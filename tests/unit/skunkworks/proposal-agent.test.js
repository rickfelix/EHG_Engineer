/**
 * Unit tests for lib/skunkworks/proposal-agent.js
 * Tests LLM synthesis, template fallback, priority scoring, and signal sorting.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the LLM module before importing the proposal agent
vi.mock('../../../lib/llm/index.js', () => ({
  getLLMClient: vi.fn(),
  initializeLLMFactory: vi.fn(),
}));

import { generateProposals } from '../../../lib/skunkworks/proposal-agent.js';
import { getLLMClient, initializeLLMFactory } from '../../../lib/llm/index.js';

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
const deps = { supabase: {}, logger: silentLogger };

function makeSignal(type, title, priority, evidence = {}) {
  return { type, title, evidence, priority };
}

describe('generateProposals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    initializeLLMFactory.mockResolvedValue(undefined);
  });

  // --- Empty/null input ---

  it('returns empty array when signals is empty', async () => {
    const result = await generateProposals(deps, []);
    expect(result).toEqual([]);
  });

  it('returns empty array when signals is null', async () => {
    const result = await generateProposals(deps, null);
    expect(result).toEqual([]);
  });

  it('returns empty array when signals is undefined', async () => {
    const result = await generateProposals(deps, undefined);
    expect(result).toEqual([]);
  });

  // --- Template fallback ---

  it('falls back to templates when LLM throws', async () => {
    getLLMClient.mockReturnValue({
      complete: vi.fn().mockRejectedValue(new Error('LLM unavailable')),
    });

    const signals = [
      makeSignal('calibration', 'High variance in market_fit', 80, { dimension: 'market_fit' }),
      makeSignal('codebase_health', 'Declining complexity', 70, { dimension: 'complexity' }),
      makeSignal('venture_portfolio', 'Stale venture: X', 60, { venture_name: 'X' }),
    ];

    const result = await generateProposals(deps, signals);
    expect(result.length).toBe(3);
    expect(silentLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('LLM failed')
    );
  });

  it('template fallback generates one proposal per signal type', async () => {
    getLLMClient.mockReturnValue({
      complete: vi.fn().mockRejectedValue(new Error('nope')),
    });

    const signals = [
      makeSignal('calibration', 'Signal A', 90, { dimension: 'dim_a' }),
      makeSignal('calibration', 'Signal B', 80, { dimension: 'dim_b' }),
      makeSignal('codebase_health', 'Signal C', 70, { dimension: 'health_c' }),
    ];

    const result = await generateProposals(deps, signals);
    // Two types: calibration and codebase_health
    expect(result.length).toBe(2);

    const calProposal = result.find(p => p.signal_source === 'calibration');
    expect(calProposal).toBeDefined();
    expect(calProposal.title).toContain('dim_a'); // Uses top signal's evidence

    const healthProposal = result.find(p => p.signal_source === 'codebase_health');
    expect(healthProposal).toBeDefined();
  });

  it('template fallback uses correct template for each signal type', async () => {
    getLLMClient.mockReturnValue({
      complete: vi.fn().mockRejectedValue(new Error('nope')),
    });

    const signals = [
      makeSignal('calibration', 'Cal signal', 80, { dimension: 'novelty' }),
    ];

    const result = await generateProposals(deps, signals);
    expect(result.length).toBe(1);
    expect(result[0].title).toContain('novelty');
    expect(result[0].hypothesis).toContain('novelty');
    expect(result[0].methodology).toBeDefined();
    expect(result[0].expected_outcome).toBeDefined();
    expect(result[0].priority_score).toBe(80);
    expect(result[0].signal_source).toBe('calibration');
  });

  it('template fallback uses default template for unknown signal types', async () => {
    getLLMClient.mockReturnValue({
      complete: vi.fn().mockRejectedValue(new Error('nope')),
    });

    const signals = [
      makeSignal('unknown_type', 'Mystery signal', 65, { foo: 'bar' }),
    ];

    const result = await generateProposals(deps, signals);
    expect(result.length).toBe(1);
    expect(result[0].title).toContain('Mystery signal');
    expect(result[0].signal_source).toBe('unknown_type');
  });

  it('template fallback includes evidence from all signals of same type', async () => {
    getLLMClient.mockReturnValue({
      complete: vi.fn().mockRejectedValue(new Error('nope')),
    });

    const signals = [
      makeSignal('calibration', 'A', 90, { dimension: 'a' }),
      makeSignal('calibration', 'B', 80, { dimension: 'b' }),
      makeSignal('calibration', 'C', 70, { dimension: 'c' }),
    ];

    const result = await generateProposals(deps, signals);
    expect(result.length).toBe(1);
    expect(result[0].evidence.length).toBe(3);
  });

  it('template fallback caps evidence at 5 items', async () => {
    getLLMClient.mockReturnValue({
      complete: vi.fn().mockRejectedValue(new Error('nope')),
    });

    const signals = Array.from({ length: 8 }, (_, i) =>
      makeSignal('calibration', `Signal ${i}`, 90 - i, { dimension: `dim_${i}` })
    );

    const result = await generateProposals(deps, signals);
    expect(result.length).toBe(1);
    expect(result[0].evidence.length).toBeLessThanOrEqual(5);
  });

  // --- Signal sorting and top-10 limit ---

  it('sorts signals by priority descending and takes top 10', async () => {
    getLLMClient.mockReturnValue({
      complete: vi.fn().mockRejectedValue(new Error('nope')),
    });

    // Create 15 signals of the same type to verify only top 10 are used
    const signals = Array.from({ length: 15 }, (_, i) =>
      makeSignal('calibration', `Signal ${i}`, 10 + i * 5, { dimension: `dim_${i}` })
    );

    const result = await generateProposals(deps, signals);
    expect(result.length).toBe(1);
    // Top signal by priority should be the last one (10 + 14*5 = 80)
    expect(result[0].priority_score).toBe(80);
  });

  // --- LLM success path ---

  it('returns LLM-generated proposals on success', async () => {
    const llmResponse = JSON.stringify([
      {
        title: 'LLM Proposal 1',
        hypothesis: 'Test hypothesis',
        methodology: 'Test method',
        expected_outcome: 'Test outcome',
        priority_score: 75,
        signal_source: 'calibration',
      },
    ]);

    getLLMClient.mockReturnValue({
      complete: vi.fn().mockResolvedValue(llmResponse),
    });

    const signals = [
      makeSignal('calibration', 'Test signal', 80, { dimension: 'test' }),
    ];

    const result = await generateProposals(deps, signals);
    expect(result.length).toBe(1);
    expect(result[0].title).toBe('LLM Proposal 1');
    expect(result[0].priority_score).toBe(75);
  });

  it('clamps LLM priority_score between 0 and 100', async () => {
    const llmResponse = JSON.stringify([
      { title: 'High', hypothesis: 'H', priority_score: 150, signal_source: 'calibration' },
      { title: 'Low', hypothesis: 'L', priority_score: -20, signal_source: 'calibration' },
    ]);

    getLLMClient.mockReturnValue({
      complete: vi.fn().mockResolvedValue(llmResponse),
    });

    const signals = [makeSignal('calibration', 'Test', 80, {})];
    const result = await generateProposals(deps, signals);

    expect(result[0].priority_score).toBe(100);
    expect(result[1].priority_score).toBe(0);
  });

  it('defaults invalid signal_source to composite', async () => {
    const llmResponse = JSON.stringify([
      { title: 'Test', hypothesis: 'H', priority_score: 50, signal_source: 'invalid_source' },
    ]);

    getLLMClient.mockReturnValue({
      complete: vi.fn().mockResolvedValue(llmResponse),
    });

    const signals = [makeSignal('calibration', 'Test', 80, {})];
    const result = await generateProposals(deps, signals);
    expect(result[0].signal_source).toBe('composite');
  });

  it('falls back to template when LLM returns no JSON array', async () => {
    getLLMClient.mockReturnValue({
      complete: vi.fn().mockResolvedValue('Sorry, I cannot help with that.'),
    });

    const signals = [makeSignal('calibration', 'Test', 80, { dimension: 'test' })];
    const result = await generateProposals(deps, signals);

    // Should fall back to template
    expect(result.length).toBe(1);
    expect(result[0].signal_source).toBe('calibration');
    expect(silentLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('LLM failed')
    );
  });

  it('falls back to template when LLM returns empty array', async () => {
    getLLMClient.mockReturnValue({
      complete: vi.fn().mockResolvedValue('[]'),
    });

    const signals = [makeSignal('calibration', 'Test', 80, { dimension: 'test' })];
    const result = await generateProposals(deps, signals);

    expect(result.length).toBe(1);
    expect(silentLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('LLM failed')
    );
  });

  it('handles LLM response wrapped in markdown code block', async () => {
    const llmResponse = '```json\n[{"title": "Wrapped", "hypothesis": "H", "priority_score": 60, "signal_source": "calibration"}]\n```';

    getLLMClient.mockReturnValue({
      complete: vi.fn().mockResolvedValue(llmResponse),
    });

    const signals = [makeSignal('calibration', 'Test', 80, {})];
    const result = await generateProposals(deps, signals);
    expect(result[0].title).toBe('Wrapped');
  });

  it('handles response object with text property', async () => {
    getLLMClient.mockReturnValue({
      complete: vi.fn().mockResolvedValue({
        text: '[{"title": "ObjResp", "hypothesis": "H", "priority_score": 55, "signal_source": "composite"}]',
      }),
    });

    const signals = [makeSignal('calibration', 'Test', 80, {})];
    const result = await generateProposals(deps, signals);
    expect(result[0].title).toBe('ObjResp');
  });

  it('provides default title and hypothesis when LLM omits them', async () => {
    const llmResponse = JSON.stringify([
      { priority_score: 50, signal_source: 'calibration' },
    ]);

    getLLMClient.mockReturnValue({
      complete: vi.fn().mockResolvedValue(llmResponse),
    });

    const signals = [makeSignal('calibration', 'Test', 80, {})];
    const result = await generateProposals(deps, signals);
    expect(result[0].title).toBe('Untitled proposal');
    expect(result[0].hypothesis).toBe('Hypothesis pending');
  });
});
