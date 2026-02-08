/**
 * Tests for Devil's Advocate module
 * SD-LEO-FEAT-DEVILS-ADVOCATE-001
 */

import { describe, it, expect, vi } from 'vitest';
import {
  getDevilsAdvocateReview,
  isDevilsAdvocateGate,
  buildArtifactRecord,
  _internal,
} from '../../lib/eva/devils-advocate.js';

const {
  buildSystemPrompt,
  buildUserPrompt,
  parseReviewResponse,
  buildFallbackResult,
  estimateQualityScore,
  ALL_GATES,
  KILL_GATES,
  PROMOTION_GATES,
} = _internal;

describe('isDevilsAdvocateGate', () => {
  it('identifies kill gates correctly', () => {
    for (const stage of [3, 5, 13, 23]) {
      const result = isDevilsAdvocateGate(stage);
      expect(result.isGate).toBe(true);
      expect(result.gateType).toBe('kill');
    }
  });

  it('identifies promotion gates correctly', () => {
    for (const stage of [16, 17, 22]) {
      const result = isDevilsAdvocateGate(stage);
      expect(result.isGate).toBe(true);
      expect(result.gateType).toBe('promotion');
    }
  });

  it('returns false for non-gate stages', () => {
    for (const stage of [1, 2, 4, 6, 7, 8, 9, 10, 11, 12, 14, 15, 18, 19, 20, 21, 24, 25]) {
      const result = isDevilsAdvocateGate(stage);
      expect(result.isGate).toBe(false);
      expect(result.gateType).toBeNull();
    }
  });

  it('covers exactly 7 gates total', () => {
    expect(ALL_GATES.length).toBe(7);
    expect(KILL_GATES.length).toBe(4);
    expect(PROMOTION_GATES.length).toBe(3);
  });
});

describe('buildSystemPrompt', () => {
  it('builds kill gate prompt with adversarial focus', () => {
    const prompt = buildSystemPrompt('kill');
    expect(prompt).toContain('kill gate');
    expect(prompt).toContain('KILLED');
    expect(prompt).toContain('JSON');
  });

  it('builds promotion gate prompt with challenge focus', () => {
    const prompt = buildSystemPrompt('promotion');
    expect(prompt).toContain('promotion gate');
    expect(prompt).toContain('advance');
    expect(prompt).toContain('JSON');
  });
});

describe('buildUserPrompt', () => {
  it('includes venture name and stage info', () => {
    const prompt = buildUserPrompt({
      stageId: 3,
      gateType: 'kill',
      gateResult: { decision: 'pass', blockProgression: false, reasons: [] },
      ventureContext: { name: 'TestVenture' },
      stageOutput: { marketFit: 80, score: 75 },
    });
    expect(prompt).toContain('TestVenture');
    expect(prompt).toContain('Stage 3');
    expect(prompt).toContain('kill gate');
  });

  it('truncates large stage output', () => {
    const largeOutput = { data: 'x'.repeat(10000) };
    const prompt = buildUserPrompt({
      stageId: 5,
      gateType: 'kill',
      gateResult: {},
      ventureContext: { name: 'Test' },
      stageOutput: largeOutput,
    });
    expect(prompt.length).toBeLessThan(12000);
  });
});

describe('parseReviewResponse', () => {
  it('parses valid JSON response', () => {
    const json = JSON.stringify({
      overallAssessment: 'challenge',
      counterArguments: ['Arg 1', 'Arg 2'],
      risks: [{ risk: 'Market risk', severity: 'high', likelihood: 'possible' }],
      alternatives: ['Consider pivot'],
      summary: 'This venture has significant concerns.',
    });

    const result = parseReviewResponse(json, { stageId: 3, gateType: 'kill' });
    expect(result.overallAssessment).toBe('challenge');
    expect(result.counterArguments).toHaveLength(2);
    expect(result.risks).toHaveLength(1);
    expect(result.alternatives).toHaveLength(1);
    expect(result.summary).toBeTruthy();
  });

  it('handles JSON in markdown code blocks', () => {
    const response = '```json\n{"overallAssessment":"support","counterArguments":["Looks good"],"risks":[],"alternatives":[],"summary":"Strong"}\n```';
    const result = parseReviewResponse(response, { stageId: 16, gateType: 'promotion' });
    expect(result.overallAssessment).toBe('support');
    expect(result.counterArguments).toHaveLength(1);
  });

  it('gracefully handles non-JSON response', () => {
    const result = parseReviewResponse('This is not JSON at all', { stageId: 3, gateType: 'kill' });
    expect(result.overallAssessment).toBe('concern');
    expect(result.counterArguments).toHaveLength(1);
    expect(result.counterArguments[0]).toContain('This is not JSON');
  });
});

describe('estimateQualityScore', () => {
  it('gives max score for complete review', () => {
    const score = estimateQualityScore({
      counterArguments: ['a', 'b'],
      risks: [{ risk: 'x' }],
      alternatives: ['y'],
      summary: 'A detailed summary that is more than fifty characters long for quality assessment.',
    });
    expect(score).toBe(100);
  });

  it('gives base score for empty review', () => {
    const score = estimateQualityScore({
      counterArguments: [],
      risks: [],
      alternatives: [],
      summary: '',
    });
    expect(score).toBe(50);
  });
});

describe('buildFallbackResult', () => {
  it('returns proceeded=true and isFallback=true', () => {
    const result = buildFallbackResult({
      stageId: 3,
      gateType: 'kill',
      startedAt: '2026-01-01T00:00:00Z',
      reason: 'API key missing',
    });
    expect(result.proceeded).toBe(true);
    expect(result.isFallback).toBe(true);
    expect(result.fallbackReason).toBe('API key missing');
    expect(result.model).toBeNull();
    expect(result.gateId).toBe('kill_gate_3');
  });
});

describe('getDevilsAdvocateReview', () => {
  it('returns structured review from mock adapter', async () => {
    const mockAdapter = {
      apiKey: 'test-key',
      complete: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          overallAssessment: 'concern',
          counterArguments: ['Market is saturated', 'Revenue model unclear'],
          risks: [{ risk: 'Competition', severity: 'high', likelihood: 'likely' }],
          alternatives: ['Consider B2B pivot'],
          summary: 'Significant competition concerns.',
        }),
        model: 'gpt-4o',
        durationMs: 1200,
        usage: { inputTokens: 500, outputTokens: 300 },
      }),
    };

    const result = await getDevilsAdvocateReview(
      {
        stageId: 3,
        gateType: 'kill',
        gateResult: { decision: 'pass', blockProgression: false },
        ventureContext: { name: 'TestVenture' },
      },
      { adapter: mockAdapter, logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() } },
    );

    expect(result.stageId).toBe(3);
    expect(result.gateType).toBe('kill');
    expect(result.proceeded).toBe(true);
    expect(result.overallAssessment).toBe('concern');
    expect(result.counterArguments).toHaveLength(2);
    expect(result.model).toBe('gpt-4o');
    expect(mockAdapter.complete).toHaveBeenCalledOnce();
  });

  it('returns fallback when adapter throws', async () => {
    const mockAdapter = {
      apiKey: 'test-key',
      complete: vi.fn().mockRejectedValue(new Error('Rate limited')),
    };

    const result = await getDevilsAdvocateReview(
      {
        stageId: 5,
        gateType: 'kill',
        gateResult: {},
        ventureContext: { name: 'Test' },
      },
      { adapter: mockAdapter, logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() } },
    );

    expect(result.isFallback).toBe(true);
    expect(result.proceeded).toBe(true);
    expect(result.fallbackReason).toContain('Rate limited');
  });

  it('returns fallback when no API key', async () => {
    // Save and clear env
    const savedKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const result = await getDevilsAdvocateReview(
      {
        stageId: 16,
        gateType: 'promotion',
        gateResult: { pass: true },
        ventureContext: { name: 'Test' },
      },
      { logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() } },
    );

    expect(result.isFallback).toBe(true);
    expect(result.proceeded).toBe(true);

    // Restore env
    if (savedKey) process.env.OPENAI_API_KEY = savedKey;
  });
});

describe('buildArtifactRecord', () => {
  it('builds valid venture_artifacts row', () => {
    const review = {
      stageId: 3,
      gateType: 'kill',
      gateId: 'kill_gate_3',
      generatedAt: '2026-01-01T00:00:00Z',
      proceeded: true,
      overallAssessment: 'concern',
      counterArguments: ['Arg1'],
      risks: [],
      alternatives: [],
      model: 'gpt-4o',
      durationMs: 1000,
      usage: { inputTokens: 100, outputTokens: 200 },
    };

    const row = buildArtifactRecord('venture-uuid-123', review);
    expect(row.venture_id).toBe('venture-uuid-123');
    expect(row.lifecycle_stage).toBe(3);
    expect(row.artifact_type).toBe('devils_advocate_review');
    expect(row.is_current).toBe(true);
    expect(row.source).toBe('devils-advocate');
    expect(row.quality_score).toBeGreaterThan(0);
    expect(row.validation_status).toBe('validated');

    const content = JSON.parse(row.content);
    expect(content.gateId).toBe('kill_gate_3');
    expect(content.overallAssessment).toBe('concern');
  });

  it('marks fallback artifacts with quality_score 0', () => {
    const fallbackReview = {
      stageId: 5,
      gateType: 'kill',
      gateId: 'kill_gate_5',
      generatedAt: '2026-01-01T00:00:00Z',
      proceeded: true,
      isFallback: true,
      overallAssessment: 'unavailable',
      counterArguments: [],
      risks: [],
      alternatives: [],
      model: null,
    };

    const row = buildArtifactRecord('venture-uuid-456', fallbackReview);
    expect(row.quality_score).toBe(0);
    expect(row.validation_status).toBe('pending');
  });
});
