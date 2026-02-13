/**
 * Unit tests for Stage 10 Analysis Step - Naming/Brand (v2.0 enhancements)
 * Part of SD-EVA-FEAT-TEMPLATES-IDENTITY-001
 *
 * Tests v2.0 features:
 * - narrativeExtension normalization (vision, mission, brandVoice)
 * - namingStrategy enum validation and fallback
 * - decision auto-selection logic (top-scoring candidate)
 * - availabilityChecks defaults and validation
 *
 * @module tests/unit/eva/stage-templates/analysis-steps/stage-10-naming-brand.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the LLM client before importing the module under test
vi.mock('../../../../../lib/llm/index.js', () => ({
  getLLMClient: vi.fn(() => ({
    complete: vi.fn(),
  })),
}));

import { analyzeStage10, MIN_CANDIDATES, MIN_CRITERIA, NAMING_STRATEGIES } from '../../../../../lib/eva/stage-templates/analysis-steps/stage-10-naming-brand.js';
import { getLLMClient } from '../../../../../lib/llm/index.js';

/**
 * Helper: create a well-formed LLM response JSON string.
 */
function createLLMResponse(overrides = {}) {
  const base = {
    brandGenome: {
      archetype: 'Explorer',
      values: ['Innovation', 'Freedom'],
      tone: 'Bold and adventurous',
      audience: 'Tech-savvy millennials',
      differentiators: ['AI-first', 'Open source'],
    },
    narrativeExtension: {
      vision: 'To democratize AI for every business',
      mission: 'We build accessible AI tools that empower small teams',
      brandVoice: 'Confident, clear, and human-centric',
    },
    namingStrategy: 'abstract',
    scoringCriteria: [
      { name: 'Memorability', weight: 30 },
      { name: 'Relevance', weight: 40 },
      { name: 'Uniqueness', weight: 30 },
    ],
    candidates: [
      { name: 'Lumina', rationale: 'Light and clarity', scores: { Memorability: 90, Relevance: 85, Uniqueness: 95 } },
      { name: 'Forge', rationale: 'Building and creation', scores: { Memorability: 80, Relevance: 75, Uniqueness: 70 } },
      { name: 'Nexus', rationale: 'Connection point', scores: { Memorability: 85, Relevance: 90, Uniqueness: 60 } },
      { name: 'Aether', rationale: 'Ethereal and expansive', scores: { Memorability: 70, Relevance: 65, Uniqueness: 85 } },
      { name: 'Prism', rationale: 'Multiple perspectives', scores: { Memorability: 88, Relevance: 80, Uniqueness: 75 } },
    ],
    decision: {
      selectedName: 'Lumina',
      workingTitle: true,
      rationale: 'Lumina scored highest across all weighted criteria, especially in uniqueness.',
      availabilityChecks: {
        domain: 'pending',
        trademark: 'pending',
        social: 'pending',
      },
    },
    ...overrides,
  };
  return JSON.stringify(base);
}

function setupMock(responseOverrides = {}) {
  const mockComplete = vi.fn().mockResolvedValue(createLLMResponse(responseOverrides));
  getLLMClient.mockReturnValue({ complete: mockComplete });
  return mockComplete;
}

const VALID_PARAMS = {
  stage1Data: { description: 'An AI-powered analytics platform', targetMarket: 'SMBs', problemStatement: 'Data chaos' },
};

describe('stage-10-naming-brand.js - Analysis Step v2.0', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Exported constants', () => {
    it('should export MIN_CANDIDATES = 5', () => {
      expect(MIN_CANDIDATES).toBe(5);
    });

    it('should export MIN_CRITERIA = 3', () => {
      expect(MIN_CRITERIA).toBe(3);
    });

    it('should export NAMING_STRATEGIES with 5 valid values', () => {
      expect(NAMING_STRATEGIES).toEqual(['descriptive', 'abstract', 'acronym', 'founder', 'metaphorical']);
    });
  });

  describe('Input validation', () => {
    it('should throw when stage1Data is missing', async () => {
      await expect(analyzeStage10({})).rejects.toThrow('Stage 10 naming/brand requires Stage 1 data with description');
    });

    it('should throw when stage1Data.description is missing', async () => {
      await expect(analyzeStage10({ stage1Data: {} })).rejects.toThrow('Stage 10 naming/brand requires Stage 1 data with description');
    });

    it('should throw when stage1Data.description is empty string', async () => {
      await expect(analyzeStage10({ stage1Data: { description: '' } })).rejects.toThrow('Stage 10 naming/brand requires Stage 1 data with description');
    });
  });

  describe('narrativeExtension normalization', () => {
    it('should include narrativeExtension in output when LLM provides it', async () => {
      setupMock();
      const result = await analyzeStage10(VALID_PARAMS);
      expect(result.narrativeExtension).toBeDefined();
      expect(result.narrativeExtension.vision).toBe('To democratize AI for every business');
      expect(result.narrativeExtension.mission).toBe('We build accessible AI tools that empower small teams');
      expect(result.narrativeExtension.brandVoice).toBe('Confident, clear, and human-centric');
    });

    it('should set narrativeExtension fields to null when LLM omits them', async () => {
      setupMock({ narrativeExtension: {} });
      const result = await analyzeStage10(VALID_PARAMS);
      expect(result.narrativeExtension.vision).toBeNull();
      expect(result.narrativeExtension.mission).toBeNull();
      expect(result.narrativeExtension.brandVoice).toBeNull();
    });

    it('should set narrativeExtension fields to null when narrativeExtension is missing entirely', async () => {
      const mockComplete = vi.fn().mockResolvedValue(JSON.stringify({
        brandGenome: { archetype: 'Creator', values: ['Innovation'], tone: 'Professional', audience: 'B2B', differentiators: ['Fast'] },
        scoringCriteria: [{ name: 'M', weight: 50 }, { name: 'R', weight: 50 }],
        candidates: [
          { name: 'C1', rationale: 'R1', scores: { M: 80, R: 90 } },
          { name: 'C2', rationale: 'R2', scores: { M: 70, R: 80 } },
          { name: 'C3', rationale: 'R3', scores: { M: 85, R: 75 } },
          { name: 'C4', rationale: 'R4', scores: { M: 75, R: 85 } },
          { name: 'C5', rationale: 'R5', scores: { M: 90, R: 70 } },
        ],
      }));
      getLLMClient.mockReturnValue({ complete: mockComplete });
      const result = await analyzeStage10(VALID_PARAMS);
      expect(result.narrativeExtension.vision).toBeNull();
      expect(result.narrativeExtension.mission).toBeNull();
      expect(result.narrativeExtension.brandVoice).toBeNull();
    });

    it('should truncate narrativeExtension fields to 500 characters', async () => {
      const longText = 'A'.repeat(600);
      setupMock({
        narrativeExtension: {
          vision: longText,
          mission: longText,
          brandVoice: longText,
        },
      });
      const result = await analyzeStage10(VALID_PARAMS);
      expect(result.narrativeExtension.vision.length).toBe(500);
      expect(result.narrativeExtension.mission.length).toBe(500);
      expect(result.narrativeExtension.brandVoice.length).toBe(500);
    });

    it('should coerce non-string narrativeExtension fields to string', async () => {
      setupMock({
        narrativeExtension: {
          vision: 12345,
          mission: true,
          brandVoice: null,
        },
      });
      const result = await analyzeStage10(VALID_PARAMS);
      expect(result.narrativeExtension.vision).toBe('12345');
      expect(result.narrativeExtension.mission).toBe('true');
      expect(result.narrativeExtension.brandVoice).toBeNull();
    });
  });

  describe('namingStrategy enum validation', () => {
    it('should accept valid namingStrategy values', async () => {
      for (const strategy of NAMING_STRATEGIES) {
        setupMock({ namingStrategy: strategy });
        const result = await analyzeStage10(VALID_PARAMS);
        expect(result.namingStrategy).toBe(strategy);
      }
    });

    it('should default to "descriptive" for invalid namingStrategy', async () => {
      setupMock({ namingStrategy: 'invalid-strategy' });
      const result = await analyzeStage10(VALID_PARAMS);
      expect(result.namingStrategy).toBe('descriptive');
    });

    it('should default to "descriptive" when namingStrategy is missing', async () => {
      setupMock({ namingStrategy: undefined });
      const result = await analyzeStage10(VALID_PARAMS);
      expect(result.namingStrategy).toBe('descriptive');
    });

    it('should default to "descriptive" for numeric namingStrategy', async () => {
      setupMock({ namingStrategy: 42 });
      const result = await analyzeStage10(VALID_PARAMS);
      expect(result.namingStrategy).toBe('descriptive');
    });
  });

  describe('decision auto-selection logic', () => {
    it('should use LLM-provided selectedName when it matches a candidate', async () => {
      setupMock({ decision: { selectedName: 'Forge' } });
      const result = await analyzeStage10(VALID_PARAMS);
      expect(result.decision.selectedName).toBe('Forge');
    });

    it('should auto-select top-scoring candidate when LLM selectedName does not match any candidate', async () => {
      setupMock({ decision: { selectedName: 'NonExistent' } });
      const result = await analyzeStage10(VALID_PARAMS);
      // Top-scoring: Lumina = 0.30*90 + 0.40*85 + 0.30*95 = 27+34+28.5 = 89.5
      expect(result.decision.selectedName).toBe('Lumina');
    });

    it('should auto-select top-scoring candidate when decision is missing entirely', async () => {
      setupMock({ decision: undefined });
      const result = await analyzeStage10(VALID_PARAMS);
      expect(result.decision.selectedName).toBe('Lumina');
    });

    it('should auto-select top-scoring candidate when decision.selectedName is empty', async () => {
      setupMock({ decision: { selectedName: '' } });
      const result = await analyzeStage10(VALID_PARAMS);
      expect(result.decision.selectedName).toBe('Lumina');
    });

    it('should default workingTitle to true when not explicitly false', async () => {
      setupMock({ decision: { workingTitle: undefined } });
      const result = await analyzeStage10(VALID_PARAMS);
      expect(result.decision.workingTitle).toBe(true);
    });

    it('should set workingTitle to false only when explicitly false', async () => {
      setupMock({ decision: { workingTitle: false } });
      const result = await analyzeStage10(VALID_PARAMS);
      expect(result.decision.workingTitle).toBe(false);
    });

    it('should provide default rationale when decision.rationale is missing', async () => {
      setupMock({ decision: { rationale: undefined } });
      const result = await analyzeStage10(VALID_PARAMS);
      expect(result.decision.rationale).toContain('Top-scoring candidate');
    });

    it('should truncate decision.rationale to 500 characters', async () => {
      setupMock({ decision: { rationale: 'R'.repeat(600) } });
      const result = await analyzeStage10(VALID_PARAMS);
      expect(result.decision.rationale.length).toBe(500);
    });
  });

  describe('availabilityChecks defaults', () => {
    it('should default all availability checks to "pending"', async () => {
      setupMock({ decision: {} });
      const result = await analyzeStage10(VALID_PARAMS);
      expect(result.decision.availabilityChecks).toEqual({
        domain: 'pending',
        trademark: 'pending',
        social: 'pending',
      });
    });

    it('should accept valid availability status values', async () => {
      setupMock({
        decision: {
          availabilityChecks: {
            domain: 'available',
            trademark: 'taken',
            social: 'unknown',
          },
        },
      });
      const result = await analyzeStage10(VALID_PARAMS);
      expect(result.decision.availabilityChecks.domain).toBe('available');
      expect(result.decision.availabilityChecks.trademark).toBe('taken');
      expect(result.decision.availabilityChecks.social).toBe('unknown');
    });

    it('should default invalid availability status values to "pending"', async () => {
      setupMock({
        decision: {
          availabilityChecks: {
            domain: 'checked',
            trademark: 'reserved',
            social: 'blocked',
          },
        },
      });
      const result = await analyzeStage10(VALID_PARAMS);
      expect(result.decision.availabilityChecks.domain).toBe('pending');
      expect(result.decision.availabilityChecks.trademark).toBe('pending');
      expect(result.decision.availabilityChecks.social).toBe('pending');
    });
  });

  describe('brandGenome normalization', () => {
    it('should truncate all brandGenome string fields to 200 characters', async () => {
      setupMock({
        brandGenome: {
          archetype: 'A'.repeat(300),
          values: ['V'.repeat(300)],
          tone: 'T'.repeat(300),
          audience: 'U'.repeat(300),
          differentiators: ['D'.repeat(300)],
        },
      });
      const result = await analyzeStage10(VALID_PARAMS);
      expect(result.brandGenome.archetype.length).toBe(200);
      expect(result.brandGenome.values[0].length).toBe(200);
      expect(result.brandGenome.tone.length).toBe(200);
      expect(result.brandGenome.audience.length).toBe(200);
      expect(result.brandGenome.differentiators[0].length).toBe(200);
    });

    it('should default archetype to "Creator" when missing', async () => {
      setupMock({ brandGenome: { values: ['V'], tone: 'T', audience: 'A', differentiators: ['D'] } });
      const result = await analyzeStage10(VALID_PARAMS);
      expect(result.brandGenome.archetype).toBe('Creator');
    });

    it('should default values to ["Innovation"] when empty array', async () => {
      setupMock({ brandGenome: { archetype: 'Hero', values: [], tone: 'T', audience: 'A', differentiators: ['D'] } });
      const result = await analyzeStage10(VALID_PARAMS);
      expect(result.brandGenome.values).toEqual(['Innovation']);
    });

    it('should default differentiators to ["Unique approach"] when empty', async () => {
      setupMock({ brandGenome: { archetype: 'Hero', values: ['V'], tone: 'T', audience: 'A', differentiators: [] } });
      const result = await analyzeStage10(VALID_PARAMS);
      expect(result.brandGenome.differentiators).toEqual(['Unique approach']);
    });

    it('should use stage1Data.targetMarket as audience fallback', async () => {
      setupMock({ brandGenome: { archetype: 'Hero', values: ['V'], tone: 'T', differentiators: ['D'] } });
      const result = await analyzeStage10({ stage1Data: { description: 'Test', targetMarket: 'Enterprise B2B' } });
      expect(result.brandGenome.audience).toBe('Enterprise B2B');
    });
  });

  describe('scoringCriteria normalization', () => {
    it('should normalize weights to sum to 100 when they do not', async () => {
      setupMock({
        scoringCriteria: [
          { name: 'A', weight: 50 },
          { name: 'B', weight: 50 },
          { name: 'C', weight: 50 },
        ],
      });
      const result = await analyzeStage10(VALID_PARAMS);
      const weightSum = result.scoringCriteria.reduce((sum, c) => sum + c.weight, 0);
      expect(Math.abs(weightSum - 100)).toBeLessThan(0.01);
    });

    it('should use default criteria when LLM provides fewer than MIN_CRITERIA', async () => {
      setupMock({
        scoringCriteria: [
          { name: 'Only', weight: 100 },
        ],
      });
      const result = await analyzeStage10(VALID_PARAMS);
      expect(result.scoringCriteria.length).toBe(4); // Default set
      expect(result.scoringCriteria[0].name).toBe('Memorability');
    });

    it('should filter out criteria missing name or weight', async () => {
      setupMock({
        scoringCriteria: [
          { name: 'Valid1', weight: 40 },
          { weight: 30 }, // missing name
          { name: 'Valid2' }, // missing weight
        ],
      });
      const result = await analyzeStage10(VALID_PARAMS);
      // Only 1 valid criterion (< MIN_CRITERIA), so defaults are used
      expect(result.scoringCriteria.length).toBe(4);
    });
  });

  describe('candidates normalization', () => {
    it('should throw when LLM returns no candidates', async () => {
      setupMock({ candidates: [] });
      await expect(analyzeStage10(VALID_PARAMS)).rejects.toThrow('LLM returned no candidates');
    });

    it('should clamp candidate scores to 0-100 range', async () => {
      setupMock({
        candidates: [
          { name: 'C1', rationale: 'R1', scores: { Memorability: 150, Relevance: -20, Uniqueness: 50 } },
          { name: 'C2', rationale: 'R2', scores: { Memorability: 80, Relevance: 80, Uniqueness: 80 } },
          { name: 'C3', rationale: 'R3', scores: { Memorability: 80, Relevance: 80, Uniqueness: 80 } },
          { name: 'C4', rationale: 'R4', scores: { Memorability: 80, Relevance: 80, Uniqueness: 80 } },
          { name: 'C5', rationale: 'R5', scores: { Memorability: 80, Relevance: 80, Uniqueness: 80 } },
        ],
      });
      const result = await analyzeStage10(VALID_PARAMS);
      expect(result.candidates[0].scores.Memorability).toBe(100);
      expect(result.candidates[0].scores.Relevance).toBe(0);
    });

    it('should default missing scores to 50', async () => {
      setupMock({
        candidates: [
          { name: 'C1', rationale: 'R1', scores: { Memorability: 80 } }, // missing Relevance and Uniqueness
          { name: 'C2', rationale: 'R2', scores: { Memorability: 80, Relevance: 80, Uniqueness: 80 } },
          { name: 'C3', rationale: 'R3', scores: { Memorability: 80, Relevance: 80, Uniqueness: 80 } },
          { name: 'C4', rationale: 'R4', scores: { Memorability: 80, Relevance: 80, Uniqueness: 80 } },
          { name: 'C5', rationale: 'R5', scores: { Memorability: 80, Relevance: 80, Uniqueness: 80 } },
        ],
      });
      const result = await analyzeStage10(VALID_PARAMS);
      expect(result.candidates[0].scores.Relevance).toBe(50);
      expect(result.candidates[0].scores.Uniqueness).toBe(50);
    });

    it('should truncate candidate name and rationale', async () => {
      setupMock({
        candidates: [
          { name: 'N'.repeat(300), rationale: 'R'.repeat(600), scores: { Memorability: 80, Relevance: 80, Uniqueness: 80 } },
          { name: 'C2', rationale: 'R2', scores: { Memorability: 80, Relevance: 80, Uniqueness: 80 } },
          { name: 'C3', rationale: 'R3', scores: { Memorability: 80, Relevance: 80, Uniqueness: 80 } },
          { name: 'C4', rationale: 'R4', scores: { Memorability: 80, Relevance: 80, Uniqueness: 80 } },
          { name: 'C5', rationale: 'R5', scores: { Memorability: 80, Relevance: 80, Uniqueness: 80 } },
        ],
      });
      const result = await analyzeStage10(VALID_PARAMS);
      expect(result.candidates[0].name.length).toBe(200);
      expect(result.candidates[0].rationale.length).toBe(500);
    });

    it('should default candidate name when missing', async () => {
      setupMock({
        candidates: [
          { rationale: 'R1', scores: { Memorability: 80, Relevance: 80, Uniqueness: 80 } },
          { name: 'C2', rationale: 'R2', scores: { Memorability: 80, Relevance: 80, Uniqueness: 80 } },
          { name: 'C3', rationale: 'R3', scores: { Memorability: 80, Relevance: 80, Uniqueness: 80 } },
          { name: 'C4', rationale: 'R4', scores: { Memorability: 80, Relevance: 80, Uniqueness: 80 } },
          { name: 'C5', rationale: 'R5', scores: { Memorability: 80, Relevance: 80, Uniqueness: 80 } },
        ],
      });
      const result = await analyzeStage10(VALID_PARAMS);
      expect(result.candidates[0].name).toBe('Candidate 1');
    });
  });

  describe('Output shape', () => {
    it('should return all expected top-level fields', async () => {
      setupMock();
      const result = await analyzeStage10(VALID_PARAMS);
      expect(result).toHaveProperty('brandGenome');
      expect(result).toHaveProperty('narrativeExtension');
      expect(result).toHaveProperty('namingStrategy');
      expect(result).toHaveProperty('scoringCriteria');
      expect(result).toHaveProperty('candidates');
      expect(result).toHaveProperty('decision');
      expect(result).toHaveProperty('totalCandidates');
      expect(result).toHaveProperty('totalCriteria');
    });

    it('should set totalCandidates to match candidates array length', async () => {
      setupMock();
      const result = await analyzeStage10(VALID_PARAMS);
      expect(result.totalCandidates).toBe(result.candidates.length);
    });

    it('should set totalCriteria to match scoringCriteria array length', async () => {
      setupMock();
      const result = await analyzeStage10(VALID_PARAMS);
      expect(result.totalCriteria).toBe(result.scoringCriteria.length);
    });
  });

  describe('Optional upstream data integration', () => {
    it('should include stage3 scoring context in prompt when available', async () => {
      const mockComplete = setupMock();
      await analyzeStage10({
        ...VALID_PARAMS,
        stage3Data: { overallScore: 78 },
      });
      const userPrompt = mockComplete.mock.calls[0][1];
      expect(userPrompt).toContain('78');
    });

    it('should include stage5 financial context in prompt when available', async () => {
      const mockComplete = setupMock();
      await analyzeStage10({
        ...VALID_PARAMS,
        stage5Data: { initialInvestment: 50000, year1: { revenue: 200000 } },
      });
      const userPrompt = mockComplete.mock.calls[0][1];
      expect(userPrompt).toContain('50000');
      expect(userPrompt).toContain('200000');
    });

    it('should include stage8 BMC context in prompt when available', async () => {
      const mockComplete = setupMock();
      await analyzeStage10({
        ...VALID_PARAMS,
        stage8Data: { value_propositions: { items: ['Affordable AI analytics'] } },
      });
      const userPrompt = mockComplete.mock.calls[0][1];
      expect(userPrompt).toContain('Affordable AI analytics');
    });

    it('should include ventureName in prompt when provided', async () => {
      const mockComplete = setupMock();
      await analyzeStage10({ ...VALID_PARAMS, ventureName: 'TestVenture' });
      const userPrompt = mockComplete.mock.calls[0][1];
      expect(userPrompt).toContain('TestVenture');
    });
  });

  describe('JSON parsing', () => {
    it('should handle LLM response wrapped in markdown code block', async () => {
      const response = createLLMResponse();
      const mockComplete = vi.fn().mockResolvedValue('```json\n' + response + '\n```');
      getLLMClient.mockReturnValue({ complete: mockComplete });
      const result = await analyzeStage10(VALID_PARAMS);
      expect(result.brandGenome.archetype).toBe('Explorer');
    });

    it('should throw on unparseable LLM response', async () => {
      const mockComplete = vi.fn().mockResolvedValue('This is not JSON at all');
      getLLMClient.mockReturnValue({ complete: mockComplete });
      await expect(analyzeStage10(VALID_PARAMS)).rejects.toThrow('Failed to parse brand naming response');
    });
  });
});
