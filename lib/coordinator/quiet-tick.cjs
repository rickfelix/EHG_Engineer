/**
 * quiet-tick.cjs — the reusable hibernation MECHANISM shared by the coordinator
 * and Adam quiet-tick aggregators (SD-LEO-INFRA-FLEET-HIBERNATION-MECHANISM-001).
 *
 * SD-LEO-INFRA-FLEET-HIBERNATION-001 (#5171) wired quiescence-AWARENESS
 * (decideQuiescence + belt-low suppression). This module is the un-shipped ~80%:
 * the pure, unit-testable primitives that turn awareness into an actual
 * idle-token reduction —
 *   - decideCadence()      FR-5/FR-6: self-paced ScheduleWakeup delay
 *   - detectSalientDelta() FR-4:      cross-party no-delta ping suppression
 *   - runCoresFailSoft()   FR-1:      compose existing cores into one fail-soft tick
 *
 * All three are PURE (no IO) so the entrypoints can be thin and the invariants
 * (<=900s quiescent park, NEVER exactly 300s, fail-soft composition) are pinned
 * by tests/unit, not by reading the live cron output.
 *
 * @module lib/coordinator/quiet-tick
 */

// FR-6 responsiveness cap: the quiescent park is the worst-case latency for a
// non-harness-tracked inbound event (a ScheduleWakeup park does not auto-wake),
// so cap it at 15min. The active band stays in the prompt-cache-warm window.
const MAX_QUIESCENT_PARK_S = 900; // 15min hard cap (FR-6 floor of responsiveness)
const ACTIVE_MIN_S = 180;         // 3min
const ACTIVE_MAX_S = 270;         // 4.5min — deliberately < 300 so we never land on the cache TTL
const PROMPT_CACHE_TTL_S = 300;   // never park at EXACTLY this (worst case vs the 5-min TTL)

// SD-LEO-INFRA-COORDINATOR-WAKE-ON-DIRECTIVE-001 FR-1: an unactioned
// DIRECTIVE_KINDS row (chairman_directive et al, per lib/fleet/worker-status.cjs)
// must never wait out a quiescent park. The 2026-07-09 incident: a chairman
// directive stack sat unactioned for 25+ minutes because decideCadence had no
// awareness of pending directives and self-scheduled up to MAX_QUIESCENT_PARK_S.
const DIRECTIVE_WAKE_MIN_S = 15;
const DIRECTIVE_WAKE_MAX_S = 45; // well inside the prompt-cache-warm window

// SD-LEO-INFRA-COORDINATOR-LOADED-QUIET-002 FR-2: the LOADED_AND_QUIET band. A
// distinct 120s span anchored at a fixed 540s floor (not a desiredActiveS reuse —
// see decideCadence's own doc comment for why) — strictly above ACTIVE_MAX_S (270)
// and strictly below MAX_QUIESCENT_PARK_S (900), so it cannot collapse into either
// existing band and cannot land on PROMPT_CACHE_TTL_S (300) by construction.
const LOADED_AND_QUIET_MIN_S = 540;
const LOADED_AND_QUIET_MAX_S = 660;

/**
 * FR-5/FR-6: map fleet state to a self-paced next-wake delay (seconds).
 *
 * hasUnactionedDirective -> hard-wake override [DIRECTIVE_WAKE_MIN_S, DIRECTIVE_WAKE_MAX_S],
 *   regardless of quiescent state (SD-LEO-INFRA-COORDINATOR-WAKE-ON-DIRECTIVE-001 FR-1).
 * hasUndeliveredChairmanEscalation -> the SAME hard-wake override (FW-3 §6d hard-park
 *   precondition, SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-H FR-2): a party holding an
 *   undelivered pick-class chairman-escalation must never take the long quiescent park —
 *   hibernating would strand the exception. Shared branch with the directive override
 *   (single offset application; the two flags can never compound past the band).
 * QUIESCENT  -> long park, capped at MAX_QUIESCENT_PARK_S (<=15min).
 * ACTIVE     -> short band [ACTIVE_MIN_S, ACTIVE_MAX_S], fast enough to catch a
 *               /signal while workers are present.
 * Invariant: NEVER returns exactly 300s (the prompt-cache TTL worst case).
 *
 * loadedAndQuiet -> a FOURTH, distinct branch (SD-LEO-INFRA-COORDINATOR-LOADED-QUIET-002
 *   FR-2), precedence hard-wake > quiescent > loaded-and-quiet > active: when true (and
 *   neither hard-wake nor quiescent applies), yields [LOADED_AND_QUIET_MIN_S,
 *   LOADED_AND_QUIET_MAX_S] ([540,660]), phase-offset the same way as the other bands.
 *   Omitted/false is byte-identical to today's 3-branch behavior — fully backward
 *   compatible. Computed by the caller via computeLoadedAndQuiet(), never inside this
 *   function (decideCadence stays pure — see module docstring).
 *
 * @param {{quiescent:boolean, partyOffsetS?:number, desiredQuiescentParkS?:number, desiredActiveS?:number, hasUnactionedDirective?:boolean, hasUndeliveredChairmanEscalation?:boolean, loadedAndQuiet?:boolean}} s
 *   partyOffsetS phases the coordinator vs Adam parks so they do not co-fire
 *   (e.g. coordinator 0, Adam 420). desiredQuiescentParkS lets a caller request a
 *   shorter quiescent park (still clamped to the cap and floored sanely).
 *   desiredActiveS (QF-20260830-071, burn-lever A3) lets a caller widen the ACTIVE
 *   band per-party, mirroring desiredQuiescentParkS: when supplied, the active band
 *   becomes [max(ACTIVE_MIN_S, desiredActiveS-45), max(ACTIVE_MIN_S, desiredActiveS)]
 *   instead of [ACTIVE_MIN_S, ACTIVE_MAX_S]. Omitted (default) is byte-identical to
 *   today's fixed band — fully backward compatible.
 *   hasUnactionedDirective / hasUndeliveredChairmanEscalation, when true, override
 *   both the quiescent and active bands with a short hard-wake delay (each defaults
 *   to false/omitted — fully backward compatible with existing callers).
 * @returns {number} delaySeconds in (0, 900], never === 300
 */
function decideCadence(s) {
  const offset = Math.max(0, Math.trunc(s && s.partyOffsetS ? s.partyOffsetS : 0));
  let delay;
  if (s && (s.hasUnactionedDirective || s.hasUndeliveredChairmanEscalation)) {
    // Hard-wake override: phased like the other bands, but confined to a much
    // shorter span so a pending directive is never waited on beyond DIRECTIVE_WAKE_MAX_S.
    // An undelivered chairman-escalation rides the SAME branch (never a second offset
    // term): the fleet must stay awake until the escalation is delivered (§6d).
    const span = DIRECTIVE_WAKE_MAX_S - DIRECTIVE_WAKE_MIN_S;
    delay = DIRECTIVE_WAKE_MIN_S + (offset % (span + 1));
    if (delay >= DIRECTIVE_WAKE_MAX_S) delay = DIRECTIVE_WAKE_MAX_S;
  } else if (s && s.quiescent) {
    const desired = (s && s.desiredQuiescentParkS) ? s.desiredQuiescentParkS : MAX_QUIESCENT_PARK_S;
    // Clamp the base into [ACTIVE_MAX_S+1 .. cap], THEN add the phase offset, THEN
    // re-clamp to the cap so phasing can never breach the 15-min responsiveness floor.
    const base = Math.min(MAX_QUIESCENT_PARK_S, Math.max(ACTIVE_MAX_S + 1, Math.trunc(desired)));
    delay = Math.min(MAX_QUIESCENT_PARK_S, base + offset);
  } else if (s && s.loadedAndQuiet) {
    // FR-2: fleet fully claimed, belt empty, no pending directive — widen the wake
    // band to [540,660] instead of the default ACTIVE [180,270].
    const span = LOADED_AND_QUIET_MAX_S - LOADED_AND_QUIET_MIN_S;
    delay = LOADED_AND_QUIET_MIN_S + (offset % (span + 1));
    if (delay >= LOADED_AND_QUIET_MAX_S) delay = LOADED_AND_QUIET_MAX_S;
  } else {
    // Active: spread across the band by the phase offset, but stay strictly below
    // the cache TTL so an active party never parks on 300s either.
    // QF-20260830-071: an optional per-party desiredActiveS widens the band (e.g.
    // Adam's 15min burn-lever) without touching the default [ACTIVE_MIN_S,
    // ACTIVE_MAX_S] band any other caller (e.g. the coordinator) still gets.
    const desiredActive = (s && s.desiredActiveS) ? Math.trunc(s.desiredActiveS) : null;
    const activeMax = desiredActive ? Math.max(ACTIVE_MIN_S, desiredActive) : ACTIVE_MAX_S;
    const activeMin = desiredActive ? Math.max(ACTIVE_MIN_S, activeMax - 45) : ACTIVE_MIN_S;
    const span = activeMax - activeMin;
    delay = activeMin + (offset % (span + 1));
    if (delay >= activeMax) delay = activeMax;
  }
  // Hard invariant: never land on the prompt-cache TTL boundary.
  if (delay === PROMPT_CACHE_TTL_S) delay = PROMPT_CACHE_TTL_S - 1;
  return delay;
}

/**
 * FR-4: decide whether a cross-party ping (coordinator->Adam / Adam->coordinator)
 * should fire, by comparing the current tick's salient state to the prior tick's.
 * A "still idle" status (no tracked field changed) returns changed=false and no
 * ping crosses the wire.
 *
 * Tracked salient fields (any change = a real delta worth waking the other party):
 *   - beltZero            belt depth crossed the 0 boundary (0<->non-zero)
 *   - openSignalCount     a new friction /signal arrived (count increased)
 *   - venture1State       a venture-1 state change
 *
 * @param {object|null} prev prior salient state (null on first tick => always a delta)
 * @param {object} cur current salient state
 * @returns {{changed:boolean, fields:string[]}}
 */
function detectSalientDelta(prev, cur) {
  const c = cur || {};
  if (!prev) return { changed: true, fields: ['first_tick'] };
  const fields = [];
  // Belt: only a 0<->non-zero TRANSITION matters, not depth jitter above 0.
  if (Boolean(prev.beltZero) !== Boolean(c.beltZero)) fields.push('beltZero');
  // Signals: a NEW signal (count went up) is a delta; draining is not a wake reason.
  if ((c.openSignalCount | 0) > (prev.openSignalCount | 0)) fields.push('openSignalCount');
  // venture-1: any change to the tracked state string.
  if ((prev.venture1State || null) !== (c.venture1State || null)) fields.push('venture1State');
  return { changed: fields.length > 0, fields };
}

/**
 * FR-1: compose a list of cores into ONE tick, fail-soft. Each core is invoked;
 * a throw (or rejected promise) is caught, recorded, and never aborts the tick —
 * the remaining cores still run. Returns a single summary the caller logs as one
 * line, plus the structured per-core outcomes.
 *
 * @param {Array<{key:string, run:Function, skip?:boolean}>} cores
 *   skip=true records the core as skipped (quiescent-mode suppression) without running it.
 * @returns {Promise<{summary:string, results:Array<{key,status,detail}>, ranCount:number, failedCount:number, skippedCount:number}>}
 */
async function runCoresFailSoft(cores) {
  const results = [];
  for (const core of (cores || [])) {
    if (!core || typeof core.run !== 'function') {
      results.push({ key: (core && core.key) || '?', status: 'skipped', detail: 'no run()' });
      continue;
    }
    if (core.skip) {
      results.push({ key: core.key, status: 'skipped', detail: 'quiescent' });
      continue;
    }
    try {
      const detail = await core.run();
      results.push({ key: core.key, status: 'ok', detail: detail == null ? 'ok' : String(detail).slice(0, 120) });
    } catch (e) {
      // FAIL-SOFT: log into the summary, continue the other cores.
      results.push({ key: core.key, status: 'fail', detail: (e && e.message) ? e.message.slice(0, 160) : String(e) });
    }
  }
  const ranCount = results.filter((r) => r.status === 'ok' || r.status === 'fail').length;
  const failedCount = results.filter((r) => r.status === 'fail').length;
  const skippedCount = results.filter((r) => r.status === 'skipped').length;
  const summary = results.map((r) => `${r.key}:${r.status}`).join(' ');
  return { summary, results, ranCount, failedCount, skippedCount };
}

// QF-20260829-373 (A7 burn-lever): cheap state-hash short-circuit. computeStateHash() digests
// the 4 cheap signals (inbox max row id, claims count, sms undrained count, escalation count)
// so a caller can skip heavy per-tick enumerations when nothing has moved. shouldSkipHeavyPass()
// is the pure decision: BINDING (per Solomon) that a hash-compute error, a missing baseline, a
// changed hash, or hitting the Nth-tick safety floor ALWAYS forces a full pass — a hash that
// fails silently and reads as "unchanged" would skip enumerations forever, which is the
// fail-open twin of the defect this short-circuit removes.
const crypto = require('crypto');

function computeStateHash(counts) {
  if (!counts || typeof counts !== 'object') return null;
  const { maxInboxId = 0, claimsCount = 0, smsUndrainedCount = 0, escalationCount = 0 } = counts;
  return crypto.createHash('sha256').update(`${maxInboxId}|${claimsCount}|${smsUndrainedCount}|${escalationCount}`).digest('hex');
}

const HEAVY_PASS_NTH_TICK_FLOOR = 8; // safety floor: force a full pass at least every 8th quiet tick

function shouldSkipHeavyPass({ hash, lastHash, skipStreak = 0, hashError = false, nthTickFloor = HEAVY_PASS_NTH_TICK_FLOOR } = {}) {
  if (hashError || !hash || !lastHash) return false;
  if (hash !== lastHash) return false;
  if (skipStreak + 1 >= nthTickFloor) return false;
  return true;
}

/**
 * SD-LEO-INFRA-COORDINATOR-LOADED-QUIET-001 FR-7: the LOADED_AND_QUIET predicate,
 * extracted as its own PURE function so it has an independent unit-test seam —
 * testing decideCadence() alone with a pre-computed boolean only re-tests the
 * pre-existing else-branch, never this predicate (TESTING sub-agent finding F1,
 * evidence sub_agent_execution_results d5e8a6ac).
 *
 * WIRED (SD-LEO-INFRA-COORDINATOR-LOADED-QUIET-002 FR-3): called fresh from
 * scripts/coordinator-quiet-tick.mjs immediately before decideCadence(), whose
 * result feeds decideCadence's loadedAndQuiet input (FR-2). The predecessor SD
 * (SD-LEO-INFRA-COORDINATOR-LOADED-QUIET-001, FR-6) found that no preemption path
 * exists for an armed ScheduleWakeup on a PARKED seat — a parked worker runs no
 * tools, so no PostToolUse hook (scripts/hooks/coordination-inbox.cjs) observes a
 * session_coordination directive until the seat's own park naturally expires. This
 * SD widens the COORDINATOR's own wake band (the seat that calls decideCadence
 * here), not a worker seat; the resulting up-to-660s undelivered-directive-latency
 * exposure on the coordinator seat was explicitly accepted by the coordinator
 * (session_coordination row 2dd84a5a-94db-401f-834c-f85d738dadb0, recorded in
 * strategic_directives_v2.metadata.risk_acceptance_b for this SD) rather than
 * gated behind building the preemption mechanism, which remains out of scope.
 *
 * @param {{idleNow:number, rawUnclaimed:number, openQfCount:number, claimableWithVerifyQfCount:number, unactionedDirective:boolean, undeliveredEscalation:boolean}} s
 *   idleNow: count of live worker seats with no active claim (must be 0).
 *   rawUnclaimed: raw-unclaimed STRATEGIC DIRECTIVE count (scripts/lib/capacity-inputs.mjs
 *     rawUnclaimed field — NOT a quick_fixes count; must be 0).
 *   openQfCount: open, unclaimed quick_fixes count (scripts/lib/capacity-inputs.mjs
 *     openQfCount field; must be 0).
 *   claimableWithVerifyQfCount: staleness-held-claimable quick_fixes count (must be 0).
 *   unactionedDirective / undeliveredEscalation: same semantics as decideCadence's
 *     hasUnactionedDirective / hasUndeliveredChairmanEscalation (must both be false).
 * @returns {boolean} true only when every clause holds AND every field is explicitly
 *   provided (fail-CLOSED: an undefined/omitted count is treated as unknown, not clear,
 *   so a caller telemetry gap can never silently widen the wake band)
 */
function computeLoadedAndQuiet(s) {
  // Fail-CLOSED on missing/unknown counts: an omitted field means the caller does not
  // know the true count, and treating unknown as "0 = clear" would let a telemetry gap
  // silently widen the wake band. Only a definite, explicit 0 counts as clear.
  const isZero = (v) => typeof v === 'number' && v === 0;
  if (!s) return false;
  const noIdleSeats = isZero(s.idleNow);
  const noUnclaimedWork = isZero(s.rawUnclaimed) && isZero(s.openQfCount);
  const noStaleClaimable = isZero(s.claimableWithVerifyQfCount);
  const noPendingDirective = s.unactionedDirective === false && s.undeliveredEscalation === false;
  return noIdleSeats && noUnclaimedWork && noStaleClaimable && noPendingDirective;
}

module.exports = {
  decideCadence,
  computeLoadedAndQuiet,
  detectSalientDelta,
  runCoresFailSoft,
  computeStateHash,
  shouldSkipHeavyPass,
  MAX_QUIESCENT_PARK_S,
  ACTIVE_MIN_S,
  ACTIVE_MAX_S,
  PROMPT_CACHE_TTL_S,
  DIRECTIVE_WAKE_MIN_S,
  DIRECTIVE_WAKE_MAX_S,
  LOADED_AND_QUIET_MIN_S,
  LOADED_AND_QUIET_MAX_S,
  HEAVY_PASS_NTH_TICK_FLOOR,
};
