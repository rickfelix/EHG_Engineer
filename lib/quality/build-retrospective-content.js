import { dedupeMixed } from './dedupe-mixed.js';

/**
 * Pure aggregation step for orchestrator-completion-guardian.js createRetrospective():
 * given the raw child SD_COMPLETION retrospective rows, produce the
 * what_went_well/what_needs_improvement/key_learnings/action_items/improvement_areas
 * fields for the parent's aggregated retrospective INSERT, with dedupeMixed() applied
 * consistently to all four aggregated arrays and a labeled (never-empty, never-omitted)
 * fallback when no child data exists for a given field.
 *
 * Extracted as a pure function (no supabase, no `this`) specifically so this aggregation
 * logic -- the part of createRetrospective() that changed substantively for
 * SD-LEO-INFRA-COMPLETION-INTEGRITY-REPAIR-001 -- can be unit-tested directly, rather
 * than only source-pinned.
 *
 * @param {Array<{key_learnings?, what_went_well?, what_needs_improvement?, action_items?}>} childRetros
 * @param {{ childCompletionPhrase: string, childCount: number }} opts - childCompletionPhrase
 *   seeds the what_went_well fallback (e.g. "all N children genuinely completed");
 *   childCount is echoed into the action_items fallback message
 * @returns {{what_went_well: string[], what_needs_improvement: string[], key_learnings: (string|object)[], action_items: (string|object)[], improvement_areas: string[]}}
 */
export function buildRetrospectiveContent(childRetros, { childCompletionPhrase, childCount }) {
  const aggregatedLearnings = [];
  const aggregatedWentWell = [];
  const aggregatedNeedsImprovement = [];
  const aggregatedActionItems = [];

  (childRetros || []).forEach((retro) => {
    if (retro.key_learnings) aggregatedLearnings.push(...retro.key_learnings);
    if (retro.what_went_well) aggregatedWentWell.push(...retro.what_went_well);
    if (retro.what_needs_improvement) aggregatedNeedsImprovement.push(...retro.what_needs_improvement);
    if (retro.action_items) aggregatedActionItems.push(...retro.action_items);
  });

  const uniqueLearnings = dedupeMixed(aggregatedLearnings, 5);
  const uniqueWentWell = dedupeMixed(aggregatedWentWell, 5);
  const uniqueNeedsImprovement = dedupeMixed(aggregatedNeedsImprovement, 3);
  const uniqueActionItems = dedupeMixed(aggregatedActionItems, 5);
  // improvement_areas is a separate text[] column -- coerce to plain strings since the
  // column is text[], not jsonb (key_learnings/action_items entries may be objects).
  const improvementAreas = dedupeMixed(
    aggregatedNeedsImprovement.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))),
    5,
  );

  return {
    what_went_well: uniqueWentWell.length > 0 ? uniqueWentWell : [
      childCompletionPhrase.replace(/^./, (c) => c.toUpperCase()),
      'Orchestrator pattern enabled parallel execution',
      'Proper LEO Protocol followed for all children',
    ],
    what_needs_improvement: uniqueNeedsImprovement.length > 0 ? uniqueNeedsImprovement : [
      'Orchestrator artifacts should be created earlier in workflow',
    ],
    key_learnings: uniqueLearnings.length > 0 ? uniqueLearnings : [
      'Orchestrator SDs require explicit artifact creation',
      'Child SD aggregation provides valuable parent context',
    ],
    action_items: uniqueActionItems.length > 0 ? uniqueActionItems : [
      `Review the ${childCount} child SD(s)' individual action items for orchestrator-level follow-up`,
    ],
    improvement_areas: improvementAreas.length > 0 ? improvementAreas : [
      'Orchestrator-level improvement areas were not captured from child retrospectives',
    ],
  };
}
