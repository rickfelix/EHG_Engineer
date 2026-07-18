/**
 * SD-LEO-INFRA-EVIDENCE-PHASE-DERIVATION-001 (FR-3): format-only phase token
 * normalization SSOT for sub-agent evidence storage.
 *
 * Canonicalizes casing/separator variants of the SAME phase token (e.g.
 * "PLAN-VERIFICATION" and "PLAN_VERIFICATION" collapse to one spelling).
 * Deliberately does NOT bucket distinct sub-phases together (e.g. PLAN_PRD
 * and PLAN_VERIFICATION must remain distinct) -- coarse bucketing to
 * {LEAD, PLAN, EXEC} would re-collapse sub-phase boundaries and reintroduce
 * a smaller version of the created_at-freezing bug fb 0b12ca77 targeted.
 */

/**
 * @param {*} raw - candidate phase token (any type; non-strings are rejected)
 * @returns {string|null} canonical uppercase, underscore-separated token, or null
 */
export function normalizePhaseToken(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed
    .toUpperCase()
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || null;
}
