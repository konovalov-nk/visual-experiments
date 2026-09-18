# Coherence URL workshop · minimal data-driven slice

Open `index.html` via GitHub Pages or directly in a browser. It contains the compiled
description, so it works offline. Its file picker can also load another
`*.workshop.json` compiled for the same player format.

## Rebuild

Requires Node.js 20+; there are no package dependencies.

```sh
node compile.mjs
cp url-create.workshop.html index.html
node --test url_create.test.mjs
node compile.mjs --changed url_create.mjs
```

`compile.mjs [input.jsonl] [player.template.html] [output-stem]` writes
`output-stem.json` (the generated level description) and `output-stem.html`
(the player with that description embedded). The player reads only the generated
description. It has no `URL` or `create` rule hard-coded into its JavaScript.

## Pieces of the model

| JSONL record | Role |
| --- | --- |
| `spec` | Human goal and world reference. |
| `world` | PostgreSQL adapter boundary and **projection**: `public.urls`, selected columns, rows where `short = input.short`. |
| `state` × 2 | Predicates on the projected world: zero matching rows (`∅`) and one matching row (`URL`). Target state also names field types. |
| `transition` | Standalone `create` action, source and target states, input shape and expected field bindings. |
| `measurement` | Pure read of projected snapshots: `count(after) - count(before) = 1`. |
| `ac` | Human readable Given/When/Then and references to transition, measurement and test. |
| `code_link` | `create` transition → implementation symbol. |
| `test_link` | AC → test symbol. |
| `case` × 3 | One visible example, then two hidden trial inputs with ordered world snapshots. |

This is intentionally separate from the existing Coherence protobufs. The
compiler checks IDs, references, field bindings, input types, increasing
snapshot sequence, projection filter, state predicates and measured deltas.
The actual content comes from the JSONL rather than from parsing arbitrary
test code. `url_create.test.mjs` is a real executable linked test, but uses an
in-memory adapter that implements a PostgreSQL-like `query` boundary. No real
PostgreSQL connection or automatic trace extraction is claimed.

`--changed` matches the **directly linked** implementation or test path and
marks the AC as a retest candidate. It does not build a transitive dependency
graph, decide whether behavior actually changed, or rewrite the spec.

### Scope and trust

The world snapshot is intentionally a *view*, not a dump of the whole DB. If
the implementation unexpectedly changes another table, this projection will
not show it. A real adapter would capture `before`/`after` around the linked
test, applying the projection filter and recording provenance (commit, test
run, adapter version). Later measurements can add other projections without
making every level load the entire database.
