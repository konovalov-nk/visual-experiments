import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const argumentsList = process.argv.slice(2);
const changedAt = argumentsList.indexOf('--changed');
const changedPath = changedAt < 0 ? null : argumentsList[changedAt + 1];
if (changedAt >= 0) {
  if (!changedPath) throw Error('--changed needs a path');
  argumentsList.splice(changedAt, 2);
}
const inputFile = resolve(argumentsList[0] ?? resolve(directory, 'url-create.jsonl'));
const templateFile = resolve(argumentsList[1] ?? resolve(directory, 'player.template.html'));
const outputStem = resolve(argumentsList[2] ?? resolve(directory, 'url-create.workshop'));

function requireThat(condition, message) {
  if (!condition) throw Error(message);
}

function atPath(value, path) {
  return path.split('.').reduce((current, key) => current?.[key], value);
}

function readRecords(file) {
  const records = new Map();
  for (const [index, line] of readFileSync(file, 'utf8').split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let record;
    try { record = JSON.parse(line); }
    catch (error) { throw Error(`${file}:${index + 1}: ${error.message}`); }
    requireThat(typeof record.kind === 'string' && typeof record.id === 'string', `Line ${index + 1}: kind and id are required`);
    requireThat(!records.has(record.id), `Duplicate id: ${record.id}`);
    records.set(record.id, record);
  }
  return [...records.values()];
}

function compile(records) {
  const byId = new Map(records.map(item => [item.id, item]));
  const ofKind = kind => records.filter(item => item.kind === kind);
  const one = kind => {
    const found = ofKind(kind);
    requireThat(found.length === 1, `Expected exactly one ${kind}; got ${found.length}`);
    return found[0];
  };
  const ref = (id, kind) => {
    const item = byId.get(id);
    requireThat(item?.kind === kind, `Broken reference ${id} (expected ${kind})`);
    return item;
  };

  const spec = one('spec');
  const world = ref(spec.world_id, 'world');
  const ac = one('ac');
  const transition = ref(ac.transition_id, 'transition');
  const measurement = ref(ac.measurement_id, 'measurement');
  const testLink = ref(ac.test_id, 'test_link');
  const codeLink = ref(transition.code_id, 'code_link');
  const from = ref(transition.from, 'state');
  const to = ref(transition.to, 'state');
  requireThat(ac.spec_id === spec.id && testLink.ac_id === ac.id, 'AC/spec/test references disagree');
  requireThat(codeLink.transition_id === transition.id, 'Code/transition references disagree');
  requireThat(from.world_id === world.id && to.world_id === world.id && measurement.world_id === world.id, 'World references disagree');
  requireThat(world.adapter === 'postgres-snapshot', 'This prototype supports postgres-snapshot');
  requireThat(measurement.operator === 'count' && measurement.compare === 'after-before', 'This prototype supports count(after) - count(before)');
  requireThat(world.projection?.path === measurement.path && world.projection.path === from.predicate?.path && from.predicate.path === to.predicate?.path, 'Projection, state predicates, and measurement must share one path');
  requireThat(world.projection.where?.equals?.startsWith('input.'), 'Projection filter must reference an input parameter');
  requireThat(Number.isInteger(measurement.expected_delta) && measurement.expected_delta > 0, 'Expected delta must be a positive integer');
  requireThat(Object.keys(to.fields ?? {}).length > 0, 'Target state needs fields');
  requireThat(Object.keys(to.fields).every(field => transition.bindings?.[field]), 'Every target field needs a binding');
  requireThat(Object.keys(transition.bindings).every(field => field in to.fields), 'A binding refers to an unknown target field');
  requireThat(existsSync(resolve(dirname(inputFile), testLink.path)), `Linked test file is missing: ${testLink.path}`);
  requireThat(existsSync(resolve(dirname(inputFile), codeLink.path)), `Linked implementation file is missing: ${codeLink.path}`);

  const cases = ofKind('case').filter(item => item.ac_id === ac.id);
  const examples = cases.filter(item => item.role === 'example');
  const trials = cases.filter(item => item.role === 'trial');
  requireThat(examples.length >= 1 && trials.length >= ac.required_trials && ac.required_trials > 0, 'Need one example and enough trials');
  requireThat(new Set(trials.map(item => JSON.stringify(item.input))).size >= ac.required_trials, 'Trials must use distinct inputs');
  const filterInput = world.projection.where.equals.slice('input.'.length);
  const candidates = new Map();
  const addCandidate = (id, label, type) => candidates.set(id, {id, label, type});
  for (const source of Object.values(transition.bindings)) {
    if (source.startsWith('generated.')) addCandidate(source, `${source}()`, 'string');
  }
  for (const [name, type] of Object.entries(transition.input ?? {})) addCandidate(`input.${name}`, `input.${name}`, type);
  for (const [name, value] of Object.entries(examples[0].context ?? {})) addCandidate(`context.${name}`, `context.${name}`, typeof value);
  addCandidate('literal.null', 'null', 'null');
  for (const [field, source] of Object.entries(transition.bindings)) {
    requireThat(candidates.has(source), `Unknown source ${source} for ${field}`);
    requireThat(candidates.get(source).type === to.fields[field], `Type mismatch: ${field} ← ${source}`);
  }

  for (const item of cases) {
    for (const [name, type] of Object.entries(transition.input)) requireThat(typeof item.input?.[name] === type, `${item.id}: input.${name} must be ${type}`);
    requireThat(Array.isArray(item.snapshots) && item.snapshots.length >= 2, `${item.id}: need at least before/after snapshots`);
    requireThat(item.snapshots.every((s, i) => Number.isInteger(s.seq) && (i === 0 || s.seq > item.snapshots[i - 1].seq)), `${item.id}: snapshot seq must increase`);
    const firstRows = atPath(item.snapshots[0].world, world.projection.path);
    const lastRows = atPath(item.snapshots.at(-1).world, world.projection.path);
    for (const snapshot of item.snapshots) {
      const rows = atPath(snapshot.world, world.projection.path);
      requireThat(Array.isArray(rows), `${item.id}/${snapshot.seq}: projected rows missing`);
      requireThat(rows.every(row => row[world.projection.where.field] === item.input[filterInput]), `${item.id}/${snapshot.seq}: row outside projection filter`);
      requireThat(rows.every(row => world.projection.columns.every(column => Object.hasOwn(row, column))), `${item.id}/${snapshot.seq}: missing projected column`);
    }
    requireThat(firstRows.length === from.predicate.count && lastRows.length === to.predicate.count, `${item.id}: snapshots violate state predicates`);
    requireThat(lastRows.length - firstRows.length === measurement.expected_delta, `${item.id}: wrong measurement delta`);
    const created = lastRows.at(-1);
    for (const [field, source] of Object.entries(transition.bindings)) {
      const value = source.startsWith('input.') ? atPath(item, source) : source.startsWith('context.') ? atPath(item, source) : undefined;
      if (source.startsWith('generated.')) requireThat(typeof created[field] === to.fields[field] && created[field].length > 0, `${item.id}: missing generated ${field}`);
      else requireThat(created[field] === value, `${item.id}: ${field} does not match ${source}`);
    }
  }

  const expected = measurement.expected_delta;
  const deltas = [...new Set([expected - 1, expected, expected + 1])].sort((a, b) => a - b);
  return {
    format: 'coherence-workshop/v1',
    spec: {id: spec.id, title: spec.title, description: spec.description},
    world: {id: world.id, adapter: world.adapter, projection: world.projection},
    states: {from: {id: from.id, title: from.title}, to: {id: to.id, title: to.title, fields: to.fields}},
    transition: {id: transition.id, action: transition.action, input: transition.input},
    measurement: {id: measurement.id, path: measurement.path, expected_delta: expected},
    ac: {id: ac.id, title: ac.title, given: ac.given, when: ac.when, then: ac.then, required_trials: ac.required_trials},
    test_link: {id: testLink.id, path: testLink.path, symbol: testLink.symbol, relation: testLink.relation, environment: testLink.environment},
    code_link: {id: codeLink.id, path: codeLink.path, symbol: codeLink.symbol, relation: codeLink.relation},
    puzzle: {cards: [...candidates.values()], slots: Object.entries(to.fields).map(([field, type]) => ({field, type, answer: transition.bindings[field]})), delta_options: deltas},
    examples, trials
  };
}

try {
  const manifest = compile(readRecords(inputFile));
  for (const link of [manifest.code_link, manifest.test_link]) {
    link.path = relative(dirname(outputStem), resolve(dirname(inputFile), link.path)).split(sep).join('/');
  }
  const json = JSON.stringify(manifest, null, 2) + '\n';
  const template = readFileSync(templateFile, 'utf8');
  const marker = '__WORKSHOP_MANIFEST__';
  requireThat(template.includes(marker), `Template must include ${marker}`);
  writeFileSync(outputStem + '.json', json);
  writeFileSync(outputStem + '.html', template.replace(marker, JSON.stringify(manifest).replace(/</g, '\\u003c')));
  console.log(`Compiled ${manifest.ac.id}: ${manifest.puzzle.slots.length} fields, ${manifest.trials.length} trials`);
  console.log(`${outputStem}.json`);
  console.log(`${outputStem}.html`);
  if (changedPath) {
    const changed = resolve(changedPath);
    const code = resolve(dirname(outputStem), manifest.code_link.path);
    const test = resolve(dirname(outputStem), manifest.test_link.path);
    if (changed === code || changed === test) console.log(`Impact candidate: ${manifest.transition.id} → ${manifest.ac.id} → ${manifest.test_link.path}; re-run linked test and compare world snapshots.`);
    else console.log('No direct link from this changed path in this small graph; indirect dependencies are not analyzed.');
  }
} catch (error) {
  console.error(`Workshop compilation failed: ${error.message}`);
  process.exitCode = 1;
}
