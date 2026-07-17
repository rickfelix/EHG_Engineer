/**
 * EVA cross-council synthesis + Venture Decision Dossier generation
 * (SD-LEO-INFRA-EHG-VENTURE-FORESIGHT-001-C, FR-3).
 * spec section 10 step 6 (EVA synthesis) + section 8.10 (dossier) + section 13
 * (scoring model -- delegated to sibling B's scoreVenture(), never reimplemented).
 *
 * The single EVA-synthesis LLM call also elicits the section-13 criterion scores
 * and pass/fail gate results (EVA is the natural owner of "translate findings into
 * EHG actions" and portfolio-fit -- spec section 6 item 8), so this stays one call
 * rather than a redundant second scoring-only call.
 */
import { getLLMClient } from '../../llm/index.js';
import { scoreVenture } from '../scoring/venture-score.js';
import { parseJsonResponse, hasRequiredKeys } from './parse-json-response.js';

const REQUIRED_FIELDS = ['key_assumptions', 'recommended_posture', 'criterion_scores', 'gate_results', 'confidence'];

export function buildEvaSynthesisPrompt(councilAdjudications, ventureCandidate) {
  const system = [
    'You are performing EVA cross-council synthesis (spec section 10 step 6): identify agreements across councils, contradictions across councils, assumptions affecting multiple councils, dependencies, potential portfolio synergies, reusable EHG capabilities, opportunity costs, and decisions the chairman must make.',
    'Also score the venture per the section 13 model: 8 weighted criteria (customer_pain 0-20, ehg_agentic_advantage 0-20, distribution_accessibility 0-15, technical_timing 0-15, revenue_potential 0-10, defensibility 0-10, cross_venture_reuse 0-5, future_option_value 0-5) and the 5 pass/fail gates (legal_viability, ethical_acceptability, financial_survivability, security_viability, data_access_legitimacy).',
    'Respond with ONLY a JSON object: {"key_assumptions": string[], "major_disagreements": string[], "recommended_posture": string, "next_experiment": string, "experiment_budget": number, "expected_information_gain": string, "cost_of_waiting": string, "reversibility": string, "rick_decision_required": boolean, "criterion_scores": {"customer_pain": number, "ehg_agentic_advantage": number, "distribution_accessibility": number, "technical_timing": number, "revenue_potential": number, "defensibility": number, "cross_venture_reuse": number, "future_option_value": number}, "gate_results": {"legal_viability": boolean, "ethical_acceptability": boolean, "financial_survivability": boolean, "security_viability": boolean, "data_access_legitimacy": boolean}, "confidence": number (0.0 to 1.0, not a percentage -- this is the evidence-confidence input to the section 13.2 confidence-adjusted score)}',
  ].join('\n');

  const user = JSON.stringify({ venture_candidate: ventureCandidate, council_adjudications: councilAdjudications });
  return { system, user };
}

export function parseEvaSynthesisOutput(rawText) {
  const parsed = parseJsonResponse(rawText);
  if (!parsed.ok) return { parseError: true, raw: rawText, reason: parsed.reason };
  if (!hasRequiredKeys(parsed.value, REQUIRED_FIELDS)) {
    return { parseError: true, raw: rawText, reason: `missing_required_fields: ${REQUIRED_FIELDS.filter((k) => parsed.value[k] === undefined).join(',')}` };
  }
  return { parseError: false, output: parsed.value };
}

/**
 * Run EVA cross-council synthesis + venture scoring, insert venture_decision_dossiers.
 * @param {Object} params
 * @param {Array} params.councilAdjudications - all 5 council_adjudications rows (must include `adjudication_id`)
 * @param {Object} params.ventureCandidate - { venture_candidate_id, ... }
 * @param {Object} params.supabase
 * @param {Object} [params.llmClient] - default: getLLMClient({purpose:'generation'})
 */
export async function runEvaSynthesis({ councilAdjudications, ventureCandidate, supabase, llmClient }) {
  const client = llmClient || getLLMClient({ purpose: 'generation' });
  const { system, user } = buildEvaSynthesisPrompt(councilAdjudications, ventureCandidate);
  const response = await client.complete(system, user);
  const parsed = parseEvaSynthesisOutput(response?.content);
  if (parsed.parseError) return parsed;

  const output = parsed.output;
  const score = scoreVenture({
    criterionScores: output.criterion_scores,
    gateResults: output.gate_results,
    confidence: output.confidence,
  });

  const { data, error } = await supabase
    .from('venture_decision_dossiers')
    .insert({
      venture_candidate_id: ventureCandidate.venture_candidate_id,
      council_adjudication_ids: councilAdjudications.map((a) => a.adjudication_id),
      overall_score: score.confidence_adjusted_score,
      overall_confidence: score.evidence_confidence,
      key_assumptions: output.key_assumptions || [],
      major_disagreements: output.major_disagreements || [],
      recommended_posture: output.recommended_posture,
      next_experiment: output.next_experiment,
      experiment_budget: output.experiment_budget,
      expected_information_gain: output.expected_information_gain,
      cost_of_waiting: output.cost_of_waiting,
      reversibility: output.reversibility,
      rick_decision_required: Boolean(output.rick_decision_required),
    })
    .select('dossier_id')
    .single();

  if (error) return { parseError: false, insertError: error.message };
  return { parseError: false, id: data.dossier_id, score };
}
