/**
 * Adjudicator workflow (SD-LEO-INFRA-EHG-VENTURE-FORESIGHT-001-C, FR-2).
 * spec section 12 (Standard Adjudicator Output Schema) + section 10 step 5.
 *
 * Consumes 3 specialist_assessments rows for a council (sibling B) and the
 * council's adjudicator profile (sibling A), producing one council_adjudications
 * row. shared_assumptions/weakest_assumptions/EHG_implications from the section-12
 * schema are folded into the two text summary columns (consensus_summary /
 * disagreement_summary) rather than silently dropped -- sibling B's schema has no
 * dedicated columns for them (Phase-1 simplification, documented here not silently).
 */
import { getLLMClient } from '../../llm/index.js';
import { parseJsonResponse, hasRequiredKeys } from './parse-json-response.js';

const REQUIRED_FIELDS = ['consensus', 'evidence_quality', 'council_confidence', 'recommended_action'];
const EVIDENCE_QUALITY_VALUES = ['low', 'moderate', 'strong', 'very_strong'];

export function buildAdjudicatorPrompt(adjudicatorProfile, council, specialistAssessments) {
  const system = [
    `Apply the recurring analytical frameworks and adjudication discipline associated with the ${adjudicatorProfile.person_name}-informed lens for the ${council.council_name}.`,
    'Do not imitate personal style, claim endorsement, or invent an opinion.',
    'Compare the specialist analyses. Identify areas of agreement. Identify material disagreement. Evaluate evidence quality. Expose hidden assumptions. Preserve minority opinions. Assign confidence. Translate the findings into EHG actions.',
    'Respond with ONLY a JSON object matching this shape: {"council_id": string, "venture_candidate_id": string, "consensus": string[], "material_disagreements": [{"issue": string, "positions": string[], "why_it_matters": string}], "minority_view": string, "shared_assumptions": string[], "weakest_assumptions": string[], "evidence_quality": "low"|"moderate"|"strong"|"very_strong", "council_confidence": number, "EHG_implications": string[], "recommended_action": string, "recommended_experiments": string[], "monitoring_triggers": string[], "kill_conditions": string[]}',
  ].join('\n');

  const user = JSON.stringify({
    council_id: council.council_id,
    venture_candidate_id: specialistAssessments[0]?.venture_candidate_id,
    specialist_assessments: specialistAssessments,
  });

  return { system, user };
}

export function parseAdjudicatorOutput(rawText) {
  const parsed = parseJsonResponse(rawText);
  if (!parsed.ok) return { parseError: true, raw: rawText, reason: parsed.reason };
  if (!hasRequiredKeys(parsed.value, REQUIRED_FIELDS)) {
    return { parseError: true, raw: rawText, reason: `missing_required_fields: ${REQUIRED_FIELDS.filter((k) => parsed.value[k] === undefined).join(',')}` };
  }
  if (!EVIDENCE_QUALITY_VALUES.includes(parsed.value.evidence_quality)) {
    return { parseError: true, raw: rawText, reason: `invalid_evidence_quality: ${parsed.value.evidence_quality}` };
  }
  return { parseError: false, output: parsed.value };
}

function formatConsensusSummary(output) {
  const parts = [...(output.consensus || [])];
  if ((output.shared_assumptions || []).length) parts.push(`Shared assumptions: ${output.shared_assumptions.join('; ')}`);
  if ((output.EHG_implications || []).length) parts.push(`EHG implications: ${output.EHG_implications.join('; ')}`);
  return parts.join(' | ');
}

function formatDisagreementSummary(output) {
  const parts = (output.material_disagreements || []).map((d) => `${d.issue}: ${d.why_it_matters}`);
  if ((output.weakest_assumptions || []).length) parts.push(`Weakest assumptions: ${output.weakest_assumptions.join('; ')}`);
  return parts.join(' | ');
}

/**
 * Run one council's adjudication and insert a council_adjudications row.
 * @param {Object} params
 * @param {Object} params.adjudicatorProfile - adjudicator PerspectiveProfile (sibling A)
 * @param {Object} params.council - council definition (sibling A)
 * @param {Array} params.specialistAssessments - the 3 specialist_assessments rows for this council
 * @param {string} params.ventureCandidateId
 * @param {Object} params.supabase
 * @param {Object} [params.llmClient] - default: getLLMClient({purpose:'generation'})
 */
export async function runAdjudication({ adjudicatorProfile, council, specialistAssessments, ventureCandidateId, supabase, llmClient }) {
  const client = llmClient || getLLMClient({ purpose: 'generation' });
  const { system, user } = buildAdjudicatorPrompt(adjudicatorProfile, council, specialistAssessments);
  const response = await client.complete(system, user);
  const parsed = parseAdjudicatorOutput(response?.content);
  if (parsed.parseError) return parsed;

  const output = parsed.output;
  const { data, error } = await supabase
    .from('council_adjudications')
    .insert({
      venture_candidate_id: ventureCandidateId,
      council_id: council.council_id,
      adjudicator_perspective_id: adjudicatorProfile.perspective_id,
      consensus_summary: formatConsensusSummary(output),
      disagreement_summary: formatDisagreementSummary(output),
      minority_view: output.minority_view || '',
      evidence_quality: output.evidence_quality,
      council_confidence: output.council_confidence,
      recommendation: output.recommended_action,
      recommended_experiments: output.recommended_experiments || [],
      monitoring_triggers: output.monitoring_triggers || [],
      kill_conditions: output.kill_conditions || [],
    })
    .select('adjudication_id')
    .single();

  if (error) return { parseError: false, insertError: error.message };
  return { parseError: false, id: data.adjudication_id };
}
