/**
 * Context gathering + prompt composition for the Stage-20 experience-design
 * review pilot (standalone design-agent adapter, Unit B).
 *
 * SD-LEO-FEAT-STAGE-EXPERIENCE-DESIGN-001 (FR-3): the reviewer consumes
 * Stage-15 experience artifacts (wireframes, IA, user-journey) + the live
 * deployment URL. Architecture note (recorded so this isn't re-derived):
 * `execute-subagent.js --code DESIGN` does NOT itself call an LLM --
 * `lib/sub-agent-executor/executor.js` only builds a Task Contract; the
 * actual analysis is composed by a Claude Code session reading a prompt.
 * This module follows that same INLINE MODE convention already used by
 * `scripts/add-prd-to-database.js` and `scripts/record-explore-evidence.js`:
 * `buildExperienceReviewPrompt()` is pure (testable without a DB or an LLM),
 * and `fetchExperienceReviewArtifacts()` is the one DB-touching read.
 *
 * @module lib/eva/experience-review/context
 */

// Artifact types this reviewer consumes (lib/eva/artifact-types.js constants,
// inlined as literals here to avoid a runtime dependency on that module's
// full export surface for a 2-value lookup).
export const EXPERIENCE_ARTIFACT_TYPES = Object.freeze({
  USER_JOURNEY: 'blueprint_user_journey',
  WIREFRAME_SCREENS: 'wireframe_screens',
});

/**
 * Fetch the current Stage-15 experience artifacts for a venture.
 * Fail-soft per artifact: a missing artifact is reported in `missing`,
 * never thrown -- FR-3's dependency contract is "record a low-confidence
 * finding, never fail the run" when Stage-15 artifacts are absent.
 *
 * @param {Object} supabase
 * @param {string} ventureId
 * @returns {Promise<{journey: Object|null, wireframes: Object|null, missing: string[]}>}
 */
export async function fetchExperienceReviewArtifacts(supabase, ventureId) {
  if (!supabase) throw new Error('fetchExperienceReviewArtifacts: supabase client required');
  if (!ventureId) throw new Error('fetchExperienceReviewArtifacts: ventureId required');

  const missing = [];

  const fetchOne = async (artifactType) => {
    const { data, error } = await supabase
      .from('venture_artifacts')
      .select('id, artifact_data, content, created_at')
      .eq('venture_id', ventureId)
      .eq('artifact_type', artifactType)
      .eq('is_current', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) {
      missing.push(artifactType);
      return null;
    }
    return data;
  };

  const [journey, wireframes] = await Promise.all([
    fetchOne(EXPERIENCE_ARTIFACT_TYPES.USER_JOURNEY),
    fetchOne(EXPERIENCE_ARTIFACT_TYPES.WIREFRAME_SCREENS),
  ]);

  return { journey, wireframes, missing };
}

/**
 * Compose the venture-stage prompt variant: the ehg-redesign skill's
 * scan/rank/fix rubric, retargeted from "existing UI code" to "Stage-15
 * experience artifacts vs. the live deployment". Pure -- no I/O, directly
 * unit-testable.
 *
 * @param {Object} args
 * @param {string} args.ventureName
 * @param {string} args.ventureId
 * @param {string} args.deploymentUrl
 * @param {Object|null} args.journey   - blueprint_user_journey artifact row (or null)
 * @param {Object|null} args.wireframes - wireframe_screens artifact row (or null)
 * @param {string[]} [args.missing]    - artifact types that were absent
 * @returns {string}
 */
export function buildExperienceReviewPrompt({ ventureName, ventureId, deploymentUrl, journey, wireframes, missing = [] }) {
  if (!ventureId) throw new Error('buildExperienceReviewPrompt: ventureId required');
  if (!deploymentUrl) throw new Error('buildExperienceReviewPrompt: deploymentUrl required');

  const journeyBlock = journey
    ? JSON.stringify(journey.artifact_data ?? journey.content, null, 2)
    : '(no blueprint_user_journey artifact found for this venture -- flag journey_coherence findings as INCONCLUSIVE, do not invent journey structure)';
  const wireframesBlock = wireframes
    ? JSON.stringify(wireframes.artifact_data ?? wireframes.content, null, 2)
    : '(no wireframe_screens artifact found for this venture -- flag usability/accessibility findings as INCONCLUSIVE where they depend on the intended screen design)';

  return `# Experience-design review: ${ventureName || ventureId}

You are reviewing the LIVE DEPLOYMENT against its intended Stage-15 design, using the
ehg-redesign skill's scan -> rank -> fix rubric, retargeted:
  - SCAN: identify usability, accessibility, and journey_coherence defects by comparing
    the live deployment at ${deploymentUrl} against the Stage-15 artifacts below.
  - RANK: severity-tag each finding (critical/high/medium/low) by user-facing impact,
    not code-quality impact.
  - Do NOT propose or apply fixes -- this is a review-only pass. No FIX step.

SCOPE CONSTRAINT (chairman-authorized, WARN-capped pilot): your findings are informational.
No experience finding can FAIL this venture's Stage-20 verdict, regardless of severity you
assign -- assign the TRUE severity, do not self-censor toward a lower one.

## Stage-15 user-journey artifact (journey_coherence source)
${journeyBlock}

## Stage-15 wireframe-screens artifact (usability/accessibility source)
${wireframesBlock}
${missing.length ? `\n## Missing artifacts\n${missing.join(', ')} -- findings depending on these must be marked low-confidence/INCONCLUSIVE, not fabricated.\n` : ''}
## Output contract
Return a JSON array of findings, each: { "category": "usability"|"accessibility"|"journey_coherence",
"severity": "critical"|"high"|"medium"|"low", "title": "...", "detail": "...",
"evidence_pointer": { "url": "...", "screen_ref": "..." } }. Persist via
scripts/experience-review/record-review.mjs --venture-id ${ventureId} --content @<findings.json>.`;
}
