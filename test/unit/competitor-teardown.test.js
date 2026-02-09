/**
 * Competitor Teardown Path - Full Implementation Tests
 *
 * Tests the LLM-powered competitor analysis pipeline:
 * - Single competitor analysis
 * - Multi-competitor with gap analysis
 * - First-principles deconstruction
 * - Error handling and graceful degradation
 *
 * Part of SD-LEO-ORCH-STAGE-INTELLIGENT-VENTURE-001-C
 */

import { describe, test, expect, vi } from 'vitest';
import { executeCompetitorTeardown } from '../../lib/eva/stage-zero/paths/competitor-teardown.js';

// ── Mock LLM Client ──────────────────────────────────────────

function createMockLLMClient(responses = {}) {
  let callCount = 0;
  const responseList = Array.isArray(responses) ? responses : null;

  return {
    _model: 'mock-model',
    messages: {
      create: vi.fn().mockImplementation(async ({ messages }) => {
        const prompt = messages[0]?.content || '';

        // If responses is an array, return in order
        if (responseList) {
          const idx = callCount++;
          const text = responseList[idx] || '{}';
          return { content: [{ text }] };
        }

        // Route based on prompt content
        if (prompt.includes('Analyze this competitor business')) {
          return {
            content: [{
              text: JSON.stringify(responses.analysis || {
                company_name: 'TestCorp',
                url: 'https://testcorp.com',
                business_model: 'SaaS',
                value_proposition: 'Automated testing',
                target_market: 'Enterprise developers',
                pricing_model: 'Per-seat subscription',
                key_features: ['CI/CD integration', 'Visual regression', 'API testing'],
                work_components: [
                  { component: 'Test creation', automation_potential: 'high', description: 'Writing test scripts' },
                  { component: 'Test execution', automation_potential: 'high', description: 'Running tests' },
                ],
                weaknesses: ['Expensive for small teams', 'Complex setup'],
                differentiation_opportunities: ['AI-generated tests', 'Zero-config setup'],
              }),
            }],
          };
        }

        if (prompt.includes('first-principles venture strategist')) {
          return {
            content: [{
              text: JSON.stringify(responses.deconstruction || {
                root_customer_goals: ['Ship reliable software faster'],
                automatable_components: [
                  { component: 'Test writing', current_cost: '$50k/yr engineer', automation_approach: 'LLM-generated tests' },
                ],
                automation_solution: 'AI-powered testing platform with zero human test engineers',
                suggested_venture_name: 'AutoTest AI',
                root_customer_problem: 'Software testing requires expensive specialized engineers',
                target_market: 'Mid-market SaaS companies',
                cost_advantage_estimate: '80% lower',
                speed_advantage_estimate: '10x faster test creation',
              }),
            }],
          };
        }

        if (prompt.includes('Compare these competitors')) {
          return {
            content: [{
              text: JSON.stringify(responses.gapAnalysis || {
                table_stakes: ['CI/CD integration', 'Dashboard'],
                differentiators: [{ feature: 'Visual testing', who_has_it: ['CompA'] }],
                gaps: ['AI-generated tests', 'Self-healing tests'],
                common_weaknesses: ['Complex pricing', 'Slow setup'],
                underserved_segments: ['Solo developers', 'Startups'],
              }),
            }],
          };
        }

        return { content: [{ text: '{}' }] };
      }),
    },
  };
}

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

// ── Core Functionality Tests ──────────────────────────────────

describe('Competitor Teardown - executeCompetitorTeardown', () => {
  test('requires at least one URL', async () => {
    await expect(
      executeCompetitorTeardown({ urls: [] }, { logger: silentLogger })
    ).rejects.toThrow('At least one competitor URL is required');
  });

  test('requires urls parameter', async () => {
    await expect(
      executeCompetitorTeardown({}, { logger: silentLogger })
    ).rejects.toThrow('At least one competitor URL is required');
  });

  test('analyzes single competitor and returns PathOutput', async () => {
    const llmClient = createMockLLMClient();

    const result = await executeCompetitorTeardown(
      { urls: ['https://testcorp.com'] },
      { logger: silentLogger, llmClient }
    );

    // Verify PathOutput structure
    expect(result.origin_type).toBe('competitor_teardown');
    expect(result.competitor_urls).toEqual(['https://testcorp.com']);
    expect(result.suggested_name).toBe('AutoTest AI');
    expect(result.suggested_problem).toBe('Software testing requires expensive specialized engineers');
    expect(result.suggested_solution).toContain('AI-powered testing platform');
    expect(result.target_market).toBe('Mid-market SaaS companies');

    // Verify raw_material
    expect(result.raw_material.competitor_analyses).toHaveLength(1);
    expect(result.raw_material.first_principles).toBeDefined();
    expect(result.raw_material.gap_analysis).toBeNull(); // Only 1 competitor
    expect(result.raw_material.analyzed_at).toBeDefined();

    // Verify metadata
    expect(result.metadata.path).toBe('competitor_teardown');
    expect(result.metadata.url_count).toBe(1);
    expect(result.metadata.companies_analyzed).toContain('TestCorp');
  });

  test('runs gap analysis for multiple competitors', async () => {
    const llmClient = createMockLLMClient();

    const result = await executeCompetitorTeardown(
      { urls: ['https://comp-a.com', 'https://comp-b.com'] },
      { logger: silentLogger, llmClient }
    );

    // LLM should be called: 2 analyses + 1 deconstruction + 1 gap analysis = 4
    expect(llmClient.messages.create).toHaveBeenCalledTimes(4);

    // Gap analysis should be populated
    expect(result.raw_material.gap_analysis).not.toBeNull();
    expect(result.raw_material.gap_analysis.table_stakes).toBeDefined();
    expect(result.raw_material.gap_analysis.gaps).toBeDefined();

    // Two competitor analyses
    expect(result.raw_material.competitor_analyses).toHaveLength(2);
    expect(result.metadata.url_count).toBe(2);
  });

  test('skips gap analysis for single competitor', async () => {
    const llmClient = createMockLLMClient();

    const result = await executeCompetitorTeardown(
      { urls: ['https://single.com'] },
      { logger: silentLogger, llmClient }
    );

    // LLM should be called: 1 analysis + 1 deconstruction = 2
    expect(llmClient.messages.create).toHaveBeenCalledTimes(2);
    expect(result.raw_material.gap_analysis).toBeNull();
  });

  test('logs progress during analysis', async () => {
    const llmClient = createMockLLMClient();
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

    await executeCompetitorTeardown(
      { urls: ['https://testcorp.com'] },
      { logger, llmClient }
    );

    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('1 competitor'));
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('https://testcorp.com'));
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('first-principles'));
  });
});

// ── Competitor Analysis Tests ──────────────────────────────────

describe('Competitor Teardown - analyzeCompetitor', () => {
  test('adds url and analyzed_at to LLM response', async () => {
    const llmClient = createMockLLMClient();

    const result = await executeCompetitorTeardown(
      { urls: ['https://testcorp.com'] },
      { logger: silentLogger, llmClient }
    );

    const analysis = result.raw_material.competitor_analyses[0];
    expect(analysis.url).toBe('https://testcorp.com');
    expect(analysis.analyzed_at).toBeDefined();
    expect(analysis.company_name).toBe('TestCorp');
  });

  test('handles LLM returning non-JSON gracefully', async () => {
    const llmClient = createMockLLMClient([
      'I cannot analyze this URL in a structured format.',
      JSON.stringify({ suggested_venture_name: 'Fallback', root_customer_problem: '', automation_solution: '', target_market: '' }),
    ]);

    const result = await executeCompetitorTeardown(
      { urls: ['https://bad-response.com'] },
      { logger: silentLogger, llmClient }
    );

    // Should still produce a result, even with error in analysis
    const analysis = result.raw_material.competitor_analyses[0];
    expect(analysis.error).toBe('Could not parse analysis');
    expect(analysis.url).toBe('https://bad-response.com');
  });

  test('handles LLM error gracefully', async () => {
    const llmClient = {
      _model: 'mock-model',
      messages: {
        create: vi.fn()
          .mockRejectedValueOnce(new Error('Rate limited'))
          .mockResolvedValue({
            content: [{ text: JSON.stringify({ suggested_venture_name: '', root_customer_problem: '', automation_solution: '', target_market: '' }) }],
          }),
      },
    };
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

    const result = await executeCompetitorTeardown(
      { urls: ['https://error.com'] },
      { logger, llmClient }
    );

    const analysis = result.raw_material.competitor_analyses[0];
    expect(analysis.error).toBe('Rate limited');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Rate limited'));
  });
});

// ── First-Principles Deconstruction Tests ──────────────────────

describe('Competitor Teardown - First Principles', () => {
  test('extracts suggested fields from deconstruction', async () => {
    const llmClient = createMockLLMClient({
      deconstruction: {
        root_customer_goals: ['Save time'],
        automatable_components: [],
        automation_solution: 'Full automation platform',
        suggested_venture_name: 'AutoPilot',
        root_customer_problem: 'Manual processes waste time',
        target_market: 'SMBs in finance',
        cost_advantage_estimate: '60% lower',
        speed_advantage_estimate: '5x faster',
      },
    });

    const result = await executeCompetitorTeardown(
      { urls: ['https://comp.com'] },
      { logger: silentLogger, llmClient }
    );

    expect(result.suggested_name).toBe('AutoPilot');
    expect(result.suggested_problem).toBe('Manual processes waste time');
    expect(result.suggested_solution).toBe('Full automation platform');
    expect(result.target_market).toBe('SMBs in finance');
  });

  test('handles deconstruction failure gracefully', async () => {
    const llmClient = {
      _model: 'mock-model',
      messages: {
        create: vi.fn()
          .mockResolvedValueOnce({
            content: [{ text: JSON.stringify({ company_name: 'Test', url: 'https://test.com' }) }],
          })
          .mockRejectedValueOnce(new Error('Context too long')),
      },
    };

    const result = await executeCompetitorTeardown(
      { urls: ['https://test.com'] },
      { logger: silentLogger, llmClient }
    );

    // Should still return a result, with empty suggested fields
    expect(result.origin_type).toBe('competitor_teardown');
    expect(result.suggested_name).toBe('');
    expect(result.raw_material.first_principles.error).toBe('Context too long');
  });
});

// ── Gap Analysis Tests ──────────────────────────────────────────

describe('Competitor Teardown - Gap Analysis', () => {
  test('identifies market gaps from multiple competitors', async () => {
    const llmClient = createMockLLMClient({
      gapAnalysis: {
        table_stakes: ['Basic feature A'],
        differentiators: [{ feature: 'Advanced B', who_has_it: ['Comp1'] }],
        gaps: ['No AI automation', 'No self-service'],
        common_weaknesses: ['Poor onboarding'],
        underserved_segments: ['Micro-businesses'],
      },
    });

    const result = await executeCompetitorTeardown(
      { urls: ['https://comp1.com', 'https://comp2.com'] },
      { logger: silentLogger, llmClient }
    );

    const gap = result.raw_material.gap_analysis;
    expect(gap.gaps).toContain('No AI automation');
    expect(gap.underserved_segments).toContain('Micro-businesses');
    expect(gap.common_weaknesses).toContain('Poor onboarding');
  });

  test('handles gap analysis failure gracefully', async () => {
    let callCount = 0;
    const llmClient = {
      _model: 'mock-model',
      messages: {
        create: vi.fn().mockImplementation(async () => {
          callCount++;
          // First 2 calls = competitor analyses, 3rd = deconstruction, 4th = gap analysis (fails)
          if (callCount <= 2) {
            return { content: [{ text: JSON.stringify({ company_name: `Comp${callCount}`, url: `https://comp${callCount}.com` }) }] };
          }
          if (callCount === 3) {
            return { content: [{ text: JSON.stringify({ suggested_venture_name: 'Test', root_customer_problem: '', automation_solution: '', target_market: '' }) }] };
          }
          throw new Error('Gap analysis failed');
        }),
      },
    };

    const result = await executeCompetitorTeardown(
      { urls: ['https://comp1.com', 'https://comp2.com'] },
      { logger: silentLogger, llmClient }
    );

    expect(result.raw_material.gap_analysis.error).toBe('Gap analysis failed');
  });
});
