/**
 * Pure builder for the mandatory_child_order metadata patch written by
 * scripts/amend-sd.js --mandatory-child-order. Extracted out of the CLI so the
 * flag's parsing/validation is unit-testable without invoking the CLI's main()
 * (which talks to Supabase and calls process.exit). QF-20260907-152
 * (QF-20260904-708 remainder). Structured shape read by
 * lib/fleet/claim-eligibility.cjs's parseMandatoryChildOrder.
 *
 * @param {string} rawValue - comma-separated child suffixes, e.g. "E,A,B"
 * @param {string|null} [reason]
 * @returns {{error: string}|{metadata: {mandatory_child_order: {order: string[], reason: string|null}}}}
 */
export function buildMandatoryChildOrderPatch(rawValue, reason = null) {
  const order = String(rawValue || '')
    .split(',')
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);
  if (order.length < 2) {
    return { error: '--mandatory-child-order needs at least 2 comma-separated child suffixes, e.g. "E,A,B"' };
  }
  return { metadata: { mandatory_child_order: { order, reason: reason || null } } };
}
