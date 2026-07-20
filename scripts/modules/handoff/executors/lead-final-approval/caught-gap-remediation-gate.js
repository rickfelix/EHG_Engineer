/**
 * QF-20260720-369 (chairman-directed cfeb9179): sibling to F1 (retro-known-issues.js) --
 * F1 only SURFACES pre-existing retro caveats. This REQUIRES a why-missed root-cause +
 * systemic-prevention output on any SD whose retrospective reports a caught-gap
 * remediation (bugs_found > 0), so that meta-learning is a first-class, guaranteed
 * completion-record line item rather than reviewer-discretionary.
 *
 * Fail-open by construction (same executor-wide contract as F1 -- see retro-known-issues.js
 * header): never throws, never blocks -- surfaces the gap as an appended known_issues entry.
 */
import { getFilteredRetrospective } from '../../retro-filters.js';
import { isGenuineCaveat, dereferenceImprovementItem } from './retro-known-issues.js';

export function isCaughtGapRemediation(retrospective) {
  return !!(retrospective && Number(retrospective.bugs_found) > 0);
}

export function hasWhyMissedPreventionContent(retrospective) {
  const fields = [retrospective?.failure_patterns, retrospective?.improvement_areas];
  return fields.some(
    (arr) => Array.isArray(arr) && arr.map(dereferenceImprovementItem).some(isGenuineCaveat)
  );
}

/** Never throws -- mirrors extractRetroKnownIssues's fail-open contract. */
export async function checkCaughtGapRemediationGap(sd, supabase) {
  try {
    const { retrospective } = await getFilteredRetrospective(
      sd && sd.id,
      (sd && sd.created_at) || null,
      supabase,
      (sd && sd.sd_key) || null
    );
    if (!isCaughtGapRemediation(retrospective) || hasWhyMissedPreventionContent(retrospective)) {
      return null;
    }
    return {
      issue: `Caught-gap remediation (${retrospective.bugs_found} bug(s) found/fixed) with no why-missed root-cause / systemic-prevention analysis in failure_patterns or improvement_areas (chairman directive cfeb9179).`,
    };
  } catch {
    return null;
  }
}
