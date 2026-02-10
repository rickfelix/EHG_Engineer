/**
 * Unit Tests: Virality Synthesis Component (Component 9)
 * SD-LEO-ORCH-EVA-STAGE-CONFIGURABLE-001-A
 *
 * Test Coverage:
 * - Successful LLM response parsing
 * - LLM failure fallback to defaults
 * - Score calculation from sub-dimensions
 * - All 7 sub-dimensions present in output
 * - Component field validation
 * - Clamping of out-of-range values
 * - Invalid mechanic type handling
 */

import { describe, test, expect, vi } from 'vitest';
import { analyzeVirality, calculateViralityScore, MECHANIC_TYPES } from '../../../../../lib/eva/stage-zero/synthesis/virality.js';

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
  k_factor: 2.5,
  cycle_time_days: 3,
  mechanic_type: 'inherent',
  channel_fit: 75,
  shareability: 80,
  decay_rate: 0.2,
  organic_ratio: 0.7,
  virality_score: 72,
  growth_loops: [{ name: 'Team invite', description: 'Users invite teammates', strength: 85 }],
  viral_channels: ['email', 'slack'],
  compounding_factors: 'Network effects compound as more teams join',
  risks: ['Requires critical mass per team'],
  summary: 'Strong inherent virality through team collaboration mechanics.',
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

describe('analyzeVirality', () => {
  test('parses valid LLM response with all sub-dimensions', async () => {
    const client = createMockLLMClient(validLLMResponse);
    const result = await analyzeVirality(mockPathOutput, { llmClient: client, logger: silentLogger });

    expect(result.component).toBe('virality_analysis');
    expect(result.k_factor).toBe(2.5);
    expect(result.cycle_time_days).toBe(3);
    expect(result.mechanic_type).toBe('inherent');
    expect(result.channel_fit).toBe(75);
    expect(result.shareability).toBe(80);
    expect(result.decay_rate).toBe(0.2);
    expect(result.organic_ratio).toBe(0.7);
    expect(result.virality_score).toBe(72);
    expect(result.growth_loops).toHaveLength(1);
    expect(result.viral_channels).toEqual(['email', 'slack']);
    expect(result.summary).toBeTruthy();
  });

  test('returns default result when LLM fails', async () => {
    const client = createFailingLLMClient('API unavailable');
    const result = await analyzeVirality(mockPathOutput, { llmClient: client, logger: silentLogger });

    expect(result.component).toBe('virality_analysis');
    expect(result.virality_score).toBe(0);
    expect(result.k_factor).toBe(0);
    expect(result.cycle_time_days).toBe(0);
    expect(result.shareability).toBe(0);
    expect(result.channel_fit).toBe(0);
    expect(result.decay_rate).toBe(0);
    expect(result.organic_ratio).toBe(0);
    expect(result.growth_loops).toEqual([]);
    expect(result.viral_channels).toEqual([]);
    expect(result.summary).toContain('Analysis failed');
  });

  test('returns default result when LLM returns unparseable text', async () => {
    const client = {
      _model: 'test-model',
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ text: 'I cannot analyze this venture in JSON format.' }],
        }),
      },
    };
    const result = await analyzeVirality(mockPathOutput, { llmClient: client, logger: silentLogger });

    expect(result.component).toBe('virality_analysis');
    expect(result.virality_score).toBe(0);
    expect(result.summary).toContain('Could not parse');
  });

  test('clamps out-of-range values', async () => {
    const outOfRange = {
      ...validLLMResponse,
      k_factor: 15,        // max 10
      channel_fit: 150,     // max 100
      shareability: -20,    // min 0
      decay_rate: 2.0,      // max 1
      organic_ratio: -0.5,  // min 0
      virality_score: 120,  // max 100
    };
    const client = createMockLLMClient(outOfRange);
    const result = await analyzeVirality(mockPathOutput, { llmClient: client, logger: silentLogger });

    expect(result.k_factor).toBe(10);
    expect(result.channel_fit).toBe(100);
    expect(result.shareability).toBe(0);
    expect(result.decay_rate).toBe(1);
    expect(result.organic_ratio).toBe(0);
    expect(result.virality_score).toBe(100);
  });

  test('defaults invalid mechanic_type to word_of_mouth', async () => {
    const badMechanic = { ...validLLMResponse, mechanic_type: 'nonexistent_type' };
    const client = createMockLLMClient(badMechanic);
    const result = await analyzeVirality(mockPathOutput, { llmClient: client, logger: silentLogger });

    expect(result.mechanic_type).toBe('word_of_mouth');
  });

  test('has all 7 required sub-dimensions', async () => {
    const client = createMockLLMClient(validLLMResponse);
    const result = await analyzeVirality(mockPathOutput, { llmClient: client, logger: silentLogger });

    const requiredFields = ['k_factor', 'cycle_time_days', 'mechanic_type', 'channel_fit', 'shareability', 'decay_rate', 'organic_ratio'];
    for (const field of requiredFields) {
      expect(result).toHaveProperty(field);
    }
  });
});

describe('calculateViralityScore', () => {
  test('returns 0 for null input', () => {
    expect(calculateViralityScore(null)).toBe(0);
  });

  test('returns near-zero for empty input', () => {
    // Empty object uses default decay_rate=0.5 → (1-0.5)*100*0.10 = 5
    expect(calculateViralityScore({})).toBe(5);
  });

  test('calculates weighted score correctly', () => {
    const dims = {
      k_factor: 5,           // 50/100 * 0.30 = 15
      shareability: 80,      // 80/100 * 0.20 = 16
      channel_fit: 60,       // 60/100 * 0.15 = 9
      organic_ratio: 0.8,    // 80/100 * 0.15 = 12
      cycle_time_days: 3,    // (30-3)/30 * 100 = 90 * 0.10 = 9
      decay_rate: 0.2,       // (1-0.2)*100 = 80 * 0.10 = 8
    };
    const score = calculateViralityScore(dims);
    // Expected: 15 + 16 + 9 + 12 + 9 + 8 = 69
    expect(score).toBe(69);
  });

  test('returns score in 0-100 range for extreme values', () => {
    const maxDims = {
      k_factor: 10,
      shareability: 100,
      channel_fit: 100,
      organic_ratio: 1.0,
      cycle_time_days: 0,
      decay_rate: 0,
    };
    const score = calculateViralityScore(maxDims);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  test('handles 30+ day cycle time as zero contribution', () => {
    const dims = { cycle_time_days: 45, decay_rate: 1 };
    const score = calculateViralityScore(dims);
    // cycle_time at 45 days = 0, decay_rate at 1 (full decay) = 0
    expect(score).toBe(0);
  });
});

describe('MECHANIC_TYPES', () => {
  test('contains all 4 mechanic types', () => {
    expect(MECHANIC_TYPES).toEqual(['inherent', 'manufactured', 'word_of_mouth', 'incentivized']);
  });
});
