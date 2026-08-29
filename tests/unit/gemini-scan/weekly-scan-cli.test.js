import { describe, test, expect } from 'vitest';
import { runScan } from '../../../scripts/gemini-weekly-scan.mjs';

const okExecutor = async () => ({ ok: true, costUsd: 0.01, latencyMs: 50 });

describe('runScan (pure orchestration core)', () => {
  test('no-delta run: identical fetched vs known produces zero recommendations and zero filtered', async () => {
    const known = [{ id: 'gemini-2.5-flash', displayName: '', description: '' }];
    const fetched = [{ id: 'gemini-2.5-flash', displayName: '', description: '' }];
    const result = await runScan({ fetched, known, executor: okExecutor });
    expect(result.recommendations).toEqual([]);
    expect(result.filtered).toEqual([]);
    expect(result.updatedKnownModels).toEqual(known);
  });

  test('a new GA model produces exactly one recommendation and is added to updatedKnownModels', async () => {
    const known = [];
    const fetched = [{ id: 'gemini-4.0-flash', displayName: 'Four', description: 'd' }];
    const result = await runScan({ fetched, known, executor: okExecutor });
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].metadata.model_id).toBe('gemini-4.0-flash');
    expect(result.recommendations[0].metadata.lifecycle).toBe('GA');
    expect(result.updatedKnownModels).toEqual(fetched);
  });

  test('a new preview model with no cited-terms exception is filtered, not recommended', async () => {
    const known = [];
    const fetched = [{ id: 'gemini-4.0-flash-preview', displayName: '', description: '' }];
    const result = await runScan({ fetched, known, executor: okExecutor, ctExceptions: new Set() });
    expect(result.recommendations).toEqual([]);
    expect(result.filtered).toHaveLength(1);
    expect(result.filtered[0].reason).toMatch(/non-GA/);
  });

  test('a cited-terms exception allows a preview model through', async () => {
    const known = [];
    const fetched = [{ id: 'gemini-4.0-flash-preview', displayName: '', description: '' }];
    const result = await runScan({ fetched, known, executor: okExecutor, ctExceptions: new Set(['gemini-4.0-flash-preview']) });
    expect(result.recommendations).toHaveLength(1);
  });

  test('per-candidate cost cap: a candidate whose eval cost exceeds $1 is filtered', async () => {
    const known = [];
    const fetched = [{ id: 'gemini-4.0-flash', displayName: '', description: '' }];
    const expensiveExecutor = async () => ({ ok: true, costUsd: 0.4, latencyMs: 50 }); // 3 fixtures * 0.4 = 1.2 > $1 cap
    const result = await runScan({ fetched, known, executor: expensiveExecutor });
    expect(result.recommendations).toEqual([]);
    expect(result.filtered[0].reason).toMatch(/per-candidate cost/);
  });

  test('cycle cost cap: candidates are evaluated until the $5 cycle cap is reached, remainder filtered', async () => {
    const known = [];
    // 6 candidates, each costing $0.9 (well under $1/candidate), 6*0.9=$5.4 > $5 cycle cap
    const fetched = Array.from({ length: 6 }, (_, i) => ({ id: `gemini-4.${i}-flash`, displayName: '', description: '' }));
    const perCandidateExecutor = async () => ({ ok: true, costUsd: 0.3, latencyMs: 50 }); // 3 fixtures * 0.3 = $0.9/candidate
    const result = await runScan({ fetched, known, executor: perCandidateExecutor });
    expect(result.recommendations.length).toBe(5); // 5 * 0.9 = 4.5, 6th would push to 5.4 > 5
    expect(result.filtered).toHaveLength(1);
    expect(result.filtered[0].reason).toMatch(/cycle cost cap/);
  });
});
