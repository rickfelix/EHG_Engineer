'use strict';

/**
 * coerce-literal.cjs — SD-FDBK-INFRA-HARDEN-ORCHESTRATOR-CHILD-001
 *
 * Coerce a captured Supabase-mutation value token (text extracted from a Bash command by
 * pre-tool-enforce.cjs::extractParams) to a JS literal so lib/schema-preflight.cjs can
 * type-check it against the real column type.
 *
 * ONLY unambiguous literals are coerced:
 *   - 'true' / 'false'           -> boolean
 *   - integer / decimal literal  -> number
 *   - 'x' / "x" / `x`            -> the inner string
 * Anything else (variables, expressions, arrays, nested objects, template interpolation)
 * returns the 'unknown' placeholder, which schema-preflight treats as TYPE-CHECK-SKIP.
 *
 * This fixes the false-positive where every mutation value was stamped 'unknown' and then
 * type-checked against non-string columns (e.g. bool is_working_on) → spurious "Type mismatch".
 *
 * @param {string} raw - the value token text (right side of `key: value`)
 * @returns {boolean|number|string} a coerced literal, or the string 'unknown'
 */
function coerceLiteral(raw) {
  const v = (raw == null ? '' : String(raw)).trim();
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+(?:\.\d+)?$/.test(v)) return Number(v);
  const q = v.match(/^(['"`])([\s\S]*)\1$/);
  if (q) return q[2];
  return 'unknown';
}

module.exports = { coerceLiteral };
