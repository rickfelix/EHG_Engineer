/**
 * Tests for Devil's Advocate
 * SD-LEO-ORCH-CLI-VENTURE-LIFECYCLE-002-B
 */

import { describe, it, expect, vi } from 'vitest';
import {
  isDevilsAdvocateGate,
  getDevilsAdvocateReview,
  buildArtifactRecord,
  _internal,
} from '../../../lib/eva/devils-advocate.js';

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('DevilsAdvocate', () => {
  describe('isDevilsAdvocateGate', () => {
    it('should identify kill gates', () => {
      for (const stage of [3, 5, 13, 23]) {
        const result = isDevilsAdvocateGate(stage);
        expect(result.isGate).toBe(true);
        expect(result.gateType).toBe('kill');
      }
    });

    it('should identify promotion gates', () => {
      for (const stage of [16, 17, 22]) {
        const result = isDevilsAdvocateGate(stage);
        expect(result.isGate).toBe(true);
        expect(result.gateType).toBe('promotion');
      }
    });

    it('should return false for non-gate stages', () => {
      for (const stage of [1, 2, 4, 6, 7, 8, 9, 10, 11, 12, 14, 15, 18, 19, 20, 21, 24, 25]) {
        const result = isDevilsAdvocateGate(stage);
        expect(result.isGate).toBe(false);
        expect(result.gateType).toBeNull();
      }
    });
  });

  describe('getDevilsAdvocateReview - with mock adapter', () => {
    it('should return structured review from adapter', async () => {
      const mockAdapter = {
        apiKey: 'test-key',
        complete: vi.fn().mockResolvedValue({
          content: JSON.stringify({
            overallAssessment: 'concern',
            counterArguments: ['Market saturation risk', 'Competitor advantage'],
            risks: [{ risk: 'Market size', severity: 'high', likelihood: 'possible' }],
            alternatives: ['Focus on niche segment'],
            summary: 'The venture faces market risks.',
          }),
          model: 'gpt-4o',
          durationMs: 1200,
          usage: { prompt_tokens: 500, completion_tokens: 200 },
        }),
      };

      const result = await getDevilsAdvocateReview(
        {
          stageId: 3,
          gateType: 'kill',
          gateResult: { decision: 'proceed' },
          ventureContext: { name: 'TestVenture' },
          stageOutput: { score: 7 },
        },
        { adapter: mockAdapter, logger: silentLogger },
      );

      expect(result.stageId).toBe(3);
      expect(result.gateType).toBe('kill');
      expect(result.proceeded).toBe(true);
      expect(result.overallAssessment).toBe('concern');
      expect(result.counterArguments).toHaveLength(2);
      expect(result.risks).toHaveLength(1);
      expect(result.model).toBe('gpt-4o');
    });

    it('should return fallback when adapter has no API key', async () => {
      const mockAdapter = { apiKey: null };

      const result = await getDevilsAdvocateReview(
        {
          stageId: 5,
          gateType: 'kill',
          gateResult: {},
          ventureContext: { name: 'Test' },
        },
        { adapter: mockAdapter, logger: silentLogger },
      );

      // The code checks adapter.apiKey only in the non-injected path
      // When adapter is injected, it goes straight to adapter.complete()
      // Since this adapter has no complete method, it will throw
      expect(result.isFallback).toBe(true);
    });

    it('should return fallback when adapter.complete throws', async () => {
      const mockAdapter = {
        apiKey: 'test',
        complete: vi.fn().mockRejectedValue(new Error('API rate limited')),
      };

      const result = await getDevilsAdvocateReview(
        {
          stageId: 13,
          gateType: 'kill',
          gateResult: {},
          ventureContext: { name: 'Test' },
        },
        { adapter: mockAdapter, logger: silentLogger },
      );

      expect(result.isFallback).toBe(true);
      expect(result.fallbackReason).toContain('API rate limited');
      expect(result.proceeded).toBe(true);
    });
  });

  describe('buildArtifactRecord', () => {
    it('should build a valid artifact record', () => {
      const review = {
        stageId: 3,
        gateType: 'kill',
        gateId: 'kill_gate_3',
        generatedAt: '2026-01-01T00:00:00Z',
        proceeded: true,
        overallAssessment: 'concern',
        counterArguments: ['Arg1', 'Arg2'],
        risks: [{ risk: 'R1', severity: 'high', likelihood: 'possible' }],
        alternatives: ['Alt1'],
        model: 'gpt-4o',
        durationMs: 1000,
        usage: { prompt_tokens: 500 },
      };

      const record = buildArtifactRecord('venture-123', review);

      expect(record.venture_id).toBe('venture-123');
      expect(record.lifecycle_stage).toBe(3);
      expect(record.artifact_type).toBe('devils_advocate_review');
      expect(record.is_current).toBe(true);
      expect(record.source).toBe('devils-advocate');
      expect(record.quality_score).toBeGreaterThan(0);
    });

    it('should set quality_score 0 for fallback reviews', () => {
      const review = {
        stageId: 5,
        gateType: 'kill',
        gateId: 'kill_gate_5',
        isFallback: true,
        overallAssessment: 'unavailable',
        counterArguments: [],
        risks: [],
        alternatives: [],
      };

      const record = buildArtifactRecord('venture-123', review);
      expect(record.quality_score).toBe(0);
      expect(record.validation_status).toBe('pending');
    });
  });

  describe('internal helpers', () => {
    describe('parseReviewResponse', () => {
      it('should parse valid JSON response', () => {
        const content = JSON.stringify({
          overallAssessment: 'support',
          counterArguments: ['Tried hard but looks good'],
          risks: [],
          alternatives: [],
          summary: 'Looks good',
        });
        const result = _internal.parseReviewResponse(content);
        expect(result.overallAssessment).toBe('support');
        expect(result.counterArguments).toHaveLength(1);
      });

      it('should handle JSON in markdown code blocks', () => {
        const content = '```json\n{"overallAssessment":"challenge","counterArguments":["Issue 1"],"risks":[],"alternatives":[],"summary":"Problems found"}\n```';
        const result = _internal.parseReviewResponse(content);
        expect(result.overallAssessment).toBe('challenge');
      });

      it('should fallback gracefully on invalid JSON', () => {
        const result = _internal.parseReviewResponse('This is not JSON at all');
        expect(result.overallAssessment).toBe('concern');
        expect(result.counterArguments).toHaveLength(1);
      });
    });

    describe('estimateQualityScore', () => {
      it('should return base 50 for empty review', () => {
        const score = _internal.estimateQualityScore({});
        expect(score).toBe(50);
      });

      it('should add points for counter-arguments, risks, alternatives, summary', () => {
        const score = _internal.estimateQualityScore({
          counterArguments: ['a', 'b'],
          risks: [{ risk: 'r1' }],
          alternatives: ['alt1'],
          summary: 'A sufficiently long summary that definitely exceeds fifty characters in total length.',
        });
        expect(score).toBe(100);
      });
    });

    describe('buildSystemPrompt', () => {
      it('should build kill gate prompt', () => {
        const prompt = _internal.buildSystemPrompt('kill');
        expect(prompt).toContain('KILLED');
        expect(prompt).toContain('fatal flaws');
      });

      it('should build promotion gate prompt', () => {
        const prompt = _internal.buildSystemPrompt('promotion');
        expect(prompt).toContain('advance');
        expect(prompt).toContain('weaknesses');
      });
    });

    describe('constants', () => {
      it('should define correct kill gates', () => {
        expect(_internal.KILL_GATES).toEqual([3, 5, 13, 23]);
      });

      it('should define correct promotion gates', () => {
        expect(_internal.PROMOTION_GATES).toEqual([16, 17, 22]);
      });

      it('should have all gates combined', () => {
        expect(_internal.ALL_GATES).toHaveLength(7);
      });
    });
  });
});
