import { describe, it, expect, beforeEach } from 'vitest';
import { evaluateGoal, _clearCache } from '../../lib/goal-evaluator/voting.mjs';

const VALID_VOCAB = {
  schema_version: '1.0.0',
  vocabulary_version: '1.0.0',
  terms: [{ term: 'foo', added_at: '2024-01-01T00:00:00Z' }],
};

beforeEach(() => _clearCache());

describe('goal-evaluator voting (3-sample T=0 fail-closed)', () => {
  it('unanimous PASS when all 3 samples agree', async () => {
    const llm = async () => ({ verdict: 'PASS', confidence: 0.9 });
    const r = await evaluateGoal({ prompt: 'test', vocab: VALID_VOCAB, llm });
    expect(r.verdict).toBe('PASS');
    expect(r.votes.length).toBe(3);
    expect(r.confidence).toBeGreaterThan(0);
  });

  it('UNANIMITY_FAIL when samples disagree (fail-closed)', async () => {
    let i = 0;
    const llm = async () => ({ verdict: ['PASS', 'PASS', 'FAIL'][i++], confidence: 0.8 });
    const r = await evaluateGoal({ prompt: 'test', vocab: VALID_VOCAB, llm });
    expect(r.verdict).toBe('UNANIMITY_FAIL');
    expect(r.confidence).toBe(0);
  });

  it('cache hit within 60s returns same result', async () => {
    let callCount = 0;
    const llm = async () => { callCount++; return { verdict: 'PASS', confidence: 0.9 }; };
    await evaluateGoal({ prompt: 'p', vocab: VALID_VOCAB, llm });
    const cached = await evaluateGoal({ prompt: 'p', vocab: VALID_VOCAB, llm });
    expect(callCount).toBe(3); // first call only; cached returns cached
    expect(cached.cached).toBe(true);
  });

  it('vocab_version change invalidates cache', async () => {
    let callCount = 0;
    const llm = async () => { callCount++; return { verdict: 'PASS', confidence: 0.9 }; };
    await evaluateGoal({ prompt: 'p', vocab: VALID_VOCAB, llm });
    const v2 = { ...VALID_VOCAB, vocabulary_version: '2.0.0' };
    const fresh = await evaluateGoal({ prompt: 'p', vocab: v2, llm });
    expect(callCount).toBe(6); // 3 first + 3 fresh
    expect(fresh.cached).toBe(false);
  });

  it('CONTRACT_MISSING short-circuits to no votes', async () => {
    const llm = async () => ({ verdict: 'PASS', confidence: 1 });
    const r = await evaluateGoal({ prompt: 'p', vocab: { terms: [] }, llm });
    expect(r.verdict).toBe('CONTRACT_MISSING');
    expect(r.votes).toEqual([]);
  });
});
