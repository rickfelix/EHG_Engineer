// SD-LEO-INFRA-WORKER-EXTERNAL-REVIVAL-001 (FR-1): PURE spawn-decision logic for the
// worker-spawn-executor daemon. No DB, no process spawn, no ambient clock — every input is
// injected so this is fully unit-testable and deterministic.
//
// Given the pending worker_spawn_requests rows + the set of callsigns already backed by a
// live session, decide which requests to spawn this tick and which to skip (and why). The
// daemon (scripts/fleet/worker-spawn-executor.cjs) handles the actual I/O and the
// default-OFF live spawn; this module just makes the decision.

/**
 * @param {object} input
 * @param {Array<{id:string, requested_callsign:string, status:string, requested_at:string, expires_at:string}>} input.pendingRequests
 * @param {Set<string>|Array<string>} input.liveCallsigns - callsigns already backed by a live session
 * @param {number} input.nowMs - injected clock
 * @param {number} input.perTickCap - max spawns to authorize this tick (>=0)
 * @returns {{toSpawn: Array<object>, skipped: Array<{request: object, reason: string}>}}
 */
function resolveSpawnDecisions({ pendingRequests, liveCallsigns, nowMs, perTickCap } = {}) {
  const requests = Array.isArray(pendingRequests) ? pendingRequests : [];
  const live = liveCallsigns instanceof Set ? liveCallsigns : new Set(liveCallsigns || []);
  const cap = Number.isFinite(perTickCap) && perTickCap >= 0 ? Math.floor(perTickCap) : 0;
  const now = Number.isFinite(nowMs) ? nowMs : 0;

  const skipped = [];
  // Stable order: oldest requested_at first, so dedup keeps the oldest and the cap is fair.
  const ordered = requests.slice().sort((a, b) => {
    const ta = Date.parse(a && a.requested_at) || 0;
    const tb = Date.parse(b && b.requested_at) || 0;
    return ta - tb;
  });

  const eligible = [];
  const seenCallsign = new Set();
  for (const r of ordered) {
    if (!r || typeof r !== 'object') { continue; }
    if (r.status !== 'pending') { skipped.push({ request: r, reason: 'not_pending' }); continue; }
    const exp = Date.parse(r.expires_at);
    if (Number.isFinite(exp) && exp <= now) { skipped.push({ request: r, reason: 'expired' }); continue; }
    const callsign = r.requested_callsign;
    if (!callsign) { skipped.push({ request: r, reason: 'no_callsign' }); continue; }
    if (live.has(callsign)) { skipped.push({ request: r, reason: 'already_live' }); continue; }
    if (seenCallsign.has(callsign)) { skipped.push({ request: r, reason: 'duplicate_callsign' }); continue; }
    seenCallsign.add(callsign);
    eligible.push(r);
  }

  const toSpawn = eligible.slice(0, cap);
  for (const r of eligible.slice(cap)) { skipped.push({ request: r, reason: 'cap_exceeded' }); }

  return { toSpawn, skipped };
}

module.exports = { resolveSpawnDecisions };
