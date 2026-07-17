/**
 * Specialist assessment workflow (SD-LEO-INFRA-EHG-VENTURE-FORESIGHT-001-C, FR-1).
 * spec section 11 (Standard Specialist Output Schema) + section 18 (Prompting Guidance).
 *
 * Consumes sibling A's profile/council content verbatim (lib/foresight/content) and
 * writes to sibling B's specialist_assessments table. Third-person analytical framing
 * only -- the profile content is already anti-impersonation-linted; this module must
 * not add first-person or "you are <person>" framing on top of it (spec section 3/18).
 */
import { getLLMClient } from '../../llm/index.js';
import { parseJsonResponse, hasRequiredKeys } from './parse-json-response.js';

const REQUIRED_FIELDS = ['executive_conclusion', 'observations', 'recommended_action', 'overall_confidence'];

/**
 * Build the third-person analytical prompt for one specialist perspective.
 * Never impersonates the person -- applies their documented frameworks/themes/
 * cautions/biases as an analytical LENS (spec section 18's explicit contrast:
 * "Apply the recurring analytical frameworks... Do not imitate personal style").
 */
export function buildSpecialistPrompt(profile, council, ventureCandidate) {
  const system = [
    `Apply the recurring analytical frameworks, published arguments, technical interests, and documented cautions associated with the ${profile.person_name}-informed ${council.council_name} lens.`,
    'Do not imitate personal style, claim endorsement, or invent an opinion. Distinguish sourced doctrine from your own inference.',
    `Analytical frameworks: ${(profile.analytical_frameworks || []).join(' | ')}`,
    `Recurring themes: ${(profile.recurring_themes || []).join(' | ')}`,
    `Known cautions to apply: ${(profile.known_cautions || []).join(' | ')}`,
    `Known biases to guard against in your own analysis: ${(profile.known_biases || []).join(' | ')}`,
    `Council purpose: ${council.purpose}`,
    `Primary questions for this council: ${(council.primary_questions || []).join(' | ')}`,
    'Every response must include evidence citations, clear uncertainty, assumption identification, a counterargument, EHG implications, and a recommended experiment.',
    'Respond with ONLY a JSON object matching this shape: {"perspective_id": string, "venture_candidate_id": string, "executive_conclusion": string, "observations": [{"statement": string, "classification": "verified_observation"|"strong_inference"|"weak_signal"|"forecast"|"speculation", "confidence": number, "source_ids": string[]}], "opportunities": string[], "risks": string[], "assumptions": string[], "minority_or_counter_view": string, "recommended_action": "reject"|"monitor"|"research"|"prototype"|"validate"|"incubate"|"launch"|"scale", "recommended_experiment": string, "overall_confidence": number}',
  ].join('\n');

  const user = [
    `Venture candidate: ${JSON.stringify(ventureCandidate)}`,
    `perspective_id: ${profile.perspective_id}`,
    `venture_candidate_id: ${ventureCandidate.venture_candidate_id}`,
  ].join('\n');

  return { system, user };
}

/** Parse and validate a specialist LLM response against spec section 11's required fields. */
export function parseSpecialistOutput(rawText) {
  const parsed = parseJsonResponse(rawText);
  if (!parsed.ok) return { parseError: true, raw: rawText, reason: parsed.reason };
  if (!hasRequiredKeys(parsed.value, REQUIRED_FIELDS)) {
    return { parseError: true, raw: rawText, reason: `missing_required_fields: ${REQUIRED_FIELDS.filter((k) => parsed.value[k] === undefined).join(',')}` };
  }
  return { parseError: false, output: parsed.value };
}

/**
 * Run one specialist assessment and insert a specialist_assessments row.
 * @param {Object} params
 * @param {Object} params.profile - specialist PerspectiveProfile (sibling A)
 * @param {Object} params.council - council definition (sibling A)
 * @param {Object} params.ventureCandidate - { venture_candidate_id, ...context fields }
 * @param {Object} params.supabase - Supabase client
 * @param {Object} [params.llmClient] - injected LLM client (default: getLLMClient({purpose:'analysis'}))
 * @returns {Promise<{ parseError: boolean, id?: string, reason?: string }>}
 */
export async function runSpecialistAssessment({ profile, council, ventureCandidate, supabase, llmClient }) {
  const client = llmClient || getLLMClient({ purpose: 'analysis' });
  const { system, user } = buildSpecialistPrompt(profile, council, ventureCandidate);
  const response = await client.complete(system, user);
  const parsed = parseSpecialistOutput(response?.content);
  if (parsed.parseError) return parsed;

  const output = parsed.output;
  const sourceIds = Array.from(
    new Set((output.observations || []).flatMap((o) => o.source_ids || [])),
  );

  const { data, error } = await supabase
    .from('specialist_assessments')
    .insert({
      venture_candidate_id: ventureCandidate.venture_candidate_id,
      council_id: council.council_id,
      perspective_id: profile.perspective_id,
      evidence_reviewed: sourceIds,
      findings: { executive_conclusion: output.executive_conclusion, observations: output.observations },
      opportunities: output.opportunities || [],
      risks: output.risks || [],
      assumptions: output.assumptions || [],
      confidence: output.overall_confidence,
      recommended_action: output.recommended_action,
      dissent_flags: output.minority_or_counter_view ? [output.minority_or_counter_view] : [],
      prompt_version: council.default_prompt_version,
      model_version: client.model || client.effortLevel || 'unknown',
    })
    .select('assessment_id')
    .single();

  if (error) return { parseError: false, insertError: error.message };
  return { parseError: false, id: data.assessment_id };
}
