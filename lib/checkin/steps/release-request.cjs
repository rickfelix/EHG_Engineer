// SD-LEO-INFRA-WORK-CLASS-CLAIM-001 (FR-4): cooperative release-request, honored at the
// LOOP BOUNDARY only. A coordinator (or the worker itself) sets metadata.release_request =
// { requested_by, requested_at, reason, ttl_minutes } on a claimed SD; this step — running
// right after roll-call, BEFORE resume re-attaches — releases the claim cleanly via
// bestEffortReleaseSd and clears the flag. Never a mid-flight yank (a forced git checkout
// races other sessions in a shared tree); a worker heads-down between checkins simply
// honors the request at its next tick.
//
// Race discipline (C-RELEASE): the flag CLEAR is the atomic guard — a conditional update
// keyed on (claiming_session_id = me AND release_request present). Clear-then-release
// order means a sweep/TTL release racing us can never double-release: if anything else
// changed the claim first, our conditional clear matches 0 rows and we skip. TTL is
// self-compared vs Date.now(); an EXPIRED request is ignored LOUDLY (surfaced in the
// result, flag left for the coordinator to re-issue or retract) — never silently honored.
/** Pure: is this release_request live? Returns 'live' | 'expired' | null (absent/malformed). */
function releaseRequestState(md, nowMs) {
  const rr = md && md.release_request;
  if (!rr || typeof rr !== 'object') return null;
  const requestedAt = Date.parse(rr.requested_at);
  if (!Number.isFinite(requestedAt)) return null;
  const ttlMin = Number(rr.ttl_minutes);
  if (Number.isFinite(ttlMin) && ttlMin > 0 && nowMs > requestedAt + ttlMin * 60000) return 'expired';
  return 'live';
}

module.exports = {
  name: 'release-request',
  releaseRequestState,
  async run(ctx) {
    const { sb, sessionId } = ctx;
    try {
      const { data: held } = await sb
        .from('strategic_directives_v2')
        .select('id, sd_key, metadata')
        .eq('claiming_session_id', sessionId)
        .limit(5);
      const nowMs = Date.now();
      for (const row of held || []) {
        const state = releaseRequestState(row.metadata, nowMs);
        if (!state) continue;
        if (state === 'expired') {
          if (!ctx.base.release_requests_expired) ctx.base.release_requests_expired = [];
          ctx.base.release_requests_expired.push({ sd: row.sd_key, requested_at: row.metadata.release_request.requested_at });
          continue; // loud (surfaced in every result) but never honored — coordinator re-issues
        }
        // Atomic guard: conditional clear FIRST. 0 rows updated = state changed under us -> skip.
        const cleared = { ...(row.metadata || {}) };
        const honored = cleared.release_request;
        delete cleared.release_request;
        const upd = await sb
          .from('strategic_directives_v2')
          .update({ metadata: cleared })
          .eq('id', row.id)
          .eq('claiming_session_id', sessionId)
          .select('id');
        if (upd.error || !upd.data || upd.data.length !== 1) continue;
        const { bestEffortReleaseSd } = await import('../../fleet/best-effort-release.mjs');
        const rel = await bestEffortReleaseSd(sb, sessionId, `release_request:${honored.reason || 'unspecified'}`);
        // Audit trail — a cooperative release must be reconstructable (who asked, when honored).
        try {
          await sb.from('system_events').insert({
            event_type: 'work_release_request_honored',
            actor_type: 'agent',
            actor_role: 'fleet-worker',
            sd_id: row.id,
            payload: { sd_key: row.sd_key, session_id: sessionId, request: honored, released: rel.released, release_error: rel.error },
          });
        } catch { /* audit is best-effort; the release itself already happened */ }
        if (!ctx.base.release_requests_honored) ctx.base.release_requests_honored = [];
        ctx.base.release_requests_honored.push({ sd: row.sd_key, released: rel.released, requested_by: honored.requested_by || null });
      }
    } catch { /* fail-open: a fault here never blocks the checkin ladder */ }
    // Never returns a terminal result — the ladder continues (resume will no longer see the
    // released SD; the worker falls through to assignment/self-claim/idle as normal).
  },
};
