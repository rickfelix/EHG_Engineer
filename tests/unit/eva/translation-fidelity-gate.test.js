/**
 * Tests for Translation Fidelity Gate Engine
 * SD-LEO-FEAT-TRANSLATION-FIDELITY-GATES-001
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dotenv and supabase
vi.mock('dotenv/config', () => ({}));

const mockInsert = vi.fn().mockResolvedValue({ error: null });
const mockSelect = vi.fn().mockReturnThis();
const mockEq = vi.fn().mockReturnThis();
const mockSingle = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn((table) => {
      if (table === 'eva_translation_gates') {
        return { insert: mockInsert };
      }
      return {
        select: mockSelect,
        eq: mockEq,
        single: mockSingle,
      };
    }),
  })),
}));

// Mock LLM client factory
const mockComplete = vi.fn();
vi.mock('../../../lib/llm/client-factory.js', () => ({
  getValidationClient: vi.fn(() => ({
    complete: mockComplete,
    modelId: 'test-model',
  })),
}));

describe('Translation Fidelity Gate', () => {
  let evaluateTranslationFidelity;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../../scripts/eva/translation-fidelity-gate.js');
    evaluateTranslationFidelity = mod.evaluateTranslationFidelity;
  });

  describe('evaluateTranslationFidelity', () => {
    const upstream = {
      type: 'brainstorm_session',
      id: 'bs-1',
      key: 'test-brainstorm',
      content: 'User personas, constraints, decisions about architecture',
      dimensions: ['scalability', 'security'],
    };

    const downstream = {
      type: 'eva_vision_document',
      id: 'vis-1',
      key: 'test-vision',
      content: 'Vision covering scalability and security concerns',
      dimensions: ['scalability', 'security', 'usability'],
    };

    it('returns passing result when LLM scores >= 70', async () => {
      mockComplete.mockResolvedValue(JSON.stringify({
        score: 85,
        reasoning: 'Good coverage of upstream themes',
        coverage_areas: [
          { area: 'scalability', covered: true, notes: 'Addressed in architecture section' },
          { area: 'security', covered: true, notes: 'Covered in constraints' },
        ],
        gaps: [],
      }));

      const result = await evaluateTranslationFidelity(upstream, downstream, 'brainstorm_to_vision');

      expect(result.passed).toBe(true);
      expect(result.score).toBe(85);
      expect(result.maxScore).toBe(100);
      expect(result.gaps).toEqual([]);
      expect(result.details.gate_type).toBe('brainstorm_to_vision');
      expect(result.details.model_used).toBe('test-model');
    });

    it('returns failing result when LLM scores < 70', async () => {
      mockComplete.mockResolvedValue(JSON.stringify({
        score: 45,
        reasoning: 'Significant gaps in translation',
        coverage_areas: [
          { area: 'scalability', covered: false, notes: 'Missing' },
        ],
        gaps: [
          { item: 'Scalability requirements', source: 'brainstorm', severity: 'critical' },
          { item: 'User persona constraints', source: 'brainstorm', severity: 'major' },
        ],
      }));

      const result = await evaluateTranslationFidelity(upstream, downstream, 'brainstorm_to_vision');

      expect(result.passed).toBe(false);
      expect(result.score).toBe(45);
      expect(result.gaps).toHaveLength(2);
      expect(result.issues).toHaveLength(1); // Only critical
      expect(result.warnings).toHaveLength(1); // Non-critical
    });

    it('returns fallback result when LLM client is unavailable', async () => {
      const { getValidationClient } = await import('../../../lib/llm/client-factory.js');
      getValidationClient.mockImplementationOnce(() => { throw new Error('No API key'); });

      const result = await evaluateTranslationFidelity(upstream, downstream, 'brainstorm_to_vision');

      expect(result.passed).toBe(true); // Advisory - don't block
      expect(result.score).toBe(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].message).toContain('Gate skipped');
    });

    it('returns fallback result when LLM call fails', async () => {
      mockComplete.mockRejectedValue(new Error('Rate limited'));

      const result = await evaluateTranslationFidelity(upstream, downstream, 'vision_to_architecture');

      expect(result.passed).toBe(true);
      expect(result.score).toBe(0);
      expect(result.details.gate_type).toBe('vision_to_architecture');
    });

    it('handles unparseable LLM response', async () => {
      mockComplete.mockResolvedValue('This is not valid JSON at all');

      const result = await evaluateTranslationFidelity(upstream, downstream, 'architecture_to_sd');

      expect(result.passed).toBe(false); // score=0 < 70
      expect(result.score).toBe(0);
    });

    it('clamps score to 0-100 range', async () => {
      mockComplete.mockResolvedValue(JSON.stringify({
        score: 150,
        reasoning: 'Over-scored',
        gaps: [],
      }));

      const result = await evaluateTranslationFidelity(upstream, downstream, 'brainstorm_to_vision');

      expect(result.score).toBe(100);
    });

    it('handles array upstream (multiple sources)', async () => {
      const upstreams = [upstream, {
        type: 'eva_vision_document',
        id: 'vis-0',
        key: 'parent-vision',
        content: 'Parent vision content',
        dimensions: [],
      }];

      mockComplete.mockResolvedValue(JSON.stringify({
        score: 78,
        reasoning: 'Combined upstream coverage is adequate',
        gaps: [{ item: 'Minor detail lost', source: 'parent-vision', severity: 'minor' }],
      }));

      const result = await evaluateTranslationFidelity(upstreams, downstream, 'vision_to_architecture');

      expect(result.passed).toBe(true);
      expect(result.score).toBe(78);
      expect(result.gaps).toHaveLength(1);
    });

    it('normalizes invalid severity values to minor', async () => {
      mockComplete.mockResolvedValue(JSON.stringify({
        score: 60,
        reasoning: 'Some gaps',
        gaps: [{ item: 'Something', source: 'upstream', severity: 'extreme' }],
      }));

      const result = await evaluateTranslationFidelity(upstream, downstream, 'brainstorm_to_vision');

      expect(result.gaps[0].severity).toBe('minor');
    });

    it('includes duration_ms in details', async () => {
      mockComplete.mockResolvedValue(JSON.stringify({ score: 90, reasoning: 'Fast', gaps: [] }));

      const result = await evaluateTranslationFidelity(upstream, downstream, 'brainstorm_to_vision');

      expect(result.details.duration_ms).toBeGreaterThanOrEqual(0);
    });
  });

  describe('runAndPersistGate', () => {
    let runAndPersistGate;

    beforeEach(async () => {
      const mod = await import('../../../scripts/eva/translation-fidelity-gate.js');
      runAndPersistGate = mod.runAndPersistGate;
    });

    it('persists gate result to database', async () => {
      mockComplete.mockResolvedValue(JSON.stringify({
        score: 88,
        reasoning: 'Good fidelity',
        gaps: [],
      }));

      const upstream = { type: 'test', id: '1', key: 'k1', content: 'up', dimensions: [] };
      const downstream = { type: 'test', id: '2', key: 'k2', content: 'down', dimensions: [] };

      const result = await runAndPersistGate(upstream, downstream, 'brainstorm_to_vision');

      expect(result).not.toBeNull();
      expect(result.passed).toBe(true);
      expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
        gate_type: 'brainstorm_to_vision',
        passed: true,
        coverage_score: 88,
      }));
    });

    it('returns null on unexpected error without throwing', async () => {
      // Force an error by making evaluateTranslationFidelity throw
      mockComplete.mockImplementation(() => { throw new TypeError('Unexpected'); });

      const result = await runAndPersistGate(
        { type: 'test', id: '1', key: 'k1' },
        { type: 'test', id: '2', key: 'k2' },
        'brainstorm_to_vision'
      );

      // Should not throw, should return result (fallback or null)
      expect(result).toBeDefined();
    });
  });
});
