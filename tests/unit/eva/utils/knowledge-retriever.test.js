/**
 * Tests for Cross-Venture Knowledge Retriever
 * SD-MAN-ORCH-EVA-PORTFOLIO-INTELLIGENCE-001-A
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the cross-venture-learning module before importing the SUT
vi.mock('../../../../lib/eva/cross-venture-learning.js', () => ({
  searchSimilar: vi.fn(),
}));

import { retrieveKnowledge, _internal } from '../../../../lib/eva/utils/knowledge-retriever.js';
import { searchSimilar } from '../../../../lib/eva/cross-venture-learning.js';

// ── Fixtures ──────────────────────────────────────────────

const VENTURE_CONTEXT = {
  id: 'venture-abc-123',
  name: 'Acme Corp',
  archetype: 'SaaS',
};

const STAGE_ID = 3;

function mockLogger() {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeResult(overrides = {}) {
  return {
    source: 'venture_artifacts',
    id: 'art-001',
    content: 'Some pattern content',
    score: 0.8,
    metadata: { venture_id: 'venture-other-999' },
    ...overrides,
  };
}

// ── buildStageQuery ───────────────────────────────────────

describe('buildStageQuery', () => {
  const { buildStageQuery } = _internal;

  it('should produce query with name, archetype, and stage', () => {
    const query = buildStageQuery(VENTURE_CONTEXT, STAGE_ID);
    expect(query).toContain('Acme Corp');
    expect(query).toContain('SaaS venture');
    expect(query).toContain('stage 3');
    expect(query).toContain('patterns lessons risks');
  });

  it('should omit name when not present', () => {
    const query = buildStageQuery({ archetype: 'Marketplace' }, 2);
    expect(query).not.toContain('undefined');
    expect(query).toContain('Marketplace venture');
    expect(query).toContain('stage 2');
  });

  it('should omit archetype when not present', () => {
    const query = buildStageQuery({ name: 'TestCo' }, 1);
    expect(query).not.toContain('undefined');
    expect(query).toContain('TestCo');
    expect(query).toContain('stage 1');
    expect(query).not.toContain('venture');
  });

  it('should handle empty context gracefully', () => {
    const query = buildStageQuery({}, 5);
    expect(query).toContain('stage 5');
    expect(query).toContain('patterns lessons risks');
  });
});

// ── Constants ─────────────────────────────────────────────

describe('exported constants', () => {
  it('MAX_RESULTS should be 5', () => {
    expect(_internal.MAX_RESULTS).toBe(5);
  });

  it('SCORE_THRESHOLD should be 0.5', () => {
    expect(_internal.SCORE_THRESHOLD).toBe(0.5);
  });
});

// ── retrieveKnowledge ─────────────────────────────────────

describe('retrieveKnowledge', () => {
  let logger;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = mockLogger();
  });

  // ── Guard clauses ────────────────────────────────────

  it('should return empty array when supabase is null', async () => {
    const result = await retrieveKnowledge(
      { ventureContext: VENTURE_CONTEXT, stageId: STAGE_ID },
      { supabase: null, logger },
    );
    expect(result).toEqual([]);
    expect(searchSimilar).not.toHaveBeenCalled();
  });

  it('should return empty array when supabase is undefined', async () => {
    const result = await retrieveKnowledge(
      { ventureContext: VENTURE_CONTEXT, stageId: STAGE_ID },
      { logger },
    );
    expect(result).toEqual([]);
  });

  it('should return empty array when ventureContext is null', async () => {
    const result = await retrieveKnowledge(
      { ventureContext: null, stageId: STAGE_ID },
      { supabase: {}, logger },
    );
    expect(result).toEqual([]);
    expect(searchSimilar).not.toHaveBeenCalled();
  });

  it('should return empty array when ventureContext is undefined', async () => {
    const result = await retrieveKnowledge(
      { stageId: STAGE_ID },
      { supabase: {}, logger },
    );
    expect(result).toEqual([]);
  });

  // ── searchSimilar integration ────────────────────────

  it('should call searchSimilar with correct params', async () => {
    searchSimilar.mockResolvedValue([]);

    await retrieveKnowledge(
      { ventureContext: VENTURE_CONTEXT, stageId: STAGE_ID },
      { supabase: 'fake-sb', logger },
    );

    expect(searchSimilar).toHaveBeenCalledOnce();
    expect(searchSimilar).toHaveBeenCalledWith('fake-sb', {
      query: expect.stringContaining('stage 3'),
      tables: ['venture_artifacts', 'issue_patterns'],
      matchThreshold: 0.5,
      limit: 10, // MAX_RESULTS * 2
    });
  });

  // ── FR-3: Exclude own venture ────────────────────────

  it('should exclude results matching current venture id (FR-3)', async () => {
    searchSimilar.mockResolvedValue([
      makeResult({ id: 'own-1', score: 0.9, metadata: { venture_id: VENTURE_CONTEXT.id } }),
      makeResult({ id: 'other-1', score: 0.85, metadata: { venture_id: 'venture-other-777' } }),
    ]);

    const result = await retrieveKnowledge(
      { ventureContext: VENTURE_CONTEXT, stageId: STAGE_ID },
      { supabase: {}, logger },
    );

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('other-1');
  });

  // ── FR-1: Score threshold filtering ──────────────────

  it('should filter results below 0.5 score threshold (FR-1)', async () => {
    searchSimilar.mockResolvedValue([
      makeResult({ id: 'high', score: 0.9 }),
      makeResult({ id: 'low', score: 0.3 }),
      makeResult({ id: 'boundary', score: 0.5 }),
      makeResult({ id: 'just-below', score: 0.49 }),
    ]);

    const result = await retrieveKnowledge(
      { ventureContext: VENTURE_CONTEXT, stageId: STAGE_ID },
      { supabase: {}, logger },
    );

    const ids = result.map(r => r.id);
    expect(ids).toContain('high');
    expect(ids).toContain('boundary');
    expect(ids).not.toContain('low');
    expect(ids).not.toContain('just-below');
  });

  // ── FR-4: Deduplication ──────────────────────────────

  it('should deduplicate by source+id (FR-4)', async () => {
    searchSimilar.mockResolvedValue([
      makeResult({ source: 'venture_artifacts', id: 'dup-1', score: 0.9 }),
      makeResult({ source: 'venture_artifacts', id: 'dup-1', score: 0.85 }),
      makeResult({ source: 'issue_patterns', id: 'dup-1', score: 0.8 }),
    ]);

    const result = await retrieveKnowledge(
      { ventureContext: VENTURE_CONTEXT, stageId: STAGE_ID },
      { supabase: {}, logger },
    );

    // venture_artifacts:dup-1 appears once, issue_patterns:dup-1 is a different key
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ source: 'venture_artifacts', id: 'dup-1' });
    expect(result[1]).toMatchObject({ source: 'issue_patterns', id: 'dup-1' });
  });

  // ── FR-4: Max 5 results, sorted by descending score ─

  it('should return max 5 results sorted by descending score (FR-4)', async () => {
    // Use exact decimal scores to avoid floating-point arithmetic issues
    const scores = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.9];
    const manyResults = scores.map((score, i) =>
      makeResult({
        source: 'venture_artifacts',
        id: `art-${i}`,
        score,
      }),
    );
    searchSimilar.mockResolvedValue(manyResults);

    const result = await retrieveKnowledge(
      { ventureContext: VENTURE_CONTEXT, stageId: STAGE_ID },
      { supabase: {}, logger },
    );

    expect(result).toHaveLength(5);
    // Should be sorted descending
    for (let i = 0; i < result.length - 1; i++) {
      expect(result[i].score).toBeGreaterThanOrEqual(result[i + 1].score);
    }
    // Highest scores should be present
    expect(result[0].score).toBe(0.9);
    expect(result[4].score).toBe(0.65);
  });

  // ── FR-5: Graceful degradation ───────────────────────

  it('should return empty array on searchSimilar error (FR-5)', async () => {
    searchSimilar.mockRejectedValue(new Error('Network failure'));

    const result = await retrieveKnowledge(
      { ventureContext: VENTURE_CONTEXT, stageId: STAGE_ID },
      { supabase: {}, logger },
    );

    expect(result).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Knowledge retrieval failed'),
    );
  });

  it('should log warning with error message on failure (FR-5)', async () => {
    searchSimilar.mockRejectedValue(new Error('timeout exceeded'));

    await retrieveKnowledge(
      { ventureContext: VENTURE_CONTEXT, stageId: STAGE_ID },
      { supabase: {}, logger },
    );

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('timeout exceeded'),
    );
  });

  // ── Output shape ─────────────────────────────────────

  it('should strip metadata from output, returning only source/id/content/score', async () => {
    searchSimilar.mockResolvedValue([
      makeResult({
        source: 'issue_patterns',
        id: 'ip-42',
        content: 'Pattern data',
        score: 0.75,
        metadata: { venture_id: 'other', extra_field: 'should not appear' },
      }),
    ]);

    const result = await retrieveKnowledge(
      { ventureContext: VENTURE_CONTEXT, stageId: STAGE_ID },
      { supabase: {}, logger },
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      source: 'issue_patterns',
      id: 'ip-42',
      content: 'Pattern data',
      score: 0.75,
    });
    expect(result[0]).not.toHaveProperty('metadata');
  });

  // ── Logging ──────────────────────────────────────────

  it('should log count when results are returned', async () => {
    searchSimilar.mockResolvedValue([
      makeResult({ score: 0.8 }),
      makeResult({ id: 'art-002', score: 0.7 }),
    ]);

    await retrieveKnowledge(
      { ventureContext: VENTURE_CONTEXT, stageId: STAGE_ID },
      { supabase: {}, logger },
    );

    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('2 cross-venture pattern(s)'),
    );
  });

  it('should not log when no results are returned', async () => {
    searchSimilar.mockResolvedValue([]);

    await retrieveKnowledge(
      { ventureContext: VENTURE_CONTEXT, stageId: STAGE_ID },
      { supabase: {}, logger },
    );

    expect(logger.log).not.toHaveBeenCalled();
  });

  // ── Default logger ───────────────────────────────────

  it('should default to console when logger not provided', async () => {
    searchSimilar.mockResolvedValue([]);

    // Should not throw when deps.logger is omitted
    const result = await retrieveKnowledge(
      { ventureContext: VENTURE_CONTEXT, stageId: STAGE_ID },
      { supabase: {} },
    );

    expect(result).toEqual([]);
  });

  // ── Edge: results with no metadata ───────────────────

  it('should keep results that have no metadata (no venture_id to match)', async () => {
    searchSimilar.mockResolvedValue([
      makeResult({ id: 'no-meta', score: 0.7, metadata: undefined }),
      makeResult({ id: 'null-meta', score: 0.6, metadata: null }),
    ]);

    const result = await retrieveKnowledge(
      { ventureContext: VENTURE_CONTEXT, stageId: STAGE_ID },
      { supabase: {}, logger },
    );

    // Both should pass since metadata?.venture_id is undefined, not matching VENTURE_CONTEXT.id
    expect(result).toHaveLength(2);
  });
});
