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
const { hasWip } = require('../../claim/wip-detector.cjs');

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
      // FR-3: the seat's worktree, for the WIP gate below. Read once, outside the loop.
      let session = {};
      try {
        const { data: cs } = await sb
          .from('claude_sessions')
          .select('worktree_path, worktree_branch')
          .eq('session_id', sessionId)
          .maybeSingle();
        session = cs || {};
      } catch { /* fail-open on the lookup; hasWip still checks branch/PR from repoRoot */ }
      const nowMs = Date.now();
      for (const row of held || []) {
        const state = releaseRequestState(row.metadata, nowMs);
        if (!state) continue;
        if (state === 'expired') {
          if (!ctx.base.release_requests_expired) ctx.base.release_requests_expired = [];
          ctx.base.release_requests_expired.push({ sd: row.sd_key, requested_at: row.metadata.release_request.requested_at });
          continue; // loud (surfaced in every result) but never honored — coordinator re-issues
        }
        // FR-3 WIP GATE (SD-LEO-INFRA-FULL-UTILISATION-RECOVERY-001). release_sd clears the DB
        // claim without ever looking at the working tree, so a cooperative release can orphan
        // real work. Reuses the CANONICAL three-way detector (uncommitted / unpushed / open PR)
        // rather than a second implementation.
        // ORDER IS LOAD-BEARING: this must run BEFORE the conditional clear below. Refusing after
        // the clear would consume the request without releasing anything, leaving the coordinator
        // believing it was honored. Refusing here LEAVES THE FLAG SET, so the request stands until
        // the work is preserved (commit+push on the claim-bound branch, or scripts/prepark-wip.cjs).
        // hasWipFn is injectable (defaults to the real detector), matching the existing convention
        // at scripts/worker-checkin.cjs foreignClaimantBlocksSteal so tests can pin it.
        const wip = (ctx.hasWipFn || hasWip)(session.worktree_path, session.worktree_branch, null, { repoRoot: process.cwd() });
        if (wip.hasWip) {
          if (!ctx.base.release_requests_refused) ctx.base.release_requests_refused = [];
          ctx.base.release_requests_refused.push({ sd: row.sd_key, reasons: wip.reasons });
          continue;
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
        // SD-SCOPED (QF-20260726-593). release_sd takes NO SD argument — it releases whatever
        // claude_sessions.sd_key currently points at. This loop walks up to 5 SDs claimed by this
        // session, so an unscoped call could clear the release_request flag on THIS row while
        // releasing a DIFFERENT, live SD. expectedSdKey makes it a fail-closed no-op unless the
        // session actually holds this row's SD.
        const rel = await bestEffortReleaseSd(sb, sessionId, `release_request:${honored.reason || 'unspecified'}`,
          console.error, { expectedSdKey: row.sd_key });
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
        // FR-1 (SD-LEO-INFRA-FULL-UTILISATION-RECOVERY-001): ctx.mySd is a ONE-SHOT snapshot,
        // read once in scripts/worker-checkin.cjs (mySd = data.sd_key) BEFORE the ladder runs.
        // Clearing the DB claim above does NOT update it, and release_sd leaves
        // strategic_directives_v2.status untouched, so resume's terminal-check still passes.
        // Without this line the very next step (resume) sees a held claim and returns
        // action='resume' for the SD we just released — silently defeating this file's own
        // closing comment and the contract in index.cjs ("BEFORE resume, so a released SD is
        // not re-attached this same tick"). Only clear on a CONFIRMED release: if
        // bestEffortReleaseSd failed, the claim may still be held and resume must still see it.
        if (rel.released && ctx.mySd === row.sd_key) ctx.mySd = null;
      }
    } catch { /* fail-open: a fault here never blocks the checkin ladder */ }
    // Never returns a terminal result — the ladder continues (resume will no longer see the
    // released SD; the worker falls through to assignment/self-claim/idle as normal).
  },
};
