/**
 * SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 / FR-5b — the death test and the reap decision.
 *
 * CHAIRMAN OVERRIDE 2026-07-27 supersedes report-only: "I think you need to be more aggressive
 * with the 119 terminals." The reaper ships. Authority is recorded on the SD as
 * metadata.chairman_override_fr5 + fr5_reap_authorized, alongside evidence of an ALREADY-EXECUTED
 * reap: 149 consoles measured, 148 with zero descendants killed, 0 failures, 1 occupied console
 * spared, WindowsTerminal host intact, all 15 live claude.exe untouched.
 *
 * WHY REAPING EMPTY CONSOLES IS SAFE — the asymmetry is the whole argument. The test is
 * "contains no process", so a FALSE POSITIVE CANNOT DESTROY WORK: there is nothing in an empty
 * console to lose. That asymmetry is what makes this shippable at all, and it is why the
 * pre-kill re-check below matters more than the scan that preceded it.
 *
 * DEAD IS THE AND OF TWO INDEPENDENT LEGS. NEITHER IS SUFFICIENT:
 *   (A) the pid is ABSENT from a Win32_Process claude.exe NAME query. Immune to the wrapper-pid
 *       error BY CONSTRUCTION — claude_sessions.pid falls back to process.ppid, and a
 *       powershell.exe is simply not named claude.exe, so the wrong pid cannot pass this leg.
 *   (B) last_tool_at is IDENTICAL across two samples >= 10 minutes apart (FR-1's
 *       sampleToolActivityTwice, same primitive FR-2 uses at the opposite polarity).
 *
 * EXPLICITLY EXCLUDED, with the reason recorded here so they are not re-added:
 *   heartbeat_at        — keeps ticking on a PARKED worker whose agent is idle. Four false
 *                         "fleet down" verdicts are on record from reading it as activity.
 *   is_alive            — a derived column, only as good as whatever last wrote it.
 *   process_alive_at    — same class: a stamp, not an observation.
 *   process.kill(pid,0) as a POSITIVE — sound ONLY as a negative. It proves a pid is absent;
 *                         it never proves the agent behind it is doing anything.
 *   window presence     — a Cursor pane has NO window object, and an empty console HAS one. It
 *                         is anti-correlated with life here: all 15 live claude.exe on this host
 *                         are grandchildren of Cursor.exe via powershell, while the 148 reaped
 *                         consoles were top-level windows containing nothing.
 *
 * SEAT-TO-WINDOW BINDING IS NOT ATTEMPTED and must not be. Capture is structurally a spawn-time
 * before/after difference with no post-hoc recovery, and a Cursor pane has no window object at
 * all. This module never claims to know which seat owns which console.
 */

/** Minimum gap between the two last_tool_at samples. Leg B is meaningless below this. */
export const MIN_ACTIVITY_SAMPLE_GAP_MS = 600_000;

/**
 * Leg A + leg B. Pure.
 * @param {{absentFromClaudeImages: boolean|null, activitySample: {ok:boolean, identical:boolean, intervalMs:number}|null}} o
 * @returns {{dead: boolean, legA: boolean, legB: boolean, why: string}}
 */
export function isSeatDead({ absentFromClaudeImages, activitySample } = {}) {
  // An UNKNOWN leg is not a passing leg. Both probes must have actually answered.
  const legA = absentFromClaudeImages === true;
  const sampleUsable = Boolean(
    activitySample && activitySample.ok === true &&
    Number.isFinite(activitySample.intervalMs) &&
    activitySample.intervalMs >= MIN_ACTIVITY_SAMPLE_GAP_MS
  );
  const legB = sampleUsable && activitySample.identical === true;

  if (legA && legB) {
    return { dead: true, legA, legB, why: 'absent from the claude.exe image set AND last_tool_at did not move across the sampling window' };
  }
  const reasons = [];
  if (!legA) {
    reasons.push(absentFromClaudeImages === false
      ? 'a live claude.exe still carries this pid'
      : 'could not confirm absence from the claude.exe image set');
  }
  if (!legB) {
    if (!activitySample || activitySample.ok !== true) reasons.push('the activity sample failed — an unreadable sample is not evidence of death');
    else if (!Number.isFinite(activitySample.intervalMs) || activitySample.intervalMs < MIN_ACTIVITY_SAMPLE_GAP_MS) {
      reasons.push(`the two samples were less than ${MIN_ACTIVITY_SAMPLE_GAP_MS / 60000} minutes apart`);
    } else reasons.push('last_tool_at advanced between samples — the agent is working');
  }
  return { dead: false, legA, legB, why: reasons.join('; ') };
}

/**
 * Is this console reapable? Pure. `descendantCount` must come from a REAL observation —
 * see enumerateWindowsStrict (FR-5a): a failed enumeration must never arrive here as zero.
 */
export function isConsoleReapable({ descendantCount, observed = true } = {}) {
  if (observed !== true) {
    return { reapable: false, why: 'the console was not actually observed — a failed probe is not an empty console' };
  }
  if (!Number.isFinite(descendantCount)) {
    return { reapable: false, why: 'descendant count unknown' };
  }
  return descendantCount === 0
    ? { reapable: true, why: 'zero descendants — nothing in it to lose' }
    : { reapable: false, why: `${descendantCount} descendant process(es) — occupied` };
}

/**
 * Reap a set of candidate consoles.
 *
 * THE PRE-KILL RE-CHECK IS THE SAFETY MECHANISM, NOT THE SCAN. The scan is a snapshot; a console
 * can gain a child between scanning and killing. Adam's executed reap re-checked EACH process
 * IMMEDIATELY BEFORE killing it and spared anything that had gained one — that is the behaviour
 * reproduced here, and it is why a stale scan cannot destroy work.
 *
 * @returns {{killed:number[], spared:Array<{pid:number,why:string}>, failed:Array<{pid:number,error:string}>}}
 */
export async function reapEmptyConsoles(candidates, deps = {}) {
  const { recheckDescendants, kill, onLog = () => {}, env = process.env } = deps;
  const killed = [], spared = [], failed = [];

  // THE GATE BELONGS ON THE FUNCTION THAT KILLS, not only on its caller. runReaperOnce checks the
  // same flag, but this is the function that actually invokes `kill` — and a guard one level above
  // the primitive holds only while today's single caller remains the only one. Raised by the EXEC
  // TESTING pass, which noted graceful-kill gates twice (CLI + orchestrator) while this gated once.
  if (String(env.FLEET_CONSOLE_REAPER_ENABLED || '') !== 'on') {
    return { killed, spared, failed, refused: 'FLEET_CONSOLE_REAPER_ENABLED is not on' };
  }

  for (const c of candidates || []) {
    const pid = c && c.pid;
    if (!Number.isFinite(pid)) { spared.push({ pid, why: 'no pid' }); continue; }

    // Re-observe RIGHT NOW, ignoring whatever the scan said.
    let live;
    try {
      live = await recheckDescendants(pid);
    } catch (err) {
      spared.push({ pid, why: `re-check failed (${(err && err.message) || err}) — refusing to kill on an unverified console` });
      continue;
    }
    const verdict = isConsoleReapable(live);
    if (!verdict.reapable) {
      spared.push({ pid, why: verdict.why });
      onLog(`SPARED console ${pid}: ${verdict.why}`);
      continue;
    }

    try {
      await kill(pid);
      killed.push(pid);
    } catch (err) {
      failed.push({ pid, error: (err && err.message) || String(err) });
    }
  }

  onLog(`reap complete: killed=${killed.length} spared=${spared.length} failed=${failed.length}`);
  return { killed, spared, failed };
}
