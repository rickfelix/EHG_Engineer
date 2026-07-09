/**
 * Value-authenticity spec-time gate (SD-LEO-INFRA-VALUE-AUTHENTICITY-SPEC-001).
 *
 * Rejects PRD acceptance criteria on value-bearing ("derived result") leaves that a
 * mock/stub could satisfy — forcing authors to SELECT + PARAMETERIZE a criterion_id
 * from the canonical criteria library (value_authenticity_criteria_library, see
 * database/migrations/20260709_value_authenticity_criteria_library.sql) instead of
 * writing free-text prose. See docs/design/value-authenticity-system-design.md §1-L2.
 *
 * Ships OBSERVE-ONLY (FR-5, CLAUDE_CORE.md "Observe-Only-First Default for New
 * Enforcement"): findings are logged/flagged, never blocking, unless
 * VALUE_AUTHENTICITY_GATE_BINDING=true is explicitly set.
 *
 * All classification/check functions below are PURE (no I/O) so they are directly
 * unit-testable without a database or PRD row.
 */

// Contract version 1 ID scheme (FR-6): 'VA-<T_FORM>-<slug>'. A criterion is considered
// "selected from the library" if its text contains a matching ID token — this is how
// the spec-time selection (this SD) and the runtime execution (pair-half B) round-trip
// by ID without either side re-deriving the other's shape (SSOT §4.3).
const LIBRARY_CRITERION_ID_PATTERN = /\bVA-T[0-4]-[a-z0-9-]+\b/i;

// Trigger predicate (SSOT §1-L2): only leaves whose output the product presents as a
// DERIVED RESULT a user relies on — never CRUD/nav (universal friction gets gates
// gamed). Keyword-heuristic classifier; false-negatives (missing a real derived-result
// leaf) are safer than false-positives (gating CRUD) given this ships observe-only.
const DERIVED_RESULT_KEYWORDS = [
  'analysis', 'analyze', 'recommend', 'generat', 'score', 'pricing', 'price',
  'persona', 'insight', 'predict', 'forecast', 'valuation', 'rating', 'assessment',
  'evaluat', 'classif', 'summar', 'derive', 'research', 'estimate'
];
const CRUD_NAV_KEYWORDS = [
  'create a', 'create an', 'delete', 'navigate', 'display the', 'list the',
  'render', 'view the', 'record', 'save the', 'store the', 'load the', 'fetch the',
  'log in', 'sign up', 'button', 'form field', 'page load', 'redirect'
];

/**
 * Does this leaf (FR title + description) present a claim a user relies on as a
 * derived result (analysis/recommendation/generated content/score/price), as opposed
 * to CRUD/nav? Pure function — no I/O.
 * @param {string} leafText
 * @returns {boolean} true if the leaf is in scope for the gate
 */
function classifyTriggerPredicate(leafText) {
  const text = (leafText || '').toLowerCase();
  if (!text.trim()) return false;

  const hasDerivedResultSignal = DERIVED_RESULT_KEYWORDS.some(kw => text.includes(kw));
  if (!hasDerivedResultSignal) return false;

  // A leaf can mention a derived-result word in passing while still being pure CRUD
  // (e.g. "user can view their score history" — a display leaf, not a computation
  // leaf). Require the derived-result signal WITHOUT being dominated by CRUD/nav
  // phrasing to reduce false positives on such leaves.
  const crudNavHits = CRUD_NAV_KEYWORDS.filter(kw => text.includes(kw)).length;
  const derivedHits = DERIVED_RESULT_KEYWORDS.filter(kw => text.includes(kw)).length;
  return derivedHits > crudNavHits;
}

/**
 * Is this acceptance-criterion text mock-satisfiable — i.e. free-text prose rather
 * than a selection+parameterization from the canonical criteria library by ID? Pure
 * function — no I/O, no DB lookup (library existence is NOT verified here; that is
 * the caller's job when it has access to the live library rows).
 * @param {string} criterionText
 * @returns {boolean} true if the criterion is mock-satisfiable (missing a library ID)
 */
function isMockSatisfiable(criterionText) {
  const text = (criterionText || '').trim();
  if (!text) return true;
  return !LIBRARY_CRITERION_ID_PATTERN.test(text);
}

/**
 * Extract the library criterion_id referenced by an acceptance-criterion string, if
 * any. Pure function.
 * @param {string} criterionText
 * @returns {string|null}
 */
function extractCriterionId(criterionText) {
  const match = LIBRARY_CRITERION_ID_PATTERN.exec(criterionText || '');
  return match ? match[0].toUpperCase() : null;
}

/**
 * Deferred-stub trap (SSOT §1-L2, two teeth). A phased stub on an in-scope leaf is
 * legal ONLY if BOTH teeth are present:
 *   (i) the deferral names a blocking-predecessor SD (a real SD key gating launch)
 *   (ii) the product claim demotes while stubbed (cannot advertise as real)
 * Pure function.
 * @param {{ namedBlockingSdKey?: string|null, claimDemoted?: boolean }} deferral
 * @returns {{ passed: boolean, missingTeeth: string[] }}
 */
function checkDeferredStubTrap(deferral) {
  const missingTeeth = [];
  const hasNamedBlockingSd = !!(deferral && deferral.namedBlockingSdKey && /^SD-/.test(deferral.namedBlockingSdKey));
  const claimDemoted = !!(deferral && deferral.claimDemoted === true);

  if (!hasNamedBlockingSd) missingTeeth.push('NAMED_BLOCKING_PREDECESSOR_SD');
  if (!claimDemoted) missingTeeth.push('CLAIM_DEMOTION');

  return { passed: missingTeeth.length === 0, missingTeeth };
}

/**
 * No-silent-pass (FR-4): an in-scope leaf with no library-expressible criterion must
 * either (a) have a criterion selected from the library, or (b) carry an explicit
 * authenticity-unspecifiable waiver with a named owner (recorded via SD-1's decision-
 * binding disposition rows — this function does not read that table; the caller
 * supplies whether a waiver was found). Pure function.
 * @param {{ hasLibraryCriterion: boolean, waiver?: { ownerName?: string } | null }} params
 * @returns {{ passed: boolean, reason: string }}
 */
function checkNoSilentPass({ hasLibraryCriterion, waiver }) {
  if (hasLibraryCriterion) return { passed: true, reason: 'LIBRARY_CRITERION_PRESENT' };
  const hasNamedWaiver = !!(waiver && typeof waiver.ownerName === 'string' && waiver.ownerName.trim().length > 0);
  if (hasNamedWaiver) return { passed: true, reason: 'WAIVER_WITH_NAMED_OWNER' };
  return { passed: false, reason: 'NO_CRITERION_NO_WAIVER' };
}

/**
 * Evaluate a single PRD functional requirement against FR-2/FR-3/FR-4. Pure function
 * (no I/O) — the caller supplies libraryCriterionIds (from a live DB read) and any
 * known waivers so this stays testable without a database.
 * @param {object} fr - a PRD functional_requirements[] entry
 * @param {{ libraryCriterionIds: Set<string>, waiversByFrId?: Map<string, {ownerName: string}> }} ctx
 * @returns {Array<{fr_id: string, criterion: string, issue: string, message: string}>}
 */
function evaluateFunctionalRequirement(fr, ctx) {
  const findings = [];
  const leafText = `${fr?.title || ''} ${fr?.description || ''}`;
  if (!classifyTriggerPredicate(leafText)) return findings; // out of scope (CRUD/nav)

  const criteria = Array.isArray(fr?.acceptance_criteria) ? fr.acceptance_criteria : [];
  const libraryCriterionIds = ctx?.libraryCriterionIds || new Set();
  let anyLibraryCriterion = false;

  for (const criterion of criteria) {
    if (isMockSatisfiable(criterion)) {
      findings.push({
        fr_id: fr.id || '(no id)',
        criterion,
        issue: 'MOCK_SATISFIABLE',
        message: `FR ${fr.id || '(no id)'}: acceptance criterion "${String(criterion).slice(0, 120)}" is free-text and mock-satisfiable — select+parameterize a criterion_id from value_authenticity_criteria_library instead.`
      });
      continue;
    }
    const criterionId = extractCriterionId(criterion);
    if (libraryCriterionIds.size > 0 && criterionId && !libraryCriterionIds.has(criterionId)) {
      findings.push({
        fr_id: fr.id || '(no id)',
        criterion,
        issue: 'UNKNOWN_CRITERION_ID',
        message: `FR ${fr.id || '(no id)'}: references criterion_id "${criterionId}" which is not in the current criteria library — round-trip contract broken.`
      });
      continue;
    }
    anyLibraryCriterion = true;
  }

  if (!anyLibraryCriterion) {
    const waiver = ctx?.waiversByFrId?.get(fr.id);
    const silentPass = checkNoSilentPass({ hasLibraryCriterion: false, waiver });
    if (!silentPass.passed) {
      findings.push({
        fr_id: fr.id || '(no id)',
        criterion: null,
        issue: 'NO_SILENT_PASS_VIOLATION',
        message: `FR ${fr.id || '(no id)'}: derived-result leaf has no library-expressible criterion and no authenticity-unspecifiable waiver with a named owner — cannot silently pass.`
      });
    }
  }

  return findings;
}

/**
 * Main gate evaluation across a full PRD. Pure function given its inputs — the
 * ValidatorRegistry wrapper (registerValueAuthenticityGate below) is the only piece
 * that performs I/O (reading the live library table, the binding-mode env var).
 * @param {object} prd - PRD row (functional_requirements field consumed)
 * @param {{ bindingEnabled?: boolean, libraryCriterionIds?: Set<string>, waiversByFrId?: Map<string, {ownerName: string}> }} options
 * @returns {{ passed: boolean, score: number, max_score: number, issues: string[], warnings: string[], findings: Array }}
 */
function evaluateValueAuthenticitySpecGate(prd, options = {}) {
  const bindingEnabled = options.bindingEnabled === true;
  const frs = Array.isArray(prd?.functional_requirements) ? prd.functional_requirements : [];

  const allFindings = frs.flatMap(fr => evaluateFunctionalRequirement(fr, options));
  const messages = allFindings.map(f => f.message);

  // Observe-only (default): never fails the gate, findings surface as warnings only,
  // so the calibration window has real data without blocking any handoff (FR-5).
  if (!bindingEnabled) {
    return {
      passed: true,
      score: allFindings.length === 0 ? 100 : 70,
      max_score: 100,
      issues: [],
      warnings: messages,
      findings: allFindings
    };
  }

  return {
    passed: allFindings.length === 0,
    score: allFindings.length === 0 ? 100 : 0,
    max_score: 100,
    issues: messages,
    warnings: [],
    findings: allFindings
  };
}

/**
 * Register this gate into the ValidatorRegistry, following the established
 * `registry.register(name, async (context) => result, description)` pattern (see
 * scripts/modules/handoff/validation/validator-registry/gates/additional-validators.js).
 * @param {import('../core.js').ValidatorRegistry} registry
 */
function registerValueAuthenticityGate(registry) {
  registry.register('valueAuthenticitySpecGate', async (context) => {
    const { prd, supabase } = context;

    if (!prd) {
      return { passed: true, score: 100, max_score: 100, warnings: ['No PRD available yet — gate not applicable at this handoff'] };
    }

    let libraryCriterionIds = new Set();
    try {
      if (supabase) {
        const { data } = await supabase.from('value_authenticity_criteria_library').select('criterion_id');
        libraryCriterionIds = new Set((data || []).map(r => r.criterion_id.toUpperCase()));
      }
    } catch {
      // Fail-open on a library-read error: observe-mode already never blocks, and a
      // transient DB error should not manufacture MOCK_SATISFIABLE findings for
      // criteria that legitimately reference valid (but unverifiable-right-now) IDs.
      libraryCriterionIds = new Set();
    }

    const bindingEnabled = process.env.VALUE_AUTHENTICITY_GATE_BINDING === 'true';
    return evaluateValueAuthenticitySpecGate(prd, { bindingEnabled, libraryCriterionIds });
  }, 'Value-authenticity spec-time gate (FR-2/FR-3/FR-4; observe-only unless VALUE_AUTHENTICITY_GATE_BINDING=true)');
}

export {
  classifyTriggerPredicate,
  isMockSatisfiable,
  extractCriterionId,
  checkDeferredStubTrap,
  checkNoSilentPass,
  evaluateFunctionalRequirement,
  evaluateValueAuthenticitySpecGate,
  registerValueAuthenticityGate,
  LIBRARY_CRITERION_ID_PATTERN
};
