import { describe, test, expect, vi } from 'vitest';
import {
  evaluateDesignPotential,
  DESIGN_DIMENSIONS,
  DESIGN_RECOMMENDATIONS,
} from '../../../../../lib/eva/stage-zero/synthesis/design-evaluation.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockLLMClient(responseJson) {
  return {
    _model: 'test-model',
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ text: JSON.stringify(responseJson) }],
        usage: { input_tokens: 100, output_tokens: 200 },
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

const mockPathOutput = {
  suggested_name: 'DesignFirst',
  suggested_problem: 'Poor UX in enterprise dashboards',
  suggested_solution: 'AI-powered adaptive interfaces',
  target_market: 'Enterprise SaaS teams',
};

const validLLMResponse = {
  dimensions: {
    ux_simplicity: 8,
    design_differentiation: 7,
    adoption_friction: 6,
    design_scalability: 7,
    aesthetic_moat: 5,
    machine_interface_quality: 6,
  },
  composite_score: 65,
  design_risks: ['Complex onboarding flow'],
  design_opportunities: ['AI-driven personalization'],
  recommendation: 'design_standard',
  summary: 'Solid design potential with room for improvement in aesthetic moat.',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('evaluateDesignPotential', () => {
  test('returns valid result for a well-formed LLM response', async () => {
    const client = createMockLLMClient(validLLMResponse);
    const result = await evaluateDesignPotential(mockPathOutput, {
      logger: silentLogger,
      llmClient: client,
    });

    expect(result.component).toBe('design_evaluation');
    expect(result.dimensions.ux_simplicity).toBe(8);
    expect(result.dimensions.design_differentiation).toBe(7);
    expect(result.dimensions.adoption_friction).toBe(6);
    expect(result.dimensions.design_scalability).toBe(7);
    expect(result.dimensions.aesthetic_moat).toBe(5);
    expect(result.composite_score).toBe(65);
    expect(result.recommendation).toBe('design_standard');
    expect(result.design_risks).toEqual(['Complex onboarding flow']);
    expect(result.design_opportunities).toEqual(['AI-driven personalization']);
    expect(result.summary).toBeTruthy();
  });

  test('calls LLM client with correct structure', async () => {
    const client = createMockLLMClient(validLLMResponse);
    await evaluateDesignPotential(mockPathOutput, {
      logger: silentLogger,
      llmClient: client,
    });

    expect(client.messages.create).toHaveBeenCalledTimes(1);
    const callArgs = client.messages.create.mock.calls[0][0];
    expect(callArgs.model).toBe('test-model');
    expect(callArgs.max_tokens).toBe(1500);
    expect(callArgs.messages).toHaveLength(1);
    expect(callArgs.messages[0].role).toBe('user');
    expect(callArgs.messages[0].content).toContain('DesignFirst');
  });

  test('returns default result when LLM response is unparseable', async () => {
    const client = {
      _model: 'test-model',
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ text: 'This is not JSON at all' }],
          usage: { input_tokens: 50, output_tokens: 30 },
        }),
      },
    };

    const result = await evaluateDesignPotential(mockPathOutput, {
      logger: silentLogger,
      llmClient: client,
    });

    expect(result.component).toBe('design_evaluation');
    expect(result.composite_score).toBe(0);
    expect(result.recommendation).toBe('design_minimal');
    expect(result.summary).toContain('Could not parse');
  });

  test('returns default result when LLM throws an error', async () => {
    const client = createFailingLLMClient('API rate limit exceeded');
    const result = await evaluateDesignPotential(mockPathOutput, {
      logger: silentLogger,
      llmClient: client,
    });

    expect(result.component).toBe('design_evaluation');
    expect(result.composite_score).toBe(0);
    expect(result.recommendation).toBe('design_minimal');
    expect(result.summary).toContain('Evaluation failed');
    expect(result.summary).toContain('API rate limit exceeded');
  });

  test('clamps out-of-range dimension values', async () => {
    const response = {
      ...validLLMResponse,
      dimensions: {
        ux_simplicity: 15,
        design_differentiation: -3,
        adoption_friction: 10.7,
        design_scalability: 0,
        aesthetic_moat: 100,
      },
    };
    const client = createMockLLMClient(response);
    const result = await evaluateDesignPotential(mockPathOutput, {
      logger: silentLogger,
      llmClient: client,
    });

    expect(result.dimensions.ux_simplicity).toBe(10);
    expect(result.dimensions.design_differentiation).toBe(0);
    expect(result.dimensions.adoption_friction).toBe(10);
    expect(result.dimensions.design_scalability).toBe(0);
    expect(result.dimensions.aesthetic_moat).toBe(10);
  });

  test('handles non-finite dimension values gracefully', async () => {
    const response = {
      ...validLLMResponse,
      dimensions: {
        ux_simplicity: 'not a number',
        design_differentiation: null,
        adoption_friction: undefined,
        design_scalability: NaN,
        aesthetic_moat: Infinity,
      },
    };
    const client = createMockLLMClient(response);
    const result = await evaluateDesignPotential(mockPathOutput, {
      logger: silentLogger,
      llmClient: client,
    });

    // NaN, null, undefined, non-numeric strings → 0
    expect(result.dimensions.ux_simplicity).toBe(0);
    expect(result.dimensions.design_differentiation).toBe(0);
    expect(result.dimensions.adoption_friction).toBe(0);
    expect(result.dimensions.design_scalability).toBe(0);
    // Infinity is not finite → 0
    expect(result.dimensions.aesthetic_moat).toBe(0);
  });

  test('recomputes composite_score when LLM returns non-numeric value', async () => {
    const response = {
      ...validLLMResponse,
      composite_score: 'high',
    };
    const client = createMockLLMClient(response);
    const result = await evaluateDesignPotential(mockPathOutput, {
      logger: silentLogger,
      llmClient: client,
    });

    // Falls back to computeComposite: (8+7+6+7+5+6)/6 * 10 = 65
    expect(result.composite_score).toBe(65);
  });

  test('infers recommendation when LLM returns invalid value', async () => {
    const response = {
      ...validLLMResponse,
      recommendation: 'something_invalid',
      composite_score: 75,
    };
    const client = createMockLLMClient(response);
    const result = await evaluateDesignPotential(mockPathOutput, {
      logger: silentLogger,
      llmClient: client,
    });

    // composite >= 70 → design_led
    expect(result.recommendation).toBe('design_led');
  });

  test('infers design_minimal for low composite scores', async () => {
    const response = {
      ...validLLMResponse,
      recommendation: 'bogus',
      composite_score: 30,
    };
    const client = createMockLLMClient(response);
    const result = await evaluateDesignPotential(mockPathOutput, {
      logger: silentLogger,
      llmClient: client,
    });

    expect(result.recommendation).toBe('design_minimal');
  });

  test('clamps composite_score to 0-100 range', async () => {
    const response = {
      ...validLLMResponse,
      composite_score: 150,
    };
    const client = createMockLLMClient(response);
    const result = await evaluateDesignPotential(mockPathOutput, {
      logger: silentLogger,
      llmClient: client,
    });

    expect(result.composite_score).toBeLessThanOrEqual(100);
    expect(result.composite_score).toBeGreaterThanOrEqual(0);
  });

  test('defaults design_risks and design_opportunities to empty arrays', async () => {
    const response = {
      ...validLLMResponse,
      design_risks: 'not an array',
      design_opportunities: null,
    };
    const client = createMockLLMClient(response);
    const result = await evaluateDesignPotential(mockPathOutput, {
      logger: silentLogger,
      llmClient: client,
    });

    expect(result.design_risks).toEqual([]);
    expect(result.design_opportunities).toEqual([]);
  });

  test('handles empty content array from LLM', async () => {
    const client = {
      _model: 'test-model',
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [],
          usage: { input_tokens: 10, output_tokens: 0 },
        }),
      },
    };

    const result = await evaluateDesignPotential(mockPathOutput, {
      logger: silentLogger,
      llmClient: client,
    });

    expect(result.component).toBe('design_evaluation');
    expect(result.composite_score).toBe(0);
    expect(result.recommendation).toBe('design_minimal');
  });

  test('extracts usage from LLM response', async () => {
    const client = createMockLLMClient(validLLMResponse);
    const result = await evaluateDesignPotential(mockPathOutput, {
      logger: silentLogger,
      llmClient: client,
    });

    expect(result).toHaveProperty('usage');
  });

  test('returns all required fields in result shape', async () => {
    const client = createMockLLMClient(validLLMResponse);
    const result = await evaluateDesignPotential(mockPathOutput, {
      logger: silentLogger,
      llmClient: client,
    });

    const requiredFields = [
      'component',
      'dimensions',
      'composite_score',
      'design_risks',
      'design_opportunities',
      'recommendation',
      'summary',
      'usage',
    ];
    for (const field of requiredFields) {
      expect(result).toHaveProperty(field);
    }
  });
});

describe('DESIGN_DIMENSIONS', () => {
  test('contains exactly 6 dimensions', () => {
    expect(DESIGN_DIMENSIONS).toHaveLength(6);
  });

  test('includes all expected dimension keys', () => {
    expect(DESIGN_DIMENSIONS).toContain('ux_simplicity');
    expect(DESIGN_DIMENSIONS).toContain('design_differentiation');
    expect(DESIGN_DIMENSIONS).toContain('adoption_friction');
    expect(DESIGN_DIMENSIONS).toContain('design_scalability');
    expect(DESIGN_DIMENSIONS).toContain('aesthetic_moat');
    expect(DESIGN_DIMENSIONS).toContain('machine_interface_quality');
  });
});

describe('DESIGN_RECOMMENDATIONS', () => {
  test('contains exactly 3 recommendation types', () => {
    expect(DESIGN_RECOMMENDATIONS).toHaveLength(3);
  });

  test('includes all expected recommendation values', () => {
    expect(DESIGN_RECOMMENDATIONS).toContain('design_led');
    expect(DESIGN_RECOMMENDATIONS).toContain('design_standard');
    expect(DESIGN_RECOMMENDATIONS).toContain('design_minimal');
  });
});
