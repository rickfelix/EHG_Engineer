/**
 * Venture-Screen operating mode orchestrator (SD-LEO-INFRA-EHG-VENTURE-FORESIGHT-001-C,
 * FR-4). spec section 9.2: "Evaluate an identified venture candidate before
 * meaningful engineering effort begins."
 *
 * Wires: sibling A's council/profile content -> specialist-runner (x3 per council)
 * -> adjudicator-runner (x1 per council) -> eva-synthesis (x1 across all 5 councils).
 *
 * A parse/insert failure on one specialist or adjudicator call is collected into
 * `errors` and does NOT abort the run -- a bad response from one lens must not
 * block evaluation of the other four councils (PRD FR-4 acceptance criterion).
 * A council whose adjudication failed is excluded from the EVA synthesis input
 * (partial-board synthesis is more honest than fabricating a missing adjudication).
 */
import { loadCouncils, loadProfiles } from '../content/index.mjs';
import { runSpecialistAssessment } from './specialist-runner.js';
import { runAdjudication } from './adjudicator-runner.js';
import { runEvaSynthesis } from './eva-synthesis.js';

/**
 * @param {string} ventureCandidateIdOrObject - venture_candidate_id string, or a
 *   full venture-candidate context object (spec section 10 step 3 shape) with at
 *   least { venture_candidate_id }.
 * @param {Object} params
 * @param {Object} params.supabase
 * @param {Object} [params.llmClient] - shared injected LLM client for all stages;
 *   omit to let each stage default to its own getLLMClient({purpose}) call.
 */
export async function runVentureScreen(ventureCandidateIdOrObject, { supabase, llmClient } = {}) {
  const ventureCandidate =
    typeof ventureCandidateIdOrObject === 'string'
      ? { venture_candidate_id: ventureCandidateIdOrObject }
      : ventureCandidateIdOrObject;

  const councils = loadCouncils();
  const profiles = loadProfiles();
  const profileById = new Map(profiles.map((p) => [p.perspective_id, p]));

  const specialistAssessmentIds = [];
  const councilAdjudicationIds = [];
  const errors = [];
  const adjudicationsForSynthesis = [];

  for (const council of councils) {
    const specialistRows = [];
    for (const perspectiveId of council.specialist_perspective_ids || []) {
      const profile = profileById.get(perspectiveId);
      if (!profile) {
        errors.push({ stage: 'specialist', council_id: council.council_id, perspective_id: perspectiveId, reason: 'profile_not_found' });
        continue;
      }
      const result = await runSpecialistAssessment({ profile, council, ventureCandidate, supabase, llmClient });
      if (result.parseError || result.insertError) {
        errors.push({ stage: 'specialist', council_id: council.council_id, perspective_id: perspectiveId, ...result });
        continue;
      }
      specialistAssessmentIds.push(result.id);
      specialistRows.push({ ...profile, assessment_id: result.id, venture_candidate_id: ventureCandidate.venture_candidate_id });
    }

    if (specialistRows.length === 0) {
      errors.push({ stage: 'adjudication', council_id: council.council_id, reason: 'no_specialist_assessments_available' });
      continue;
    }

    const adjudicatorProfile = profileById.get(council.adjudicator_perspective_id);
    if (!adjudicatorProfile) {
      errors.push({ stage: 'adjudication', council_id: council.council_id, reason: 'adjudicator_profile_not_found' });
      continue;
    }

    const adjResult = await runAdjudication({
      adjudicatorProfile,
      council,
      specialistAssessments: specialistRows,
      ventureCandidateId: ventureCandidate.venture_candidate_id,
      supabase,
      llmClient,
    });
    if (adjResult.parseError || adjResult.insertError) {
      errors.push({ stage: 'adjudication', council_id: council.council_id, ...adjResult });
      continue;
    }
    councilAdjudicationIds.push(adjResult.id);
    adjudicationsForSynthesis.push({ adjudication_id: adjResult.id, council_id: council.council_id });
  }

  let dossierId = null;
  if (adjudicationsForSynthesis.length > 0) {
    const synthResult = await runEvaSynthesis({
      councilAdjudications: adjudicationsForSynthesis,
      ventureCandidate,
      supabase,
      llmClient,
    });
    if (synthResult.parseError || synthResult.insertError) {
      errors.push({ stage: 'eva_synthesis', ...synthResult });
    } else {
      dossierId = synthResult.id;
    }
  } else {
    errors.push({ stage: 'eva_synthesis', reason: 'no_council_adjudications_available' });
  }

  return { specialistAssessmentIds, councilAdjudicationIds, dossierId, errors };
}
