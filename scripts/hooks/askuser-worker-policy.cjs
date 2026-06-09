// askuser-worker-policy.cjs — pure predicate for the AskUserQuestion PreToolUse guard.
// SD-FDBK-ENH-ENFORCEMENT-IDEA-OPERATOR-001.
//
// AskUserQuestion pauses an autonomous /loop worker indefinitely waiting for a human who is
// not watching — stalling the SD and holding a worker slot. Workers must escalate via /signal
// (options + recommendation + default-proceed) instead. This module decides WHICH sessions
// are blocked. Extracted as a pure, side-effect-free function so the policy is unit-testable
// without the hook's stdin/process machinery.
//
// POSITIVE detection (only a CONFIRMED autonomous fleet worker is blocked):
//   - has a fleet identity / callsign (assigned by the fleet roster — workers in /loop), AND
//   - is NOT the coordinator (metadata.is_coordinator), Adam (metadata.role==='adam'), or
//     non_fleet (metadata.non_fleet — chairman/adam helper sessions).
// Everything else is EXEMPT (returns false → AskUserQuestion allowed): the operator/chairman
// interactive session (no fleet identity), coordinator, Adam, solo, and — critically — any
// session whose metadata could not be resolved (null/garbage). Failing OPEN here means a
// detection error never wedges a tool the operator legitimately needs.

/**
 * @param {object|null} meta - claude_sessions.metadata for the calling session (or null if unresolved)
 * @returns {boolean} true ⇢ block AskUserQuestion for this session
 */
function isBlockableWorker(meta) {
  if (!meta || typeof meta !== 'object') return false;   // unresolved/garbage → fail-open ALLOW
  if (meta.is_coordinator === true) return false;        // coordinator exempt
  if (meta.role === 'adam') return false;                // Adam exempt
  if (meta.non_fleet === true) return false;             // non-fleet (chairman/adam helpers) exempt
  const callsign = (meta.fleet_identity && meta.fleet_identity.callsign) || meta.callsign;
  return Boolean(callsign);                              // block ONLY a confirmed fleet worker
}

/** The deny message shown when AskUserQuestion is blocked — names the /signal escalation contract. */
const ASKUSER_DENY_MESSAGE =
  '[BLOCKED ENF-NO-ASKUSER-WORKER] AskUserQuestion is disabled for autonomous fleet workers — it pauses ' +
  'the /loop indefinitely waiting for a human who is not watching, stalling the SD and holding a worker ' +
  'slot. Resolve it autonomously, OR escalate to the coordinator via /signal:\n' +
  '  /signal <type> "<question> — options: [A] …, [B] …; recommendation: <A|B>; default if no reply: proceed with <A|B>"\n' +
  '(types: stuck | prd-ambiguous | spec-conflict | need-sweep | feedback | other). The coordinator/operator ' +
  'replies, or the default proceeds — so the loop never hangs. (Coordinator, Adam, and operator/chairman ' +
  'sessions are exempt and may use AskUserQuestion.)';

module.exports = { isBlockableWorker, ASKUSER_DENY_MESSAGE };
