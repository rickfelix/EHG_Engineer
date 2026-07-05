/**
 * SD-LEO-INFRA-J2A-EVA-GENERATION-001 -- unit tests for the pure/deterministic
 * parts of the J2a model-tier A/B experiment harness: decision-rule evaluation,
 * claim matching, and cost-readout aggregation. No live LLM calls or Supabase
 * writes happen in this suite (db-test-guard: pure-function tests only).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  ARMS,
  SAMPLE,
  DECISION_RULE,
  extractKeywords,
  matchClaimToRegenerated,
  evaluateVerdict,
  buildVentureBriefPrompt,
  stripMarkdownJsonFence,
  computeCostReadout,
  rescoreSample,
} from '../../../scripts/eva/j2a-model-tier-experiment.mjs';

describe('DECISION_RULE (FR-1)', () => {
  it('is locked with a version and lockedAt date', () => {
    expect(DECISION_RULE.version).toBe(1);
    expect(DECISION_RULE.lockedAt).toBe('2026-07-05');
  });

  it('is frozen (cannot be amended at runtime)', () => {
    expect(Object.isFrozen(DECISION_RULE)).toBe(true);
    expect(() => { DECISION_RULE.version = 2; }).toThrow(); // ESM strict mode: throws on write to a frozen object
    expect(DECISION_RULE.version).toBe(1);
  });
});

describe('SAMPLE (FR-3)', () => {
  it('targets story index 5 with controls at 0, 1, 6', () => {
    expect(SAMPLE.targetIndex).toBe(5);
    expect(SAMPLE.controlIndices).toEqual([0, 1, 6]);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(SAMPLE)).toBe(true);
  });
});

describe('extractKeywords', () => {
  it('filters stopwords and short words', () => {
    const kws = extractKeywords('As a user, I want to search for market data');
    expect(kws).not.toContain('user');
    expect(kws).not.toContain('want');
    expect(kws).toContain('search');
    expect(kws).toContain('market');
  });

  it('lowercases and dedupes', () => {
    const kws = extractKeywords('Market MARKET market data');
    expect(kws).toEqual(['market', 'data']);
  });

  it('returns empty array for empty/undefined input', () => {
    expect(extractKeywords('')).toEqual([]);
    expect(extractKeywords(undefined)).toEqual([]);
  });
});

describe('matchClaimToRegenerated', () => {
  it('finds the best keyword-overlap match among regenerated claims', () => {
    const original = 'As a Small Agency Owner, I want to compare the marketing spend and channel mix';
    const regenerated = [
      'As a Fractional CMO, I want to view competitor pricing',
      'As a Small Agency Owner, I want to compare marketing spend across channels',
      'As a Strategic Consultant, I want to export data',
    ];
    const match = matchClaimToRegenerated(original, regenerated);
    expect(match).not.toBeNull();
    expect(match.claim).toBe(regenerated[1]);
    expect(match.overlap).toBeGreaterThan(0);
  });

  it('returns null when no regenerated claim shares any keyword', () => {
    const original = 'As a Small Agency Owner, I want to compare marketing spend';
    const regenerated = ['As a Fractional CMO, I want to view competitor pricing'];
    const match = matchClaimToRegenerated(original, regenerated);
    expect(match).toBeNull();
  });

  it('returns null when the original claim has no extractable keywords', () => {
    const match = matchClaimToRegenerated('', ['some claim text here']);
    expect(match).toBeNull();
  });
});

describe('evaluateVerdict (FR-1 mechanical evaluation)', () => {
  it('returns flip-remediation when higher-tier flips target with zero control regressions', () => {
    const result = evaluateVerdict({
      [ARMS.NULL_REROLL]: { 5: 'PARTIAL', 0: 'BUILT', 1: 'BUILT', 6: 'BUILT' },
      [ARMS.HIGHER_TIER]: { 5: 'BUILT', 0: 'BUILT', 1: 'BUILT', 6: 'BUILT' },
    });
    expect(result.verdict).toBe('flip-remediation');
  });

  it('returns proceed-unchanged when the null-baseline reroll also flips the target (confound)', () => {
    const result = evaluateVerdict({
      [ARMS.NULL_REROLL]: { 5: 'BUILT', 0: 'BUILT', 1: 'BUILT', 6: 'BUILT' },
      [ARMS.HIGHER_TIER]: { 5: 'BUILT', 0: 'BUILT', 1: 'BUILT', 6: 'BUILT' },
    });
    expect(result.verdict).toBe('proceed-unchanged');
    expect(result.reason).toMatch(/confound/);
  });

  it('returns partial-retier when higher-tier flips target but regresses a control', () => {
    const result = evaluateVerdict({
      [ARMS.NULL_REROLL]: { 5: 'PARTIAL', 0: 'BUILT', 1: 'BUILT', 6: 'BUILT' },
      [ARMS.HIGHER_TIER]: { 5: 'BUILT', 0: 'PARTIAL', 1: 'BUILT', 6: 'BUILT' },
    });
    expect(result.verdict).toBe('partial-retier');
    expect(result.reason).toMatch(/regressed control indices \[0\]/);
  });

  it('returns proceed-unchanged when higher-tier does not flip the target', () => {
    const result = evaluateVerdict({
      [ARMS.NULL_REROLL]: { 5: 'PARTIAL', 0: 'BUILT', 1: 'BUILT', 6: 'BUILT' },
      [ARMS.HIGHER_TIER]: { 5: 'PARTIAL', 0: 'BUILT', 1: 'BUILT', 6: 'BUILT' },
    });
    expect(result.verdict).toBe('proceed-unchanged');
  });

  it('is a pure function -- same input always produces the same verdict', () => {
    const input = {
      [ARMS.NULL_REROLL]: { 5: 'PARTIAL', 0: 'BUILT', 1: 'BUILT', 6: 'BUILT' },
      [ARMS.HIGHER_TIER]: { 5: 'BUILT', 0: 'BUILT', 1: 'BUILT', 6: 'BUILT' },
    };
    const first = evaluateVerdict(input);
    const second = evaluateVerdict(input);
    expect(first).toEqual(second);
  });
});

describe('buildVentureBriefPrompt', () => {
  it('includes problem, solution approach, target market, and UVP when present', () => {
    const prompt = buildVentureBriefPrompt({
      name: 'MarketLens',
      problem_statement: 'A problem',
      solution_approach: 'A solution',
      target_market: 'consultants',
      unique_value_proposition: 'A UVP',
    });
    expect(prompt).toContain('MarketLens');
    expect(prompt).toContain('A problem');
    expect(prompt).toContain('A solution');
    expect(prompt).toContain('consultants');
    expect(prompt).toContain('A UVP');
  });

  it('falls back to description when problem_statement is absent, and omits missing optional fields', () => {
    const prompt = buildVentureBriefPrompt({ name: 'X', description: 'fallback problem' });
    expect(prompt).toContain('fallback problem');
    expect(prompt).not.toContain('Solution approach');
    expect(prompt).not.toContain('Target market');
  });
});

describe('stripMarkdownJsonFence', () => {
  it('strips a ```json ... ``` fence', () => {
    const wrapped = '```json\n{"a": 1}\n```';
    expect(stripMarkdownJsonFence(wrapped)).toBe('{"a": 1}');
  });

  it('strips a bare ``` ... ``` fence with no language tag', () => {
    const wrapped = '```\n{"a": 1}\n```';
    expect(stripMarkdownJsonFence(wrapped)).toBe('{"a": 1}');
  });

  it('is a no-op on content that is already raw JSON', () => {
    expect(stripMarkdownJsonFence('{"a": 1}')).toBe('{"a": 1}');
  });

  it('returns empty string for empty/undefined input', () => {
    expect(stripMarkdownJsonFence('')).toBe('');
    expect(stripMarkdownJsonFence(undefined)).toBe('');
  });

  it('tolerates trailing content after the closing fence (no strict end anchor)', () => {
    const wrapped = '```json\n{"a": 1}\n```\n\nLet me know if you need anything else!';
    expect(stripMarkdownJsonFence(wrapped)).toBe('{"a": 1}');
  });
});

/** Chainable mock query builder: any number of .eq()/.gte() calls, resolves via .then(). */
function makeMockQueryBuilder(result) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

describe('rescoreSample (FR-4 blind-scoring audit trail, TS-2)', () => {
  it('every audit row computeDispositionInput contains ONLY present/evidenceConfidence/deviationRecords -- never arm or model', () => {
    const originalClaims = {
      0: 'As a Strategic Consultant, I want to search for market data',
      1: 'As a Fractional CMO, I want to view competitors',
      5: 'As a Small Agency Owner, I want to compare marketing spend',
      6: 'As a Strategic Consultant, I want to identify market gaps',
    };
    // A nonexistent repoPath makes findEvidenceForClaim's internal buildFileIndex
    // return [] deterministically (no live filesystem access needed for this
    // structural assertion) -- every claim resolves to confidence:'NONE'.
    const { auditRows } = rescoreSample({
      arm: ARMS.HIGHER_TIER,
      artifactData: { epics: [] },
      originalClaims,
      repoPath: '/nonexistent/path/for/unit-test-only',
    });

    expect(auditRows).toHaveLength(4);
    for (const row of auditRows) {
      expect(Object.keys(row.computeDispositionInput).sort()).toEqual(
        ['deviationRecords', 'evidenceConfidence', 'present'].sort()
      );
      expect(row.computeDispositionInput).not.toHaveProperty('arm');
      expect(row.computeDispositionInput).not.toHaveProperty('model');
    }
  });

  it('falls back to the original claim text when no regenerated claim overlaps', () => {
    const originalClaims = { 5: 'As a Small Agency Owner, I want to compare marketing spend' };
    const { auditRows } = rescoreSample({
      arm: ARMS.NULL_REROLL,
      artifactData: { epics: [{ stories: [{ as_a: 'X', i_want_to: 'do something unrelated' }] }] },
      originalClaims,
      repoPath: '/nonexistent/path/for/unit-test-only',
    });
    const targetRow = auditRows.find((r) => r.sampleIndex === '5' || r.sampleIndex === 5);
    expect(targetRow.matchOverlap).toBe(0);
    expect(targetRow.matchedClaim).toBe(originalClaims[5]);
  });
});

describe('computeCostReadout (FR-5)', () => {
  it('aggregates tokens/cost per model from mocked model_usage_log rows and computes cost-per-flip', async () => {
    const rows = [
      { reported_model_name: 'gemini-2.5-flash', metadata: { input_tokens: 1000, output_tokens: 2000 } },
      { reported_model_name: 'claude-sonnet-4-6', metadata: { input_tokens: 1500, output_tokens: 3000 } },
    ];
    const builder = makeMockQueryBuilder({ data: rows, error: null });
    const supabase = { from: vi.fn(() => builder) };

    const readout = await computeCostReadout(supabase, {
      sdId: 'SD-LEO-INFRA-J2A-EVA-GENERATION-001',
      flipsByArm: { 'claude-sonnet-4-6': 1 },
      sinceIso: '2026-07-05T00:00:00.000Z',
    });

    expect(builder.eq).toHaveBeenCalledWith('sd_id', 'SD-LEO-INFRA-J2A-EVA-GENERATION-001');
    expect(builder.eq).toHaveBeenCalledWith('subagent_type', 'generation');
    expect(builder.gte).toHaveBeenCalledWith('captured_at', '2026-07-05T00:00:00.000Z');

    expect(readout).toHaveLength(2);
    const flashEntry = readout.find((r) => r.model === 'gemini-2.5-flash');
    const sonnetEntry = readout.find((r) => r.model === 'claude-sonnet-4-6');
    expect(flashEntry.totalTokens).toBe(3000);
    expect(flashEntry.costPerFlipUsd).toBeNull(); // no flips attributed
    expect(sonnetEntry.totalTokens).toBe(4500);
    expect(sonnetEntry.storiesFlipped).toBe(1);
    expect(sonnetEntry.costPerFlipUsd).toBeGreaterThan(0);
  });

  it('omits the gte() call when sinceIso is not provided', async () => {
    const builder = makeMockQueryBuilder({ data: [], error: null });
    const supabase = { from: vi.fn(() => builder) };
    await computeCostReadout(supabase, { sdId: 'x', flipsByArm: {} });
    expect(builder.gte).not.toHaveBeenCalled();
  });

  it('propagates a query error clearly rather than silently returning empty', async () => {
    const builder = makeMockQueryBuilder({ data: null, error: { message: 'boom' } });
    const supabase = { from: vi.fn(() => builder) };
    await expect(
      computeCostReadout(supabase, { sdId: 'x', flipsByArm: {} })
    ).rejects.toThrow(/boom/);
  });
});
