/**
 * Vetting Pipeline Integration Tests
 * SD-LEO-ORCH-SELF-IMPROVING-LEO-001-F
 *
 * Tests the full vetting pipeline flow:
 *   Proposal → Rubric Assessment (AI) → Outcome Tracking
 *
 * Uses injectable mocks to verify pipeline connectivity
 * without requiring live LLM or database connections.
 */

import { jest } from '@jest/globals';

// Import rubric evaluator
const evalMod = await import(
  '../../../../lib/sub-agents/vetting/rubric-evaluator.js'
);
const evaluateWithAI = evalMod.evaluateWithAI || evalMod.default?.evaluateWithAI;
const validateEvaluationSchema = evalMod.validateEvaluationSchema || evalMod.default?.validateEvaluationSchema;

const DEFAULT_RUBRIC = {
  version: 'pipeline-test-1.0',
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

function makeProposal(overrides = {}) {
  return {
    id: 'pipeline-test-proposal',
    title: 'Improve error handling in feedback ingestion',
    summary: 'Add retry logic and dead-letter queue for failed feedback processing',
    motivation: 'Current pipeline drops feedback on transient errors',
    risk_level: 'low',
    content: 'We propose adding exponential backoff retry with a dead-letter queue.',
    ...overrides
  };
}

function makeValidLLMResponse() {
  return {
    criteria: DEFAULT_RUBRIC.criteria.map(c => ({
      id: c.id,
      name: c.name,
      score: 70 + Math.floor(Math.random() * 15),
      summary: `Evaluation of ${c.name.toLowerCase()} shows adequate capability for this proposal.`,
      reasoning: [
        `The proposal addresses ${c.name.toLowerCase()} through clear approach`,
        'Evidence of careful consideration in the implementation plan'
      ],
      evidence: ['Add retry logic and dead-letter queue'],
      improvements: ['Consider monitoring for retry exhaustion']
    })),
    overall_score: 75,
    weighting: { value: 0.25, risk: 0.20, complexity: 0.15, reversibility: 0.15, alignment: 0.15, testability: 0.10 }
  };
}

function makeMockClient(completeFn) {
  return { complete: completeFn };
}

function makeMockSupabase() {
  const insertedRecords = { audit_log: [], leo_vetting_outcomes: [] };
  return {
    client: {
      from: (table) => ({
        insert: (data) => {
          insertedRecords[table] = insertedRecords[table] || [];
          insertedRecords[table].push(data);
          return Promise.resolve({ error: null });
        }
      })
    },
    getInserted: (table) => insertedRecords[table] || []
  };
}

describe('Vetting Pipeline Integration', () => {
  describe('Full pipeline: Proposal → AI Rubric → Persistence', () => {
    test('evaluates proposal and persists results to audit_log and vetting_outcomes', async () => {
      const validResponse = makeValidLLMResponse();
      const mockComplete = jest.fn().mockResolvedValue({
        content: JSON.stringify(validResponse),
        model: 'claude-sonnet-4-5-20250929'
      });

      const mockSupabase = makeMockSupabase();

      const result = await evaluateWithAI(makeProposal(), DEFAULT_RUBRIC, {
        llmClient: makeMockClient(mockComplete),
        supabase: mockSupabase.client
      });

      // Verify evaluation succeeded
      expect(result.status).toBe('SUCCESS');
      expect(Object.keys(result.scores)).toHaveLength(6);
      expect(result.totalScore).toBe(75);

      // Verify audit log was written
      const auditEntries = mockSupabase.getInserted('audit_log');
      expect(auditEntries.length).toBe(1);
      expect(auditEntries[0].event_type).toBe('rubric_evaluation');
      expect(auditEntries[0].details.status).toBe('SUCCESS');
      expect(auditEntries[0].details.correlation_id).toMatch(/^eval-/);

      // Verify vetting outcome was written
      const outcomes = mockSupabase.getInserted('leo_vetting_outcomes');
      expect(outcomes.length).toBe(1);
      expect(outcomes[0].proposal_id).toBe('pipeline-test-proposal');
      expect(outcomes[0].rubric_score).toBe(75);
      expect(outcomes[0].processed_by).toBe('rubric-evaluator-ai');
    });

    test('failed evaluation writes audit log but NOT vetting outcome', async () => {
      const err = new Error('Service unavailable');
      err.status = 503;
      const mockComplete = jest.fn().mockRejectedValue(err);
      const mockSupabase = makeMockSupabase();

      const result = await evaluateWithAI(makeProposal(), DEFAULT_RUBRIC, {
        llmClient: makeMockClient(mockComplete),
        supabase: mockSupabase.client
      });

      expect(result.status).toBe('FAILED');
      expect(result.totalScore).toBe(0);

      // Audit log should still record the failure
      const auditEntries = mockSupabase.getInserted('audit_log');
      expect(auditEntries.length).toBe(1);
      expect(auditEntries[0].details.status).toBe('FAILED');
      expect(auditEntries[0].details.error_code).toBe('PROVIDER_SERVER_ERROR');

      // Vetting outcome should NOT be written for failures
      const outcomes = mockSupabase.getInserted('leo_vetting_outcomes');
      expect(outcomes.length).toBe(0);
    });
  });

  describe('Pipeline data integrity', () => {
    test('correlation ID flows through evaluation to persistence', async () => {
      const validResponse = makeValidLLMResponse();
      const mockComplete = jest.fn().mockResolvedValue({
        content: JSON.stringify(validResponse),
        model: 'claude-sonnet-4-5-20250929'
      });
      const mockSupabase = makeMockSupabase();

      const result = await evaluateWithAI(makeProposal(), DEFAULT_RUBRIC, {
        llmClient: makeMockClient(mockComplete),
        supabase: mockSupabase.client
      });

      const correlationId = result.correlationId;
      expect(correlationId).toMatch(/^eval-/);

      // Same correlation ID in audit log
      const auditEntries = mockSupabase.getInserted('audit_log');
      expect(auditEntries[0].details.correlation_id).toBe(correlationId);

      // Same correlation ID in vetting outcome metadata
      const outcomes = mockSupabase.getInserted('leo_vetting_outcomes');
      expect(outcomes[0].metadata.correlation_id).toBe(correlationId);
    });

    test('per-criterion scores flow from LLM response to result', async () => {
      const validResponse = makeValidLLMResponse();
      // Set specific scores
      validResponse.criteria[0].score = 90; // value
      validResponse.criteria[1].score = 60; // risk

      const mockComplete = jest.fn().mockResolvedValue({
        content: JSON.stringify(validResponse),
        model: 'claude-sonnet-4-5-20250929'
      });

      const result = await evaluateWithAI(makeProposal(), DEFAULT_RUBRIC, {
        llmClient: makeMockClient(mockComplete)
      });

      expect(result.scores.value.score).toBe(90);
      expect(result.scores.risk.score).toBe(60);
      expect(result.scores.value.weight).toBe(0.25);
      expect(result.scores.risk.weight).toBe(0.20);
    });
  });

  describe('Schema validation integration', () => {
    test('validateEvaluationSchema accepts valid LLM output format', () => {
      const response = makeValidLLMResponse();
      const result = validateEvaluationSchema(response, DEFAULT_RUBRIC.criteria.map(c => c.id));
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('validateEvaluationSchema rejects incomplete criteria set', () => {
      const response = makeValidLLMResponse();
      response.criteria = response.criteria.slice(0, 3); // Only 3 of 6
      const result = validateEvaluationSchema(response, DEFAULT_RUBRIC.criteria.map(c => c.id));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Expected 6 criteria'))).toBe(true);
    });
  });
});
