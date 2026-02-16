/**
 * Unit tests for Stage 02 Analysis Step - Multi-Persona Analysis
 * SD: SD-EVA-R2-FIX-TEST-COVERAGE-001
 *
 * Tests: analyzeStage02, PERSONAS, clampScore behavior
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock LLM client before importing module under test
vi.mock('../../../../../lib/llm/index.js', () => ({
  getLLMClient: vi.fn(() => ({
    complete: vi.fn(),
  })),
}));

// Mock parseJSON
vi.mock('../../../../../lib/eva/utils/parse-json.js', () => ({
  parseJSON: vi.fn((str) => JSON.parse(str)),
  extractUsage: vi.fn((response) => response?.usage || null),
}));

import { analyzeStage02, PERSONAS } from '../../../../../lib/eva/stage-templates/analysis-steps/stage-02-multi-persona.js';
import { getLLMClient } from '../../../../../lib/llm/index.js';
import { parseJSON } from '../../../../../lib/eva/utils/parse-json.js';

function createMockLogger() {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makePersonaResponse(personaId, score = 75) {
  return JSON.stringify({
    model: personaId,
    summary: 'This is a detailed assessment of the venture from this perspective.',
    strengths: ['Strong market fit', 'Good timing'],
    risks: ['Competition is fierce'],
    score,
  });
}

describe('PERSONAS', () => {
  it('has exactly 6 personas', () => {
    expect(PERSONAS).toHaveLength(6);
  });

  it('each persona has required fields', () => {
    for (const p of PERSONAS) {
      expect(p).toHaveProperty('id');
      expect(p).toHaveProperty('name');
      expect(p).toHaveProperty('stage3Metric');
      expect(p).toHaveProperty('focus');
    }
  });

  it('persona IDs are unique', () => {
    const ids = PERSONAS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('stage3Metric values are unique', () => {
    const metrics = PERSONAS.map(p => p.stage3Metric);
    expect(new Set(metrics).size).toBe(metrics.length);
  });
});

describe('analyzeStage02', () => {
  let mockComplete;
  const logger = createMockLogger();

  beforeEach(() => {
    vi.clearAllMocks();
    mockComplete = vi.fn();
    getLLMClient.mockReturnValue({ complete: mockComplete });
  });

  const validStage1Data = {
    description: 'A SaaS platform for pet grooming appointments',
    valueProp: 'Seamless booking for pet owners',
    targetMarket: 'Pet owners in urban areas',
    problemStatement: 'Scheduling pet grooming is fragmented',
  };

  it('throws when stage1Data is missing description', async () => {
    await expect(
      analyzeStage02({ stage1Data: {}, logger }),
    ).rejects.toThrow('Stage 02 requires Stage 1 data with description');
  });

  it('throws when stage1Data is null', async () => {
    await expect(
      analyzeStage02({ stage1Data: null, logger }),
    ).rejects.toThrow();
  });

  it('runs all 6 personas and returns critiques with composite score', async () => {
    // Each persona call returns a different score
    const scores = [80, 70, 60, 90, 50, 75];
    PERSONAS.forEach((persona, i) => {
      mockComplete.mockResolvedValueOnce(makePersonaResponse(persona.id, scores[i]));
    });

    const result = await analyzeStage02({
      stage1Data: validStage1Data,
      ventureName: 'PetGroom',
      logger,
    });

    expect(result.critiques).toHaveLength(6);
    expect(mockComplete).toHaveBeenCalledTimes(6);

    // Composite = average of scores, rounded
    const expectedComposite = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    expect(result.compositeScore).toBe(expectedComposite);
  });

  it('maps persona IDs correctly to critiques', async () => {
    PERSONAS.forEach((persona) => {
      mockComplete.mockResolvedValueOnce(makePersonaResponse(persona.id, 70));
    });

    const result = await analyzeStage02({
      stage1Data: validStage1Data,
      logger,
    });

    for (let i = 0; i < PERSONAS.length; i++) {
      expect(result.critiques[i].model).toBe(PERSONAS[i].id);
    }
  });

  it('clamps score above 100 to 100', async () => {
    PERSONAS.forEach((persona) => {
      mockComplete.mockResolvedValueOnce(JSON.stringify({
        model: persona.id,
        summary: 'Assessment text that is long enough to pass.',
        strengths: ['Good'],
        risks: ['Bad'],
        score: 150, // Over 100
      }));
    });

    const result = await analyzeStage02({ stage1Data: validStage1Data, logger });
    for (const critique of result.critiques) {
      expect(critique.score).toBeLessThanOrEqual(100);
    }
  });

  it('clamps negative score to 0', async () => {
    PERSONAS.forEach((persona) => {
      mockComplete.mockResolvedValueOnce(JSON.stringify({
        model: persona.id,
        summary: 'Assessment text that is long enough to pass.',
        strengths: ['Good'],
        risks: ['Bad'],
        score: -10,
      }));
    });

    const result = await analyzeStage02({ stage1Data: validStage1Data, logger });
    for (const critique of result.critiques) {
      expect(critique.score).toBeGreaterThanOrEqual(0);
    }
  });

  it('defaults non-numeric score to 50', async () => {
    PERSONAS.forEach((persona) => {
      mockComplete.mockResolvedValueOnce(JSON.stringify({
        model: persona.id,
        summary: 'Assessment text that is long enough to pass.',
        strengths: ['Good'],
        risks: ['Bad'],
        score: 'not-a-number',
      }));
    });

    const result = await analyzeStage02({ stage1Data: validStage1Data, logger });
    for (const critique of result.critiques) {
      expect(critique.score).toBe(50);
    }
  });

  it('normalizes non-array strengths to array', async () => {
    PERSONAS.forEach((persona) => {
      mockComplete.mockResolvedValueOnce(JSON.stringify({
        model: persona.id,
        summary: 'Assessment text that is long enough to pass.',
        strengths: 'single strength string',
        risks: ['risk'],
        score: 70,
      }));
    });

    const result = await analyzeStage02({ stage1Data: validStage1Data, logger });
    for (const critique of result.critiques) {
      expect(Array.isArray(critique.strengths)).toBe(true);
    }
  });

  it('handles missing summary with fallback', async () => {
    PERSONAS.forEach((persona) => {
      mockComplete.mockResolvedValueOnce(JSON.stringify({
        model: persona.id,
        strengths: ['Good'],
        risks: ['Bad'],
        score: 70,
      }));
    });

    const result = await analyzeStage02({ stage1Data: validStage1Data, logger });
    for (const critique of result.critiques) {
      expect(typeof critique.summary).toBe('string');
      expect(critique.summary.length).toBeGreaterThan(0);
    }
  });

  it('passes venture name and stage1Data in prompt', async () => {
    PERSONAS.forEach((persona) => {
      mockComplete.mockResolvedValueOnce(makePersonaResponse(persona.id, 70));
    });

    await analyzeStage02({
      stage1Data: validStage1Data,
      ventureName: 'TestVenture',
      logger,
    });

    // Check the user prompt (second arg) contains venture info
    const firstCall = mockComplete.mock.calls[0];
    expect(firstCall[1]).toContain('TestVenture');
    expect(firstCall[1]).toContain(validStage1Data.description);
  });
});
