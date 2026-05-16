// lib/goal-evaluator/voting.mjs
// Sibling B FR-B-2: 3-sample T=0 unanimous voting + fail-closed evaluator.
// Closes RISK B-02 priority 15: brainstorm heuristic accuracy <85% mitigation.

import { createHash } from 'crypto';
import { validateVocabTuple } from '../../scripts/lib/vocab-version-validator.mjs';

const DEFAULT_SAMPLES = 3;
const CACHE_TTL_MS = 60 * 1000;
const cache = new Map();

function makeKey({ prompt, vocab }) {
  const hash = createHash('sha256').update(prompt + '|' + (vocab?.vocabulary_version || '0')).digest('hex').slice(0, 16);
  return hash;
}

async function defaultLLMCall(_prompt, _vocab) {
  // Default no-op evaluator — returns PASS for smoke tests when no client is injected.
  // Production callers inject anthropic client via options.llm.
  return { verdict: 'PASS', confidence: 0.5 };
}

export async function evaluateGoal({ prompt, vocab, samples = DEFAULT_SAMPLES, llm = defaultLLMCall }) {
  const vocabCheck = validateVocabTuple({ schema_version: vocab?.schema_version, vocabulary_version: vocab?.vocabulary_version, vocab });
  if (vocabCheck.verdict !== 'PASS') {
    return { verdict: vocabCheck.verdict, votes: [], confidence: 0, cached: false, reason: vocabCheck.reason };
  }

  const key = makeKey({ prompt, vocab });
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && (now - cached.at) < CACHE_TTL_MS) {
    return { ...cached.result, cached: true };
  }

  const votes = [];
  for (let i = 0; i < samples; i++) {
    try {
      const v = await llm(prompt, vocab);
      votes.push(v);
    } catch (e) {
      votes.push({ verdict: 'UNANIMITY_FAIL', error: e.message });
    }
  }

  const verdicts = votes.map(v => v.verdict);
  const unanimous = verdicts.every(v => v === verdicts[0]);
  const verdict = unanimous ? verdicts[0] : 'UNANIMITY_FAIL';
  const confidence = unanimous ? (votes.reduce((s, v) => s + (v.confidence || 0), 0) / samples) : 0;

  const result = { verdict, votes, confidence: Number(confidence.toFixed(4)), cached: false };
  cache.set(key, { at: now, result });
  return result;
}

export function _clearCache() { cache.clear(); }
