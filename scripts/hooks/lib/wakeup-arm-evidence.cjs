'use strict';
/**
 * SD-LEO-INFRA-TERMINAL-RITUAL-ENFORCEMENT-001 — STEP 0 (safe-alone).
 *
 * Three things the enforcement needs BEFORE it is allowed to enforce anything:
 *   1. KILL-SWITCH READ PLUMBING — a runtime, DB-read, fail-open-to-OFF gate.
 *   2. The ARM PREDICATE over the transcript, with "current turn" defined explicitly.
 *   3. Two-verdict OBSERVATION (first-read vs post-stabilisation) so the flush-race
 *      frequency is MEASURED before step A depends on it.
 *
 * WHY THE PLUMBING SHIPS FIRST (the hole this closes): hooks execute from each seat's OWN
 * worktree checkout, so a merge to main does NOT reach running seats — adoption is staggered.
 * That softens "the whole fleet breaks at once", but it cuts BOTH ways: if the kill switch's
 * own reader arrives on that same staggered schedule, every seat running a pre-switch commit
 * is UNSWITCHABLE-OFF. The reader must therefore be live on a seat BEFORE any code consults it.
 *
 * NOTHING HERE DECIDES ANYTHING IN STEP 0. The predicate is computed and printed only.
 * Step A wires awaitStableVerdict() to the block decision; this module is its single source.
 */

// ── Kill switch ──────────────────────────────────────────────────────────────
// session_coordination has CHECK valid_target: (target_session IS NOT NULL) OR
// (target_sd IS NOT NULL). A null-targeted "fleet broadcast" row is therefore STRUCTURALLY
// UNINSERTABLE — verified empirically 2026-08-02 (insert rejected). The broadcast is carried
// on target_sd instead, using a sentinel that can never collide with a real SD key.
const FLEET_BROADCAST_SD = '__FLEET_ENFORCEMENT__';
const KILL_SWITCH_KIND = 'fleet_enforcement_kill';
const ENFORCEMENT_ID = 'stop_loop_wakeup_reminder';
const WIND_DOWN_WINDOW_MS = 10 * 60 * 1000;

/**
 * PostgREST or-filter admitting BOTH legs in the ONE round-trip the hook already makes:
 *   leg 1 — this session's own recent rows (the existing wind-down probe, unchanged semantics)
 *   leg 2 — live fleet kill-switch broadcasts (not expired)
 * Each leg carries its OWN time bound inside the and(...) group, so the result set stays small
 * and a kill-switch row cannot be starved out of the row limit by chatty sender rows.
 */
function buildCoordinationFilter({ sessionId, sinceIso, nowIso }) {
  return [
    `and(sender_session.eq.${sessionId},created_at.gte.${sinceIso})`,
    `and(target_sd.eq.${FLEET_BROADCAST_SD},payload->>kind.eq.${KILL_SWITCH_KIND},expires_at.gt.${nowIso})`,
  ].join(',');
}

/**
 * Widening a shared query changes EVERY consumer of its rows. The wind-down scan below is a
 * text match over body+payload; a kill-switch row whose body happens to say "winding down"
 * would silently flip windDownSignaled. Partition explicitly so neither leg can read the
 * other's rows.
 */
function partitionCoordinationRows(rows) {
  const killRows = [];
  const senderRows = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    const kind = r && r.payload && r.payload.kind;
    if (r && r.target_sd === FLEET_BROADCAST_SD && kind === KILL_SWITCH_KIND) killRows.push(r);
    else senderRows.push(r);
  }
  return { killRows, senderRows };
}

/**
 * Is enforcement switched off right now? A kill row disables this enforcement when its
 * payload.enforcement names it, or is 'all'/absent (a blanket switch).
 * NOTE the caller's contract: any FAILURE to read (DB error, no client, throw) must be
 * treated as DISABLED — the switch fails open to OFF, never to enforcing.
 */
function isEnforcementDisabled(killRows, { enforcement = ENFORCEMENT_ID, nowMs = Date.now() } = {}) {
  for (const r of Array.isArray(killRows) ? killRows : []) {
    const p = (r && r.payload) || {};
    const target = p.enforcement || 'all';
    if (target !== 'all' && target !== enforcement) continue;
    // expires_at is also filtered in SQL; re-check so a stale/bypassed caller can't over-disable.
    if (r.expires_at && new Date(r.expires_at).getTime() <= nowMs) continue;
    return true;
  }
  return false;
}

/** Rows for the wind-down text scan, re-applying the 10-minute window in JS. */
function recentSenderRows(senderRows, { nowMs = Date.now(), windowMs = WIND_DOWN_WINDOW_MS } = {}) {
  return (Array.isArray(senderRows) ? senderRows : []).filter((r) => {
    if (!r || !r.created_at) return false;
    return nowMs - new Date(r.created_at).getTime() <= windowMs;
  });
}

// ── Arm predicate ────────────────────────────────────────────────────────────
// Shape verified against a real transcript (session ab29dc41, 8.9MB, 28 occurrences,
// 2026-08-02): type='assistant', message.content[] block {type:'tool_use', name:'ScheduleWakeup'}.
const WAKEUP_TOOL = 'ScheduleWakeup';

/**
 * "CURRENT TURN" — DEFINED EXPLICITLY, because a STALE ARM is the likeliest bug in this
 * enforcement and it fails SILENTLY FOREVER: a ScheduleWakeup from the PREVIOUS turn, counted
 * as evidence for THIS one, makes the hook believe every turn is armed and it never blocks
 * again. There is no error, no log, no alert — the enforcement simply evaporates.
 *
 * The turn begins at the LAST prompt-like entry (a human prompt OR a loop/system prompt), and
 * only tool_use blocks at a HIGHER index than that boundary are admissible evidence.
 *
 * Verdicts:
 *   'armed'   — a ScheduleWakeup tool_use appears after the boundary
 *   'unarmed' — the boundary was found and no such call appears after it
 *   'unknown' — no boundary in the tail window (turn larger than the read window, empty
 *               transcript, unreadable). NEVER block-worthy: absence of evidence is not
 *               evidence of absence.
 * A `stop:true` ScheduleWakeup is a deliberate loop END, recorded separately — it is an arm
 * for the purpose of "the worker used the tool", but step A must not treat it as continuation.
 */
function findArmInCurrentTurn(entries, { isPromptBoundary } = {}) {
  const list = Array.isArray(entries) ? entries : [];
  const { idx: turnStartIdx, via } = findTurnStart(list, isPromptBoundary || defaultIsPromptBoundary);
  if (turnStartIdx === -1) {
    return { verdict: 'unknown', reason: 'no turn boundary in tail window', armCount: 0, stopRequested: false, turnStartIdx, via };
  }
  let armCount = 0;
  let stopRequested = false;
  for (let i = turnStartIdx + 1; i < list.length; i++) {
    const e = list[i];
    if (!e || e.type !== 'assistant') continue;
    const c = e.message && e.message.content;
    if (!Array.isArray(c)) continue;
    for (const b of c) {
      if (b && b.type === 'tool_use' && b.name === WAKEUP_TOOL) {
        armCount++;
        if (b.input && b.input.stop === true) stopRequested = true;
      }
    }
  }
  return {
    verdict: armCount > 0 ? 'armed' : 'unarmed',
    reason: armCount > 0 ? `${armCount} ScheduleWakeup tool_use after turn boundary` : 'no ScheduleWakeup tool_use in current turn',
    armCount,
    stopRequested,
    turnStartIdx,
    via,
  };
}

/**
 * WHERE THE CURRENT TURN STARTS.
 *
 * PRIMARY — promptId. MEASURED over a full 8.9MB /loop-worker transcript (session ab29dc41,
 * 4,826 entries, 2026-08-02): every `user` entry carries the promptId of the turn it belongs to
 * (573 user entries over 38 distinct promptIds, tool-result carriers included); assistant entries
 * carry none. So the turn is "the FIRST entry bearing the newest promptId, plus everything after".
 * Replaying that definition over all 38 turns yields 28 armed / 10 unarmed, and the 28 matches an
 * independently counted 28 ScheduleWakeup tool_use blocks exactly — no double-count, no stale
 * attribution across boundaries.
 *
 * FALLBACK — print-before-park's origin/isMeta discriminators, which DO NOT WORK on this shape:
 * across those same 4,826 entries, origin.kind==='human' matched 3 and isMeta+promptSource==='system'
 * matched ZERO, in a session that is ~38 loop ticks. A predicate built on them alone is blind here:
 * it returns 'unknown' forever and the enforcement silently never fires — the precise failure mode
 * this SD exists to prevent, which is why the boundary is measured rather than assumed. The fallback
 * is retained only because origin.kind==='human' does still identify genuine human prompts (3/3).
 *
 * Window caveat: if the tail window cuts mid-turn, the earliest VISIBLE entry of the newest
 * promptId is used. That is still inside the current turn, so arms after it remain correctly
 * attributed; only an arm that happened before the window opened could be missed.
 */
function findTurnStart(list, boundary) {
  let pid = null;
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i] && list[i].promptId) { pid = list[i].promptId; break; }
  }
  if (pid) {
    for (let i = 0; i < list.length; i++) {
      if (list[i] && list[i].promptId === pid) return { idx: i, via: 'promptId' };
    }
  }
  for (let i = list.length - 1; i >= 0; i--) {
    if (boundary(list[i])) return { idx: i, via: 'origin' };
  }
  return { idx: -1, via: 'none' };
}

/** Fallback boundary: reuse print-before-park's discriminators (single source, no re-derivation). */
function defaultIsPromptBoundary(e) {
  const pbp = require('../print-before-park.cjs');
  return pbp.isHumanPrompt(e) || pbp.isLoopPrompt(e);
}

/**
 * FLUSH-RACE GUARD (pattern copied from print-before-park.cjs:211-226, which shipped with ZERO
 * tests — this is where it finally gets them). The final assistant block can flush to the JSONL
 * AFTER the Stop hook begins reading, so a single read reports 'unarmed' for a turn that DID arm.
 *
 * Cost discipline: the re-read loop runs ONLY while the verdict is 'unarmed' — exactly the
 * population step A would block. An 'armed' or 'unknown' first read returns immediately, so a
 * compliant seat pays one filesystem tail-read and nothing else.
 *
 * Fully injectable ({read, now, sleep}) so the race is DETERMINISTICALLY testable rather than
 * reproduced by timing luck.
 */
async function awaitStableVerdict({ read, now = Date.now, sleep, deadlineMs = 2500, intervalMs = 400 }) {
  const startedAt = now();
  const first = read();
  let stable = first;
  let reads = 1;
  while (stable && stable.verdict === 'unarmed' && now() - startedAt < deadlineMs) {
    await sleep(intervalMs);
    stable = read();
    reads++;
  }
  return {
    first,
    stable,
    reads,
    elapsedMs: now() - startedAt,
    flipped: Boolean(first && stable && first.verdict !== stable.verdict),
  };
}

/**
 * BOTH verdicts on one line, so the real race frequency is quantifiable from logs BEFORE any
 * decision depends on it. `flipped=true` is the flush race actually happening in the wild.
 *
 * CHANNEL SAFETY: this string is written to STDERR. Claude Code parses a Stop hook's STDOUT as
 * the decision document — anything non-JSON there risks corrupting the decision channel, and a
 * corrupted decision on the hook EVERY seat traverses EVERY turn is exactly the blast radius
 * this SD's build order exists to avoid. The tests assert the emitted BYTES on stdout, not the
 * intent to keep it clean.
 */
function formatPendingWake(obs, { sessionId = '', enforcement = ENFORCEMENT_ID } = {}) {
  const f = (obs && obs.first) || {};
  const s = (obs && obs.stable) || {};
  // `via` is reported so discriminator HEALTH is measurable in the wild: a fleet-wide drift to
  // via=none is exactly how this enforcement would go silently blind after a transcript-format
  // change, and it is invisible unless the boundary method is on the line.
  return `[${enforcement}] pending-wake session=${sessionId || 'unknown'} first=${f.verdict || 'none'} stable=${s.verdict || 'none'} flipped=${obs && obs.flipped ? 'yes' : 'no'} reads=${(obs && obs.reads) || 0} elapsed_ms=${(obs && obs.elapsedMs) || 0} arms=${s.armCount || 0} stop_requested=${s.stopRequested ? 'yes' : 'no'} via=${s.via || 'none'}\n`;
}

module.exports = {
  FLEET_BROADCAST_SD,
  KILL_SWITCH_KIND,
  ENFORCEMENT_ID,
  WIND_DOWN_WINDOW_MS,
  WAKEUP_TOOL,
  buildCoordinationFilter,
  partitionCoordinationRows,
  isEnforcementDisabled,
  recentSenderRows,
  findArmInCurrentTurn,
  awaitStableVerdict,
  formatPendingWake,
};
