/**
 * Customer-facing landing detector + design-pass check + gate-mode resolver.
 * SD-LEO-INFRA-ACTIVATE-DESIGN-FIDELITY-001 (the GATE HALF of the MarketLens landing-seam fix).
 *
 * Pure, synchronous, NEVER throws — same convention as backend-leaf-detection.js, so callers
 * invoke these inside their existing flow without a try/catch and a malformed input can never
 * turn a working gate evaluation into a thrown error.
 *
 * WHY: the thin MarketLens landing shipped as a backend/API child and slipped through
 * backend-leaf-detection.js classifyBackendLeaf() (which exempts on !hasUISurface), while
 * design-fidelity-scorer.js returned null (no stitchData) as a silent PASS. A customer-facing
 * landing is ALWAYS in-scope for design fidelity; these predicates let the gate observe that.
 */

// Customer-facing landing signal: a user-facing marketing/landing PAGE surface. Requires a
// page-noun (not a bare "landing"/"hero") so a backend worker that merely mentions "hero-image"
// or a "landing zone" does not false-trip — false-positives pollute the observe corpus that the
// observe->bind decision reads (adversarial re-verify FR-1). Exported (like
// backend-leaf-detection.js UI_SURFACE_RE) so the keyword set is reviewable/auditable.
export const CUSTOMER_FACING_LANDING_RE =
  /\b(landing[-\s]?page|customer[-\s]?facing|marketing[-\s]?(?:page|site|landing)|hero[-\s]?(?:section|banner)|home[-\s]?page|homepage|front[-\s]?page|product[-\s]?page|public[-\s]?(?:page|site)|splash[-\s]?page|go[-\s]?to[-\s]?market\s+page)\b/i;

/** true when target_application names a VENTURE app (not the EHG_Engineer harness, not empty). */
export function isVentureAppTarget(target) {
  const t = String(target || '').trim().toLowerCase();
  if (!t) return false;                 // no target -> not a known venture surface
  if (t === 'ehg_engineer') return false; // the backend-only harness repo
  return true;
}

/**
 * true when the SD is a CUSTOMER-FACING LANDING: it targets a venture app AND its scope/title
 * carries a landing / customer-facing / marketing-page signal. FENCED so a genuine backend
 * leaf (a venture engine/worker with no landing surface) never trips it — the venture-target
 * AND landing-signal conjunction is required, so "DataDistill distillation engine" (venture
 * target, no landing signal) is NOT a customer-facing landing.
 *
 * @param {{target_application?: string}} sd
 * @param {string} scopeText - flattened scope.included text
 * @param {string} titleText - sd.title
 * @returns {boolean}
 */
export function isCustomerFacingLanding(sd, scopeText, titleText) {
  if (!isVentureAppTarget(sd?.target_application)) return false;
  const text = `${String(scopeText || '')} ${String(titleText || '')}`;
  return CUSTOMER_FACING_LANDING_RE.test(text);
}

/**
 * true when a customer-facing landing HAS a design pass by ANY path: a Stitch/S17 design
 * artifact is present, OR a completed design / page-quality child SD exists. PURE — the caller
 * injects the already-fetched artifacts + child SDs (dependency injection keeps this testable
 * and non-throwing). A missing/malformed input reads as "no design pass".
 *
 * @param {{ designArtifacts?: Array, childSds?: Array }} deps
 * @returns {boolean}
 */
export function hasDesignPass(deps = {}) {
  const artifacts = Array.isArray(deps?.designArtifacts) ? deps.designArtifacts : [];
  const children = Array.isArray(deps?.childSds) ? deps.childSds : [];

  const hasStitchOrS17 = artifacts.some((a) => {
    const kind = `${String(a?.artifact_type || a?.kind || a?.type || '')} ${String(a?.stage || a?.stage_number || '')} ${String(a?.name || '')}`.toLowerCase();
    // substring for stitch/design (matches 'stitch_export', 'design_tokens'); S17 covers 's17' and a
    // standalone stage number 17.
    return kind.includes('stitch') || kind.includes('design') || kind.includes('s17') || /(^|\D)17(\D|$)/.test(kind);
  });
  if (hasStitchOrS17) return true;

  return children.some((c) => {
    const status = String(c?.status || '').toLowerCase();
    if (status !== 'completed') return false;
    const label = `${String(c?.sd_type || '')} ${String(c?.title || '')}`.toLowerCase();
    return /\bdesign\b/.test(label) || /page[-\s]?quality/.test(label) || /\bui\b/.test(label);
  });
}

/**
 * Resolve DESIGN_FIDELITY_GATE_MODE as an explicit ALLOWLIST: ONLY the exact string 'bind'
 * opts into blocking; every other value (unset, '', 'BIND ', 'binding', 'Bind', garbage)
 * resolves to 'observe'. This FAILS SAFE — a misspelled/unset value can never fail-open into
 * binding and block the MarketLens flagship (which has no design pass at S24).
 *
 * @param {object} env - process.env (or a test double)
 * @returns {'observe'|'bind'}
 */
export function resolveDesignFidelityGateMode(env = {}) {
  return (env && env.DESIGN_FIDELITY_GATE_MODE) === 'bind' ? 'bind' : 'observe';
}
