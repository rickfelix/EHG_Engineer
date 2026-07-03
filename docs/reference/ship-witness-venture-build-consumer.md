# Ship-witness: venture-build walker observe-only merge-witness

**SD**: SD-LEO-INFRA-SHIP-WITNESS-VENTURE-001 (Ship-witness C)
**Status**: Approved
**Category**: Protocol
**Version**: 1.0.0
**Author**: LEO Protocol
**Last Updated**: 2026-07-03
**Tags**: ship-witness, venture-build, observe-only, done-shipped, telemetry

## What this is

The venture-build walker (`lib/eva/bridge/venture-build-consumer.js` `runConsume()`)
accepts a leaf as done at its completion point (`const ok = !!(driven && driven.completed)`)
purely on the `driveLeaf` `{completed}` signal — it never checked whether the leaf's PR
actually **merged**. The A1 canary proved the gap: a leaf reached `status='completed'`
while its PR stayed OPEN (`done` != `shipped`).

This SD adds an **OBSERVE-ONLY** merge-witness at that acceptance point
(`lib/eva/bridge/venture-build-merge-witness.js` `observeLeafMergeWitness()`), reusing the
Ship-witness A substrate (`lib/ship/merge-witness-ladder.mjs` + `merge-witness-telemetry.mjs`,
SD-LEO-INFRA-SHIP-WITNESS-MERGEWORK-001). It records whether a completed leaf's PR merged and
emits telemetry — **without changing the walker's control flow and without advancing any stage**.

## Behavior

For each leaf the walker accepts as completed (and only when not a dry-run):

1. **Resolve the leaf's PR** out-of-band (the leaf object carries only `{id, sd_key}`): the
   canonical `ship_review_findings(sd_key, pr_number)` join, with a
   `gh pr list --state merged --head feat/<sd_key>` fallback. Fail-soft — any error or
   unresolvable PR yields `not_evaluable`.
2. **Determine merged state** via the existing `verifyMerged` (injected, time-bounded, through a
   bounded *throwing* gh runner so a gh outage collapses to `not_evaluable`, never a false
   `not_merged`).
3. **Build the observe-only verdict** via `evaluateMergeWorkLadder` and write it to
   `merge_witness_telemetry` with `lane = 'venture-build'`, then read it back (write-then-read-back).
4. **Emit `LEO_BUILD_LEAF_COMPLETED_UNMERGED`** — only on a **positive** `not_merged` (never on
   `not_evaluable` or `merged`, so a merged leaf whose PR simply could not be resolved is never
   false-flagged).

The whole witness is wrapped so nothing it does can escape into the walk. It NEVER alters `ok`,
`result.drivenLeaves`, loop termination (`isTreeComplete`), or any stage advancement.

## Observe-before-enforce

This SD is the **recording** stage only. The observe→fail-closed flip (blocking a leaf's
completion when its PR is unmerged) is the separate downstream **Ship-witness D**
(SD-LEO-INFRA-SHIP-WITNESS-ENFORCE-001), which consumes the `lane='venture-build'` telemetry
this SD produces once lane adoption is proven.

## Operations

- **Kill-switch**: set `VENTURE_BUILD_MERGE_WITNESS=off` to disable the witness with zero code
  change (default: ON/observe). Under a test runner (`VITEST` / `NODE_ENV=test`) the default
  seams never shell out to `gh`.
- **CLI**: `npm run venture:build:consume -- --venture-id <uuid> [--dry-run | --finalize | --check-stack]`
  (`lib/eva/bridge/venture-build-consumer.js`). A real per-leaf build is session-hosted via the
  `/leo-build-venture` skill; the CLI only introspects (`--dry-run`) or finalizes.
- **No schema change**: reuses the `merge_witness_telemetry` table from Ship-witness A.

## Related

- Ship-witness A (substrate): SD-LEO-INFRA-SHIP-WITNESS-MERGEWORK-001
- Ship-witness B (trust_tier auto-merge eligibility): see `ship-witness-venture-trust-tier.md`
- Ship-witness D (enforce-flip): SD-LEO-INFRA-SHIP-WITNESS-ENFORCE-001
