/**
 * Unit Tests: Narrative Risk Synthesis Component (Component 11)
 * SD-LEO-FIX-BRAINSTORM-NARRATIVE-RISK-001
 *
 * Test Coverage:
 * - Successful LLM response parsing
 * - LLM failure fallback to defaults
 * - Composite score calculation from weighted sub-dimensions
 * - Governance band classification (NR-Low, NR-Moderate, NR-High, NR-Critical)
 * - All 4 sub-dimensions present in output
 * - Clamping of out-of-range values
 * - Confidence caveat included
 * - Weight verification (DS=35%, DD=30%, HP=20%, IE=15%)
 */

import { describe, test, expect, vi } from 'vitest';
import {
  analyzeNarrativeRisk,
  calculateNarrativeRiskScore,
  classifyGovernanceBand,
  NR_WEIGHTS,
  GOVERNANCE_BANDS,
} from '../../../../../lib/eva/stage-zero/synthesis/narrative-risk.js';

const mockPathOutput = {
  suggested_name: 'TestVenture',
  suggested_problem: 'Users need better collaboration tools',
  suggested_solution: 'AI-powered team workspace with built-in sharing',
  target_market: 'Remote teams at SMBs',
  origin_type: 'discovery',
  competitor_urls: [],
  blueprint_id: null,
  discovery_strategy: null,
  metadata: {},
};

const validLLMResponse = {
  decision_sensitivity: 40,
  demand_distortion: 25,
  hype_persistence: 30,
  influence_exposure: 20,
  narrative_flags: ['AI hype cycle proximity', 'VC narrative amplification'],
  confidence: 0.75,
  confidence_caveat: 'AI-adjacent ventures may receive inflated scores due to training data density.',
  summary: 'Moderate narrative risk. Core collaboration need is structural, but AI positioning amplifies perceived urgency.',
};

function createMockLLMClient(responseJson) {
  return {
    _model: 'test-model',
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ text: JSON.stringify(responseJson) }],
      }),
    },
  };
}

function createFailingLLMClient(errorMessage) {
  return {
    _model: 'test-model',
    messages: {
      create: vi.fn().mockRejectedValue(new Error(errorMessage)),
    },
  };
}

const silentLogger = { log: vi.fn(), warn: vi.fn() };

describe('analyzeNarrativeRisk', () => {
  test('parses valid LLM response with all sub-dimensions', async () => {
    const client = createMockLLMClient(validLLMResponse);
    const result = await analyzeNarrativeRisk(mockPathOutput, { llmClient: client, logger: silentLogger });

    expect(result.component).toBe('narrative_risk');
    expect(result.component_scores.decision_sensitivity).toBe(40);
    expect(result.component_scores.demand_distortion).toBe(25);
    expect(result.component_scores.hype_persistence).toBe(30);
    expect(result.component_scores.influence_exposure).toBe(20);
    expect(result.narrative_flags).toHaveLength(2);
    expect(result.confidence).toBe(0.75);
    expect(result.confidence_caveat).toBeTruthy();
    expect(result.summary).toBeTruthy();
  });

  test('calculates correct composite NR score from sub-dimensions', async () => {
    const client = createMockLLMClient(validLLMResponse);
    const result = await analyzeNarrativeRisk(mockPathOutput, { llmClient: client, logger: silentLogger });

    // DS=40*0.35=14, DD=25*0.30=7.5, HP=30*0.20=6, IE=20*0.15=3 → 30.5 → rounded to 31
    expect(result.nr_score).toBe(31);
  });

  test('assigns correct governance band', async () => {
    const client = createMockLLMClient(validLLMResponse);
    const result = await analyzeNarrativeRisk(mockPathOutput, { llmClient: client, logger: silentLogger });

    // Score 31 → NR-Moderate (25-49)
    expect(result.nr_band).toBe('NR-Moderate');
    expect(result.nr_interpretation).toBe('Watch assumptions');
  });

  test('returns default result when LLM fails', async () => {
    const client = createFailingLLMClient('API unavailable');
    const result = await analyzeNarrativeRisk(mockPathOutput, { llmClient: client, logger: silentLogger });

    expect(result.component).toBe('narrative_risk');
    expect(result.nr_score).toBe(0);
    expect(result.nr_band).toBe('NR-Unknown');
    expect(result.component_scores.decision_sensitivity).toBe(0);
    expect(result.component_scores.demand_distortion).toBe(0);
    expect(result.component_scores.hype_persistence).toBe(0);
    expect(result.component_scores.influence_exposure).toBe(0);
    expect(result.confidence).toBe(0);
    expect(result.narrative_flags).toEqual([]);
    expect(result.summary).toContain('Analysis failed');
  });

  test('returns default result when LLM returns unparseable text', async () => {
    const client = {
      _model: 'test-model',
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ text: 'I cannot analyze narrative risk in JSON format.' }],
        }),
      },
    };
    const result = await analyzeNarrativeRisk(mockPathOutput, { llmClient: client, logger: silentLogger });

    expect(result.component).toBe('narrative_risk');
    expect(result.nr_score).toBe(0);
    expect(result.nr_band).toBe('NR-Unknown');
    expect(result.summary).toContain('Could not parse');
  });

  test('clamps out-of-range sub-dimension values', async () => {
    const outOfRange = {
      ...validLLMResponse,
      decision_sensitivity: 150,
      demand_distortion: -20,
      hype_persistence: 200,
      influence_exposure: -50,
      confidence: 2.5,
    };
    const client = createMockLLMClient(outOfRange);
    const result = await analyzeNarrativeRisk(mockPathOutput, { llmClient: client, logger: silentLogger });

    expect(result.component_scores.decision_sensitivity).toBe(100);
    expect(result.component_scores.demand_distortion).toBe(0);
    expect(result.component_scores.hype_persistence).toBe(100);
    expect(result.component_scores.influence_exposure).toBe(0);
    expect(result.confidence).toBe(1);
  });

  test('has all 4 required sub-dimensions in component_scores', async () => {
    const client = createMockLLMClient(validLLMResponse);
    const result = await analyzeNarrativeRisk(mockPathOutput, { llmClient: client, logger: silentLogger });

    const requiredFields = ['decision_sensitivity', 'demand_distortion', 'hype_persistence', 'influence_exposure'];
    for (const field of requiredFields) {
      expect(result.component_scores).toHaveProperty(field);
    }
  });

  test('provides default confidence caveat when LLM omits it', async () => {
    const noCaveat = { ...validLLMResponse };
    delete noCaveat.confidence_caveat;
    const client = createMockLLMClient(noCaveat);
    const result = await analyzeNarrativeRisk(mockPathOutput, { llmClient: client, logger: silentLogger });

    expect(result.confidence_caveat).toContain('LLM training data');
  });

  test('handles non-array narrative_flags gracefully', async () => {
    const badFlags = { ...validLLMResponse, narrative_flags: 'not an array' };
    const client = createMockLLMClient(badFlags);
    const result = await analyzeNarrativeRisk(mockPathOutput, { llmClient: client, logger: silentLogger });

    expect(result.narrative_flags).toEqual([]);
  });
});

describe('calculateNarrativeRiskScore', () => {
  test('returns 0 for null input', () => {
    expect(calculateNarrativeRiskScore(null)).toBe(0);
  });

  test('returns 0 for empty input', () => {
    expect(calculateNarrativeRiskScore({})).toBe(0);
  });

  test('calculates weighted score correctly', () => {
    const components = {
      decision_sensitivity: 60,  // 60 * 0.35 = 21
      demand_distortion: 40,     // 40 * 0.30 = 12
      hype_persistence: 50,      // 50 * 0.20 = 10
      influence_exposure: 30,    // 30 * 0.15 = 4.5
    };
    const score = calculateNarrativeRiskScore(components);
    // 21 + 12 + 10 + 4.5 = 47.5 → rounded to 48
    expect(score).toBe(48);
  });

  test('returns 100 for maximum values', () => {
    const maxComponents = {
      decision_sensitivity: 100,
      demand_distortion: 100,
      hype_persistence: 100,
      influence_exposure: 100,
    };
    expect(calculateNarrativeRiskScore(maxComponents)).toBe(100);
  });

  test('weights sum to 1.0', () => {
    const weightSum = Object.values(NR_WEIGHTS).reduce((sum, w) => sum + w, 0);
    expect(weightSum).toBeCloseTo(1.0, 10);
  });

  test('Decision Sensitivity has highest weight (35%)', () => {
    expect(NR_WEIGHTS.decision_sensitivity).toBe(0.35);
    const weights = Object.values(NR_WEIGHTS);
    expect(NR_WEIGHTS.decision_sensitivity).toBe(Math.max(...weights));
  });
});

describe('classifyGovernanceBand', () => {
  test('classifies NR-Low (0-24)', () => {
    expect(classifyGovernanceBand(0).band).toBe('NR-Low');
    expect(classifyGovernanceBand(12).band).toBe('NR-Low');
    expect(classifyGovernanceBand(24).band).toBe('NR-Low');
  });

  test('classifies NR-Moderate (25-49)', () => {
    expect(classifyGovernanceBand(25).band).toBe('NR-Moderate');
    expect(classifyGovernanceBand(37).band).toBe('NR-Moderate');
    expect(classifyGovernanceBand(49).band).toBe('NR-Moderate');
  });

  test('classifies NR-High (50-69)', () => {
    expect(classifyGovernanceBand(50).band).toBe('NR-High');
    expect(classifyGovernanceBand(60).band).toBe('NR-High');
    expect(classifyGovernanceBand(69).band).toBe('NR-High');
  });

  test('classifies NR-Critical (70-100)', () => {
    expect(classifyGovernanceBand(70).band).toBe('NR-Critical');
    expect(classifyGovernanceBand(85).band).toBe('NR-Critical');
    expect(classifyGovernanceBand(100).band).toBe('NR-Critical');
  });

  test('provides interpretation for each band', () => {
    expect(classifyGovernanceBand(10).interpretation).toBe('Structural, durable demand');
    expect(classifyGovernanceBand(30).interpretation).toBe('Watch assumptions');
    expect(classifyGovernanceBand(55).interpretation).toBe('Timing & scope risk');
    expect(classifyGovernanceBand(80).interpretation).toBe('Narrative-fragile');
  });

  test('clamps negative scores to NR-Low', () => {
    expect(classifyGovernanceBand(-5).band).toBe('NR-Low');
  });

  test('clamps scores above 100 to NR-Critical', () => {
    expect(classifyGovernanceBand(150).band).toBe('NR-Critical');
  });
});

describe('GOVERNANCE_BANDS', () => {
  test('contains 4 bands', () => {
    expect(GOVERNANCE_BANDS).toHaveLength(4);
  });

  test('bands cover full 0-100 range without gaps', () => {
    expect(GOVERNANCE_BANDS[0].min).toBe(0);
    expect(GOVERNANCE_BANDS[GOVERNANCE_BANDS.length - 1].max).toBe(100);
    for (let i = 1; i < GOVERNANCE_BANDS.length; i++) {
      expect(GOVERNANCE_BANDS[i].min).toBe(GOVERNANCE_BANDS[i - 1].max + 1);
    }
  });
});

describe('NR_WEIGHTS', () => {
  test('contains exactly 4 sub-dimensions', () => {
    expect(Object.keys(NR_WEIGHTS)).toHaveLength(4);
  });

  test('has correct weights per brainstorm spec', () => {
    expect(NR_WEIGHTS.decision_sensitivity).toBe(0.35);
    expect(NR_WEIGHTS.demand_distortion).toBe(0.30);
    expect(NR_WEIGHTS.hype_persistence).toBe(0.20);
    expect(NR_WEIGHTS.influence_exposure).toBe(0.15);
  });
});
