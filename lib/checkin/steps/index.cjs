/**
 * Ordered check-in step registry (SD-ARCH-HOTSPOT-CHECKIN-001).
 *
 * Each entry follows the { name, applies(ctx)?, run(ctx) } contract documented in
 * lib/checkin/pipeline.cjs. ORDER IS THE LADDER — it mirrors the original inline rung
 * order of scripts/worker-checkin.cjs resolveCheckin exactly:
 *
 *   1. model-effort-merge      (rung 2c   — merge --model/--effort into session metadata)
 *   2. quarantine-self-clear   (rung 2c-2 — self-clear an uncleared probe quarantine)
 *   3. callsign-rehydrate      (rung 2b   — re-hydrate callsign from SET_IDENTITY)
 *   4. roll-call               (rung 3    — register availability; CREATES ctx.base)
 *   5. resume                  (rung 4    — stale-claim healing + resume short-circuit)
 *   6. build-forbidden-guard   (rung 4.5  — propose-only sessions never acquire claims)
 *   7. directed-assignment     (rung 5    — pending WORK_ASSIGNMENT claim)
 *   8. recover-stranded-final  (rung 5.7  — re-claim a stranded LEAD_FINAL SD)
 *   9. adopt-orphan            (rung 5.8  — adopt an orphaned in_progress SD)
 *  9.5. drain-reservations     (rung 5.85 — SD-LEO-INFRA-DISPATCH-AUTH-AUTO-AUTHORIZE-001-C:
 *                                read active coordinator_reservation fences into ctx.reservations,
 *                                strictly after directed/stranded/orphan recovery, strictly
 *                                before any self-claim tier below)
 *  10. self-claim-gates        (rung 5.9  — session opt-out + global stand-down)
 *  11. critical-qf-jump        (rung 5.95 — aged CRITICAL QF outranks SD self-claim)
 *  12. merged-pool-self-claim  (rung 5.5 + 6 — ensureActiveBaseline + merged-pool claim)
 *  13. self-claim-qf           (rung 6.5  — open quick_fix self-claim)
 *  14. idle                    (rung 7    — ALWAYS returns the idle resolution)
 */
module.exports = [
  require('./model-effort-merge.cjs'),
  require('./quarantine-self-clear.cjs'),
  require('./callsign-rehydrate.cjs'),
  require('./roll-call.cjs'),
  require('./resume.cjs'),
  require('./build-forbidden-guard.cjs'),
  require('./directed-assignment.cjs'),
  require('./recover-stranded-final.cjs'),
  require('./adopt-orphan.cjs'),
  require('./drain-reservations.cjs'),
  require('./self-claim-gates.cjs'),
  require('./critical-qf-jump.cjs'),
  require('./merged-pool-self-claim.cjs'),
  require('./self-claim-qf.cjs'),
  require('./idle.cjs'),
];
