import assert from 'node:assert/strict';
import test from 'node:test';
import {createUrl} from './url_create.mjs';

function fakePostgresQueryAdapter() {
  const rows = [];
  return {
    rows,
    async query(sql, values) {
      assert.match(sql, /^INSERT INTO public\.urls .* RETURNING id, short, original$/);
      assert.equal(values.length, 2);
      const row = {id: `url_${String(rows.length + 1).padStart(2, '0')}`, short: values[0], original: values[1]};
      rows.push(row);
      return {rows: [row]};
    }
  };
}

test('create URL persists row and returns id', async () => {
  const db = fakePostgresQueryAdapter();
  const before = db.rows.map(row => ({...row}));
  const input = {short: 'moss', original: 'https://garden.test'};
  const created = await createUrl(db, input);
  const after = db.rows.map(row => ({...row}));

  assert.equal(before.length, 0);
  assert.equal(after.length - before.length, 1);
  assert.deepEqual(created, {id: 'url_01', ...input});
  assert.deepEqual(after, [created]);
});
