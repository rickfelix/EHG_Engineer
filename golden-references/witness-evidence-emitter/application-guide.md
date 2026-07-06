# Application guide — witness-evidence emitter

Template-shaped for a delegate-tier session. You adapt `witness-emitter.mjs` to
witness a new governed action; you do not need estate context beyond this folder.

## Inputs

- **Action** — the governed operation whose truth you must prove; its RETURN is
  the observed result.
- **Store** — the durable surface the witness is written to and re-read from
  (injected; the task says its shape). In an application this is your DB/table.
- **Transaction boundary** — the real single-commit seam (a DB transaction, a
  single RPC, or an outbox) that the injected `transaction(fn)` maps onto.

## Adaptation points

1. Rename `emitWitness`/`verifyWitness` to your action's verbs if you like — keep
   exactly one emit and one verify.
2. Replace the observed content (`observed_result`) with your action's real
   return; keep it assigned FROM the action call, never a parameter.
3. Adapt the store keys and what `verifyWitness` re-derives — always from the
   store, never from the witness object.
4. Map `opts.transaction` to your real BEGIN/COMMIT / single-RPC / outbox seam.

## Invariants

These are never legal adaptations — each has a WHY in the reference:

- **Atomic single boundary** — action effect and witness are written inside ONE
  transaction callback. `await writeAction(); await writeWitness();` is the
  forbidden crash-between-writes race. Name your real transaction seam here;
  do NOT copy `merge-witness-telemetry.mjs`'s best-effort-swallow second write —
  that is correct only for observe-only telemetry, and fatal for a gate witness.
- **Never pre-declare** — `observed_result` comes from the action RETURN, after
  it runs. A witness value passed in (or set before the action) is the
  mocked-gate-green defect.
- **Verify by read** — `verifyWitness` re-derives from the store, re-hashes, and
  compares. It never trusts `witness.observed_result`.
- **Tamper-evident** — the witness carries content AND a `node:crypto`
  `evidence_hash`, never a bare boolean. A hash alone is not enough; verify must
  re-derive the content to re-hash it.
- **Independent re-derivation source** — verify reads a store SEPARATE from the
  witness object and FAILS when they disagree. A rederive that reads
  `witness.observed_result` is a tautology and can never catch a forgery.

## Acceptance (both directions)

Textual locks (`judgeSource` from `acceptance-locks.mjs`) are necessary but WEAK.
The behavioral contract is the real enforcement, and it runs against YOUR module
when you point the runner at it:

```
GOLDEN_REF_MODULE=<abs path to your witness-emitter.mjs> \
GOLDEN_REF_SRC=<abs path to your source> \
npx vitest run tests/unit/golden-references/witness-emitter-acceptance.test.js
```

The suite then CALLS your `emitWitness`/`verifyWitness` against a test store:

- **Pass**: emit against a store the action mutates → `verified===null` at emit;
  `verifyWitness` reads the store → `verified===true`; content + hash present.
- **Miss**: tamper/empty the store after emit, before verify → `verifyWitness`
  returns `verified:false`; a pre-declared witness, a boolean-only witness, a
  two-awaited-writes emit, or a rederive reading `witness.observed_result` each
  fail their named lock or behavioral assertion.
