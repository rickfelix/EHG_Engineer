/**
 * Rubric Evaluator Integration Tests
 * SD-LEO-ORCH-SELF-IMPROVING-LEO-001-A
 *
 * Tests evaluateWithAI() with injectable mock LLM client covering:
 * TS-1: Happy path (valid response, persistence)
 * TS-2: Schema validation failure + repair retry
 * TS-3: Timeout handling
 * TS-4: Provider error mapping
 */

import { jest } from '@jest/globals';

const mod = await import(
  '../../../../lib/sub-agents/vetting/rubric-evaluator.js'
);
const evaluateWithAI = mod.evaluateWithAI || mod.default?.evaluateWithAI;

const DEFAULT_RUBRIC = {
  version: 'test-1.0',
  criteria: [
    { id: 'value', name: 'Value Proposition', description: 'Does this provide value?', weight: 0.25 },
    { id: 'risk', name: 'Risk Assessment', description: 'What is the risk?', weight: 0.20 },
    { id: 'complexity', name: 'Complexity', description: 'How complex?', weight: 0.15 },
    { id: 'reversibility', name: 'Reversibility', description: 'Can it be reversed?', weight: 0.15 },
    { id: 'alignment', name: 'Protocol Alignment', description: 'Does it align?', weight: 0.15 },
    { id: 'testability', name: 'Testability', description: 'Can it be tested?', weight: 0.10 }
  ],
  scoringScale: { min: 1, max: 5 }
};

const SAMPLE_PROPOSAL = {
  id: 'test-proposal-1',
  title: 'Add caching layer for database queries',
  summary: 'Implement Redis-based caching to reduce database load by 40%',
  motivation: 'Current query patterns show redundant reads',
  risk_level: 'medium',
  content: 'We propose adding a Redis caching layer between the application and database.'
};

function makeValidLLMResponse() {
  const criteria = DEFAULT_RUBRIC.criteria.map(c => ({
    id: c.id,
    name: c.name,
    score: 65 + Math.floor(Math.random() * 20),
    summary: `This criterion evaluates ${c.name.toLowerCase()} and the proposal demonstrates adequate capability.`,
    reasoning: [
      `The proposal addresses ${c.name.toLowerCase()} through clear technical approach`,
      'Evidence of careful consideration in the implementation plan'
    ],
    evidence: ['We propose adding a Redis caching layer'],
    improvements: ['Consider adding fallback strategy for cache misses']
  }));

  return {
    criteria,
    overall_score: 72,
    weighting: { value: 0.25, risk: 0.20, complexity: 0.15, reversibility: 0.15, alignment: 0.15, testability: 0.10 }
  };
}

function makeMockClient(completeFn) {
  return { complete: completeFn };
}

describe('evaluateWithAI - Integration Tests', () => {
  // TS-1: Happy path
  describe('TS-1: Happy path evaluation', () => {
    test('returns SUCCESS with all 6 criteria scored', async () => {
      const validResponse = makeValidLLMResponse();
      const mockComplete = jest.fn().mockResolvedValue({
        content: JSON.stringify(validResponse),
        model: 'claude-sonnet-4-5-20250929',
        durationMs: 1500
      });

      const result = await evaluateWithAI(SAMPLE_PROPOSAL, DEFAULT_RUBRIC, {
        llmClient: makeMockClient(mockComplete)
      });

      expect(result.status).toBe('SUCCESS');
      expect(Object.keys(result.scores)).toHaveLength(6);
      expect(result.totalScore).toBe(72);
      expect(result.model).toBe('claude-sonnet-4-5-20250929');
      expect(result.rubricVersion).toBe('test-1.0');
      expect(result.correlationId).toMatch(/^eval-/);
      expect(result.attempt).toBe(1);
    });

    test('returns per-criterion structured reasoning', async () => {
      const validResponse = makeValidLLMResponse();
      const mockComplete = jest.fn().mockResolvedValue({
        content: JSON.stringify(validResponse),
        model: 'claude-sonnet-4-5-20250929'
      });

      const result = await evaluateWithAI(SAMPLE_PROPOSAL, DEFAULT_RUBRIC, {
        llmClient: makeMockClient(mockComplete)
      });

      for (const criterionId of ['value', 'risk', 'complexity', 'reversibility', 'alignment', 'testability']) {
        const score = result.scores[criterionId];
        expect(score).toBeDefined();
        expect(score.score).toBeGreaterThanOrEqual(0);
        expect(score.score).toBeLessThanOrEqual(100);
        expect(score.summary.length).toBeGreaterThanOrEqual(20);
        expect(score.reasoning.length).toBeGreaterThanOrEqual(2);
        expect(score.improvements.length).toBeGreaterThanOrEqual(1);
        expect(score.weight).toBeGreaterThan(0);
      }
    });

    test('scores vary across distinct proposals (not hardcoded)', async () => {
      const scores = [];

      for (let i = 0; i < 3; i++) {
        const response = makeValidLLMResponse();
        response.overall_score = 50 + i * 15;
        response.criteria[0].score = 40 + i * 20;

        const mockComplete = jest.fn().mockResolvedValue({
          content: JSON.stringify(response),
          model: 'claude-sonnet-4-5-20250929'
        });

        const result = await evaluateWithAI(
          { ...SAMPLE_PROPOSAL, id: `proposal-${i}`, title: `Proposal ${i}` },
          DEFAULT_RUBRIC,
          { llmClient: makeMockClient(mockComplete) }
        );
        scores.push(result.totalScore);
      }

      const unique = new Set(scores);
      expect(unique.size).toBeGreaterThanOrEqual(2);
    });

    test('computes weightedScore for each criterion', async () => {
      const validResponse = makeValidLLMResponse();
      validResponse.criteria[0].score = 80; // value, weight 0.25
      const mockComplete = jest.fn().mockResolvedValue({
        content: JSON.stringify(validResponse),
        model: 'claude-sonnet-4-5-20250929'
      });

      const result = await evaluateWithAI(SAMPLE_PROPOSAL, DEFAULT_RUBRIC, {
        llmClient: makeMockClient(mockComplete)
      });

      // weightedScore = (score / 100) * scoringScale.max * weight
      // For value: (80/100) * 5 * 0.25 = 1.0
      expect(result.scores.value.weightedScore).toBeCloseTo(1.0, 2);
    });
  });

  // TS-2: Schema validation failure + repair retry
  describe('TS-2: Schema validation failure with repair retry', () => {
    test('retries once on malformed response and succeeds', async () => {
      const malformed = { criteria: [], overall_score: 50 };
      const valid = makeValidLLMResponse();

      const mockComplete = jest.fn()
        .mockResolvedValueOnce({ content: JSON.stringify(malformed), model: 'claude-sonnet-4-5-20250929' })
        .mockResolvedValueOnce({ content: JSON.stringify(valid), model: 'claude-sonnet-4-5-20250929' });

      const result = await evaluateWithAI(SAMPLE_PROPOSAL, DEFAULT_RUBRIC, {
        llmClient: makeMockClient(mockComplete)
      });

      expect(result.status).toBe('SUCCESS');
      expect(result.attempt).toBe(2);
      expect(mockComplete).toHaveBeenCalledTimes(2);
    });

    test('returns PARSE_ERROR after retry also fails', async () => {
      const malformed = { criteria: [], overall_score: -1 };

      const mockComplete = jest.fn()
        .mockResolvedValueOnce({ content: JSON.stringify(malformed), model: 'claude-sonnet-4-5-20250929' })
        .mockResolvedValueOnce({ content: JSON.stringify(malformed), model: 'claude-sonnet-4-5-20250929' });

      const result = await evaluateWithAI(SAMPLE_PROPOSAL, DEFAULT_RUBRIC, {
        llmClient: makeMockClient(mockComplete)
      });

      expect(result.status).toBe('PARSE_ERROR');
      expect(result.totalScore).toBe(0);
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors.length).toBeGreaterThan(0);
    });

    test('strips markdown code fences from response', async () => {
      const valid = makeValidLLMResponse();
      const wrappedResponse = '```json\n' + JSON.stringify(valid) + '\n```';

      const mockComplete = jest.fn().mockResolvedValue({
        content: wrappedResponse,
        model: 'claude-sonnet-4-5-20250929'
      });

      const result = await evaluateWithAI(SAMPLE_PROPOSAL, DEFAULT_RUBRIC, {
        llmClient: makeMockClient(mockComplete)
      });

      expect(result.status).toBe('SUCCESS');
      expect(Object.keys(result.scores)).toHaveLength(6);
    });
  });

  // TS-3: Timeout handling
  describe('TS-3: Timeout handling', () => {
    test('returns TIMEOUT when LLM exceeds timeout', async () => {
      const mockComplete = jest.fn().mockImplementation((_sys, _user, opts) => {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => resolve({ content: '{}', model: 'test' }), 10000);
          if (opts?.signal) {
            opts.signal.addEventListener('abort', () => {
              clearTimeout(timer);
              const err = new Error('TIMEOUT');
              err.name = 'AbortError';
              reject(err);
            });
          }
        });
      });

      const result = await evaluateWithAI(SAMPLE_PROPOSAL, DEFAULT_RUBRIC, {
        llmClient: makeMockClient(mockComplete),
        timeoutMs: 100
      });

      expect(result.status).toBe('TIMEOUT');
      expect(result.latencyMs).toBeGreaterThanOrEqual(80);
      expect(result.totalScore).toBe(0);
    });
  });

  // TS-4: Provider error mapping
  describe('TS-4: Provider error mapping', () => {
    test('maps 500 error to PROVIDER_SERVER_ERROR', async () => {
      const err = new Error('Internal Server Error');
      err.status = 500;
      err.requestId = 'req-abc-123';
      const mockComplete = jest.fn().mockRejectedValue(err);

      const result = await evaluateWithAI(SAMPLE_PROPOSAL, DEFAULT_RUBRIC, {
        llmClient: makeMockClient(mockComplete)
      });

      expect(result.status).toBe('FAILED');
      expect(result.errorCode).toBe('PROVIDER_SERVER_ERROR');
    });

    test('maps 429 to RATE_LIMITED', async () => {
      const err = new Error('rate_limit exceeded');
      err.status = 429;
      const mockComplete = jest.fn().mockRejectedValue(err);

      const result = await evaluateWithAI(SAMPLE_PROPOSAL, DEFAULT_RUBRIC, {
        llmClient: makeMockClient(mockComplete)
      });

      expect(result.status).toBe('FAILED');
      expect(result.errorCode).toBe('RATE_LIMITED');
    });

    test('maps 400 to PROVIDER_CLIENT_ERROR', async () => {
      const err = new Error('Bad Request');
      err.status = 400;
      const mockComplete = jest.fn().mockRejectedValue(err);

      const result = await evaluateWithAI(SAMPLE_PROPOSAL, DEFAULT_RUBRIC, {
        llmClient: makeMockClient(mockComplete)
      });

      expect(result.status).toBe('FAILED');
      expect(result.errorCode).toBe('PROVIDER_CLIENT_ERROR');
    });

    test('maps network errors to NETWORK_ERROR', async () => {
      const err = new Error('ECONNREFUSED');
      const mockComplete = jest.fn().mockRejectedValue(err);

      const result = await evaluateWithAI(SAMPLE_PROPOSAL, DEFAULT_RUBRIC, {
        llmClient: makeMockClient(mockComplete)
      });

      expect(result.status).toBe('FAILED');
      expect(result.errorCode).toBe('NETWORK_ERROR');
    });
  });

  // Failure result structure
  describe('Failure result structure', () => {
    test('failure result has consistent shape', async () => {
      const mockComplete = jest.fn().mockRejectedValue(new Error('test error'));

      const result = await evaluateWithAI(SAMPLE_PROPOSAL, DEFAULT_RUBRIC, {
        llmClient: makeMockClient(mockComplete)
      });

      expect(result).toHaveProperty('scores');
      expect(result).toHaveProperty('totalScore', 0);
      expect(result).toHaveProperty('rubricVersion', 'test-1.0');
      expect(result).toHaveProperty('evaluatorVersion');
      expect(result).toHaveProperty('assessedAt');
      expect(result).toHaveProperty('correlationId');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('error');
    });
  });

  // Single LLM call constraint (FR-4)
  describe('Single LLM call constraint', () => {
    test('makes exactly 1 LLM call on success', async () => {
      const valid = makeValidLLMResponse();
      const mockComplete = jest.fn().mockResolvedValue({
        content: JSON.stringify(valid),
        model: 'claude-sonnet-4-5-20250929'
      });

      await evaluateWithAI(SAMPLE_PROPOSAL, DEFAULT_RUBRIC, {
        llmClient: makeMockClient(mockComplete)
      });

      expect(mockComplete).toHaveBeenCalledTimes(1);
    });

    test('makes at most 2 LLM calls (1 + 1 retry)', async () => {
      const malformed = { criteria: [], overall_score: -1 };
      const mockComplete = jest.fn().mockResolvedValue({
        content: JSON.stringify(malformed),
        model: 'claude-sonnet-4-5-20250929'
      });

      await evaluateWithAI(SAMPLE_PROPOSAL, DEFAULT_RUBRIC, {
        llmClient: makeMockClient(mockComplete)
      });

      expect(mockComplete).toHaveBeenCalledTimes(2);
    });
  });
});
