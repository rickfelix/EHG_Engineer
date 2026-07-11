# Order-Dependent Permanent-Strand Bug Audit — 2026-07-11

**SD**: SD-LEO-FIX-PAYMENT-RAIL-RETRO-001 (FR-2, bug-class audit)

## Bug class

`lib/payments/attribution-resolver.js` had a real, already-fixed bug (commit `0b37459ebf7`):
`resolveUnattributedEvents` processed a batch in a **single pass**, fixed `created_at`-ascending
order. A row could be marked with a **terminal status** (excluding it from all future re-scans,
since future runs only re-scan rows matching a null/unresolved filter) **before** its same-batch
"donor" sibling (which carries the metadata this row needs) had been processed — permanently
stranding it even after the donor resolved later in the same or a subsequent batch. The fix: two
passes — pass 1 folds all donor data order-independently, pass 2 resolves against the complete
set.

**3-condition signature** used to test each candidate below:
1. Batch fetched in fixed order AND future runs only re-scan the unresolved subset via a terminal
   filter (e.g. `.is('some_status', null)`).
2. Single pass with an intra-batch sibling-donor dependency — an accumulator `.push()`/similar
   **inside** the loop that a **later iteration in the same pass** depends on to make **its**
   decision.
3. Non-matching/unresolved rows get a **terminal status** that excludes them from the next run's
   re-scan, so a row processed before its donor is permanently lost, not just delayed.

`scripts/intake/drain-intake.mjs` was already confirmed **not affected** in a prior pass (PLAN
phase) and is excluded from the table below — its `existingSds.push()` accumulator only helps
later items avoid creating a duplicate SD; it never assigns a terminal status that excludes an
item from re-triage.

## Findings

| File | Verdict | Reason |
|---|---|---|
| `lib/claim/queue-resolver.cjs` | not-affected | `getNextWorkableSD` is read-only — it returns the first unclaimed candidate from a query and never writes a terminal status to any row, so condition 3 is absent entirely. |
| `scripts/solomon-ledger-reconcile.cjs` | not-affected | `reconcileBatch` (line 51) decides each row's `outcome` solely from an **external** lookup (`strategic_directives_v2.status` for that row's own `outcome_sd_key`) — no accumulator inside the loop that a later row depends on; condition 2 absent. |
| `scripts/ship-witness-reconcile.mjs` | not-affected | `reconcileUnwitnessedMerges` (line 65) writes one independent telemetry row per PR from that PR's own `fetchShape` result — no cross-row accumulator; condition 2 absent. |
| `scripts/ship-witness-retroactive-batch.mjs` | not-affected | `runRetroactiveBatch` (line 48) evaluates each PR independently via `runRetroactiveEvaluation`; no shared accumulator between iterations; condition 2 absent. |
| `scripts/lineage/backfill-vision-key.mjs` | not-affected | `backfillVisionKey`'s loop (line 139) computes each row's `vision_key`/`arch_key` purely from that SD's own `sd_key`/`metadata` (`computeBackfillRow`); no sibling accumulator, so condition 2 is absent even though condition 1/3 (terminal `metadata->>vision_key` write excluding future re-scans) are present. |
| `scripts/backfill-canonical-lfa-from-executions.mjs` | not-affected | The two donor sets (`execAccepted`, `canonAccepted`) are fully paginated-fetched via `fetchAcceptedSdIds` (lines 72-92) **before** the per-SD `isBackfillable` computation and the apply loop (lines 108-122) re-checks live DB state (`canonNow`) immediately before each insert — no same-pass intra-batch dependency; condition 2 absent. |
| `lib/learning/feedback-clusterer.js` | not-affected | `findPromotableClusters` already implements the two-pass fix pattern itself: the grouping loop (lines 68-82) builds every cluster's full item set with no exclusion decision, and `evaluateForPromotion` / terminal `cluster_processed_at` stamping (`markProcessed`, line 284) only run afterward, in a separate pass, against complete clusters. |
| `lib/sourcing-engine/dedup-autostamp.js` | not-affected | `autostampLedgerCandidates`'s `existing`/`shippedInfraKeys`/`outcomeRealizedKeys` context (lines 130-152) is computed once from the full `strategic_directives_v2` table **before** the candidate loop (line 163) — no candidate's stamp depends on a sibling candidate processed earlier in the same loop; condition 2 absent. |
| `scripts/feedback-fingerprint-promoter.mjs` | not-affected | Uses `groupByFingerprint` (`lib/shared/content-fingerprint.cjs:58`), which runs a complete single pass building full groups with no exclusion logic; the promotion decision + terminal `metadata.promoted_to_qf` stamp (lines 69-116) run afterward over already-complete groups — same two-pass-safe shape as feedback-clusterer. |
| `scripts/promote-retro-action-items.mjs` | not-affected | Loop over `retros` (line 75) decides `action_items_promoted` per retrospective using only that row's own `metadata`/`action_items`; no accumulator carries state between retro iterations; condition 2 absent. |
| `scripts/solomon-ledger-pending-resurface.cjs` | not-affected | Explicitly "stamps nothing on the ledger row itself" (file header + `resurfaceStalePending`, line 61) — dedup is keyed per-row-per-day against `session_coordination`, not a terminal status on the ledger row, so condition 3 is absent; a stale-pending row remains visible on every future run regardless of processing order. |
| `scripts/stage-zero-queue-processor.js` | not-affected | Architecture is one-row-at-a-time (`fetchNextPending` `.limit(1)` + atomic `claimRequest`, lines 164-201), not a fixed-order batch scan — condition 1 (batch fetch) is absent by construction. |
| `lib/eva/venture-capture-forward.js` | not-affected | `drainCaptureBacklog`'s per-venture `getMissingStages` (line 139) re-reads live `venture_capture_snapshots` state for that venture only on each call — it is not populated by, or dependent on, other ventures/stages processed earlier in the same run; condition 2 absent, and capture is idempotent-upsert (no permanent terminal exclusion). |
| `scripts/drain-capture-backlog.mjs` | not-affected | Thin CLI wrapper that calls `drainCaptureBacklog` from `lib/eva/venture-capture-forward.js` directly — same verdict as that file. |
| `lib/sourcing-engine/refill-auto-promote.js` | not-affected | `promoteStagedCandidate` (line 175) makes its promote/skip decision from the single item's own fields (`item.promoted_to_sd_key`, a deterministic `sd_key`, and a live existence check against `strategic_directives_v2`) — no accumulator shared across items in a batch; condition 2 absent. |
| `scripts/backfill-chairman-decisions-missing-rows.mjs` | not-affected | `workTypeByStage` and `classifications` maps are fully built in their own complete passes (lines 74-90) before the per-venture candidate loop (lines 104-124); each venture's candidacy is decided from that finished map plus a live per-venture `chairman_decisions` existence check, not from siblings processed earlier in the same loop. |
| `scripts/sourcing-engine/backfill-414-null-titles.mjs` | not-affected | Loop over null-title rows (line 40) resolves each row's title independently via `resolveSourceTitle(supabase, row)` using that row's own `source_id`; no cross-row accumulator; condition 2 absent even though condition 1/3 (fixed batch + terminal `dropped` disposition) are present. |
| `lib/eva/youtube-backlog-clear.js` | not-affected | `planBacklogClear` (line 45) is a pure single-pass planner deriving each row's lane solely from that row's own `chairman_intent`; it performs no DB writes at all (the physical move is delegated elsewhere), so there is no terminal-status write in this file and condition 3 is absent. |
| `scripts/eva/backfill-vision-drift-marker.mjs` | not-affected | Loop over S19 rows (line 46) checks the SET-ONCE predicate against that row's own `advisory_data` only; no accumulator dependency between rows in the loop; condition 2 absent. |
| `lib/feedback/preclaim-feedback-rows.js` | not-affected | `preclaimFeedbackRows` (line 83) claims each row via an independent atomic `UPDATE ... WHERE quick_fix_id IS NULL` guard per row; no row's claim outcome depends on another row's claim within the same call; condition 2 absent. |

## Summary

- **20/20 not-affected.** No file matched all three conditions of the bug signature.
- **0 affected, 0 inconclusive, 0 not-found.** Every candidate name resolved to exactly one
  primary implementation file (some also had a thin CLI wrapper, noted where applicable).
- The two files closest in *shape* to the original bug — `feedback-clusterer.js` and
  `feedback-fingerprint-promoter.mjs` — both already use the two-pass pattern the payment-rail
  fix introduced (build complete groups first, decide/stamp terminal state second), so they are
  not just "unlikely," they are structurally immune to condition 2.
