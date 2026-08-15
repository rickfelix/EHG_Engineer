/**
 * Unit tests: PBN scoring skill (LLM call, injected client — no real network/API cost).
 * SD-LEO-FEAT-PROVEN-BETTER-NEW-001 FR-1/FR-3.
 */
import { describe, it, expect, vi } from 'vitest';
import { scorePbnBuckets } from '../../../../lib/eva/stage-zero/pbn-scoring.js';

const brief = { name: 'Test Idea', problem_statement: 'p', solution: 's', target_market: 'm' };

function fakeClient(content) {
  return { complete: vi.fn().mockResolvedValue({ content }) };
}

describe('scorePbnBuckets', () => {
  it('parses a well-formed LLM JSON response into the expected bucket shape', async () => {
    const content = JSON.stringify({
      proven: { mechanic: 'incumbent loop', citations: [{ source: 's', measured: 'm', reference: 'r' }], coverage: true },
      better: { hypothesis: 'h', friction_point: 'f', citations: [], coverage: false },
      new: { wedge: 'w', wedge_count: 1, coverage: true },
    });
    const result = await scorePbnBuckets(brief, { llmClient: fakeClient(content), logger: { error: vi.fn() } });
    expect(result.proven.mechanic).toBe('incumbent loop');
    expect(result.proven.coverage).toBe(true);
    expect(result.new.wedge_count).toBe(1);
  });

  it('extracts JSON embedded in surrounding prose (defensive regex match)', async () => {
    const content = `Here is my analysis:\n${JSON.stringify({
      proven: { coverage: false, citations: [] },
      better: { coverage: false, citations: [] },
      new: { wedge_count: 0 },
    })}\nEnd of analysis.`;
    const result = await scorePbnBuckets(brief, { llmClient: fakeClient(content), logger: { error: vi.fn() } });
    expect(result.proven.coverage).toBe(false);
  });

  it('coerces a non-boolean coverage field to false (never trust LLM types blindly)', async () => {
    const content = JSON.stringify({
      proven: { coverage: 'yes', citations: [] }, // string, not boolean
      better: { coverage: 1, citations: [] }, // truthy number, not boolean
      new: { wedge_count: 1 },
    });
    const result = await scorePbnBuckets(brief, { llmClient: fakeClient(content), logger: { error: vi.fn() } });
    expect(result.proven.coverage).toBe(false);
    expect(result.better.coverage).toBe(false);
  });

  it('coerces non-array citations to an empty array', async () => {
    const content = JSON.stringify({
      proven: { citations: 'not an array', coverage: true },
      better: { citations: null, coverage: false },
      new: { wedge_count: 0 },
    });
    const result = await scorePbnBuckets(brief, { llmClient: fakeClient(content), logger: { error: vi.fn() } });
    expect(result.proven.citations).toEqual([]);
    expect(result.better.citations).toEqual([]);
  });

  it('fails closed (all buckets uncoverable) when the LLM response has no JSON at all', async () => {
    const result = await scorePbnBuckets(brief, { llmClient: fakeClient('I cannot help with that.'), logger: { error: vi.fn() } });
    expect(result.proven.coverage).toBe(false);
    expect(result.better.coverage).toBe(false);
    expect(result.new.coverage).toBe(false);
    expect(result.scoring_error).toBeTruthy();
  });

  it('fails closed when the JSON is malformed (truncated/invalid)', async () => {
    const result = await scorePbnBuckets(brief, { llmClient: fakeClient('{"proven": {"coverage": true,') });
    expect(result.proven.coverage).toBe(false);
    expect(result.scoring_error).toBeTruthy();
  });

  it('fails closed when the LLM client throws (network/timeout error)', async () => {
    const throwingClient = { complete: vi.fn().mockRejectedValue(new Error('timeout')) };
    const result = await scorePbnBuckets(brief, { llmClient: throwingClient, logger: { error: vi.fn() } });
    expect(result.proven.coverage).toBe(false);
    expect(result.new.coverage).toBe(false);
    expect(result.scoring_error).toContain('timeout');
  });

  it('a scoring failure never produces a PASS-shaped result — the empty-proven rule must catch it downstream', async () => {
    // Regression guard for the fail-closed contract: a failed scorer's output, fed into
    // evaluatePbnVerdict, must REJECT (proven.coverage=false), never silently PASS.
    const { evaluatePbnVerdict } = await import('../../../../lib/eva/stage-zero/pbn-gate.js');
    const result = await scorePbnBuckets(brief, { llmClient: { complete: vi.fn().mockRejectedValue(new Error('down')) }, logger: { error: vi.fn() } });
    const verdict = evaluatePbnVerdict(result);
    expect(verdict.verdict).toBe('REJECT');
  });
});
