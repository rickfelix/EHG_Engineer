import { describe, it, expect } from 'vitest';
import {
  buildAdjudicatorPrompt,
  parseAdjudicatorOutput,
  runAdjudication,
} from '../../../../lib/foresight/workflow/adjudicator-runner.js';
import {
  createMockSupabase,
  createMockLLMClient,
  SAMPLE_COUNCIL,
  SAMPLE_ADJUDICATOR_PROFILE,
  SAMPLE_ADJUDICATOR_OUTPUT,
} from './test-helpers.js';

const SPECIALIST_ROWS = [
  { assessment_id: 'a-1', venture_candidate_id: 'vc-test-001', perspective_id: 'jack-clark', recommended_action: 'validate' },
  { assessment_id: 'a-2', venture_candidate_id: 'vc-test-001', perspective_id: 'nathan-benaich', recommended_action: 'validate' },
  { assessment_id: 'a-3', venture_candidate_id: 'vc-test-001', perspective_id: 'rodney-brooks', recommended_action: 'prototype' },
];

describe('buildAdjudicatorPrompt', () => {
  it('includes the specialist assessments and never impersonates the adjudicator', () => {
    const { system, user } = buildAdjudicatorPrompt(SAMPLE_ADJUDICATOR_PROFILE, SAMPLE_COUNCIL, SPECIALIST_ROWS);
    expect(system).not.toMatch(/\byou are\b/i);
    expect(user).toContain('jack-clark');
    expect(user).toContain('nathan-benaich');
  });
});

describe('parseAdjudicatorOutput', () => {
  it('parses a well-formed section-12-shaped response', () => {
    const result = parseAdjudicatorOutput(JSON.stringify(SAMPLE_ADJUDICATOR_OUTPUT));
    expect(result.parseError).toBe(false);
    expect(result.output.evidence_quality).toBe('strong');
  });

  it('rejects an invalid evidence_quality value', () => {
    const result = parseAdjudicatorOutput(JSON.stringify({ ...SAMPLE_ADJUDICATOR_OUTPUT, evidence_quality: 'excellent' }));
    expect(result.parseError).toBe(true);
    expect(result.reason).toMatch(/invalid_evidence_quality/);
  });

  it('returns a structured error for malformed JSON', () => {
    const result = parseAdjudicatorOutput('{ broken');
    expect(result.parseError).toBe(true);
  });
});

describe('runAdjudication', () => {
  it('inserts one council_adjudications row, preserving minority_view', async () => {
    const supabase = createMockSupabase();
    const llmClient = createMockLLMClient([SAMPLE_ADJUDICATOR_OUTPUT]);

    const result = await runAdjudication({
      adjudicatorProfile: SAMPLE_ADJUDICATOR_PROFILE,
      council: SAMPLE_COUNCIL,
      specialistAssessments: SPECIALIST_ROWS,
      ventureCandidateId: 'vc-test-001',
      supabase,
      llmClient,
    });

    expect(result.parseError).toBe(false);
    expect(supabase.inserted.council_adjudications).toHaveLength(1);
    const row = supabase.inserted.council_adjudications[0];
    expect(row.minority_view).toBe('One specialist dissents on timing.');
    expect(row.evidence_quality).toBe('strong');
    expect(row.council_confidence).toBe(0.75);
    expect(row.recommended_experiments).toEqual(['Build a thin prototype']);
    expect(row.kill_conditions).toEqual(['Capability regresses']);
  });

  it('defaults minority_view to empty string when absent (matches sibling B NOT NULL DEFAULT constraint)', async () => {
    const supabase = createMockSupabase();
    const output = { ...SAMPLE_ADJUDICATOR_OUTPUT, minority_view: undefined };
    delete output.minority_view;
    const llmClient = createMockLLMClient([output]);

    await runAdjudication({ adjudicatorProfile: SAMPLE_ADJUDICATOR_PROFILE, council: SAMPLE_COUNCIL, specialistAssessments: SPECIALIST_ROWS, ventureCandidateId: 'vc-test-001', supabase, llmClient });

    expect(supabase.inserted.council_adjudications[0].minority_view).toBe('');
  });

  it('folds shared_assumptions and EHG_implications into consensus_summary rather than dropping them', async () => {
    const supabase = createMockSupabase();
    const llmClient = createMockLLMClient([SAMPLE_ADJUDICATOR_OUTPUT]);

    await runAdjudication({ adjudicatorProfile: SAMPLE_ADJUDICATOR_PROFILE, council: SAMPLE_COUNCIL, specialistAssessments: SPECIALIST_ROWS, ventureCandidateId: 'vc-test-001', supabase, llmClient });

    const row = supabase.inserted.council_adjudications[0];
    expect(row.consensus_summary).toContain('Compute costs continue to fall');
    expect(row.consensus_summary).toContain('EHG can build on this capability now');
    expect(row.disagreement_summary).toContain('Regulatory environment stays stable');
  });

  it('does not insert a row on a malformed LLM response', async () => {
    const supabase = createMockSupabase();
    const llmClient = createMockLLMClient(['not json']);

    const result = await runAdjudication({ adjudicatorProfile: SAMPLE_ADJUDICATOR_PROFILE, council: SAMPLE_COUNCIL, specialistAssessments: SPECIALIST_ROWS, ventureCandidateId: 'vc-test-001', supabase, llmClient });

    expect(result.parseError).toBe(true);
    expect(supabase.inserted.council_adjudications).toHaveLength(0);
  });
});
