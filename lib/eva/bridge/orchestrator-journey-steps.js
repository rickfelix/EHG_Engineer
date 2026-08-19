/**
 * SD-LEO-INFRA-VENTURE-JOURNEY-UAT-001 FR-1: derive an orchestrator SD's
 * metadata.journey_steps from the venture's blueprint_user_journey artifact
 * (Stage 15's generateUserJourneys() output) — never from acceptance criteria,
 * which Stage 19 sprint items carry but which are not grounded in the actual
 * app surface the way Stage 15's screen/route-mapped journeys are.
 *
 * Pure/DB-free: the caller (lifecycle-sd-bridge.js) fetches + JSON.parses the
 * venture_artifacts row; this only flattens it. Tombstoned step_ids are
 * dropped — a retired step must never be handed to the UAT walker (FR-2).
 */

/**
 * @param {{journeys?: Array}|null|undefined} journeyArtifactContent - parsed
 *   content of a blueprint_user_journey venture_artifacts row.
 * @returns {Array|null} flattened, walkable step list, or null when there are
 *   no journeys/steps (never an empty array — presence itself is the FR-3 gate signal).
 */
export function deriveJourneySteps(journeyArtifactContent) {
  const journeys = journeyArtifactContent?.journeys;
  if (!Array.isArray(journeys) || journeys.length === 0) return null;

  const steps = [];
  for (const journey of journeys) {
    if (!journey || !Array.isArray(journey.steps)) continue;
    const tombstoned = new Set(Array.isArray(journey.tombstones) ? journey.tombstones : []);
    for (const step of journey.steps) {
      if (!step?.step_id || tombstoned.has(step.step_id)) continue;
      steps.push({
        step_id: step.step_id,
        journey_id: journey.journey_id || null,
        persona_ref: journey.persona_ref || null,
        seq: step.seq ?? null,
        goal: step.goal || null,
        screen_ref: step.screen_ref || null,
        route: step.route ?? null,
        action: step.action || null,
        expected_outcome: step.expected_outcome || null,
        requires: Array.isArray(step.requires) ? step.requires : [],
      });
    }
  }
  return steps.length > 0 ? steps : null;
}
