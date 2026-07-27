/**
 * SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 / FR-1
 *
 * releaseWorkItemOnSessionEnd() — the ONE work-item reset every release path calls,
 * plus sampleToolActivityTwice(), the ONE two-sample activity primitive.
 *
 * WHY THIS EXISTS
 *   The work-item reset lives today on exactly ONE release path
 *   (scripts/stale-session-sweep.cjs, the CLAIM_BOUNDARY_PROBE branch). Every other
 *   release path clears the CLAIM but leaves the work item itself in a state no picker
 *   can see: a QF stays status='in_progress' with no claimant, so the check-in open-QF
 *   picker (which selects status='open') cannot reach it, while the coordinator's supply
 *   gauge still counts it as available. The item reads as owned and is reachable by
 *   nobody. lib/fleet/spawn-control.js:538 stop() is itself one of these — it marks the
 *   row released and never touches the work item — which is why a Kill button built
 *   before this helper would manufacture strands faster than hand-closing windows does.
 *
 * THE isSweepResetAllowed DECISION — RESOLVED, and the SD's framing was wrong
 *   The SD records an unresolved decision: "the reset is gated by isSweepResetAllowed,
 *   so extracting it forces a choice — carry the guard and every caller inherits sweep
 *   semantics, or drop it and lose a predicate that exists because it was needed."
 *   That is a FALSE DILEMMA, because it conflates the two branches. Measured in
 *   scripts/stale-session-sweep.cjs at the CLAIM_BOUNDARY_PROBE site:
 *
 *     - The QF branch (:237-239) is NOT gated by isSweepResetAllowed AT ALL. Its guard
 *       is the column predicate itself — status='in_progress' AND claiming_session_id IS
 *       NULL AND pr_url IS NULL AND commit_sha IS NULL. Nothing to carry or drop.
 *     - The SD branch (:242) calls resetSdPhaseOnRelease, and only THAT is gated.
 *
 *   And the guard is not "sweep semantics". lib/exec-context-guard.mjs
 *   assertSweepHandoffGate answers one question: would resetting this SD to
 *   targetResetPhase override a handoff that has ALREADY BEEN ACCEPTED past that phase?
 *   The name says "Sweep" only because the sweep was its first caller. Overriding an
 *   accepted handoff is wrong for EVERY release path, not just the sweep.
 *
 *   RESOLUTION: CARRY the guard on the SD branch — every caller SHOULD inherit it,
 *   because it protects a real invariant rather than a sweep-local policy. The QF branch
 *   carries no guard because it never had one; its column predicate IS the guard.
 *   CONSEQUENCE OF THE LOSING OPTION, recorded as the PRD requires: dropping the guard
 *   would let any release path silently rewind an SD whose next phase was already
 *   accepted, reintroducing exactly the override that SD-FDBK-INFRA-EXEC-CONTEXT-GUARD-001
 *   added it to prevent.
 *
 * FLAGGING: this module is inert until wired. The per-site conversion (FR-1b) is what
 *   sits behind LEO_RELEASE_WORKITEM_RESET (default OFF) — see isReleaseWorkItemResetEnabled.
 */

import { assertSweepHandoffGate } from '../exec-context-guard.mjs';

/** Mid-phase state → the safe boundary it rewinds to. Mirrors the sweep's map. */
export const PHASE_RESET_MAP = {
  EXEC: 'PLAN_PRD',
  EXEC_COMPLETE: 'PLAN_PRD',
  PLAN_VERIFICATION: 'PLAN_PRD',
  LEAD_APPROVAL: 'LEAD',
  LEAD_FINAL_APPROVAL: 'LEAD_FINAL',
};

/**
 * FR-1b gate. Default OFF: an unset/absent value must never enable conversion, so the
 * check is an explicit opt-in equality rather than a truthiness test.
 */
export function isReleaseWorkItemResetEnabled(env = process.env) {
  return env.LEO_RELEASE_WORKITEM_RESET === 'on';
}

/** A work item is a quick-fix iff its key carries the QF- prefix; everything else is an SD. */
export function isQuickFixKey(workItemKey) {
  return typeof workItemKey === 'string' && /^QF-/.test(workItemKey);
}

/**
 * Reset ONE work item so a picker can see it again, after its claim has been released.
 *
 * Returns a verdict object — never throws. A release path must not abort because a reset
 * failed; the claim is already gone and the next sweep re-converges.
 *   { ok, kind, action, reason, detail }
 *   action: 'qf_reopened' | 'qf_untouched' | 'sd_phase_reset' | 'sd_no_reset' | 'skipped' | 'error'
 */
export async function releaseWorkItemOnSessionEnd(supabase, workItemKey, reason, opts = {}) {
  const { onLog = () => {} } = opts;
  if (!supabase || !workItemKey) {
    return { ok: false, kind: null, action: 'skipped', reason, detail: 'missing supabase client or work item key' };
  }

  try {
    if (isQuickFixKey(workItemKey)) {
      // Guarded on EVERY column so an item carrying real work (a PR or a commit) or a
      // fresh claimant is never reverted. The UPDATE is the guard — it is applied in the
      // WHERE clause, not read-then-written, so a claimant arriving mid-flight loses the
      // row from the predicate rather than racing us.
      const { data, error } = await supabase
        .from('quick_fixes')
        .update({ status: 'open' })
        .eq('id', workItemKey)
        .filter('status', 'eq', 'in_progress')
        .is('claiming_session_id', null)
        .is('pr_url', null)
        .is('commit_sha', null)
        .select('id');

      if (error) {
        return { ok: false, kind: 'qf', action: 'error', reason, detail: error.message };
      }
      const reopened = Array.isArray(data) && data.length > 0;
      if (reopened) onLog(`WORK_ITEM_RESET: ${workItemKey} in_progress → open (${reason})`);
      return {
        ok: true,
        kind: 'qf',
        action: reopened ? 'qf_reopened' : 'qf_untouched',
        reason,
        detail: reopened
          ? 'no claimant, no pr_url, no commit_sha — returned to the open pool'
          : 'predicate did not match (already open, or carries a claimant / pr_url / commit_sha)',
      };
    }

    // ---- SD branch: rewind to the safe phase boundary, guarded ----
    const { data: sd, error: readErr } = await supabase
      .from('strategic_directives_v2')
      .select('sd_key, current_phase, status')
      .eq('sd_key', workItemKey)
      .maybeSingle();

    if (readErr) return { ok: false, kind: 'sd', action: 'error', reason, detail: readErr.message };
    if (!sd) return { ok: true, kind: 'sd', action: 'sd_no_reset', reason, detail: 'SD not found (vanished or unknown key)' };

    const resetTo = PHASE_RESET_MAP[sd.current_phase];
    if (!resetTo) {
      return { ok: true, kind: 'sd', action: 'sd_no_reset', reason, detail: `current_phase '${sd.current_phase}' is already a safe boundary` };
    }

    // CARRIED GUARD (see the decision above): never rewind past an ACCEPTED handoff.
    // Fail-soft in both directions — a guard that cannot answer must not authorise the
    // write, and must not abort the caller either.
    try {
      await assertSweepHandoffGate(supabase, workItemKey, resetTo);
    } catch (err) {
      const code = (err && err.code) || 'UNKNOWN';
      onLog(`SKIP_RESET: ${workItemKey} — ${reason} — ${code}: ${err && err.message ? err.message : err}`);
      return { ok: true, kind: 'sd', action: 'sd_no_reset', reason, detail: `handoff gate blocked the reset (${code})` };
    }

    const { error: updErr } = await supabase
      .from('strategic_directives_v2')
      .update({ current_phase: resetTo })
      .eq('sd_key', workItemKey);

    if (updErr) return { ok: false, kind: 'sd', action: 'error', reason, detail: updErr.message };
    onLog(`PHASE_RESET: ${workItemKey} ${sd.current_phase} → ${resetTo} (${reason})`);
    return { ok: true, kind: 'sd', action: 'sd_phase_reset', reason, detail: `${sd.current_phase} → ${resetTo}` };
  } catch (err) {
    return { ok: false, kind: null, action: 'error', reason, detail: (err && err.message) || String(err) };
  }
}

/**
 * Sample claude_sessions.last_tool_at TWICE, intervalMs apart.
 *
 * THE SINGLE OWNER of the two-sample pattern, consumed at OPPOSITE POLARITY by two FRs:
 *   FR-2 (graceful kill) needs ADVANCING — it is the only positive proof of life.
 *     process.kill(pid, 0) is sound ONLY as a negative: it proves a pid is absent, never
 *     that the agent behind it is doing anything.
 *   FR-5 (reaping) needs IDENTICAL across >= 10 minutes as leg B of its DEAD test.
 * Zero two-sample implementations existed in this repo before this one; without a single
 * owner the two consumers would each grow their own and drift apart.
 *
 * DELIBERATELY NOT USED HERE: heartbeat_at. It keeps ticking on a parked worker whose
 * agent is idle — four false "fleet down" verdicts are on record from reading it as
 * activity. last_tool_at moves only when a tool actually ran.
 *
 * Returns { ok, advancing, identical, first, second, intervalMs, detail }.
 * Never throws: a read failure yields ok:false with advancing/identical BOTH false, so a
 * failed sample can neither authorise a kill (needs advancing) nor authorise a reap
 * (needs identical). An unreadable sample must not look like an answer.
 */
export async function sampleToolActivityTwice(supabase, sessionId, opts = {}) {
  const { intervalMs = 600_000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = opts;

  const readOnce = async () => {
    const { data, error } = await supabase
      .from('claude_sessions')
      .select('last_tool_at')
      .eq('session_id', sessionId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? data.last_tool_at ?? null : null;
  };

  if (!supabase || !sessionId) {
    return { ok: false, advancing: false, identical: false, first: null, second: null, intervalMs, detail: 'missing supabase client or session id' };
  }

  try {
    const first = await readOnce();
    await sleep(intervalMs);
    const second = await readOnce();

    // identical covers the never-ran-a-tool case (null === null): a session that has
    // never moved is, for FR-5's purposes, not advancing.
    const identical = first === second;
    const advancing = !identical && second !== null;

    return {
      ok: true,
      advancing,
      identical,
      first,
      second,
      intervalMs,
      detail: advancing
        ? 'last_tool_at advanced between samples — the agent is alive'
        : 'last_tool_at did not advance between samples',
    };
  } catch (err) {
    return {
      ok: false,
      advancing: false,
      identical: false,
      first: null,
      second: null,
      intervalMs,
      detail: `sample failed: ${(err && err.message) || err}`,
    };
  }
}
