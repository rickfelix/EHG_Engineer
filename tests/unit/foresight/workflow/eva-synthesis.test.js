import { describe, it, expect } from 'vitest';
import { buildEvaSynthesisPrompt, parseEvaSynthesisOutput, runEvaSynthesis } from '../../../../lib/foresight/workflow/eva-synthesis.js';
import { scoreVenture } from '../../../../lib/foresight/scoring/venture-score.js';
import { createMockSupabase, createMockLLMClient, SAMPLE_VENTURE_CANDIDATE, SAMPLE_EVA_OUTPUT } from './test-helpers.js';

const COUNCIL_ADJUDICATIONS = [
  { adjudication_id: 'adj-1', council_id: 'frontier_capability' },
  { adjudication_id: 'adj-2', council_id: 'human_transition' },
  { adjudication_id: 'adj-3', council_id: 'strategic_foresight' },
  { adjudication_id: 'adj-4', council_id: 'exponential_systems' },
  { adjudication_id: 'adj-5', council_id: 'market_reality' },
];

describe('buildEvaSynthesisPrompt', () => {
  it('includes the council adjudications and the section-13 scoring instructions', () => {
    const { system, user } = buildEvaSynthesisPrompt(COUNCIL_ADJUDICATIONS, SAMPLE_VENTURE_CANDIDATE);
    expect(system).toContain('customer_pain');
    expect(system).toContain('legal_viability');
    expect(user).toContain('adj-1');
  });
});

describe('parseEvaSynthesisOutput', () => {
  it('parses a well-formed response', () => {
    const result = parseEvaSynthesisOutput(JSON.stringify(SAMPLE_EVA_OUTPUT));
    expect(result.parseError).toBe(false);
    expect(result.output.recommended_posture).toBe('incubate');
  });

  it('returns a structured error for malformed JSON', () => {
    const result = parseEvaSynthesisOutput('nope');
    expect(result.parseError).toBe(true);
  });

  it('returns a structured error when required fields are missing', () => {
    const result = parseEvaSynthesisOutput(JSON.stringify({ key_assumptions: [] }));
    expect(result.parseError).toBe(true);
    expect(result.reason).toMatch(/missing_required_fields/);
  });
});

describe('runEvaSynthesis', () => {
  it('inserts one venture_decision_dossiers row referencing all 5 council_adjudication_ids', async () => {
    const supabase = createMockSupabase();
    const llmClient = createMockLLMClient([SAMPLE_EVA_OUTPUT]);

    const result = await runEvaSynthesis({ councilAdjudications: COUNCIL_ADJUDICATIONS, ventureCandidate: SAMPLE_VENTURE_CANDIDATE, supabase, llmClient });

    expect(result.parseError).toBe(false);
    expect(supabase.inserted.venture_decision_dossiers).toHaveLength(1);
    const row = supabase.inserted.venture_decision_dossiers[0];
    expect(row.council_adjudication_ids).toEqual(['adj-1', 'adj-2', 'adj-3', 'adj-4', 'adj-5']);
    expect(row.venture_candidate_id).toBe('vc-test-001');
    expect(row.rick_decision_required).toBe(true);
  });

  it("the dossier's overall_score/overall_confidence exactly match a direct scoreVenture() call with the same inputs (PRD FR-3)", async () => {
    const supabase = createMockSupabase();
    const llmClient = createMockLLMClient([SAMPLE_EVA_OUTPUT]);

    await runEvaSynthesis({ councilAdjudications: COUNCIL_ADJUDICATIONS, ventureCandidate: SAMPLE_VENTURE_CANDIDATE, supabase, llmClient });

    const directScore = scoreVenture({
      criterionScores: SAMPLE_EVA_OUTPUT.criterion_scores,
      gateResults: SAMPLE_EVA_OUTPUT.gate_results,
      confidence: SAMPLE_EVA_OUTPUT.confidence,
    });

    const row = supabase.inserted.venture_decision_dossiers[0];
    expect(row.overall_score).toBe(directScore.confidence_adjusted_score);
    expect(row.overall_confidence).toBe(directScore.evidence_confidence);
    // Reproduces the spec's own worked example end-to-end (raw 82, confidence 0.55 -> 45).
    expect(directScore.confidence_adjusted_score).toBe(45);
  });

  it('a failed gate in the EVA output is reflected in the underlying scoreVenture() call, not silently dropped', async () => {
    const supabase = createMockSupabase();
    const output = { ...SAMPLE_EVA_OUTPUT, gate_results: { ...SAMPLE_EVA_OUTPUT.gate_results, security_viability: false } };
    const llmClient = createMockLLMClient([output]);

    const result = await runEvaSynthesis({ councilAdjudications: COUNCIL_ADJUDICATIONS, ventureCandidate: SAMPLE_VENTURE_CANDIDATE, supabase, llmClient });

    expect(result.score.gate_results.passed).toBe(false);
    expect(result.score.overall_recommendation).toBe('fail');
  });

  it('does not insert a row on a malformed LLM response', async () => {
    const supabase = createMockSupabase();
    const llmClient = createMockLLMClient(['garbage']);

    const result = await runEvaSynthesis({ councilAdjudications: COUNCIL_ADJUDICATIONS, ventureCandidate: SAMPLE_VENTURE_CANDIDATE, supabase, llmClient });

    expect(result.parseError).toBe(true);
    expect(supabase.inserted.venture_decision_dossiers).toHaveLength(0);
  });
});
