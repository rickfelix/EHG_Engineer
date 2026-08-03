/**
 * Claim-release PID-liveness guard — SD-LEO-INFRA-STALE-SWEEP-PID-LIVENESS-GUARD-001.
 *
 * WHY: multiple INDEPENDENT release paths (the coordinator conflict-eviction sweep, the
 * compaction-recovery hooks) released an in_progress claim purely on HEARTBEAT staleness.
 * A parked-but-alive /loop worker (heartbeat stale because it is sleeping between ticks, but
 * its OS process very much alive) was swept — orphaning its in-flight SD. A heartbeat-stale
 * worker whose PID is ALIVE is recoverable, NOT abandoned; only a genuinely dead PID (or a
 * claim stale beyond a much longer hard-abandonment ceiling) should be released.
 *
 * This is the single guard those release sites consult before clearing a claim. It is a thin,
 * pure wrapper over the read-time liveness SSOT (lib/fleet/session-liveness.cjs isSessionAlive),
 * so "alive" means exactly what every other consumer means by it (raw is_alive | fresh heartbeat
 * | live PID | fresh tick | armed expected-silence). No new threshold is invented here.
 *
 * FR-2 (guard): shouldHoldClaim() returns hold=true when the holder is alive.
 * FR-3 (observability): callers emit a clear SKIP log using the returned reason.
 */
const { isSessionAlive, heartbeatAgeSec, LIVENESS_HEARTBEAT_SEC } = require('./session-liveness.cjs');
const { SILENCE_HARD_CAP_MS } = require('./silence-cap.cjs');

/**
 * Decide whether a stale-heartbeat claim must be HELD (not released) because its holder is alive.
 *
 * @param {object|null} session - a claude_sessions-shaped row. For an accurate verdict it should
 *   carry the fields the SSOT reads: is_alive, heartbeat_at, terminal_id (PID is the last
 *   hyphen-segment), process_alive_at, expected_silence_until.
 * @param {{aliveCcPids?:Set<string>|null}} [opts] - optional pre-computed alive-PID set (the sweep
 *   already has one); when omitted the SSOT reads the host PID markers fresh.
 * @returns {{hold:boolean, reason:(string|null)}} hold=true => do NOT release; reason is the
 *   liveness signal that vouched for the holder (e.g. 'pid_alive', 'fresh_heartbeat').
 */
/**
 * SD-LEO-INFRA-STALE-SESSION-SWEEP-001 FR-1b — the hard-abandonment ceiling.
 *
 * DERIVED, NEVER A BARE LITERAL. There are already FOUR independent 30-minute constants in this
 * codebase (SILENCE_HARD_CAP_MIN, ARMED_SILENCE_MAX_MS, DESKTOP_DEAD_CAP_SECONDS, and this), and
 * lib/fleet/silence-cap.cjs exists precisely BECAUSE two of them drifted apart — a writer capped at
 * 60min while its reader honoured 30min, silently mis-reaping parked workers. Deriving from the
 * shared cap makes "the ceiling is at least as long as any honourable silence window" structural
 * instead of a coincidence that holds until someone edits one number.
 *
 * The floor of 6x the heartbeat threshold keeps the ceiling far away from ordinary staleness: the
 * worker wrongly released on 2026-07-27 was 344.4s stale against a 300s threshold — it missed by 44
 * seconds. Both inputs evaluate to 1800 today, so this changes no behaviour; it buys structure.
 */
const LIVENESS_ABANDON_SEC = Math.max(SILENCE_HARD_CAP_MS / 1000, 6 * LIVENESS_HEARTBEAT_SEC);

/**
 * Is this claim young enough that a NON-EXPIRING hold is still defensible?
 *
 * An unknown age (null) answers NO. Every real call site supplies one of the two age forms, so this
 * is a defensive branch — but it must fail toward release, matching the convention
 * isWithinArmedSilenceWindow already sets in silence-cap.cjs. A hold granted on an age nobody can
 * measure is unbounded by construction, which is the stranding this ceiling exists to prevent.
 */
function withinAbandonCeiling(session, nowMs = Date.now()) {
  const age = heartbeatAgeSec(session, nowMs);
  return age !== null && age < LIVENESS_ABANDON_SEC;
}

function shouldHoldClaim(session, { aliveCcPids = null } = {}) {
  const verdict = isSessionAlive(session, { aliveCcPids });

  // NOTE ON raw_is_alive — WITHDRAWN DESIGN, RECORDED SO IT IS NOT RE-PROPOSED.
  //
  // An earlier draft of this FR ceiling-gated raw_is_alive here, on the reasoning that it is a bare
  // boolean with no expiry (2075 rows carry is_alive=true with heartbeats 3 to 170 days old, and
  // nothing clears it on release). That reasoning is still true. The IMPLEMENTATION was wrong: it
  // broke two ratified guard-rail tests, including one whose file pre-registers "if any future
  // change breaks one of them, that change is wrong, not the test" — written after five prior
  // attempts at this defect class collapsed by making the predicate more willing to declare death.
  //
  // The stickiness is instead handled where it originates: scripts/stale-session-sweep.cjs simply
  // DOES NOT SELECT is_alive, so rung 1 stays inert at the sweep exactly as it is today. That was
  // measured to matter — 6 of 6 claim-holding rows carry is_alive=true, so feeding rung 1 there
  // would have held every row at every seam and silently turned the sweep into a no-op.
  //
  // Withholding a field is a narrower, reversible lever than overriding a ratified verdict.
  if (verdict.alive === true) return { hold: true, reason: verdict.reason };

  // ABSTENTION IS NOT DEATH — but it is not immortality either.
  //
  // pid-venue.cjs establishes that an unreadable marker venue must ABSTAIN rather than report death,
  // and the sweep's classifier honours that: pidUnverifiable rides on the very object handed to this
  // guard and is excluded from isStale. Until now this guard never read it, so at the one site that
  // performs an irreversible write, "I cannot tell" was silently rendered "not alive".
  //
  // The ceiling is what keeps the fix from becoming a worse bug. On the GitHub Actions runner the PID
  // venue is blind on EVERY tick (.claude/session-identity is host-local and gitignored), so an
  // unconditional hold-on-abstention would disable claim release entirely on the venue that runs the
  // sweep every five minutes — trading false-death for a claim stranded forever. Neither guarded seam
  // filters on isStale, so this binds at all three sweep seams, not just conflict eviction.
  if (session && session.pidUnverifiable === true && withinAbandonCeiling(session)) {
    return { hold: true, reason: 'pid_unverifiable_within_ceiling' };
  }

  return { hold: false, reason: verdict.reason };
}

/**
 * Statuses this sweep's own classifier treats as alive. Kept here, beside the guard, so the
 * eviction site cannot drift from the liveness vocabulary it is supposed to respect.
 */
const ALIVE_FAMILY = Object.freeze(['ACTIVE', 'ALIVE_NO_HEARTBEAT', 'ALIVE_SOURCE_SIDE']);

/**
 * SD-LEO-INFRA-STALE-SESSION-SWEEP-001 / FR-2 + FR-6.
 *
 * Two refusals that must fire BEFORE any mutation in the conflict-eviction loop. Pure and
 * exported deliberately: inline in a ~4,000-line main() the only available test is an assertion
 * about source text, which proves WIRING and never FIRING. Extracted, the shipped path calls the
 * same function the tests call.
 *
 * FR-2 (keeper_is_evictee): before this, keeper.session_id appeared exactly once in the sweep —
 * inside a log line, read to NARRATE an eviction and never to PREVENT it. A bucket holding one
 * session twice therefore evicted the row it had just elected to keep. Checked route-independently
 * so it still holds if a future change reintroduces a duplicate producer.
 *
 * FR-6 (classified_alive): on 2026-07-27 the evicted row carried status='ALIVE_SOURCE_SIDE' — the
 * sweep evicted a session its OWN classifier had called alive, one statement after reading that
 * classification. Independent of shouldHoldClaim on purpose: it reads the sweep's recorded verdict
 * rather than re-deriving liveness, so it survives a revert or narrowing of the field-set fix.
 *
 * @returns {{refuse: boolean, code: string|null, detail: string|null}}
 */
function refuseConflictEviction({ evict, keeper, bucketSize = null } = {}) {
  if (!evict || !keeper) return { refuse: false, code: null, detail: null };

  if (evict.session_id && keeper.session_id && evict.session_id === keeper.session_id) {
    return {
      refuse: true,
      code: 'keeper_is_evictee',
      detail: 'session ' + evict.session_id + ' appeared as both keeper and evictee'
        + (bucketSize === null ? '' : ' (bucket size ' + bucketSize + ')'),
    };
  }

  if (ALIVE_FAMILY.includes(evict.status)) {
    return {
      refuse: true,
      code: 'classified_alive',
      detail: 'this sweep classified ' + evict.session_id + ' as ' + evict.status,
    };
  }

  return { refuse: false, code: null, detail: null };
}

module.exports = {
  shouldHoldClaim, withinAbandonCeiling, LIVENESS_ABANDON_SEC,
  refuseConflictEviction, ALIVE_FAMILY,
};
