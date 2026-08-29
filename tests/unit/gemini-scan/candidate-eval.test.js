import { describe, test, expect } from 'vitest';
import { evaluateCandidate, CANDIDATE_FIXTURE_COUNT } from '../../../lib/gemini-scan/candidate-eval.js';

describe('evaluateCandidate', () => {
  test('runs CANDIDATE_FIXTURE_COUNT fixtures against the injected executor with the candidate model id, never a purpose-resolved id', () => {
    const seenModelIds = new Set();
    const executor = async (fixture) => {
      seenModelIds.add(fixture.modelId);
      return { ok: true, costUsd: 0.01, latencyMs: 100 };
    };
    return evaluateCandidate('gemini-4.0-flash', executor).then((result) => {
      expect(seenModelIds).toEqual(new Set(['gemini-4.0-flash']));
      expect(result.results).toHaveLength(CANDIDATE_FIXTURE_COUNT);
      expect(result.ok).toBe(true);
      expect(result.costUsd).toBeCloseTo(0.03, 5);
    });
  });

  test('a single failing fixture marks the whole candidate as not ok', async () => {
    let call = 0;
    const executor = async () => {
      call += 1;
      return { ok: call !== 2, costUsd: 0.01, latencyMs: 100 };
    };
    const result = await evaluateCandidate('gemini-4.0-flash', executor);
    expect(result.ok).toBe(false);
  });
});
