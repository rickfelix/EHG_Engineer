/**
 * Tests for Guardrail Intelligence Analyzer
 * SD-MAN-GEN-CORRECTIVE-VISION-GAP-002
 *
 * Verifies LLM-driven analysis, parallel execution, deterministic fallback,
 * cost tracking, and persistence to intelligence_analysis table.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  analyzeGuardrailResults,
  buildDeterministicFallback,
  getAnalysisHistory,
} from '../../../lib/governance/guardrail-intelligence-analyzer.js';

// --- Test fixtures ---

const SAMPLE_SD = {
  title: 'Implement user auth module',
  sd_type: 'feature',
  priority: 'high',
  scope: 'Auth service with JWT tokens',
  strategic_objectives: [{ id: 'OKR-1', name: 'Security' }],
};

const PASSING_GUARDRAILS = {
  passed: true,
  violations: [],
  warnings: [],
};

const FAILING_GUARDRAILS = {
  passed: false,
  violations: [
    {
      guardrail: 'GR-VISION-ALIGNMENT',
      name: 'Vision Alignment Minimum',
      mode: 'blocking',
      severity: 'critical',
      message: 'Vision alignment score 20/100 is below minimum threshold (30).',
    },
    {
      guardrail: 'GR-SCOPE-BOUNDARY',
      name: 'Scope Boundary Enforcement',
      mode: 'blocking',
      severity: 'high',
      message: 'Infrastructure SD includes frontend/UI scope.',
    },
  ],
  warnings: [
    {
      guardrail: 'GR-RISK-ASSESSMENT',
      name: 'Risk Assessment Required',
      mode: 'advisory',
      severity: 'medium',
      message: 'High-priority SD has no risks identified.',
    },
  ],
};

/** Factory for mock LLM clients */
function createMockLlmClient(responses = {}) {
  const defaultResponses = {
    riskAssessment: {
      content: JSON.stringify({
        overall_risk: 'high',
        risk_factors: [{ factor: 'scope', severity: 'high', rationale: 'Broad scope' }],
        mitigation_suggestions: ['Narrow scope to core auth'],
      }),
      cost: 5,
    },
    patternAnalysis: {
      content: JSON.stringify({
        patterns_detected: [{ pattern: 'scope-creep', frequency_signal: 'recurring', impact: 'Delays' }],
        strategic_alignment_notes: 'Aligned with security OKR',
        cross_sd_implications: ['May affect SD-AUTH-002'],
      }),
      cost: 5,
    },
    recommendations: {
      content: JSON.stringify({
        recommended_actions: [{ action: 'Split SD', priority: 'immediate', rationale: 'Too broad' }],
        governance_adjustments: [],
        escalation_needed: false,
        escalation_reason: null,
      }),
      cost: 5,
    },
  };

  const merged = { ...defaultResponses, ...responses };
  let callIndex = 0;
  const dimensions = ['riskAssessment', 'patternAnalysis', 'recommendations'];

  return {
    analyze: vi.fn(async () => {
      const dim = dimensions[callIndex % dimensions.length];
      callIndex++;
      const resp = merged[dim];
      if (resp instanceof Error) throw resp;
      return resp;
    }),
    _callIndex: () => callIndex,
  };
}

/** Factory for mock Supabase client */
function createMockSupabase(insertResult = {}) {
  const defaultResult = {
    data: { id: 'analysis-uuid-001' },
    error: null,
    ...insertResult,
  };

  const chainable = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(defaultResult),
    eq: vi.fn().mockReturnThis(),
    contains: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
  };

  return {
    from: vi.fn(() => chainable),
    _chain: chainable,
  };
}

// --- Tests ---

describe('Guardrail Intelligence Analyzer - analyzeGuardrailResults', () => {
  it('returns deterministic fallback when no LLM client provided', async () => {
    const result = await analyzeGuardrailResults(SAMPLE_SD, PASSING_GUARDRAILS);

    expect(result.analysisId).toBeNull();
    expect(result.riskAssessment).toBeDefined();
    expect(result.patternAnalysis).toBeDefined();
    expect(result.recommendations).toBeDefined();
    expect(result.cost.totalCost).toBe(0);
    expect(result.cost.posture).toBe('enforcement');
    expect(result.meta.errors).toContain('No LLM client provided — using deterministic fallback');
  });

  it('returns deterministic fallback when llmClient lacks analyze method', async () => {
    const result = await analyzeGuardrailResults(SAMPLE_SD, PASSING_GUARDRAILS, {
      llmClient: { notAnalyze: () => {} },
    });

    expect(result.meta.errors).toContain('No LLM client provided — using deterministic fallback');
    expect(result.cost.totalCost).toBe(0);
  });

  it('calls LLM for all 3 dimensions with valid client', async () => {
    const llmClient = createMockLlmClient();

    const result = await analyzeGuardrailResults(SAMPLE_SD, FAILING_GUARDRAILS, { llmClient });

    expect(llmClient.analyze).toHaveBeenCalledTimes(3);
    expect(result.riskAssessment.overall_risk).toBe('high');
    expect(result.patternAnalysis.patterns_detected).toHaveLength(1);
    expect(result.recommendations.recommended_actions).toHaveLength(1);
    expect(result.meta.dimensions).toBe(3);
    expect(result.meta.partial).toBe(false);
  });

  it('tracks cost from LLM responses', async () => {
    const llmClient = createMockLlmClient();

    const result = await analyzeGuardrailResults(SAMPLE_SD, PASSING_GUARDRAILS, { llmClient });

    expect(result.cost.totalCost).toBe(15); // 5 per dimension * 3
    expect(result.cost.evaluation).toBeDefined();
    expect(result.cost.evaluation.level).toBe('normal'); // 15 < EXEC warn threshold (200)
    expect(result.cost.posture).toBe('enforcement');
  });

  it('handles partial LLM failures gracefully', async () => {
    const llmClient = createMockLlmClient({
      patternAnalysis: new Error('LLM timeout'),
    });

    const result = await analyzeGuardrailResults(SAMPLE_SD, FAILING_GUARDRAILS, { llmClient });

    expect(result.meta.partial).toBe(true);
    expect(result.meta.errors.length).toBeGreaterThan(0);
    // patternAnalysis should fall back to deterministic
    expect(result.patternAnalysis).toBeDefined();
    expect(result.patternAnalysis.patterns_detected).toBeDefined();
    // Other dimensions should have LLM results
    expect(result.riskAssessment.overall_risk).toBe('high');
  });

  it('respects concurrency setting', async () => {
    let maxConcurrent = 0;
    let currentConcurrent = 0;

    const llmClient = {
      analyze: vi.fn(async (prompt) => {
        currentConcurrent++;
        if (currentConcurrent > maxConcurrent) maxConcurrent = currentConcurrent;
        await new Promise(r => setTimeout(r, 10));
        currentConcurrent--;
        return { content: JSON.stringify({ overall_risk: 'low', risk_factors: [], mitigation_suggestions: [] }), cost: 1 };
      }),
    };

    // With concurrency=1, max should be 1
    await analyzeGuardrailResults(SAMPLE_SD, PASSING_GUARDRAILS, {
      llmClient,
      concurrency: 1,
    });

    expect(maxConcurrent).toBe(1);
  });

  it('persists to intelligence_analysis table when supabase provided', async () => {
    const llmClient = createMockLlmClient();
    const supabase = createMockSupabase();

    const result = await analyzeGuardrailResults(SAMPLE_SD, PASSING_GUARDRAILS, {
      llmClient,
      supabase,
      sdKey: 'SD-TEST-001',
    });

    expect(result.analysisId).toBe('analysis-uuid-001');
    expect(supabase.from).toHaveBeenCalledWith('intelligence_analysis');
    expect(supabase._chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        agent_type: 'guardrail_intelligence',
        status: 'COMPLETED',
        results: expect.objectContaining({
          sd_key: 'SD-TEST-001',
        }),
      }),
    );
  });

  it('handles persistence failure gracefully', async () => {
    const llmClient = createMockLlmClient();
    const supabase = createMockSupabase({
      data: null,
      error: { message: 'Connection refused' },
    });

    const result = await analyzeGuardrailResults(SAMPLE_SD, PASSING_GUARDRAILS, {
      llmClient,
      supabase,
      sdKey: 'SD-TEST-001',
    });

    expect(result.analysisId).toBeNull();
    expect(result.meta.errors).toContainEqual(expect.stringContaining('persist'));
  });

  it('skips persistence when no supabase or sdKey', async () => {
    const llmClient = createMockLlmClient();

    const result = await analyzeGuardrailResults(SAMPLE_SD, PASSING_GUARDRAILS, { llmClient });

    expect(result.analysisId).toBeNull();
    expect(result.meta.errors).toHaveLength(0);
  });

  it('includes timing metadata', async () => {
    const llmClient = createMockLlmClient();

    const result = await analyzeGuardrailResults(SAMPLE_SD, PASSING_GUARDRAILS, { llmClient });

    expect(result.meta.analyzedAt).toBeDefined();
    expect(typeof result.meta.durationMs).toBe('number');
    expect(result.meta.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe('Guardrail Intelligence Analyzer - buildDeterministicFallback', () => {
  it('returns critical risk for critical violations', () => {
    const result = buildDeterministicFallback(SAMPLE_SD, FAILING_GUARDRAILS);

    expect(result.riskAssessment.overall_risk).toBe('critical');
    expect(result.riskAssessment.risk_factors).toHaveLength(2);
    expect(result.recommendations.escalation_needed).toBe(true);
  });

  it('returns low risk when all guardrails pass', () => {
    const result = buildDeterministicFallback(SAMPLE_SD, PASSING_GUARDRAILS);

    expect(result.riskAssessment.overall_risk).toBe('low');
    expect(result.riskAssessment.risk_factors).toHaveLength(0);
    expect(result.recommendations.escalation_needed).toBe(false);
    expect(result.patternAnalysis.strategic_alignment_notes).toContain('passed');
  });

  it('returns medium risk for multiple warnings without violations', () => {
    const manyWarnings = {
      passed: true,
      violations: [],
      warnings: [
        { guardrail: 'GR-A', severity: 'low', message: 'a' },
        { guardrail: 'GR-B', severity: 'low', message: 'b' },
        { guardrail: 'GR-C', severity: 'low', message: 'c' },
      ],
    };

    const result = buildDeterministicFallback(SAMPLE_SD, manyWarnings);

    expect(result.riskAssessment.overall_risk).toBe('medium');
  });

  it('returns high risk for non-critical violations', () => {
    const highViolation = {
      passed: false,
      violations: [{ guardrail: 'GR-X', severity: 'high', message: 'high issue' }],
      warnings: [],
    };

    const result = buildDeterministicFallback(SAMPLE_SD, highViolation);

    expect(result.riskAssessment.overall_risk).toBe('high');
  });

  it('maps violations to recommended actions with correct priority', () => {
    const result = buildDeterministicFallback(SAMPLE_SD, FAILING_GUARDRAILS);

    const actions = result.recommendations.recommended_actions;
    expect(actions).toHaveLength(2);
    expect(actions[0].priority).toBe('immediate'); // critical severity
    expect(actions[1].priority).toBe('soon'); // high severity
  });

  it('maps warnings to detected patterns', () => {
    const result = buildDeterministicFallback(SAMPLE_SD, FAILING_GUARDRAILS);

    expect(result.patternAnalysis.patterns_detected).toHaveLength(1);
    expect(result.patternAnalysis.patterns_detected[0].pattern).toBe('GR-RISK-ASSESSMENT');
    expect(result.patternAnalysis.patterns_detected[0].frequency_signal).toBe('new');
  });

  it('has zero cost for deterministic fallback', () => {
    const result = buildDeterministicFallback(SAMPLE_SD, PASSING_GUARDRAILS);

    expect(result.cost.totalCost).toBe(0);
    expect(result.cost.posture).toBe('enforcement');
  });

  it('returns complete structure with all required fields', () => {
    const result = buildDeterministicFallback(SAMPLE_SD, PASSING_GUARDRAILS);

    // Top-level
    expect(result).toHaveProperty('analysisId');
    expect(result).toHaveProperty('riskAssessment');
    expect(result).toHaveProperty('patternAnalysis');
    expect(result).toHaveProperty('recommendations');
    expect(result).toHaveProperty('cost');
    expect(result).toHaveProperty('meta');

    // Risk assessment shape
    expect(result.riskAssessment).toHaveProperty('overall_risk');
    expect(result.riskAssessment).toHaveProperty('risk_factors');
    expect(result.riskAssessment).toHaveProperty('mitigation_suggestions');

    // Pattern analysis shape
    expect(result.patternAnalysis).toHaveProperty('patterns_detected');
    expect(result.patternAnalysis).toHaveProperty('strategic_alignment_notes');
    expect(result.patternAnalysis).toHaveProperty('cross_sd_implications');

    // Recommendations shape
    expect(result.recommendations).toHaveProperty('recommended_actions');
    expect(result.recommendations).toHaveProperty('governance_adjustments');
    expect(result.recommendations).toHaveProperty('escalation_needed');
    expect(result.recommendations).toHaveProperty('escalation_reason');
  });
});

describe('Guardrail Intelligence Analyzer - getAnalysisHistory', () => {
  it('queries intelligence_analysis table with correct filters', async () => {
    const supabase = createMockSupabase();

    await getAnalysisHistory(supabase, { sdKey: 'SD-TEST-001', limit: 5 });

    expect(supabase.from).toHaveBeenCalledWith('intelligence_analysis');
    expect(supabase._chain.eq).toHaveBeenCalledWith('agent_type', 'guardrail_intelligence');
    expect(supabase._chain.eq).toHaveBeenCalledWith('status', 'COMPLETED');
    expect(supabase._chain.contains).toHaveBeenCalledWith('results', { sd_key: 'SD-TEST-001' });
  });

  it('returns empty array on error', async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: null, error: { message: 'fail' } }),
      })),
    };

    const result = await getAnalysisHistory(supabase);

    expect(result).toEqual([]);
  });

  it('uses default limit of 10', async () => {
    const supabase = createMockSupabase();

    await getAnalysisHistory(supabase);

    expect(supabase._chain.limit).toHaveBeenCalledWith(10);
  });
});

describe('Guardrail Intelligence Analyzer - LLM Response Parsing', () => {
  it('handles JSON in markdown code blocks', async () => {
    const llmClient = {
      analyze: vi.fn(async () => ({
        content: '```json\n{"overall_risk":"low","risk_factors":[],"mitigation_suggestions":[]}\n```',
        cost: 1,
      })),
    };

    const result = await analyzeGuardrailResults(SAMPLE_SD, PASSING_GUARDRAILS, { llmClient });

    expect(result.riskAssessment.overall_risk).toBe('low');
  });

  it('handles plain JSON response', async () => {
    const llmClient = {
      analyze: vi.fn(async () => ({
        content: '{"overall_risk":"medium","risk_factors":[],"mitigation_suggestions":[]}',
        cost: 1,
      })),
    };

    const result = await analyzeGuardrailResults(SAMPLE_SD, PASSING_GUARDRAILS, { llmClient });

    expect(result.riskAssessment.overall_risk).toBe('medium');
  });

  it('falls back on unparseable LLM response', async () => {
    const llmClient = {
      analyze: vi.fn(async () => ({
        content: 'I cannot produce JSON right now, sorry!',
        cost: 1,
      })),
    };

    const result = await analyzeGuardrailResults(SAMPLE_SD, PASSING_GUARDRAILS, { llmClient });

    // Should get fallback shapes, not crash
    expect(result.riskAssessment).toBeDefined();
    expect(result.riskAssessment.overall_risk).toBeDefined();
  });
});
