/**
 * Unit Tests: Technology Trajectory Synthesis Component (Component 12)
 * SD-LEO-FEAT-TECHNOLOGY-TRAJECTORY-MODEL-001
 *
 * Test Coverage:
 * - Successful LLM response parsing with all 3 axes
 * - LLM failure fallback to defaults
 * - Composite score calculation from weighted base-case projections
 * - Competitive timing signal validation (opening/closing/contested)
 * - Bull/base/bear band presence per axis
 * - Clamping of out-of-range values
 * - Confidence caveat included
 * - Axis weight verification (RA=40%, CD=35%, ME=25%)
 * - Stubbed data feed interface
 */

import { describe, test, expect, vi } from 'vitest';
import {
  analyzeTechTrajectory,
  calculateTrajectoryScore,
  AXIS_WEIGHTS,
  TIMING_SIGNALS,
} from '../../../../../lib/eva/stage-zero/synthesis/tech-trajectory.js';

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
  axes: {
    reasoning_autonomy: {
      current: 65,
      bull_6m: 85,
      base_6m: 75,
      bear_6m: 68,
      venture_impact: 'Improved reasoning enables autonomous workflow management',
    },
    cost_deflation: {
      current: 50,
      bull_6m: 80,
      base_6m: 65,
      bear_6m: 45,
      venture_impact: 'Lower costs make per-user AI features viable',
    },
    multimodal_expansion: {
      current: 40,
      bull_6m: 70,
      base_6m: 55,
      bear_6m: 42,
      venture_impact: 'Vision enables document analysis in workspace',
    },
  },
  competitive_timing: {
    signal: 'opening',
    confidence: 0.7,
    window_months: 6,
    rationale: 'Reasoning improvements create new moat opportunities',
  },
  next_disruption_event: {
    event: 'Next-gen model release',
    estimated_months: 4,
    invalidation_scope: 'Cost assumptions may need revision',
  },
  gap_windows: [
    { capability: 'Agent orchestration', opens_when: 'Q2 2026', venture_relevance: 'Enables autonomous team workflows' },
  ],
  confidence_caveat: 'Framework-informed projections. Not real-time signals.',
  summary: 'Strong trajectory alignment. Build window opening as reasoning capabilities enable core features.',
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

describe('analyzeTechTrajectory', () => {
  test('parses valid LLM response with all 3 axes', async () => {
    const client = createMockLLMClient(validLLMResponse);
    const result = await analyzeTechTrajectory(mockPathOutput, { llmClient: client, logger: silentLogger });

    expect(result.component).toBe('tech_trajectory');
    expect(result.axes.reasoning_autonomy.current).toBe(65);
    expect(result.axes.reasoning_autonomy.bull_6m).toBe(85);
    expect(result.axes.reasoning_autonomy.base_6m).toBe(75);
    expect(result.axes.reasoning_autonomy.bear_6m).toBe(68);
    expect(result.axes.cost_deflation.base_6m).toBe(65);
    expect(result.axes.multimodal_expansion.base_6m).toBe(55);
    expect(result.confidence_caveat).toBeTruthy();
    expect(result.summary).toBeTruthy();
  });

  test('calculates correct composite trajectory score from base-case projections', async () => {
    const client = createMockLLMClient(validLLMResponse);
    const result = await analyzeTechTrajectory(mockPathOutput, { llmClient: client, logger: silentLogger });

    // RA=75*0.40=30, CD=65*0.35=22.75, ME=55*0.25=13.75 → 66.5 → rounded to 67
    expect(result.trajectory_score).toBe(67);
  });

  test('returns correct competitive timing signal', async () => {
    const client = createMockLLMClient(validLLMResponse);
    const result = await analyzeTechTrajectory(mockPathOutput, { llmClient: client, logger: silentLogger });

    expect(result.competitive_timing.signal).toBe('opening');
    expect(result.competitive_timing.confidence).toBe(0.7);
    expect(result.competitive_timing.window_months).toBe(6);
    expect(result.competitive_timing.rationale).toBeTruthy();
  });

  test('includes next disruption event', async () => {
    const client = createMockLLMClient(validLLMResponse);
    const result = await analyzeTechTrajectory(mockPathOutput, { llmClient: client, logger: silentLogger });

    expect(result.next_disruption_event.event).toBe('Next-gen model release');
    expect(result.next_disruption_event.estimated_months).toBe(4);
    expect(result.next_disruption_event.invalidation_scope).toBeTruthy();
  });

  test('includes gap windows array', async () => {
    const client = createMockLLMClient(validLLMResponse);
    const result = await analyzeTechTrajectory(mockPathOutput, { llmClient: client, logger: silentLogger });

    expect(result.gap_windows).toHaveLength(1);
    expect(result.gap_windows[0]).toHaveProperty('capability');
  });

  test('returns default result when LLM fails', async () => {
    const client = createFailingLLMClient('API unavailable');
    const result = await analyzeTechTrajectory(mockPathOutput, { llmClient: client, logger: silentLogger });

    expect(result.component).toBe('tech_trajectory');
    expect(result.trajectory_score).toBe(0);
    expect(result.axes.reasoning_autonomy.current).toBe(0);
    expect(result.axes.cost_deflation.current).toBe(0);
    expect(result.axes.multimodal_expansion.current).toBe(0);
    expect(result.competitive_timing.signal).toBe('contested');
    expect(result.competitive_timing.confidence).toBe(0);
    expect(result.gap_windows).toEqual([]);
    expect(result.summary).toContain('Analysis failed');
    expect(result.data_feed_active).toBe(false);
  });

  test('returns default result when LLM returns unparseable text', async () => {
    const client = {
      _model: 'test-model',
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ text: 'I cannot analyze technology trajectory in JSON format.' }],
        }),
      },
    };
    const result = await analyzeTechTrajectory(mockPathOutput, { llmClient: client, logger: silentLogger });

    expect(result.component).toBe('tech_trajectory');
    expect(result.trajectory_score).toBe(0);
    expect(result.summary).toContain('Could not parse');
  });

  test('clamps out-of-range axis values', async () => {
    const outOfRange = {
      ...validLLMResponse,
      axes: {
        reasoning_autonomy: { current: 150, bull_6m: 200, base_6m: -10, bear_6m: 300, venture_impact: 'test' },
        cost_deflation: { current: -50, bull_6m: -20, base_6m: 110, bear_6m: -100, venture_impact: 'test' },
        multimodal_expansion: { current: 999, bull_6m: 0, base_6m: 50, bear_6m: 0, venture_impact: 'test' },
      },
    };
    const client = createMockLLMClient(outOfRange);
    const result = await analyzeTechTrajectory(mockPathOutput, { llmClient: client, logger: silentLogger });

    expect(result.axes.reasoning_autonomy.current).toBe(100);
    expect(result.axes.reasoning_autonomy.bull_6m).toBe(100);
    expect(result.axes.reasoning_autonomy.base_6m).toBe(0);
    expect(result.axes.cost_deflation.current).toBe(0);
    expect(result.axes.cost_deflation.base_6m).toBe(100);
    expect(result.axes.multimodal_expansion.current).toBe(100);
  });

  test('defaults invalid timing signal to contested', async () => {
    const badTiming = {
      ...validLLMResponse,
      competitive_timing: { signal: 'unknown_signal', confidence: 0.5, window_months: 3, rationale: 'test' },
    };
    const client = createMockLLMClient(badTiming);
    const result = await analyzeTechTrajectory(mockPathOutput, { llmClient: client, logger: silentLogger });

    expect(result.competitive_timing.signal).toBe('contested');
  });

  test('clamps timing confidence to 0-1 range', async () => {
    const badConfidence = {
      ...validLLMResponse,
      competitive_timing: { signal: 'opening', confidence: 2.5, window_months: 3, rationale: 'test' },
    };
    const client = createMockLLMClient(badConfidence);
    const result = await analyzeTechTrajectory(mockPathOutput, { llmClient: client, logger: silentLogger });

    expect(result.competitive_timing.confidence).toBe(1);
  });

  test('provides default confidence caveat when LLM omits it', async () => {
    const noCaveat = { ...validLLMResponse };
    delete noCaveat.confidence_caveat;
    const client = createMockLLMClient(noCaveat);
    const result = await analyzeTechTrajectory(mockPathOutput, { llmClient: client, logger: silentLogger });

    expect(result.confidence_caveat).toContain('Framework-informed');
  });

  test('handles non-array gap_windows gracefully', async () => {
    const badGaps = { ...validLLMResponse, gap_windows: 'not an array' };
    const client = createMockLLMClient(badGaps);
    const result = await analyzeTechTrajectory(mockPathOutput, { llmClient: client, logger: silentLogger });

    expect(result.gap_windows).toEqual([]);
  });

  test('has all 3 required axes in output', async () => {
    const client = createMockLLMClient(validLLMResponse);
    const result = await analyzeTechTrajectory(mockPathOutput, { llmClient: client, logger: silentLogger });

    const requiredAxes = ['reasoning_autonomy', 'cost_deflation', 'multimodal_expansion'];
    for (const axis of requiredAxes) {
      expect(result.axes).toHaveProperty(axis);
      expect(result.axes[axis]).toHaveProperty('current');
      expect(result.axes[axis]).toHaveProperty('bull_6m');
      expect(result.axes[axis]).toHaveProperty('base_6m');
      expect(result.axes[axis]).toHaveProperty('bear_6m');
    }
  });

  test('data_feed_active reflects deps.dataFeed presence', async () => {
    const client = createMockLLMClient(validLLMResponse);

    const resultNoFeed = await analyzeTechTrajectory(mockPathOutput, { llmClient: client, logger: silentLogger });
    expect(resultNoFeed.data_feed_active).toBe(false);

    const mockDataFeed = { getTechSignals: vi.fn().mockResolvedValue({ signal: 'test' }) };
    const resultWithFeed = await analyzeTechTrajectory(mockPathOutput, { llmClient: client, logger: silentLogger, dataFeed: mockDataFeed });
    expect(resultWithFeed.data_feed_active).toBe(true);
  });
});

describe('calculateTrajectoryScore', () => {
  test('returns 0 for null input', () => {
    expect(calculateTrajectoryScore(null)).toBe(0);
  });

  test('returns 0 for empty axes', () => {
    expect(calculateTrajectoryScore({})).toBe(0);
  });

  test('calculates weighted score correctly', () => {
    const axes = {
      reasoning_autonomy: { base_6m: 80 },   // 80 * 0.40 = 32
      cost_deflation: { base_6m: 60 },        // 60 * 0.35 = 21
      multimodal_expansion: { base_6m: 40 },  // 40 * 0.25 = 10
    };
    const score = calculateTrajectoryScore(axes);
    // 32 + 21 + 10 = 63
    expect(score).toBe(63);
  });

  test('returns 100 for maximum values', () => {
    const maxAxes = {
      reasoning_autonomy: { base_6m: 100 },
      cost_deflation: { base_6m: 100 },
      multimodal_expansion: { base_6m: 100 },
    };
    expect(calculateTrajectoryScore(maxAxes)).toBe(100);
  });

  test('uses base_6m for scoring, not bull or bear', () => {
    const axes = {
      reasoning_autonomy: { current: 50, bull_6m: 100, base_6m: 70, bear_6m: 40 },
      cost_deflation: { current: 30, bull_6m: 90, base_6m: 50, bear_6m: 20 },
      multimodal_expansion: { current: 20, bull_6m: 80, base_6m: 40, bear_6m: 10 },
    };
    // RA=70*0.40=28, CD=50*0.35=17.5, ME=40*0.25=10 → 55.5 → 56
    expect(calculateTrajectoryScore(axes)).toBe(56);
  });
});

describe('AXIS_WEIGHTS', () => {
  test('contains exactly 3 axes', () => {
    expect(Object.keys(AXIS_WEIGHTS)).toHaveLength(3);
  });

  test('weights sum to 1.0', () => {
    const weightSum = Object.values(AXIS_WEIGHTS).reduce((sum, w) => sum + w, 0);
    expect(weightSum).toBeCloseTo(1.0, 10);
  });

  test('Reasoning & Autonomy has highest weight (40%)', () => {
    expect(AXIS_WEIGHTS.reasoning_autonomy).toBe(0.40);
    const weights = Object.values(AXIS_WEIGHTS);
    expect(AXIS_WEIGHTS.reasoning_autonomy).toBe(Math.max(...weights));
  });

  test('has correct weights per spec', () => {
    expect(AXIS_WEIGHTS.reasoning_autonomy).toBe(0.40);
    expect(AXIS_WEIGHTS.cost_deflation).toBe(0.35);
    expect(AXIS_WEIGHTS.multimodal_expansion).toBe(0.25);
  });
});

describe('TIMING_SIGNALS', () => {
  test('contains exactly 3 signals', () => {
    expect(TIMING_SIGNALS).toHaveLength(3);
  });

  test('contains opening, closing, contested', () => {
    expect(TIMING_SIGNALS).toContain('opening');
    expect(TIMING_SIGNALS).toContain('closing');
    expect(TIMING_SIGNALS).toContain('contested');
  });
});
