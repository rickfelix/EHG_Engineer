/**
 * Unit tests for Stage 01 Analysis Step - Hydration
 * Tests: analyzeStage01 function (LLM integration, normalization, provenance)
 *
 * @module tests/unit/eva/stage-templates/stage-01-hydration.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock getLLMClient before importing
vi.mock('../../../../lib/llm/index.js', () => ({
  getLLMClient: vi.fn(() => ({
    complete: vi.fn(),
  })),
}));

vi.mock('../../../../lib/eva/utils/parse-json.js', () => ({
  parseJSON: vi.fn((input) => {
    if (typeof input === 'string') return JSON.parse(input);
    return input;
  }),
}));

import { analyzeStage01, STAGE1_ARCHETYPES } from '../../../../lib/eva/stage-templates/analysis-steps/stage-01-hydration.js';
import { getLLMClient } from '../../../../lib/llm/index.js';
import { parseJSON } from '../../../../lib/eva/utils/parse-json.js';

const makeSynthesis = (overrides = {}) => ({
  description: 'A platform that connects freelance developers with startups needing technical help quickly',
  problemStatement: 'Startups struggle to find qualified developers for short-term projects',
  valueProp: 'Instant access to vetted developers for startup-specific needs',
  targetMarket: 'Early-stage startups with limited engineering resources',
  archetype: 'marketplace',
  ...overrides,
});

const makeLLMResponse = (overrides = {}) => ({
  description: 'An AI-powered marketplace connecting vetted freelance developers with early-stage startups for rapid technical talent acquisition',
  problemStatement: 'Early-stage startups face critical delays finding qualified developers for short-term technical projects',
  valueProp: 'Instant, AI-matched access to pre-vetted developers specialized in startup-scale challenges',
  targetMarket: 'Seed to Series A startups with teams under 10 engineers',
  archetype: 'marketplace',
  keyAssumptions: [
    'Startups prefer short-term engagements over full-time hires',
    'Developer vetting can be automated with sufficient accuracy',
  ],
  moatStrategy: 'Network effects from developer ratings and startup reviews create switching costs',
  successCriteria: [
    'Match 80% of requests within 48 hours',
    'Maintain developer NPS above 50',
  ],
  ...overrides,
});

describe('stage-01-hydration.js - analyzeStage01', () => {
  let mockComplete;

  beforeEach(() => {
    vi.clearAllMocks();
    mockComplete = vi.fn().mockResolvedValue(JSON.stringify(makeLLMResponse()));
    getLLMClient.mockReturnValue({ complete: mockComplete });
    parseJSON.mockImplementation((input) => {
      if (typeof input === 'string') return JSON.parse(input);
      return input;
    });
  });

  describe('Input validation', () => {
    it('should throw when synthesis is missing', async () => {
      await expect(analyzeStage01({})).rejects.toThrow('Stage 1 hydration requires Stage 0 synthesis data');
    });

    it('should throw when synthesis is null', async () => {
      await expect(analyzeStage01({ synthesis: null })).rejects.toThrow('Stage 1 hydration requires Stage 0 synthesis data');
    });
  });

  describe('LLM integration', () => {
    it('should call getLLMClient with content-generation purpose', async () => {
      await analyzeStage01({ synthesis: makeSynthesis() });
      expect(getLLMClient).toHaveBeenCalledWith({ purpose: 'content-generation' });
    });

    it('should pass SYSTEM_PROMPT and user prompt to client.complete', async () => {
      await analyzeStage01({ synthesis: makeSynthesis(), ventureName: 'TestVenture' });
      expect(mockComplete).toHaveBeenCalledTimes(1);
      const [systemPrompt, userPrompt] = mockComplete.mock.calls[0];
      expect(systemPrompt).toContain('Stage 1 Hydration Engine');
      expect(userPrompt).toContain('TestVenture');
      expect(userPrompt).toContain('Synthesis Data');
    });

    it('should include template context in prompt when provided', async () => {
      const templateContext = { archetype: 'saas', score: 85 };
      await analyzeStage01({ synthesis: makeSynthesis(), templateContext });
      const [, userPrompt] = mockComplete.mock.calls[0];
      expect(userPrompt).toContain('Template Context');
      expect(userPrompt).toContain('calibration');
    });

    it('should use "Unnamed" when ventureName is not provided', async () => {
      await analyzeStage01({ synthesis: makeSynthesis() });
      const [, userPrompt] = mockComplete.mock.calls[0];
      expect(userPrompt).toContain('Unnamed');
    });
  });

  describe('Output normalization', () => {
    it('should return all required fields', async () => {
      const result = await analyzeStage01({ synthesis: makeSynthesis() });
      expect(result).toHaveProperty('description');
      expect(result).toHaveProperty('problemStatement');
      expect(result).toHaveProperty('valueProp');
      expect(result).toHaveProperty('targetMarket');
      expect(result).toHaveProperty('archetype');
      expect(result).toHaveProperty('keyAssumptions');
      expect(result).toHaveProperty('moatStrategy');
      expect(result).toHaveProperty('successCriteria');
      expect(result).toHaveProperty('sourceProvenance');
    });

    it('should truncate long strings', async () => {
      mockComplete.mockResolvedValue(JSON.stringify(makeLLMResponse({
        description: 'x'.repeat(3000),
      })));
      const result = await analyzeStage01({ synthesis: makeSynthesis() });
      expect(result.description.length).toBeLessThanOrEqual(2000);
    });

    it('should validate archetype against enum', async () => {
      mockComplete.mockResolvedValue(JSON.stringify(makeLLMResponse({
        archetype: 'invalid_type',
      })));
      const synthesis = makeSynthesis({ archetype: 'fintech' });
      const result = await analyzeStage01({ synthesis });
      expect(STAGE1_ARCHETYPES).toContain(result.archetype);
      expect(result.archetype).toBe('fintech'); // falls back to synthesis
    });

    it('should default archetype to saas when both LLM and synthesis are invalid', async () => {
      mockComplete.mockResolvedValue(JSON.stringify(makeLLMResponse({
        archetype: 'invalid',
      })));
      const synthesis = makeSynthesis({ archetype: 'also_invalid' });
      const result = await analyzeStage01({ synthesis });
      expect(result.archetype).toBe('saas');
    });

    it('should normalize keyAssumptions as array of strings', async () => {
      const result = await analyzeStage01({ synthesis: makeSynthesis() });
      expect(Array.isArray(result.keyAssumptions)).toBe(true);
      result.keyAssumptions.forEach(a => expect(typeof a).toBe('string'));
    });

    it('should return empty array when keyAssumptions is missing', async () => {
      mockComplete.mockResolvedValue(JSON.stringify(makeLLMResponse({
        keyAssumptions: undefined,
      })));
      const result = await analyzeStage01({ synthesis: makeSynthesis() });
      expect(result.keyAssumptions).toEqual([]);
    });

    it('should normalize successCriteria as array of strings', async () => {
      const result = await analyzeStage01({ synthesis: makeSynthesis() });
      expect(Array.isArray(result.successCriteria)).toBe(true);
      result.successCriteria.forEach(c => expect(typeof c).toBe('string'));
    });

    it('should return empty string for missing moatStrategy', async () => {
      mockComplete.mockResolvedValue(JSON.stringify(makeLLMResponse({
        moatStrategy: undefined,
      })));
      const result = await analyzeStage01({ synthesis: makeSynthesis() });
      expect(typeof result.moatStrategy).toBe('string');
    });
  });

  describe('Source provenance tracking', () => {
    it('should mark fields from synthesis as stage0', async () => {
      const synthesis = makeSynthesis();
      // LLM returns same fields that exist in synthesis
      mockComplete.mockResolvedValue(JSON.stringify(makeLLMResponse()));
      const result = await analyzeStage01({ synthesis });
      expect(result.sourceProvenance.description).toBe('stage0');
      expect(result.sourceProvenance.targetMarket).toBe('stage0');
    });

    it('should mark fields not in synthesis as llm', async () => {
      const synthesis = makeSynthesis({ moatStrategy: undefined });
      delete synthesis.moatStrategy;
      mockComplete.mockResolvedValue(JSON.stringify(makeLLMResponse({
        moatStrategy: 'First mover advantage in AI matching',
      })));
      const result = await analyzeStage01({ synthesis });
      expect(result.sourceProvenance.moatStrategy).toBe('llm');
    });

    it('should not include empty fields in provenance', async () => {
      mockComplete.mockResolvedValue(JSON.stringify(makeLLMResponse({
        moatStrategy: '',
      })));
      const synthesis = makeSynthesis({ moatStrategy: undefined });
      delete synthesis.moatStrategy;
      const result = await analyzeStage01({ synthesis });
      expect(result.sourceProvenance.moatStrategy).toBeUndefined();
    });
  });

  describe('Fallback behavior', () => {
    it('should fall back to synthesis fields when LLM returns empty', async () => {
      mockComplete.mockResolvedValue(JSON.stringify({
        description: '',
        problemStatement: '',
        valueProp: '',
        targetMarket: '',
        archetype: 'saas',
      }));
      const synthesis = makeSynthesis();
      const result = await analyzeStage01({ synthesis });
      // Falls back to synthesis.description etc via || chain
      expect(result.description).toBe(synthesis.description);
      expect(result.problemStatement).toBe(synthesis.problemStatement);
    });

    it('should prefer synthesis reframedProblem for problemStatement fallback', async () => {
      mockComplete.mockResolvedValue(JSON.stringify({
        description: 'x'.repeat(50),
        problemStatement: '',
        valueProp: 'x'.repeat(20),
        targetMarket: 'x'.repeat(10),
        archetype: 'saas',
      }));
      const synthesis = makeSynthesis({
        problemStatement: 'Original problem',
        reframedProblem: 'Better reframed problem statement',
      });
      const result = await analyzeStage01({ synthesis });
      expect(result.problemStatement).toBe('Better reframed problem statement');
    });
  });

  describe('STAGE1_ARCHETYPES export', () => {
    it('should export valid archetypes list', () => {
      expect(STAGE1_ARCHETYPES).toEqual([
        'saas', 'marketplace', 'deeptech', 'hardware', 'services', 'media', 'fintech',
      ]);
    });
  });
});
