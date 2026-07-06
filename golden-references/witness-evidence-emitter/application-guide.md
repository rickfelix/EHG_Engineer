# Application guide — witness-evidence emitter

Template-shaped for a delegate-tier session. You adapt `witness-emitter.mjs` to
witness a new governed action; you do not need estate context beyond this folder.

## Inputs

- **Action** — the governed operation whose truth you must prove. It MUTATES the
  governed store (its real durable effect) and RETURNS its claimed outcome.
- **Store** — the durable governed state (injected). In an application this is
  your DB/table — the primary state the action changes.
- **deriveTruth(store)** — how to re-derive the ACTUAL outcome from the governed
  state, independent of the action's return and the witness. This is the seam
  that makes verify a truth check, not a self-report re-check.
- **Transaction boundary** — the real single-commit seam (a DB transaction, a
  single RPC, or an outbox) that the injected `transaction(fn)` maps onto.

## Adaptation points

1. Replace the action with your governed operation — it must WRITE its effect to
   the store and RETURN its claim.
2. Replace `deriveTruth` to re-derive the actual outcome from YOUR governed
   state (the column/rows the action changed) — never from the witness or the
   action's return.
3. Adapt the witness keys and claim content; keep `claimed_result` + a canonical
   `evidence_hash`.
4. Map `opts.transaction` to your real BEGIN/COMMIT / single-RPC / outbox seam.

## Invariants

These are never legal adaptations — each has a WHY in the reference:

- **Atomic** — the action runs INSIDE the transaction and the witness is written
  in the SAME boundary, so a crash rolls back BOTH. Do NOT run the action, then
  write the witness afterward — that is the crash-between race, and it is what
  `merge-witness-telemetry.mjs`'s best-effort second write is (correct only for
  observe-only telemetry, fatal for a gate witness).
- **Never pre-declare** — the claim comes from running the action.
- **Verify by read of the TRUTH** — verify re-derives the actual outcome from
  the governed state via `deriveTruth` and compares. It NEVER re-reads the
  action's return or the witness's `claimed_result` — that only proves
  self-consistency and greens on a lying action.
- **Tamper-evident, canonical** — the witness carries the claim AND a
  `node:crypto` hash computed over CANONICAL (sorted-key) content, so a re-read
  from a real store re-hashes stably; never a bare boolean.
- **Independent re-derivation source** — verify reads the PRIMARY governed
  state, a source separate from BOTH the witness object AND the action's return.
  This is what catches a lying action: it claimed success, but the governed
  state disagrees. (The estate's `witness-adoption.mjs` does this by
  cross-checking against `gh pr list` of actually-merged PRs — an independent
  ground truth.)

## Acceptance (both directions)

Textual locks (`judgeSource` from `acceptance-locks.mjs`) are necessary but WEAK.
The behavioral contract is the real enforcement — especially the lying-action
and crash-rollback tests no grep can prove — and it runs against YOUR module:

```
GOLDEN_REF_MODULE=<abs path to your witness-emitter.mjs> \
GOLDEN_REF_SRC=<abs path to your source> \
npx vitest run tests/unit/golden-references/witness-emitter-acceptance.test.js
```

- **Pass**: an honest action mutates the store, the witness commits atomically,
  `verifyWitness` re-derives the truth → `verified===true`; canonical hashing
  tolerates key-order differences.
- **Miss**: a LYING action (claims success, mutates nothing) → `verified:false`;
  a WRONG action (effect ≠ claim) → false; a crash inside the transaction rolls
  back both effect and witness; tampering the governed state after emit → false;
  a verify that re-reads the claim, a non-canonical hash, a boolean-only witness,
  or an action written outside the transaction each fail their named check.
