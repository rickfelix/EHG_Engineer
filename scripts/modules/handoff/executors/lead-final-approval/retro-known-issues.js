/**
 * F1: LEAD-FINAL surfaces retro known-issues instead of a hardcoded placeholder.
 * SD-LEO-INFRA-LEADFINAL-ACCEPTANCE-INTEGRITY-001-A (Solomon checkpoint-3 verdict 2ef435e1).
 *
 * Isolated in its own module (not inline in index.js) so the logic that matters -- what counts
 * as a "genuine" caveat vs boilerplate, and the fail-open contract -- is directly unit-testable
 * without mocking the whole 1000-line LeadFinalApprovalExecutor. index.js's two write sites call
 * only extractRetroKnownIssues() / combineKnownIssuesWithProvenance(), both non-throwing by
 * construction: this executor is the SINGLE canonical completion path for every SD in the fleet,
 * so a bug here must degrade to the pre-existing safe fallback, never become a new failure mode.
 */
import { getFilteredRetrospective } from '../../retro-filters.js';
import { RetrospectiveQualityRubric } from '../../../rubrics/retrospective-quality-rubric.js';

export const NO_ISSUES_FALLBACK = [{ issue: 'None at approval time' }];

// Boilerplate detection reuses RetrospectiveQualityRubric.BOILERPLATE_PATTERNS PER-ITEM, not the
// aggregate detectBoilerplate(retrospective) method -- that method returns ONE hasBoilerplate flag
// across 5 fields (what_went_well, what_needs_improvement, key_learnings, action_items,
// improvement_areas), so a boilerplate match in an unrelated field (e.g. what_went_well) would
// incorrectly suppress a genuine what_needs_improvement caveat -- re-introducing the exact
// fail-CLOSED bug this SD exists to fix.
const SUPPLEMENTARY_NOISE_PATTERNS = [
  /no specific issues identified/i,
  /no significant challenges/i,
  /handoff executed smoothly/i,
];

/** what_needs_improvement items are sometimes plain strings, sometimes {improvement, ...} objects. */
export function dereferenceImprovementItem(item) {
  if (typeof item === 'string') return item;
  if (item && typeof item === 'object') return item.improvement || JSON.stringify(item);
  return item == null ? '' : String(item);
}

export function isGenuineCaveat(text) {
  if (!text || typeof text !== 'string' || !text.trim()) return false;
  if (RetrospectiveQualityRubric.BOILERPLATE_PATTERNS.some((re) => re.test(text))) return false;
  if (SUPPLEMENTARY_NOISE_PATTERNS.some((re) => re.test(text))) return false;
  return true;
}

/**
 * SECURITY review (EXEC-TO-PLAN): reference equality, not string content equality. A genuine
 * retro caveat whose text happens to literally read "None at approval time" would otherwise be
 * misdetected as the fallback via a content match. extractRetroKnownIssues() always returns the
 * SAME NO_ISSUES_FALLBACK reference in its fallback path (never reconstructs an equivalent array),
 * so identity comparison is both correct for the real call chain and immune to the string collision.
 */
export function isFallbackKnownIssues(knownIssues) {
  return knownIssues === NO_ISSUES_FALLBACK;
}

/**
 * FR-1: the SD's genuine retro known-issues, or the existing fallback. NEVER throws -- any error
 * (retro-read exception, malformed row, getFilteredRetrospective returning {error, retrospective:
 * null}) falls back to NO_ISSUES_FALLBACK, matching the pre-existing hardcoded behavior exactly.
 */
export async function extractRetroKnownIssues(sd, supabase) {
  try {
    const { retrospective } = await getFilteredRetrospective(
      sd && sd.id,
      (sd && sd.created_at) || null,
      supabase,
      (sd && sd.sd_key) || null
    );
    if (!retrospective || !Array.isArray(retrospective.what_needs_improvement)) {
      return NO_ISSUES_FALLBACK;
    }
    const genuine = retrospective.what_needs_improvement
      .map(dereferenceImprovementItem)
      .filter(isGenuineCaveat);
    if (genuine.length === 0) return NO_ISSUES_FALLBACK;
    return genuine.map((issue) => ({ issue }));
  } catch {
    return NO_ISSUES_FALLBACK;
  }
}

/**
 * FR-3: the resume/reconcile writer's known_issues combine both a surfaced retro caveat (if any)
 * AND the existing honest provenance note -- never dropping one for the other. When the retro is
 * clean (extractRetroKnownIssues returns only the fallback), the placeholder is DROPPED so the
 * result is exactly the single provenance-only entry the resume path already wrote before this SD
 * (no regression for clean SDs).
 */
export function combineKnownIssuesWithProvenance(retroKnownIssues, provenanceIssue) {
  if (isFallbackKnownIssues(retroKnownIssues)) return [provenanceIssue];
  return [...retroKnownIssues, provenanceIssue];
}
