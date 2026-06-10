<!-- Archived from: C:/Users/rickf/AppData/Local/Temp/_dbcleanup_plan.md -->
<!-- SD Key: SD-LEO-INFRA-BULK-PURGE-LIVE-001 -->
<!-- Archived at: 2026-06-09T21:55:31.066Z -->

# Bulk-purge live-baseline test pollution + add test-isolation guard (12,534 dead sd_baseline_items)

## Type
infrastructure

## Priority
high

## Summary
The live `sd_baseline_items` table holds 14,515 rows, of which 12,534 (86%) are DEAD orphans whose `sd_id` joins to no real SD. The ACTIVE baseline (a75b0d8f) is 99.2% dead (11,049 of 11,138) — this is why the self-claim queue (v_sd_next_candidates) kept degrading. ROOT CAUSE: tests insert real SDs into strategic_directives_v2 (firing trigger fn_sync_sd_to_baseline → writes a baseline item) then delete only the SD in afterEach; the baseline item survives because sd_baseline_items.sd_id has no FK / ON DELETE CASCADE. Each fixture insert+delete leaks one dead baseline row. Proven live and ACTIVELY ongoing. Net-new on top of SD-LEO-INFRA-FIX-NEXT-CANDIDATES-001 (which fixed the trigger to write sd_key and reconciled only ~41 still-joinable UUID rows — a disjoint set).

## Scope
Two deliverables: (A) a REVERSIBLE bulk purge of all 12,534 dead orphans (9,922 test-key + 2,561 bare-UUID + 51 other; 11,049 in the active baseline), and (B) a test-isolation guard so the INSERT-then-afterEach-DELETE tests stop leaking. BOUNDARIES: do NOT touch strategic_directives_v2 SD rows (clean); do NOT re-fix the trigger (already correct); operate only on sd_baseline_items + the offending test files. Active baseline must end at ~89 live items (not 11,138); total sd_baseline_items ~1,981 (not 14,515).

## Functional Requirements
FR-1 — Test-isolation guard (root-cause fix): convert tests/unit/blocked-state-detector.test.js (beforeEach seeds TEST-ORCH + 3 TEST-CHILD; afterEach deletes only SDs) and tests/integration/migrations/layer1-claiming-session-roundtrip.test.js to seed inside one outer real transaction ROLLED BACK in afterAll, using the SAVEPOINT-translating client wrapper already proven in tests/integration/sd-park.test.js (lines 35-60). Rollback discards both the SD rows AND the trigger-spawned baseline items atomically. ALTERNATIVE if a test can't be wrapped: afterEach also deletes the orphaned sd_baseline_items by sd_id (baseline items first, then SDs) + a process-kill-resilient beforeAll sweep of dead baseline items. Assert net-zero baseline-item count in the test. Audit tests/ for any other suite inserting into strategic_directives_v2 against the live DB (E2E TEST-E2E generators, SD-TEST-*-CHILD orchestration tests) and apply the same isolation. Preserve the HAS_REAL_DB skip-guard so CI without secrets still skips.

FR-2 — Reversible bulk cleanup: a migration/script that DELETEs every sd_baseline_items row whose sd_id does NOT EXISTS in strategic_directives_v2 (by sd_key OR id). DRY-RUN by default — print exact counts + samples broken down by (test-key / bare-UUID / other) and by baseline_id (esp. active a75b0d8f). Mutate only with explicit --apply + single-use issue-token via apply-migration.js --prod-deploy + advisory lock + sha-bound `-- @approved-by` header (precedent: SD-FDBK-FIX-GOVERNANCE-GAP-VENTURE-001). Bound the DELETE strictly to the NOT-EXISTS predicate — NEVER a LIKE '%TEST%' delete (a real SD key could contain TEST), NEVER a TRUNCATE.

FR-3 — Backup-table snapshot before removal: SELECT every candidate row INTO a timestamped backup table (full row + baseline_id + deleted_at) inside the SAME advisory-locked transaction as the DELETE. The migration-down restores from it.

FR-4 (optional / stretch — descope if blast radius too high) — recurrence hardening: investigate an AFTER DELETE complement (fn_remove_sd_from_baseline) or ON DELETE behavior so deleting an SD also removes its trigger-spawned ACTIVE-baseline item. GUARD carefully — a real SD legitimately in a real baseline must not lose membership on unrelated delete paths; scope strictly to active-baseline trigger-sync items or descope to a follow-up. Keep the primary SD focused on FR-1+2+3.

FR-5 — Verification: after apply, assert active baseline a75b0d8f drops 11,138 → ~89; total sd_baseline_items 14,515 → ~1,981; zero dead rows remain (NOT EXISTS returns 0); v_sd_next_candidates still returns the real candidates (no real SD lost). Re-run the live insert-then-delete probe to confirm the guard leaves net-zero.

## Sequencing
Land FR-1 (guard) and merge it FIRST so no new orphans accrue during the purge window; THEN run the dry-run purge (FR-2/FR-3) and apply via the issue-token path; THEN verify (FR-5). FR-4 is optional/follow-up.

## Source
Adam scope+verify (workflow wf_1bebf9b2). Corrected the original sd-park.test.js suspicion (red herring — it's already correctly isolated); the real polluters are blocked-state-detector.test.js + layer1-claiming-session-roundtrip.test.js + E2E suites. Net-new vs SD-LEO-INFRA-FIX-NEXT-CANDIDATES-001 (disjoint row set).

## Risks
- Destructive on live governance data: a too-broad predicate could delete real baseline memberships. Mitigation: delete strictly by NOT EXISTS join (sd_key OR id), never by key-pattern; preserve the 89 live active-baseline rows.
- Concurrent test runs leak new orphans during the purge window. Mitigation: merge FR-1 guard BEFORE running the apply-purge (same SD, guard first).
- FR-4 trigger hardening has high blast radius (could strip legitimate baseline membership). Mitigation: descope to follow-up or scope strictly to active-baseline trigger-sync items.
- Bulk DELETE of ~12.5k rows may contend with the trigger or the baseline-active partial-unique index. Mitigation: advisory lock + single-transaction whole-file apply.
- Ordering: if FR-4 adds an FK, it would fail until orphans are purged — purge first, then constrain.
