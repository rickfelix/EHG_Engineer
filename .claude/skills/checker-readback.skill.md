---
name: checker-readback
description: "First of the checker-skills program: independent post-write readback verification. Use after any state-changing DB write to catch UPDATE-0-equals-success, silent field mismatches, and jsonb key-drop/clobber writes."
version: 1.0.0
triggers: [readback, post-write verification, write verification, checker skill, verify write landed]
context_keywords: [database, infrastructure, write-verification, checker]
required_tools: [Read, Bash]
context_access: readonly
agent_scope: [DATABASE, EXEC]
dependencies: []
---
# checker-readback — independent post-write readback verification

**Source**: SD-LEO-INFRA-CHECKER-READBACK-WRITE-001 (Chairman-commissioned 2026-08-12; Solomon
Stage-B audit build-order #1 of the checker-skills program).

## What it is

`lib/checkers/readback-checker.mjs` exports `verifyReadback({ table, match, expectedFields, requiredKeys })`
— a shared, reusable Checker (not a Doer): after a state-changing write, it independently re-reads
the persisted row and asserts the write actually landed as intended. It reads the ARTIFACT (the
persisted row via a freshly-constructed service-role client), never the writer's own claim about
it — no `UPDATE...RETURNING`, no reused/cached client object.

## Contract

- **Rowcount**: `match` must resolve to EXACTLY ONE row. Zero rows (a `.eq()` on a non-matching
  key — the "fence-no-op" class) or more than one row (an over-broad match) both throw
  `ReadbackRowcountError`.
- **Field equality**: every key in `expectedFields` is deep-compared (not `===`) against the
  re-read row. A mismatch throws `ReadbackFieldMismatchError`.
- **Required keys**: `requiredKeys` is `{ column: [key1, key2, ...] }` for jsonb/structured
  columns. Each named key must be present AND not null/undefined on the re-read row — a clobber
  that NULLs a key is caught identically to one that drops it. Violation throws
  `ReadbackKeyDropError`.
- **Query errors**: a genuine DB/transport error throws `ReadbackQueryError` — never coerced into
  a rowcount failure.
- **FAIL LOUD**: on success, resolves `{ verdict: 'PASS', row }`. On any violation, THROWS. There
  is no third silent-warning outcome — that is the caller's decision, not the checker's (see
  "Wrapping at the call site" below).
- **No client parameter**: `verifyReadback()` takes no `supabase`/client argument. It always
  constructs its own service-role client, so there is nothing for a caller to accidentally reuse,
  cache, or pass a stale reference through.

## How to invoke it manually

```js
import { verifyReadback, ReadbackCheckError } from 'lib/checkers/readback-checker.mjs';

await verifyReadback({
  table: 'sub_agent_execution_results',
  match: { id: newRowId },
  expectedFields: { verdict: 'PASS', sub_agent_code: 'TESTING' },
  requiredKeys: { metadata: ['is_coordinator', 'coordinator_since'] }, // optional
});
```

## Wrapping at the call site

FAIL LOUD is a library-level contract, not a mandate that every adopter must let a checker
exception break the write it's diagnosing. The first adopter, `storeSubAgentResults()`
(`lib/sub-agent-executor/results-storage.js`), wraps the call in try/catch and logs loudly
(`console.error`) instead of re-throwing — reconciling FAIL LOUD with that file's own
pre-existing "a diagnostic that could break a write is worse than the defect it reports" doctrine.
Decide and document your own posture per adopter; do not assume the checker's throw should
propagate unchanged into every caller.

## Known-answer fixtures (the planted-defect drill)

`lib/checkers/readback-fixtures.mjs` exports four founding fixture builders, modeled on real
measured incidents from this session (provenance: `.claude/adam-session-state-228dd90c.md`,
`.claude/solomon-session-state-a26c2a97.md`):

- `correctWriteFixture()` — positive control, must PASS.
- `fenceNoOpFixture()` — a `.eq()` on a non-matching key; zero rows on re-read.
- `metadataClobberFixture({ nullify })` — a blind-replace that drops (or, with `nullify: true`,
  nulls) required jsonb keys instead of merging.
- `phantomFlipFixture()` — a wrong value persisted vs. what was intended.

Each returns `{ intendedRow, persistedRow }`: `intendedRow` drives `expectedFields`/`requiredKeys`
in a test; `persistedRow` drives a mocked Supabase client's return value. See
`tests/unit/checkers/readback-checker.test.js` for the full "both directions" suite.

## Adoption disposition (1-REP)

Three pre-existing single-purpose readback-style implementations were found at this skill's
creation and deliberately left as-is (not migrated in this SD — see FR-5 of the founding SD):
`lib/claim-guard.mjs` `reaffirmClaimColumns()` (uses `UPDATE...RETURNING`, not an independent
read — flagged in-code as a follow-on candidate), and the reference-only teaching artifacts
`golden-references/idempotent-composite-upsert/upsert-seam.mjs` and
`golden-references/witness-evidence-emitter/witness-emitter.mjs`. Check this list before writing
a new ad-hoc readback check — a follow-on SD, not a fresh implementation, is very likely the
right move.

## Timeout behavior

`verifyReadback()` opts `createSupabaseServiceClient()` into a 10s request bound
(`{ fetchTimeoutMs: 10000 }`) so a slow/dead network path fails in ~10s instead of retrying
through `@supabase/postgrest-js`'s default 4-attempt backoff (measured: 40s+). This is scoped to
this call site only — `createSupabaseServiceClient()`'s default (no options) is unchanged for
every other existing caller.
