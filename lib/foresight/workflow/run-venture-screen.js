/**
 * Venture-Screen operating mode orchestrator (SD-LEO-INFRA-EHG-VENTURE-FORESIGHT-001-C,
 * FR-4). spec section 9.2: "Evaluate an identified venture candidate before
 * meaningful engineering effort begins."
 *
 * Wires: sibling A's council/profile content -> specialist-runner (x3 per council)
 * -> adjudicator-runner (x1 per council) -> eva-synthesis (x1 across all 5 councils).
 * Each stage's ACTUAL PARSED OUTPUT is forwarded to the next stage (not the static
 * specialist/adjudicator profile or a bare id) -- an earlier version of this file
 * forwarded profile bios/ids instead of real findings, which would have caused the
 * adjudicator and EVA synthesis to reason over persona metadata rather than actual
 * assessments (caught by adversarial PR review, PR #6174, before merge).
 *
 * A parse/insert failure OR a thrown exception (malformed-but-present response
 * fields, LLM client network/timeout errors) on one specialist or adjudicator call
 * is caught and collected into `errors` and does NOT abort the run -- a bad response
 * from one lens must not block evaluation of the other four councils (PRD FR-4
 * acceptance criterion). A council whose adjudication failed is excluded from the
 * EVA synthesis input (partial-board synthesis is more honest than fabricating a
 * missing adjudication).
 */
import { loadCouncils, loadProfiles } from '../content/index.mjs';
import { runSpecialistAssessment } from './specialist-runner.js';
import { runAdjudication } from './adjudicator-runner.js';
import { runEvaSynthesis } from './eva-synthesis.js';

/** Run `fn()`, converting a thrown exception into the same shape as a returned parseError. */
async function runStageSafely(stage, contextFields, fn) {
  try {
    return await fn();
  } catch (e) {
    return { parseError: true, threw: true, stage, ...contextFields, reason: e?.message || String(e) };
  }
}

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
      const result = await runStageSafely(
        'specialist',
        { council_id: council.council_id, perspective_id: perspectiveId },
        () => runSpecialistAssessment({ profile, council, ventureCandidate, supabase, llmClient }),
      );
      if (result.parseError || result.insertError) {
        errors.push({ stage: 'specialist', council_id: council.council_id, perspective_id: perspectiveId, ...result });
        continue;
      }
      specialistAssessmentIds.push(result.id);
      // Forward the ACTUAL parsed assessment content, not the static profile.
      specialistRows.push({ perspective_id: profile.perspective_id, assessment_id: result.id, ...result.output });
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

    const adjResult = await runStageSafely(
      'adjudication',
      { council_id: council.council_id },
      () =>
        runAdjudication({
          adjudicatorProfile,
          council,
          specialistAssessments: specialistRows,
          ventureCandidateId: ventureCandidate.venture_candidate_id,
          supabase,
          llmClient,
        }),
    );
    if (adjResult.parseError || adjResult.insertError) {
      errors.push({ stage: 'adjudication', council_id: council.council_id, ...adjResult });
      continue;
    }
    councilAdjudicationIds.push(adjResult.id);
    // Forward the ACTUAL parsed adjudication content, not a bare {adjudication_id, council_id}.
    adjudicationsForSynthesis.push({ adjudication_id: adjResult.id, council_id: council.council_id, ...adjResult.output });
  }

  let dossierId = null;
  if (adjudicationsForSynthesis.length > 0) {
    const synthResult = await runStageSafely('eva_synthesis', {}, () =>
      runEvaSynthesis({ councilAdjudications: adjudicationsForSynthesis, ventureCandidate, supabase, llmClient }),
    );
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
