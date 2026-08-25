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
 *
 * SD PHASE REWIND IS OPT-IN (`rewindPhase`, default FALSE) — corrected during FR-1b.
 *   The SD frames the helper as "for an SD: resetSdPhaseOnRelease", which reads as though every
 *   release path should rewind current_phase. Surveying the actual call sites disproves that:
 *     - stale-session-sweep.cjs WANTS the rewind. Its PHASE_RESET_MAP exists so an SD is not
 *       "left in mid-phase limbo with no active claimer", and it passes rewindPhase:true.
 *     - coordinator-cold-recovery.cjs FORBIDS it, in its own words: "PRESERVES current_phase +
 *       progress (resume, not restart)". Rewinding there would convert a resume into a restart
 *       and discard the phase/progress the whole path exists to protect.
 *     - claim-validity-gate.js releases a dead/drifted owner so the NEXT claimer can pick the SD
 *       up. The fleet's resume contract (worker-checkin resume_orphan: "reads the SD's live
 *       current_phase ... NOT a restart — keep existing commits/PRD/handoffs") means preserving
 *       is correct there too.
 *   So the rewind is a per-site POLICY, not a property of releasing. Defaulting it ON would make
 *   every future call site silently inherit a behaviour that contradicts its own documented
 *   intent, and would do so invisibly — the SD would simply come back one phase earlier.
 *   Returning a QF to the open pool carries no such ambiguity and is always applied.
 *
 * THE SIXTEEN-SITE LEDGER, RESOLVED (FR-1b). The SD lists sixteen release/clear sites to
 * convert. Surveyed one by one, they are NOT uniform, and mechanically wiring all sixteen would
 * have caused three distinct regressions. The list says WHERE TO LOOK, not WHAT TO DO.
 *
 *   WIRED (5) — the holder is gone and the item is genuinely abandoned:
 *     lib/fleet/spawn-control.js stop()            flagged
 *     scripts/stale-session-sweep.cjs              UNFLAGGED + rewindPhase:true (pre-existing
 *                                                  behaviour; flagging it would have DISABLED
 *                                                  live protection on merge)
 *     lib/commands/claim-command.js releaseClaim() flagged
 *     lib/claim-validity-gate.js                   flagged (dead / drifted owner)
 *     scripts/worker-checkin.cjs selfHealStaleClaim flagged (QF-capable: self_claimed_qf puts a
 *                                                  QF id in claude_sessions.sd_key)
 *
 *   EXEMPT — WIRING WOULD CAUSE HARM (3):
 *     lib/claim-guard.mjs                  release-then-REACQUIRE; reopening in that window
 *                                          manufactures a steal race that does not exist today
 *     lib/claim-lifecycle-release.mjs      worker is STILL ALIVE and shipping; handing back
 *                                          invites a second worker onto live work
 *     scripts/coordinator-cold-recovery.cjs rewind would convert resume into restart
 *
 *   EXEMPT — TERMINAL, NOT A HAND-BACK (3): the item is not returning to any pool.
 *     scripts/cancel-sd.js (cancelled) · complete-quick-fix/orchestrator.js (completed) ·
 *     lib/sd-creation/source-adapters/qf.js (escalated to an SD)
 *
 *   NO-OP BY CONSTRUCTION (4): these resolve their key from strategic_directives_v2, so it is
 *     never a QF, and with rewindPhase defaulting false the helper returns immediately. Wiring
 *     them adds a call and changes nothing.
 *     lib/drain-orchestrator.mjs · lib/coordinator/singleton-refresh-sequencer.cjs ·
 *     scripts/claim-orchestrator-for-rollup.mjs ·
 *     scripts/modules/handoff/gates/multi-session-claim-gate.js
 *
 *   EXEMPT — THE SHORTCUT TRAP (1):
 *     lib/claim/release-claim-both-surfaces.mjs — the shared release primitive. Wiring the
 *     hand-back HERE would look like fixing every site at once, and would instead force it onto
 *     the three harmful-if-wired sites above, all of which call it. Warning recorded in that file.
 *
 *   The QF-vs-SD discriminator that drives most of this: a site whose key comes from
 *   claude_sessions.sd_key CAN be holding a quick-fix; one whose key comes from
 *   strategic_directives_v2 cannot.
 */

import { assertSweepHandoffGate } from '../exec-context-guard.mjs';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
// probeAhead, NOT countAhead: countAhead collapses every failure to 0, which for this caller reads
// as 'no work, safe to revert'. See the pre-flight comment in the SD branch.
const { probeAhead } = require_('./branch-ahead.cjs');

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
  // rewindPhase defaults FALSE — see the "SD PHASE REWIND IS OPT-IN" note in the module
  // header. Returning a QF to the open pool is universally correct for a hand-back; rewinding
  // an SD's phase is a POLICY that several release paths explicitly forbid.
  // worktreePath feeds the SD pre-flight below. It is OPTIONAL and its absence is NOT treated as
  // "no work" — a caller that cannot supply it simply gets no advisory layer, and the atomic guard
  // (status + claiming_session_id) still applies. Supplying a path that turns out to be unreadable
  // is the case that SKIPS, because that is the state we cannot distinguish from real work.
  const { onLog = () => {}, rewindPhase = false, worktreePath = null } = opts;
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

    // ---- SD branch ----
    //
    // *** THE STATUS REVERT IS NOT GATED ON rewindPhase, AND THAT IS THE WHOLE DEFECT. ***
    // This used to return here whenever rewindPhase was false — which is 4 of the 5 wired call
    // sites — with the detail string "claim released, phase preserved for resume". THE CLAIM WAS
    // NOT RELEASED. Only current_phase was ever written; status stayed in_progress, and the claim
    // path filters on STATUS with a positive allowlist (.in('status',['draft','active'])), so the
    // row became permanently unofferable. A released SD sat unreachable for hours, twice, including
    // a chairman-owned security item.
    //
    // The module header already draws the line this restores: returning an item to the pool is
    // ALWAYS correct; rewinding phase is per-site POLICY. So status reverts unconditionally and only
    // the phase component honours rewindPhase.
    const { data: sd, error: readErr } = await supabase
      .from('strategic_directives_v2')
      .select('sd_key, current_phase, status')
      .eq('sd_key', workItemKey)
      .maybeSingle();

    if (readErr) return { ok: false, kind: 'sd', action: 'error', reason, detail: readErr.message };
    if (!sd) return { ok: true, kind: 'sd', action: 'sd_no_reset', reason, detail: 'SD not found (vanished or unknown key)' };

    const resetTo = PHASE_RESET_MAP[sd.current_phase];

    // *** PRE-FLIGHT, NOT A GUARD — SAID PLAINLY BECAUSE THE PHRASE IS THE POINT. ***
    // The QF branch guards on FOUR columns (status, claiming_session_id, pr_url, commit_sha) and its
    // comment says "the UPDATE is the guard". THREE OF THOSE FIVE COLUMNS DO NOT EXIST HERE:
    // strategic_directives_v2 has status and claiming_session_id but NOT pr_url, commit_sha or
    // branch_name (verified by information_schema, with quick_fixes as the positive control).
    //
    // A git measurement is the only work signal available — and it is STRICTLY BETTER on coverage,
    // because it sees UNPUSHED commits that pr_url never could, which was the actual state of one
    // stranded branch. But it is STRICTLY WORSE on atomicity: A SUBPROCESS RESULT IS NOT A COLUMN,
    // so putting it "in the guard" forces read-check-write and reintroduces exactly the race the QF
    // comment exists to prevent.
    //
    // Hence two explicit layers, and the next reader must not inherit five-column confidence from a
    // two-column predicate — that inheritance is the same mistake as the phrase "guarded
    // identically" that started this SD:
    //   ATOMIC   (WHERE clause): status = in_progress AND claiming_session_id IS NULL
    //   ADVISORY (this pre-flight, NON-atomic): no unpushed commits
    //
    // FAIL DIRECTION IS DELIBERATE. probeAhead separates "measured zero" from "could not measure",
    // because countAhead collapses both to 0 — safe for prepark-wip, which runs inside the worktree
    // it measures, and dangerous here, where 0 would read as "no work, safe to revert" for a
    // worktree that has simply been archived. Indeterminate SKIPS, matching assertSweepHandoffGate
    // below and sampleToolActivityTwice: an unreadable sample must not look like an answer.
    // ⚠ NOT WIRED, AND DO NOT WIRE IT WITHOUT RE-SPECIFYING IT FIRST. Zero of the six callers pass
    // worktreePath, so this whole block is inert. That is not an oversight left for you to finish —
    // I TRIED to finish it, and wiring it at either concrete candidate STRANDS ROWS, for OPPOSITE
    // reasons:
    //   stale-session-sweep — release_sd NULLs worktree_path (migration 20260727, line 93), so the
    //     only capture point is the pre-release re-read at step 1a; and a released session's worktree
    //     is routinely archived, so the probe reads INDETERMINATE and skips.
    //   graceful-kill      — step 3 runs prepark-wip, which COMMITS AND PUSHES the WIP, so by the
    //     time step 5 gets here origin/main..HEAD is GUARANTEED non-zero and this skips EVERY time.
    // Either wiring reintroduces the exact bug this SD exists to fix, at fleet scale.
    //
    // THE PREMISE IS WRONG, NOT THE PLUMBING. This asks "does the branch carry commits"; the question
    // that matters is "would this work be LOST". Those diverge precisely when the branch is PUSHED —
    // pushed commits are not lost when a row becomes claimable again, that is exactly how sd-start
    // resume works. Loss risk is UNCOMMITTED-or-UNPUSHED; ahead-of-main is neither. This is the same
    // error as the range bug below, one level up: measuring branch state instead of loss risk.
    // Flagged to the coordinator for a ruling; probeAhead itself is sound and worth keeping.
    if (worktreePath) {
      // RANGE CHOICE, FOUND BY A FAILING TEST RATHER THAN BY REASONING. The first cut used
      // '@{u}..HEAD' — commits ahead of UPSTREAM — which is the literal reading of "unpushed work".
      // It reports 0 for a branch that has been PUSHED but not merged, and that branch is carrying
      // real work by any sane definition; the SD's own example is 5 commits WITH an open PR. Worse,
      // a never-pushed branch has no upstream at all, so '@{u}' fails to resolve and the probe goes
      // INDETERMINATE — safe, but for the wrong reason, and it would have masked the range bug.
      // 'origin/main..HEAD' resolves for any local branch and counts everything not yet on main.
      // It is the right range for "does this branch carry commits" — but see the NOT WIRED note
      // above: that is NOT the same question as "would this work be lost", and this block was
      // built as though it were.
      const probe = probeAhead(worktreePath, 'origin/main..HEAD');
      if (!probe.ok) {
        onLog(`SKIP_RESET: ${workItemKey} — ${reason} — branch state indeterminate (${probe.reason})`);
        return { ok: true, kind: 'sd', action: 'sd_no_reset', reason, detail: `could not determine branch state, so the row was left alone (${probe.reason})` };
      }
      if (probe.count > 0) {
        // SAYS "not on main", NOT "unpushed" — the range counts BOTH, and the two are not the same.
        // This branch reads 4 against origin/main while being fully pushed; a message calling those
        // "unpushed" would be reporting a falsehood to whoever reads the sweep log.
        onLog(`SKIP_RESET: ${workItemKey} — ${reason} — ${probe.count} commit(s) not on main`);
        return { ok: true, kind: 'sd', action: 'sd_no_reset', reason, detail: `${probe.count} commit(s) not yet on main — may be real work, not reverted` };
      }
    }

    // CARRIED GUARD (see the decision above): never rewind past an ACCEPTED handoff.
    // Only consulted when a phase rewind is actually on the table — it is a PHASE gate, and letting
    // it block the STATUS revert would recreate the unreachability this SD fixes by another route.
    const wantPhaseRewind = Boolean(rewindPhase && resetTo);
    let phaseBlocked = null;
    if (wantPhaseRewind) {
      try {
        await assertSweepHandoffGate(supabase, workItemKey, resetTo);
      } catch (err) {
        phaseBlocked = (err && err.code) || 'UNKNOWN';
        onLog(`SKIP_PHASE_REWIND: ${workItemKey} — ${reason} — ${phaseBlocked}: ${err && err.message ? err.message : err}`);
      }
    }

    // ONE guarded UPDATE. status always; current_phase only when the rewind was requested, mapped
    // and un-blocked. Applying the predicate in the WHERE clause (not read-then-write) means a
    // claimant arriving mid-flight loses the row from the predicate rather than racing us.
    const patch = { status: 'active', lifecycle_write_token: 'release-work-item.mjs' };
    const doPhase = wantPhaseRewind && !phaseBlocked;
    if (doPhase) patch.current_phase = resetTo;

    const { data: updated, error: updErr } = await supabase
      .from('strategic_directives_v2')
      .update(patch)
      .eq('sd_key', workItemKey)
      .filter('status', 'eq', 'in_progress')
      .is('claiming_session_id', null)
      .select('sd_key');

    if (updErr) return { ok: false, kind: 'sd', action: 'error', reason, detail: updErr.message };

    const released = Array.isArray(updated) && updated.length > 0;
    if (!released) {
      return { ok: true, kind: 'sd', action: 'sd_no_reset', reason, detail: 'predicate did not match (already released, or a claimant arrived)' };
    }
    onLog(doPhase
      ? `WORK_ITEM_RESET: ${workItemKey} in_progress → active, ${sd.current_phase} → ${resetTo} (${reason})`
      : `WORK_ITEM_RESET: ${workItemKey} in_progress → active (${reason})`);
    return {
      ok: true,
      kind: 'sd',
      action: doPhase ? 'sd_phase_reset' : 'sd_status_reset',
      reason,
      detail: doPhase ? `in_progress → active, ${sd.current_phase} → ${resetTo}` : 'in_progress → active (phase preserved)'
    };
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
