// QF-20260905-282: a chairman-dedicated seat self-reports coordinator_stand_down=true at
// check-in via `--stand-down`, so THIS SAME TICK's self-claim-gates step (rung 5.9, below)
// already sees it and skips the belt-pull -- no separate "release and stand by" round trip
// with the chairman. Mirrors model-effort-merge.cjs's fresh-read-then-merge shape exactly
// (a concurrent writer's fields, e.g. fleet_identity, must never be clobbered by a stale
// in-memory snapshot) and runs immediately after it, strictly before self-claim-gates.
// See docs/protocol/fleet-worker-loop-directive.md's "Dedicated-seat directive" variant.
module.exports = {
  name: 'dedicated-seat-standdown',
  async run(ctx) {
    const { sb, sessionId } = ctx;
    const { cliStandDown } = ctx.opts;
    if (!cliStandDown) return; // no-op: the flag was not passed this tick
    if (ctx.sessionMetadata && ctx.sessionMetadata.coordinator_stand_down === true) return; // already set, idempotent
    try {
      const { data: freshRow } = await sb.from('claude_sessions').select('metadata').eq('session_id', sessionId).maybeSingle();
      const freshBase = (freshRow && freshRow.metadata) || ctx.sessionMetadata || {};
      // dedicated_seat is purely informational (lets a dashboard tell "self-reported dedicated"
      // apart from a coordinator-imposed stand-down); coordinator_stand_down is the one field
      // every self-claim gate (isSelfClaimDisabled, coordinator-idle-qf-hint's eligibleIdleWorkers)
      // already reads -- no new gate logic needed, only a seat-writable path to the existing flag.
      const merged = { ...freshBase, coordinator_stand_down: true, dedicated_seat: true };
      ctx.sessionMetadata = merged;
      await sb.from('claude_sessions').update({ metadata: merged }).eq('session_id', sessionId);
    } catch { /* fail-open: check-in proceeds with whatever metadata was already read */ }
  },
};
