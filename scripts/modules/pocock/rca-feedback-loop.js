/**
 * RCA feedback-loop validator for Pocock /diagnose Phase-1 discipline.
 *
 * SD-LEO-PROTOCOL-POCOCK-PATTERNS-ORCH-001-G.
 *
 * Pure-function validators + outcome classifier. Used by:
 *   - scripts/modules/handoff/executors/exec-to-plan/gates/rca-feedback-loop-gate.js
 *   - (future) CLI lint + schema docs
 *
 * Schema:
 *   feedback_loop = {command: string, time_to_fail_seconds: int, deterministic: bool}
 *   no_seam_exists = {rationale: string}
 * Exactly ONE must be present on the RCA payload (XOR).
 */

export const FEEDBACK_LOOP_KEYS = ['command', 'time_to_fail_seconds', 'deterministic'];
export const COMMAND_MIN = 5;
export const COMMAND_MAX = 500;
export const TTFS_MIN = 1;
export const TTFS_MAX = 3600;
export const NO_SEAM_MIN_LEN = 30;
export const NO_SEAM_MIN_UNIQUE_TOKENS = 5;
export const SHELL_CHAIN_RE = /(\|\||&&|;\s|\$\(|`|\brm\s+-rf)/;
export const NO_SEAM_BANLIST_RE = /^(none|n\/a|na|tbd|todo|unknown|skip)\.?\s*$/i;
export const SUGGESTED_FALLBACK = 'Deepen RCA mechanism per no_seam_exists rationale';

export const OUTCOMES = Object.freeze({
  PASS_FEEDBACK_LOOP: 'PASS_FEEDBACK_LOOP',
  PASS_NO_SEAM_EXISTS: 'PASS_NO_SEAM_EXISTS',
  BLOCK_REQUIRE_ONE: 'BLOCK_REQUIRE_ONE',
  BLOCK_USE_ONE_NOT_BOTH: 'BLOCK_USE_ONE_NOT_BOTH',
  BLOCK_INVALID_FEEDBACK_LOOP: 'BLOCK_INVALID_FEEDBACK_LOOP',
  BLOCK_INVALID_NO_SEAM: 'BLOCK_INVALID_NO_SEAM'
});

export function validFeedbackLoop(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { valid: false, errors: ['feedback_loop must be an object'] };
  }
  const keys = Object.keys(obj);
  const extra = keys.filter(k => !FEEDBACK_LOOP_KEYS.includes(k));
  if (extra.length > 0) errors.push(`unknown key(s): ${extra.join(',')}`);
  const missing = FEEDBACK_LOOP_KEYS.filter(k => !(k in obj));
  if (missing.length > 0) errors.push(`missing key(s): ${missing.join(',')}`);
  if (typeof obj.command !== 'string') errors.push('command must be a string');
  else {
    const cmd = obj.command.trim();
    if (cmd.length < COMMAND_MIN) errors.push(`command must be >= ${COMMAND_MIN} chars trimmed`);
    if (cmd.length > COMMAND_MAX) errors.push(`command must be <= ${COMMAND_MAX} chars trimmed`);
    if (SHELL_CHAIN_RE.test(cmd)) errors.push('command must not contain shell-chain metacharacters');
  }
  if (!Number.isInteger(obj.time_to_fail_seconds)) errors.push('time_to_fail_seconds must be an integer');
  else if (obj.time_to_fail_seconds < TTFS_MIN || obj.time_to_fail_seconds > TTFS_MAX) {
    errors.push(`time_to_fail_seconds must be in [${TTFS_MIN},${TTFS_MAX}]`);
  }
  if (typeof obj.deterministic !== 'boolean') errors.push('deterministic must be a strict boolean');
  return { valid: errors.length === 0, errors };
}

export function validNoSeamExists(rationale) {
  const errors = [];
  if (typeof rationale !== 'string') return { valid: false, errors: ['rationale must be a string'] };
  const trimmed = rationale.trim();
  if (trimmed.length < NO_SEAM_MIN_LEN) errors.push(`rationale must be >= ${NO_SEAM_MIN_LEN} chars trimmed`);
  if (NO_SEAM_BANLIST_RE.test(trimmed)) errors.push('rationale matches sentinel banlist (none/n.a/tbd/etc.)');
  const tokens = trimmed.split(/\s+/).filter(Boolean).map(t => t.toLowerCase());
  const unique = new Set(tokens);
  if (unique.size < NO_SEAM_MIN_UNIQUE_TOKENS) errors.push(`rationale must have >= ${NO_SEAM_MIN_UNIQUE_TOKENS} unique tokens`);
  return { valid: errors.length === 0, errors };
}

export function validateRcaPayload(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    return { pass: false, outcome: OUTCOMES.BLOCK_REQUIRE_ONE, errors: ['payload must be an object'] };
  }
  const hasFL = metadata.feedback_loop !== undefined && metadata.feedback_loop !== null;
  const hasNS = metadata.no_seam_exists !== undefined && metadata.no_seam_exists !== null;
  if (hasFL && hasNS) {
    return { pass: false, outcome: OUTCOMES.BLOCK_USE_ONE_NOT_BOTH, errors: ['provide exactly one of feedback_loop OR no_seam_exists'] };
  }
  if (!hasFL && !hasNS) {
    return { pass: false, outcome: OUTCOMES.BLOCK_REQUIRE_ONE, errors: ['must provide feedback_loop OR no_seam_exists'] };
  }
  if (hasFL) {
    const r = validFeedbackLoop(metadata.feedback_loop);
    return r.valid
      ? { pass: true, outcome: OUTCOMES.PASS_FEEDBACK_LOOP, errors: [] }
      : { pass: false, outcome: OUTCOMES.BLOCK_INVALID_FEEDBACK_LOOP, errors: r.errors };
  }
  const rationale = typeof metadata.no_seam_exists === 'object' && metadata.no_seam_exists !== null
    ? metadata.no_seam_exists.rationale
    : metadata.no_seam_exists;
  const r = validNoSeamExists(rationale);
  return r.valid
    ? { pass: true, outcome: OUTCOMES.PASS_NO_SEAM_EXISTS, errors: [] }
    : { pass: false, outcome: OUTCOMES.BLOCK_INVALID_NO_SEAM, errors: r.errors };
}

export function suggestedDeepeningFrom(rationale) {
  if (typeof rationale !== 'string') return SUGGESTED_FALLBACK;
  const trimmed = rationale.trim();
  const sentenceMatch = trimmed.match(/^[A-Z][^.!?]{19,}[.!?]?/);
  if (sentenceMatch && sentenceMatch[0].length >= 20) return sentenceMatch[0].trim();
  return SUGGESTED_FALLBACK;
}
