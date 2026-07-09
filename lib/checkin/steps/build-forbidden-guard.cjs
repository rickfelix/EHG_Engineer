// Extracted VERBATIM from scripts/worker-checkin.cjs resolveCheckin (rung 4.5) —
// SD-ARCH-HOTSPOT-CHECKIN-001. Only edits: locals -> ctx.* + helper destructuring.
module.exports = {
  name: 'build-forbidden-guard',
  async run(ctx) {
    const { isBuildForbiddenSession } = ctx.helpers;
    // 4.5 ACQUISITION GUARD (SD-FDBK-FIX-SELF-ONLY-AUTHORIZATION-001, feedback a159d1ec):
    // propose-only sessions (metadata.non_fleet=true / role=adam, CONST-002) must NEVER
    // acquire a build claim. The claim-validity gate's CHECK 1.5 only fires at sd-start/
    // handoff — but a propose-only session is the LEAST likely to ever reach a handoff, so
    // that tripwire never trips and an Adam session could self-claim here and starve real
    // workers (claim_sd surfaces it as a live foreign holder). Short-circuit to idle BEFORE
    // every acquisition tier (assignment, recoverStrandedFinal, adoptOrphanInProgress,
    // self-claim, QF). The resume of a pre-existing claim above is intentionally NOT blocked
    // (legacy state; the gate still blocks its handoffs). Fail-safe: only an explicit
    // non_fleet/adam triggers. A follow-up SD adds the symmetric guard inside the claim_sd
    // RPC (covers qf-start / sweep / reacquire callers too).
    if (isBuildForbiddenSession(ctx.sessionMetadata)) {
      return { ...ctx.base, action: 'idle', recommended_wakeup_seconds: 1200,
        message: 'Propose-only session (non_fleet / role=adam): build claims are forbidden per CONST-002 — not self-claiming. Adam proposes work via the decision queue.' };
    }
  },
};
