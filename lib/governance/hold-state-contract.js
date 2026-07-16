/**
 * Shared hold-state contract — SD-LEO-INFRA-HOLD-STATE-CONTRACT-001.
 *
 * Every hold/fence/floor write must carry a {reason, owner, review_at,
 * release_condition} stamp. This module is the ONE place that stamp is
 * validated and provenance-stamped; callers (lib/sd-park.js,
 * scripts/defer-quick-fix.js, the exec_boundary_hold writer, the
 * min_tier_rank explicit-override path) each keep their own table-specific
 * write shape and call into this shared helper rather than re-implementing
 * the rule.
 *
 * Ships observe-first per CLAUDE.md's "Observe-Only-First Default for New
 * Enforcement": HOLD_STATE_CONTRACT_MODE defaults to 'observe' (log the
 * violation, let the write proceed unchanged) — only 'enforce' rejects a
 * non-compliant write. An unrecognized/unset value always resolves to
 * 'observe', never 'enforce', so a typo'd env var can never start silently
 * blocking writes.
 */

const CONTROL_CHARS_RE = /[\x00-\x1f\x7f]/g;

function sanitize(value) {
  return typeof value === 'string' ? value.replace(CONTROL_CHARS_RE, '') : value;
}

/** The currently-active mode. Defaults to 'observe' on anything but exactly 'enforce'. */
export function readHoldStateMode() {
  const raw = String(process.env.HOLD_STATE_CONTRACT_MODE || '').trim().toLowerCase();
  return raw === 'enforce' ? 'enforce' : 'observe';
}

/**
 * Pure validation — no DB/IO. Returns which fields are missing/invalid.
 * @param {{reason?, owner?, review_at?, release_condition?}} stamp
 * @returns {{valid:boolean, errors:string[]}}
 */
export function validateHoldStamp(stamp) {
  const s = stamp || {};
  const errors = [];
  if (!s.reason || typeof s.reason !== 'string' || !s.reason.trim()) errors.push('reason is required');
  if (!s.owner || typeof s.owner !== 'string' || !s.owner.trim()) errors.push('owner is required');
  if (!s.review_at) {
    errors.push('review_at is required');
  } else if (!Number.isFinite(Date.parse(s.review_at))) {
    errors.push('review_at must be a parseable timestamp');
  }
  if (!s.release_condition || typeof s.release_condition !== 'string' || !s.release_condition.trim()) {
    errors.push('release_condition is required');
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validate a stamp against the currently-active mode. In enforce mode, throws
 * (code=HOLD_STATE_CONTRACT_VIOLATION) before any DB write on an invalid
 * stamp. In observe mode (default), never throws — the caller is responsible
 * for logging the violation (see logHoldStateViolation) and proceeding with
 * its pre-SD write behavior unchanged.
 * @param {{reason?, owner?, review_at?, release_condition?}} stamp
 * @returns {{ok:boolean, mode:'observe'|'enforce', errors:string[]}}
 */
export function checkHoldStamp(stamp) {
  const mode = readHoldStateMode();
  const { valid, errors } = validateHoldStamp(stamp);
  if (!valid && mode === 'enforce') {
    const err = new Error(`Hold-state contract violation: ${errors.join('; ')}`);
    err.code = 'HOLD_STATE_CONTRACT_VIOLATION';
    err.mode = mode;
    err.errors = errors;
    throw err;
  }
  return { ok: valid, mode, errors };
}

/**
 * Sanitize free-text fields and stamp tamper-evident provenance, in the order
 * that prevents caller spoofing: the caller's payload is spread FIRST, the
 * canonical provenance field is set LAST (PAT-PROVENANCE-SPOOF-VIA-SPREAD-ORDER-001)
 * so a caller cannot override its own provenance by injecting that key.
 * @param {object} callerStamp - {reason, owner, review_at, release_condition, ...}
 * @param {string|null} writingSessionId - the actual writing session's identity
 *   (claiming_session_id / SET_IDENTITY callsign), never the caller-supplied owner.
 */
export function buildProvenancedStamp(callerStamp, writingSessionId) {
  const clean = { ...(callerStamp || {}) };
  if (typeof clean.reason === 'string') clean.reason = sanitize(clean.reason);
  if (typeof clean.owner === 'string') clean.owner = sanitize(clean.owner);
  if (typeof clean.release_condition === 'string') clean.release_condition = sanitize(clean.release_condition);
  return {
    ...clean,
    stamped_by_session: writingSessionId || null,
  };
}

/**
 * Observe-mode logging — fail-soft by design. A logging failure must never
 * block or crash the write it is merely observing. No-op if supabaseClient
 * is falsy (e.g. a pure unit test with no DB).
 */
export async function logHoldStateViolation(supabaseClient, { surface, stamp, errors }) {
  if (!supabaseClient) return;
  try {
    await supabaseClient.from('hold_state_contract_violations').insert({
      surface,
      reason: (stamp && typeof stamp.reason === 'string') ? stamp.reason : null,
      owner: (stamp && typeof stamp.owner === 'string') ? stamp.owner : null,
      review_at: (stamp && stamp.review_at) ? stamp.review_at : null,
      release_condition: (stamp && typeof stamp.release_condition === 'string') ? stamp.release_condition : null,
      errors,
    });
  } catch (_e) {
    // Intentionally swallowed — see doc comment above.
  }
}

export default {
  readHoldStateMode,
  validateHoldStamp,
  checkHoldStamp,
  buildProvenancedStamp,
  logHoldStateViolation,
};
