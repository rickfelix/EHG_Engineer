// SD-LEO-INFRA-WORKER-EXTERNAL-REVIVAL-001 (FR-1): PURE spawn-decision logic for the
// worker-spawn-executor daemon. No DB, no process spawn, no ambient clock — every input is
// injected so this is fully unit-testable and deterministic.
//
// Given the pending worker_spawn_requests rows + the set of callsigns already backed by a
// live session, decide which requests to spawn this tick and which to skip (and why). The
// daemon (scripts/fleet/worker-spawn-executor.cjs) handles the actual I/O and the
// default-OFF live spawn; this module just makes the decision.

// SD-LEO-INFRA-FLEET-ACCOUNT-IDENTITY-001 (FR-2): this module previously had ZERO
// limit-classification/failure-diagnostic code — it only records SKIP reasons (decision-level,
// not a real spawn attempt failing). Since no genuine failure-recording path exists here to
// attach to, this stamps the whitelisted 3-field account identity onto the returned `skipped`
// diagnostics so a FUTURE limit-classification pass can correlate skip patterns with the
// Claude account the fleet was running under. No limit-detection logic is added — out of scope.
const { getAccountIdentity } = require('./account-identity.cjs');

/**
 * @param {object} input
 * @param {Array<{id:string, requested_callsign:string, status:string, requested_at:string, expires_at:string}>} input.pendingRequests
 * @param {Set<string>|Array<string>} input.liveCallsigns - callsigns already backed by a live session
 * @param {number} input.nowMs - injected clock
 * @param {number} input.perTickCap - max spawns to authorize this tick (>=0)
 * @param {{email:string,orgName:string,accountUuid8:string}|null} [input.accountIdentity] - optional
 *   injection seam (tests / a caller with an already-resolved identity); defaults to a real
 *   getAccountIdentity() read (fail-safe: null when unavailable). Keeps this function
 *   deterministic/pure whenever a caller injects a fixed value.
 * @returns {{toSpawn: Array<object>, skipped: Array<{request: object, reason: string, identity: object|null}>}}
 */
function resolveSpawnDecisions({ pendingRequests, liveCallsigns, nowMs, perTickCap, accountIdentity } = {}) {
  const requests = Array.isArray(pendingRequests) ? pendingRequests : [];
  const live = liveCallsigns instanceof Set ? liveCallsigns : new Set(liveCallsigns || []);
  const cap = Number.isFinite(perTickCap) && perTickCap >= 0 ? Math.floor(perTickCap) : 0;
  const now = Number.isFinite(nowMs) ? nowMs : 0;
  const identity = accountIdentity !== undefined ? accountIdentity : getAccountIdentity();

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

  // FR-2: stamp identity onto every skip diagnostic without touching the skip-decision logic above.
  return { toSpawn, skipped: skipped.map((s) => ({ ...s, identity })) };
}

module.exports = { resolveSpawnDecisions };
