// Extracted VERBATIM from scripts/worker-checkin.cjs resolveCheckin (rung 5.9 self-claim-disabled
// + global stand-down; two idle short-circuits) — SD-ARCH-HOTSPOT-CHECKIN-001.
// Only edits: locals -> ctx.* + helper destructuring.
module.exports = {
  name: 'self-claim-gates',
  async run(ctx) {
    const { sb } = ctx;
    const { isSelfClaimDisabled, isGlobalStandDownActive } = ctx.helpers;
    // 5.9 SD-REFILL-00BCYOYW: session-level self-claim opt-out. Placed AFTER the recovery tiers (so a
    //     winding-down worker still finishes its own stranded/orphaned build work — that is not churn)
    //     and BEFORE step-6, so it skips ONLY the self_claim-from-sd:next path (step-6 + selfClaimQuickFix).
    //     roll_call, resume, directed WORK_ASSIGNMENT claiming and recovery all run before this point and
    //     are unaffected. Narrower sibling of the 4.5 isBuildForbiddenSession guard (which blocks ALL
    //     acquisition incl. directed work); this blocks only self-initiated claims.
    if (isSelfClaimDisabled(ctx.sessionMetadata)) {
      return { ...ctx.base, action: 'idle', recommended_wakeup_seconds: 1200,
        message: 'Session self-claim disabled (metadata.self_claim=false / availability=idle_only / coordinator_stand_down=true): skipping self-claim from sd:next to avoid grab-release churn that blocks fresh-session pickup of reserved SDs. roll_call, directed WORK_ASSIGNMENTs and own stranded/orphan recovery still honored. Clear the flag to resume self-claim.' };
    }
    // SD-LEO-INFRA-SELF-CLAIM-STANDDOWN-HONOR-001 FR-2: a coordinator/global fleet stand-down halts the
    // whole fleet's self-claim (overnight-reduction / keeper-only / venture-parked / hard-halt). roll_call,
    // resume, directed WORK_ASSIGNMENT and recovery all ran above; only the sd:next self-claim is skipped.
    if (await isGlobalStandDownActive(sb)) {
      return { ...ctx.base, action: 'idle', recommended_wakeup_seconds: 1200,
        message: 'Global/fleet stand-down active (system_settings FLEET_STAND_DOWN / HARD_HALT_STATUS enabled): skipping self-claim from sd:next. roll_call, directed WORK_ASSIGNMENTs and own stranded/orphan recovery still honored. Clear the system_settings stand-down to resume fleet self-claim.' };
    }
  },
};
