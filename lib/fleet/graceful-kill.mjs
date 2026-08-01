/**
 * SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 / FR-2 — operator-initiated graceful kill.
 *
 * THE ORDER IS NOT AN IMPLEMENTATION DETAIL, IT IS THE SAFETY PROPERTY. Every step exists
 * because a specific failure mode was measured, and each one earns its place ahead of the next:
 *
 *   1 IDENTIFY   resolve the pid and cross-check it against the SessionStart marker AND the live
 *               claude.exe image set. REFUSE on disagreement — claude_sessions.pid falls back to
 *               process.ppid, and that branch yields a SHELL WRAPPER. Killing it would terminate
 *               the wrong process. pidIsClaude is immune to this by construction: a powershell.exe
 *               is not named claude.exe.
 *   2 PROVE     sample last_tool_at TWICE. ADVANCING is the only positive proof of life;
 *               process.kill(pid, 0) is sound ONLY as a negative (it proves absence, never work).
 *   3 PRESERVE  run prepark FIRST, and HALT if the work did not become durable. Nothing below
 *               this line is reversible.
 *   4 RELEASE   hand the claim back.
 *   5 RESET     hand the work item back (FR-1).
 *   6 KILL      only now. Target the CLAUDE process, not the window, so the terminal survives
 *               and its exit is readable.
 *   7 RECORD    via spawn-control stop(), so a real fleet_verb_stop lands.
 *
 * OPERATOR-INITIATED ONLY. No watchdog may call this — ratified in two places
 * (stale-session-sweep.cjs :290 and :2058-2060). The flag below is its own; it deliberately does
 * NOT reuse FLEET_CANARY_KILL_ENABLED, whose canary-only assert is what keeps drills off
 * production seats.
 *
 * "HALT ON A DIRTY UNPUSHABLE TREE" — INTERPRETED, because the literal reading is wrong.
 *   The SD says halt on a "dirty-UNPUSHABLE tree". Read literally as "no remote", that would
 *   refuse to kill any seat in a local-only worktree — but decidePrepark documents dirty+no-remote
 *   as `commit_only`: "durable locally; the reaper protects it". Work committed locally IS
 *   preserved, so halting there protects nothing and blocks a legitimate kill.
 *   THE PROPERTY THAT MATTERS is durability, not pushability: halt when prepark did NOT make the
 *   work recoverable — it needed to commit and could not, or it needed to push and could not.
 *   A clean tree, or one prepark successfully committed and/or pushed, is safe to proceed on.
 */

// killProcessOnly, NOT killProcess: the latter routes through tree-kill, which on win32 is
// `taskkill /pid N /T /F` — it takes every DESCENDANT of the seat (dev server, leo-stack,
// background shells) and IGNORES the signal, so the SIGTERM-then-SIGKILL escalation below was two
// identical forced kills on the only platform this fleet runs on. The agent never got the chance
// to flush that the word "graceful" in this module's name promises.
import { killProcessOnly } from '../utils/process-utils.js';
import { releaseWorkItemOnSessionEnd } from './release-work-item.mjs';

/** Its OWN flag. FLEET_CANARY_KILL_ENABLED is deliberately not consulted. */
export function isGracefulKillEnabled(env = process.env) {
  return env.FLEET_GRACEFUL_KILL_ENABLED === 'on';
}

/** Ordered step names, exported so tests pin the sequence rather than restating it. */
// 'reset' sits AFTER 'kill' as of SD-LEO-INFRA-RELEASE-WORK-ITEM-001 — the hand-back now writes
// status='active', so running it pre-kill made the item claimable while its process was still alive.
export const KILL_STEPS = ['identify', 'prove', 'preserve', 'release', 'kill', 'reset', 'record'];

function verdict(outcome, step, detail, extra = {}) {
  return { outcome, haltedAt: outcome === 'killed' ? null : step, detail, ...extra };
}

/**
 * Decide whether prepark left the work recoverable. Pure, so the interpretation above is
 * testable on its own rather than only through a kill.
 * @param {{action:string, committed:boolean, pushed:boolean, note?:string}} pre
 * @param {boolean} wasDirty
 */
export function isWorkDurableAfterPrepark(pre, wasDirty) {
  if (!pre) return { durable: false, why: 'prepark produced no result' };
  if (!wasDirty && pre.action === 'noop') return { durable: true, why: 'clean tree, nothing to preserve' };
  switch (pre.action) {
    case 'noop':
      return { durable: true, why: pre.note ? `nothing to do (${pre.note})` : 'nothing to do' };
    case 'commit_only':
      // Durable WITHOUT a remote — this is the case the literal "unpushable => halt" reading
      // would have wrongly blocked.
      return pre.committed
        ? { durable: true, why: 'committed locally (no remote); recoverable from the worktree' }
        : { durable: false, why: 'needed a local commit and it did not happen' };
    case 'commit_and_push':
      if (!pre.committed) return { durable: false, why: 'needed a commit and it did not happen' };
      return pre.pushed
        ? { durable: true, why: 'committed and pushed' }
        : { durable: false, why: 'committed but the push failed — work exists only in a worktree about to lose its process' };
    case 'push_only':
      return pre.pushed
        ? { durable: true, why: 'pushed previously-committed work' }
        : { durable: false, why: 'had unpushed commits and the push failed' };
    default:
      return { durable: false, why: `unrecognised prepark action '${pre.action}'` };
  }
}

/**
 * Cross-check the pid across three independent sources. Returns the agreed pid or a refusal.
 * A disagreement is NEVER resolved by guessing — the whole point is that one of the sources
 * (claude_sessions.pid) is known to sometimes hold a shell wrapper.
 */
export function reconcilePid({ dbPid, markerPid, pidIsClaudeResult }) {
  if (!dbPid) return { ok: false, detail: 'claude_sessions.pid is null — nothing to verify or kill' };
  if (markerPid && markerPid !== dbPid) {
    return { ok: false, detail: `pid disagreement: claude_sessions.pid=${dbPid} but the SessionStart marker says ${markerPid} — refusing to guess which is the agent` };
  }
  if (pidIsClaudeResult === false) {
    return { ok: false, detail: `pid ${dbPid} is not a live claude.exe — it is most likely the shell wrapper that claude_sessions.pid falls back to (process.ppid), and killing it would terminate the wrong process` };
  }
  if (pidIsClaudeResult !== true) {
    return { ok: false, detail: `could not confirm pid ${dbPid} is a live claude.exe; refusing rather than killing an unverified pid` };
  }
  return { ok: true, pid: dbPid };
}

/**
 * Execute the graceful kill. Returns a verdict; never throws.
 * Every collaborator is injected so the ORDER can be asserted without touching a real seat.
 *
 * @returns {{outcome:'killed'|'refused'|'halted'|'disabled', haltedAt:string|null, detail:string, steps:string[]}}
 */
export async function gracefulKillSession(supabase, sessionId, deps = {}) {
  const {
    env = process.env,
    getSession,          // async () => { pid, sd_key, worktree_path }
    readMarkerPid,       // (sessionId) => number|null
    pidIsClaude,         // (pid) => boolean
    sampleToolActivity,  // async (sb, sessionId) => { ok, advancing }
    runPreparkWip,       // ({worktreePath, sdKey}) => preparkResult
    isWorktreeDirty,     // (worktreePath) => boolean
    releaseClaim,        // async (sessionId, sdKey) => { released }
    kill = killProcessOnly,
    recordStop,          // async (sessionId) => void   (spawn-control stop(); emits fleet_verb_stop)
    verifyGone,          // async (pid) => boolean      (Win32_Process name query)
    reason = 'operator_graceful_kill',
  } = deps;

  const steps = [];
  if (!isGracefulKillEnabled(env)) {
    return { ...verdict('disabled', 'identify', 'FLEET_GRACEFUL_KILL_ENABLED is not on'), steps };
  }

  try {
    // ---- 1 IDENTIFY -------------------------------------------------------------------
    steps.push('identify');
    const session = await getSession();
    if (!session) return { ...verdict('refused', 'identify', `no session row for ${sessionId}`), steps };
    const rec = reconcilePid({
      dbPid: session.pid,
      markerPid: readMarkerPid ? readMarkerPid(sessionId) : null,
      pidIsClaudeResult: pidIsClaude ? pidIsClaude(session.pid) : undefined,
    });
    if (!rec.ok) return { ...verdict('refused', 'identify', rec.detail), steps };

    // ---- 2 PROVE ----------------------------------------------------------------------
    steps.push('prove');
    const activity = await sampleToolActivity(supabase, sessionId);
    // NOTE: an ADVANCING sample means the agent is actively working. That is not a reason to
    // refuse an OPERATOR-initiated kill — the operator can see the seat and has decided. It is
    // recorded so the verdict says what was true at the moment of the kill.
    const wasAdvancing = activity && activity.ok === true && activity.advancing === true;

    // ---- 3 PRESERVE (last reversible step) ---------------------------------------------
    steps.push('preserve');
    const wasDirty = isWorktreeDirty ? isWorktreeDirty(session.worktree_path) : false;
    const pre = runPreparkWip({ worktreePath: session.worktree_path, sdKey: session.sd_key });
    const durability = isWorkDurableAfterPrepark(pre, wasDirty);
    if (!durability.durable) {
      return {
        ...verdict('halted', 'preserve', `WIP is not recoverable — ${durability.why}. Refusing to kill; nothing has been released or terminated.`),
        steps, prepark: pre, wasAdvancing,
      };
    }

    // ---- 4 RELEASE --------------------------------------------------------------------
    steps.push('release');
    const rel = releaseClaim ? await releaseClaim(sessionId, session.sd_key) : { released: true };

    // ---- 5 KILL -----------------------------------------------------------------------
    steps.push('kill');
    await kill(rec.pid, 'SIGTERM');
    // QF-20260728-054 — FAIL CLOSED when no verifier is supplied.
    //
    // These two lines used to default to `true`. fleet-kill.mjs then omitted verifyGone on the
    // production path, so `gone` was unconditionally true, the SIGKILL escalation below was dead
    // code, and this function returned "terminated and verified absent" having verified nothing.
    // That live half is fixed — fleet-kill.mjs now supplies a real Win32 probe — but the DEFAULT
    // was left as-is, which leaves the trap armed for the next caller: omit the verifier and the
    // library hands you a confident attestation for free.
    //
    // Absence of a verifier is not evidence of death. Defaulting to false costs a caller that
    // genuinely cannot verify an honest 'refused' outcome; defaulting to true costs a destructive
    // operation that lies about what it observed. Same reasoning fleet-kill.mjs already applies to
    // its own tri-state, where PROBE_FAILED and MATCH both report not-gone.
    const verified = typeof verifyGone === 'function' ? verifyGone : null;
    let gone = verified ? await verified(rec.pid) === true : false;
    if (!gone) {
      await kill(rec.pid, 'SIGKILL');
      gone = verified ? await verified(rec.pid) === true : false;
    }

    // ---- 6 RESET ----------------------------------------------------------------------
    // ORDER IS LOAD-BEARING, AND IT MOVED. This ran BEFORE the kill until
    // SD-LEO-INFRA-RELEASE-WORK-ITEM-001, which was safe only because the reset was a NO-OP for SDs:
    // the helper wrote nothing unless rewindPhase was set, and this site does not set it. That SD
    // makes the reset always write status='active' — so at the old position the row became
    // CLAIMABLE, and its SD-scoped worktree re-enterable, while the process being killed was still
    // running and unverified. A second seat could enter a live worktree. The fix is the ordering,
    // not a guard: nothing may hand the work item back until the holder is provably gone.
    //
    // Hence `gone &&`. If SIGTERM and SIGKILL both fail to verify, the item is deliberately NOT
    // handed back and the row stays in_progress — unclaimable, which is the correct fail-closed
    // outcome for "we could not prove the process is dead". Same polarity as the verifyGone default
    // above: absence of a verifier is not evidence of death, and neither is a failed kill.
    //
    // Still gated on the release having gone through — with the release unproven the hand-back
    // predicate cannot be trusted to protect an item carrying real work.
    steps.push('reset');
    let handback = null;
    if (gone && rel && rel.released !== false && session.sd_key) {
      handback = await releaseWorkItemOnSessionEnd(supabase, session.sd_key, reason);
    }

    // ---- 7 RECORD ---------------------------------------------------------------------
    // stop() also re-runs release + hand-back; both are CAS-guarded and idempotent, so the
    // second pass is a no-op. It is called for the fleet_verb_stop event, which is the only
    // durable record that this kill happened.
    steps.push('record');
    if (recordStop) await recordStop(sessionId);

    return {
      outcome: gone ? 'killed' : 'refused',
      haltedAt: gone ? null : 'kill',
      detail: gone
        ? `claude pid ${rec.pid} terminated and verified absent; terminal left running`
        : `pid ${rec.pid} still present after SIGTERM then SIGKILL — reporting failure rather than a status flip`,
      steps, prepark: pre, handback, wasAdvancing,
    };
  } catch (err) {
    return { ...verdict('refused', steps[steps.length - 1] || 'identify', `unexpected error: ${(err && err.message) || err}`), steps };
  }
}
