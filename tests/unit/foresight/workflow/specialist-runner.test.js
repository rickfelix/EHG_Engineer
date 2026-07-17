import { describe, it, expect } from 'vitest';
import {
  buildSpecialistPrompt,
  parseSpecialistOutput,
  runSpecialistAssessment,
} from '../../../../lib/foresight/workflow/specialist-runner.js';
import {
  createMockSupabase,
  createMockLLMClient,
  SAMPLE_COUNCIL,
  SAMPLE_PROFILE,
  SAMPLE_VENTURE_CANDIDATE,
  SAMPLE_SPECIALIST_OUTPUT,
} from './test-helpers.js';

describe('buildSpecialistPrompt', () => {
  it('never impersonates the person (no first-person or "you are" framing)', () => {
    const { system } = buildSpecialistPrompt(SAMPLE_PROFILE, SAMPLE_COUNCIL, SAMPLE_VENTURE_CANDIDATE);
    expect(system).not.toMatch(/\byou are\b/i);
    expect(system).toMatch(/Do not imitate personal style, claim endorsement, or invent an opinion/);
  });

  it('includes the profile analytical frameworks and council primary questions', () => {
    const { system } = buildSpecialistPrompt(SAMPLE_PROFILE, SAMPLE_COUNCIL, SAMPLE_VENTURE_CANDIDATE);
    expect(system).toContain('Measure-then-claim');
    expect(system).toContain('What new capability has emerged?');
  });

  it('includes the venture candidate id in the user message', () => {
    const { user } = buildSpecialistPrompt(SAMPLE_PROFILE, SAMPLE_COUNCIL, SAMPLE_VENTURE_CANDIDATE);
    expect(user).toContain('vc-test-001');
  });
});

describe('parseSpecialistOutput', () => {
  it('parses a well-formed section-11-shaped response', () => {
    const result = parseSpecialistOutput(JSON.stringify(SAMPLE_SPECIALIST_OUTPUT));
    expect(result.parseError).toBe(false);
    expect(result.output.recommended_action).toBe('validate');
  });

  it('returns a structured parse error for malformed JSON, not a throw', () => {
    const result = parseSpecialistOutput('not json at all');
    expect(result.parseError).toBe(true);
    expect(result.reason).toBeTruthy();
  });

  it('returns a structured parse error when required fields are missing', () => {
    const result = parseSpecialistOutput(JSON.stringify({ executive_conclusion: 'x' }));
    expect(result.parseError).toBe(true);
    expect(result.reason).toMatch(/missing_required_fields/);
  });
});

describe('runSpecialistAssessment', () => {
  it('inserts one specialist_assessments row from a valid mock LLM response', async () => {
    const supabase = createMockSupabase();
    const llmClient = createMockLLMClient([SAMPLE_SPECIALIST_OUTPUT]);

    const result = await runSpecialistAssessment({
      profile: SAMPLE_PROFILE,
      council: SAMPLE_COUNCIL,
      ventureCandidate: SAMPLE_VENTURE_CANDIDATE,
      supabase,
      llmClient,
    });

    expect(result.parseError).toBe(false);
    expect(result.id).toBeTruthy();
    expect(supabase.inserted.specialist_assessments).toHaveLength(1);
    const row = supabase.inserted.specialist_assessments[0];
    expect(row.venture_candidate_id).toBe('vc-test-001');
    expect(row.council_id).toBe('frontier_capability');
    expect(row.perspective_id).toBe('jack-clark');
    expect(row.confidence).toBe(0.7);
    expect(row.recommended_action).toBe('validate');
    expect(row.dissent_flags).toEqual(['A counterargument exists.']);
    expect(row.opportunities).toEqual(['Opportunity A']);
  });

  it('defaults dissent_flags to an empty array when minority_or_counter_view is absent', async () => {
    const supabase = createMockSupabase();
    const output = { ...SAMPLE_SPECIALIST_OUTPUT, minority_or_counter_view: '' };
    const llmClient = createMockLLMClient([output]);

    await runSpecialistAssessment({ profile: SAMPLE_PROFILE, council: SAMPLE_COUNCIL, ventureCandidate: SAMPLE_VENTURE_CANDIDATE, supabase, llmClient });

    expect(supabase.inserted.specialist_assessments[0].dissent_flags).toEqual([]);
  });

  it('does not insert a row when the LLM response is malformed', async () => {
    const supabase = createMockSupabase();
    const llmClient = createMockLLMClient(['not valid json']);

    const result = await runSpecialistAssessment({ profile: SAMPLE_PROFILE, council: SAMPLE_COUNCIL, ventureCandidate: SAMPLE_VENTURE_CANDIDATE, supabase, llmClient });

    expect(result.parseError).toBe(true);
    expect(supabase.inserted.specialist_assessments).toHaveLength(0);
  });

  it('deduplicates source_ids across observations into evidence_reviewed', async () => {
    const supabase = createMockSupabase();
    const output = {
      ...SAMPLE_SPECIALIST_OUTPUT,
      observations: [
        { statement: 'a', classification: 'verified_observation', confidence: 0.9, source_ids: ['src-1', 'src-2'] },
        { statement: 'b', classification: 'weak_signal', confidence: 0.4, source_ids: ['src-2', 'src-3'] },
      ],
    };
    const llmClient = createMockLLMClient([output]);

    await runSpecialistAssessment({ profile: SAMPLE_PROFILE, council: SAMPLE_COUNCIL, ventureCandidate: SAMPLE_VENTURE_CANDIDATE, supabase, llmClient });

    expect(supabase.inserted.specialist_assessments[0].evidence_reviewed.sort()).toEqual(['src-1', 'src-2', 'src-3']);
  });
});
