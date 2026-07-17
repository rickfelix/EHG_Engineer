/** Shared test doubles for the foresight workflow unit tests -- no live DB or LLM calls. */
import { vi } from 'vitest';

let idCounter = 0;
function nextId(prefix) {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

/**
 * Minimal Supabase-shaped mock supporting `.from(table).insert(row).select(col).single()`.
 * Records every inserted row on `.inserted[table]` and assigns an incrementing fake id
 * to the primary-key column implied by `idColumn`.
 */
export function createMockSupabase() {
  const inserted = { specialist_assessments: [], council_adjudications: [], venture_decision_dossiers: [] };
  const idColumns = {
    specialist_assessments: 'assessment_id',
    council_adjudications: 'adjudication_id',
    venture_decision_dossiers: 'dossier_id',
  };

  return {
    inserted,
    from(table) {
      return {
        insert(row) {
          return {
            select() {
              return {
                async single() {
                  const idColumn = idColumns[table];
                  const record = { ...row, [idColumn]: nextId(table) };
                  inserted[table].push(record);
                  return { data: record, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
}

/** Mock LLM client whose `.complete()` returns a queued response per call (FIFO). */
export function createMockLLMClient(responses) {
  const queue = [...responses];
  return {
    model: 'mock-model',
    complete: vi.fn(async () => {
      const next = queue.shift();
      if (next === undefined) throw new Error('createMockLLMClient: response queue exhausted');
      return { content: typeof next === 'string' ? next : JSON.stringify(next) };
    }),
  };
}

export const SAMPLE_COUNCIL = {
  council_id: 'frontier_capability',
  council_name: 'Frontier Capability Council',
  purpose: 'Determine what has recently become technically possible.',
  adjudicator_perspective_id: 'alex-wissner-gross',
  specialist_perspective_ids: ['jack-clark', 'nathan-benaich', 'rodney-brooks'],
  required_output_type: 'Technical Opportunity Brief',
  default_prompt_version: 'v1.0',
  status: 'active',
  primary_questions: ['What new capability has emerged?'],
};

export const SAMPLE_PROFILE = {
  perspective_id: 'jack-clark',
  person_name: 'Jack Clark',
  council_id: 'frontier_capability',
  role_type: 'specialist',
  analytical_frameworks: ['Measure-then-claim'],
  recurring_themes: ['Capabilities arrive earlier than institutions expect'],
  known_cautions: ['Skeptical of unreproduced claims'],
  known_biases: ['Frontier-lab vantage point'],
};

export const SAMPLE_ADJUDICATOR_PROFILE = {
  perspective_id: 'alex-wissner-gross',
  person_name: 'Alex Wissner-Gross',
  council_id: 'frontier_capability',
  role_type: 'adjudicator',
};

export const SAMPLE_VENTURE_CANDIDATE = { venture_candidate_id: 'vc-test-001', venture_name: 'Test Venture' };

export const SAMPLE_SPECIALIST_OUTPUT = {
  perspective_id: 'jack-clark',
  venture_candidate_id: 'vc-test-001',
  executive_conclusion: 'The capability is production-ready.',
  observations: [
    { statement: 'Benchmark X shows Y', classification: 'verified_observation', confidence: 0.8, source_ids: ['src-1'] },
  ],
  opportunities: ['Opportunity A'],
  risks: ['Risk A'],
  assumptions: ['Assumption A'],
  minority_or_counter_view: 'A counterargument exists.',
  recommended_action: 'validate',
  recommended_experiment: 'Run a pilot.',
  overall_confidence: 0.7,
};

export const SAMPLE_ADJUDICATOR_OUTPUT = {
  council_id: 'frontier_capability',
  venture_candidate_id: 'vc-test-001',
  consensus: ['All three specialists agree the capability is real.'],
  material_disagreements: [{ issue: 'Cost trajectory', positions: ['A', 'B'], why_it_matters: 'Affects timing' }],
  minority_view: 'One specialist dissents on timing.',
  shared_assumptions: ['Compute costs continue to fall'],
  weakest_assumptions: ['Regulatory environment stays stable'],
  evidence_quality: 'strong',
  council_confidence: 0.75,
  EHG_implications: ['EHG can build on this capability now'],
  recommended_action: 'prototype',
  recommended_experiments: ['Build a thin prototype'],
  monitoring_triggers: ['Cost drops below $X'],
  kill_conditions: ['Capability regresses'],
};

export const SAMPLE_EVA_OUTPUT = {
  key_assumptions: ['Compute costs continue to fall'],
  major_disagreements: [],
  recommended_posture: 'incubate',
  next_experiment: 'Ten paid design-partner conversations',
  experiment_budget: 5000,
  expected_information_gain: 'High -- resolves willingness-to-pay uncertainty',
  cost_of_waiting: 'Low -- market moves slowly',
  reversibility: 'High -- easy to unwind',
  rick_decision_required: true,
  criterion_scores: {
    customer_pain: 16, ehg_agentic_advantage: 16, distribution_accessibility: 12, technical_timing: 12,
    revenue_potential: 8, defensibility: 8, cross_venture_reuse: 5, future_option_value: 5,
  },
  gate_results: {
    legal_viability: true, ethical_acceptability: true, financial_survivability: true,
    security_viability: true, data_access_legitimacy: true,
  },
  confidence: 0.55,
};
