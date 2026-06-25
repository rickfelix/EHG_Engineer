/**
 * Backend-leaf detection for GATE2_IMPLEMENTATION_FIDELITY Section A (design-fidelity)
 * and Section C (data-flow-alignment). Shared by BOTH sections so the UI-surface and
 * backend-evidence heuristics can never drift apart.
 *
 * SD-FDBK-FIX-GATE2-IMPLEMENTATION-FIDELITY-001 (broadens PAT-GATE2-BACKEND-ONLY-001):
 * Section A checked scope+title and exempted {database,infrastructure,documentation};
 * Section C checked scope only and exempted only {database}; and neither matched a
 * cross-repo BACKEND venture leaf like the DataDistill D1 distillation engine, whose
 * "engine/worker" scope tripped no backend keyword, so it scored 77<80 and forced a
 * documented --bypass-validation. Recurs for E1 (PII) / H1 (error middleware).
 *
 * Discriminator (false-pass FENCE): an SD is a backend leaf ONLY when its scope carries
 * NO UI surface. Venture UI leaves (e.g. DataDistill F1 "Run History Dashboard - UI
 * Layer", G1 "Feedback Widget - UI Layer") trip hasUISurface() via "dashboard"/"widget"/
 * "UI" and are NEVER exempted here. The exemption keys on the no-UI axis, never on
 * venture membership — validated on live data, where a blanket venture_id exemption
 * would wrongly pass F1/G1 (they target the venture app AND carry UI scope).
 *
 * Pure + synchronous + never throws: callers invoke this inside their existing try/catch,
 * so a resolver error still falls through to normal scoring (never a free 25/25 on error).
 */

// UI-surface signal: any of these in scope means the SD promises a user-facing surface,
// so the UI/form sub-checks ARE applicable (no exemption). Word-boundaried so "platform"/
// "transform" do not false-trip via "form", and "build" does not false-trip via "ui".
export const UI_SURFACE_RE =
  /\b(component|ui|frontend|form|page|view|dashboard|widget|modal|button|input|nav(?:igation)?|layout)\b/i;

// Positive backend evidence: required for the UI-capable types {feature, bugfix} so a
// vague no-signal feature is NOT exempted — only a genuine backend leaf is. Broadened
// past the original /(script|cli|command|api|backend|server|lib\/|node)/ to catch the
// engine/worker/service vocabulary of venture-app backend leaves (the D1 gap).
export const BACKEND_EVIDENCE_RE =
  /\b(script|cli|command|api|backend|server|lib\/|node|engine|worker|pipeline|service|daemon|scanner|processor|middleware|queue|job|cron|webhook|distill\w*|resolver|parser|migration|sql|rpc|endpoint|handler|gate|validator|executor|ingest\w*)\b/i;

// Types that never carry a UI surface by definition → exempt on !hasUISurface alone.
export const NO_UI_TYPES = Object.freeze(['database', 'infrastructure', 'documentation']);

// Types that CAN be UI → require positive backend evidence to count as a backend leaf.
export const BACKEND_CAPABLE_TYPES = Object.freeze(['feature', 'bugfix']);

export function hasUISurface(text) {
  return UI_SURFACE_RE.test(String(text || ''));
}

export function hasBackendEvidence(scopeText, titleText) {
  return BACKEND_EVIDENCE_RE.test(String(scopeText || '')) ||
         BACKEND_EVIDENCE_RE.test(String(titleText || ''));
}

/**
 * Case-insensitive EHG_Engineer target check. The data carries both casings across
 * venture targets (e.g. 'datadistill'/'DataDistill'); harden the platform compare too.
 */
export function isEhgEngineerTarget(target) {
  return String(target || '').trim().toLowerCase() === 'ehg_engineer';
}

/**
 * Classify whether an SD is a backend leaf (no UI surface) that should receive full
 * Section A / Section C credit. Pure, synchronous, never throws.
 *
 * @param {string} sdType   - resolved sd.sd_type
 * @param {string} scopeText - flattened scope.included text
 * @param {string} titleText - resolved sd.title
 * @returns {{exempt: boolean, reason: string}}
 */
export function classifyBackendLeaf(sdType, scopeText, titleText) {
  const t = String(sdType || '').trim().toLowerCase();
  // FENCE: a UI surface in scope means the UI/form sub-checks are applicable.
  if (hasUISurface(scopeText)) return { exempt: false, reason: 'has UI surface in scope' };
  if (NO_UI_TYPES.includes(t)) {
    return { exempt: true, reason: `${t} SD without UI scope - no UI/form surface by type` };
  }
  if (BACKEND_CAPABLE_TYPES.includes(t) && hasBackendEvidence(scopeText, titleText)) {
    return { exempt: true, reason: `backend-only ${t} SD (engine/worker/server/API) - no UI/form surface` };
  }
  return { exempt: false, reason: 'no backend-leaf signal' };
}

// SD-LEO-INFRA-GATE2-BACKEND-FIDELITY-NA-001 — signals for a backend SD that SERVES an
// EXISTING frontend caller (so it MENTIONS UI but ships none). These let the exemption fire
// even when hasUISurface() is true (the classifyBackendLeaf fence above rejects such SDs).
export const API_BUILD_RE =
  /\/api\/|\b(POST|GET|PUT|PATCH|DELETE)\s+\/|\bapi\s+(route|endpoint|handler)\b/i;
// References an EXISTING/already-wired UI caller — the discriminator vs an SD that BUILDS UI.
export const SERVES_EXISTING_UI_RE =
  /\balready\s+calls?\b|\b(operator\s+app|frontend|client|ui|component)\s+already\b|\b\S+\.(tsx|jsx)\s+(already|calls?|expects?)\b/i;
// Generous "this SD BUILDS a UI surface" fence — keeps a genuine UI SD OUT of the exemption.
export const BUILDS_NEW_UI_RE =
  /\b(build|create|add|implement|render|design)\s+(\w+\s+){0,4}(component|page|form|view|dashboard|widget|modal|button|ui)\b/i;

/**
 * A backend API-endpoint SD that SERVES an EXISTING frontend caller ships NO new UI, but its
 * scope necessarily NAMES that caller (e.g. ".../route that Stage24GoLive.tsx already calls"),
 * tripping hasUISurface() — so classifyBackendLeaf's FENCE wrongly returns exempt:false and
 * Section A false-blocks it (STAGE24 / SD-EHG-PRODUCT-STAGE24-GOLIVE-BACKEND-001 forced 3
 * bypasses). This detects that precise false-positive: builds an API endpoint AND references an
 * already-calling UI caller AND does NOT itself build a new UI surface. A real UI SD BUILDS the
 * surface, so BUILDS_NEW_UI_RE fences it out — the exemption can never relax a genuine UI SD.
 * Pure + synchronous + never throws.
 *
 * @param {string} sdType
 * @param {string} scopeText
 * @param {string} titleText
 * @returns {{exempt: boolean, reason: string}}
 */
export function servesExistingUiBackend(sdType, scopeText, titleText) {
  const t = String(sdType || '').trim().toLowerCase();
  // Only the UI-capable types fall through to Section A enforcement; other types are already
  // handled by the sd-type policy / classifyBackendLeaf, so scope this narrowly.
  if (!BACKEND_CAPABLE_TYPES.includes(t)) {
    return { exempt: false, reason: 'not a UI-capable type (handled by policy/classifyBackendLeaf)' };
  }
  const text = `${scopeText || ''} ${titleText || ''}`;
  const buildsApi = API_BUILD_RE.test(text);
  const servesUi = SERVES_EXISTING_UI_RE.test(text);
  const buildsUi = BUILDS_NEW_UI_RE.test(text);
  if (buildsApi && servesUi && !buildsUi) {
    return { exempt: true, reason: 'backend API endpoint serving an existing UI caller - ships no new UI' };
  }
  return { exempt: false, reason: 'not a backend-serves-existing-UI leaf' };
}
