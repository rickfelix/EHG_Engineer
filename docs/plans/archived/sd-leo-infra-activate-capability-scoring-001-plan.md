<!-- Archived from: tmp/capability-plans/sd2-activate-scoring.md -->
<!-- SD Key: SD-LEO-INFRA-ACTIVATE-CAPABILITY-SCORING-001 -->
<!-- Archived at: 2026-05-29T14:08:56.742Z -->

# Plan: Activate capability scoring and reuse tracking in the SD lifecycle

## Type
infrastructure

## Priority
high

## Target Application
EHG_Engineer

## Summary
The capability ledger (`sd_capabilities` / `v_capability_ledger`) has an elaborate scoring and reuse model — `maturity_score` (0-5), `extraction_score` (0-5), `graph_centrality_score`, `reuse_count`, a `capability_reuse_log` table, and a computed `plane1_score = (maturity + extraction + centrality) * category_weight` — but it is entirely dormant. All 204 registered capabilities have `plane1_score=0`, `maturity_score=0`, `extraction_score=0`, and `reuse_count=0`. The scoring library (`lib/capabilities/plane1-scoring.js`) and the reuse tracker (`lib/capabilities/capability-reuse-tracker.js`) have no non-test callers; `capability_reuse_log` has 0 rows; `fn_record_capability_reuse` is never invoked. As a result every consumer that orders or filters by `plane1_score` (including Stage-0 discovery's capability block) reads an unscored, effectively arbitrary list.

Goal: Wire capability scoring and reuse recording into the SD lifecycle so capabilities accrue real maturity, extraction, and reuse values as SDs complete and as capabilities are reused. This is the keystone that makes the compounding capability flywheel function — without real scores, every downstream consumer reads noise.

## Success Criteria
- [ ] `maturity_score` and `extraction_score` are populated at capability-registration time (or at SD completion) via `lib/capabilities/plane1-scoring.js`, replacing the all-zero defaults.
- [ ] Capability reuse is recorded (`fn_record_capability_reuse` / capability-reuse-tracker) when a later SD reuses an existing capability, so `reuse_count` and `capability_reuse_log` become non-empty.
- [ ] `plane1_score` is non-zero for capabilities with non-zero maturity/extraction, verifying the compute trigger fires on real inputs.
- [ ] A one-time backfill pass scores the existing 204 capabilities so the ledger is not stuck at zero.
- [ ] `v_capability_ledger` ordering by `plane1_score` is meaningful (distinct, non-zero values).
- [ ] Tests cover: scoring on registration, reuse recording incrementing reuse_count and centrality, and backfill idempotency.

## Scope
| File | Action | Purpose |
|------|--------|---------|
| `lib/capabilities/plane1-scoring.js` | MODIFY | Expose a lifecycle-invocable scoring entrypoint |
| `lib/capabilities/capability-reuse-tracker.js` | MODIFY | Wire reuse recording into the SD lifecycle |
| `scripts/eva/archplan-command.mjs` | MODIFY | Register and score capabilities during planning/archplan |
| `scripts/one-off/backfill-capability-scores.mjs` | ADD | One-time backfill of the existing 204 capabilities |
| `tests/unit/capabilities/scoring-lifecycle.test.js` | ADD | Scoring, reuse increment, and backfill tests |
