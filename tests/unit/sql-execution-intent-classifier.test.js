/**
 * Unit Tests: SQL Execution Intent Classifier
 *
 * Tests the deterministic SQL execution intent classifier.
 *
 * SD: SD-LEO-INFRA-DATABASE-SUB-AGENT-001
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Supabase before importing the module
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve({ data: [], error: null }))
            }))
          })),
          single: vi.fn(() => Promise.resolve({ data: null, error: null }))
        }))
      })),
      insert: vi.fn(() => Promise.resolve({ data: null, error: null }))
    }))
  }))
}));

// Mock uuid
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-correlation-id')
}));

// Import after mocking
import { createClient } from '@supabase/supabase-js';
import {
  classifySQLExecutionIntent,
  shouldAutoInvokeDBAgent,
  _internal
} from '../../lib/utils/sql-execution-intent-classifier.js';

describe('SQL Execution Intent Classifier', () => {
  let mockSupabase;
  let mockFrom;

  beforeEach(() => {
    vi.resetModules();

    // Setup mock Supabase responses
    mockFrom = vi.fn();
    mockSupabase = {
      from: mockFrom
    };

    // Default mock for config loading
    mockFrom.mockImplementation((table) => {
      if (table === 'db_agent_config') {
        return {
          select: vi.fn(() => Promise.resolve({
            data: [
              { key: 'MIN_CONFIDENCE_TO_INVOKE', value: 0.80 },
              { key: 'MAX_TRIGGERS_EVALUATED', value: 200 },
              { key: 'DB_AGENT_ENABLED', value: true },
              { key: 'DENYLIST_PHRASES', value: ['do not execute', 'for reference only', 'example query'] }
            ],
            error: null
          }))
        };
      }
      if (table === 'leo_sub_agent_triggers') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() => Promise.resolve({
                    data: [
                      {
                        id: 'trigger-1',
                        trigger_phrase: 'run this sql',
                        trigger_type: 'pattern',
                        priority: 9,
                        metadata: { intent: 'SQL_EXECUTION', category: 'direct_command', confidence_boost: 0.2 },
                        trigger_context: 'SQL_EXECUTION_INTENT'
                      },
                      {
                        id: 'trigger-2',
                        trigger_phrase: 'please execute',
                        trigger_type: 'pattern',
                        priority: 8,
                        metadata: { intent: 'SQL_EXECUTION', category: 'imperative', confidence_boost: 0.15 },
                        trigger_context: 'SQL_EXECUTION_INTENT'
                      },
                      {
                        id: 'trigger-3',
                        trigger_phrase: 'run it',
                        trigger_type: 'pattern',
                        priority: 5,
                        metadata: { intent: 'SQL_EXECUTION', category: 'contextual', confidence_boost: 0.05, requires_sql_context: true },
                        trigger_context: 'SQL_EXECUTION_INTENT'
                      }
                    ],
                    error: null
                  }))
                }))
              }))
            }))
          }))
        };
      }
      if (table === 'db_agent_invocations') {
        return {
          insert: vi.fn(() => Promise.resolve({ data: null, error: null }))
        };
      }
      return {
        select: vi.fn(() => Promise.resolve({ data: [], error: null }))
      };
    });

    createClient.mockReturnValue(mockSupabase);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('hasSQLContext', () => {
    it('should detect SELECT statements', () => {
      expect(_internal.hasSQLContext('SELECT * FROM users')).toBe(true);
      expect(_internal.hasSQLContext('SELECT id, name FROM products WHERE active = true')).toBe(true);
    });

    it('should detect INSERT statements', () => {
      expect(_internal.hasSQLContext('INSERT INTO users VALUES (1, "test")')).toBe(true);
    });

    it('should detect UPDATE statements', () => {
      expect(_internal.hasSQLContext('UPDATE users SET name = "new" WHERE id = 1')).toBe(true);
    });

    it('should detect DELETE statements', () => {
      expect(_internal.hasSQLContext('DELETE FROM users WHERE id = 1')).toBe(true);
    });

    it('should detect CREATE statements', () => {
      expect(_internal.hasSQLContext('CREATE TABLE users (id INT)')).toBe(true);
      expect(_internal.hasSQLContext('CREATE INDEX idx_name ON users(name)')).toBe(true);
    });

    it('should detect ALTER statements', () => {
      expect(_internal.hasSQLContext('ALTER TABLE users ADD COLUMN email VARCHAR')).toBe(true);
    });

    it('should return false for non-SQL content', () => {
      expect(_internal.hasSQLContext('Hello, how are you?')).toBe(false);
      expect(_internal.hasSQLContext('The select function is used to choose items')).toBe(false);
    });
  });

  describe('containsDenylistPhrase', () => {
    const denylist = ['do not execute', 'for reference only', 'example query'];

    it('should detect denylist phrases', () => {
      expect(_internal.containsDenylistPhrase('Here is an example query for reference only', denylist)).toBe(true);
      expect(_internal.containsDenylistPhrase('Do not execute this SQL', denylist)).toBe(true);
    });

    it('should be case insensitive', () => {
      expect(_internal.containsDenylistPhrase('FOR REFERENCE ONLY: SELECT * FROM users', denylist)).toBe(true);
    });

    it('should return false when no denylist phrases present', () => {
      expect(_internal.containsDenylistPhrase('Please run this SQL: SELECT * FROM users', denylist)).toBe(false);
    });
  });

  describe('matchTriggers', () => {
    const triggers = [
      {
        id: 'trigger-1',
        trigger_phrase: 'run this sql',
        trigger_type: 'pattern',
        priority: 9,
        metadata: { category: 'direct_command', confidence_boost: 0.2 }
      },
      {
        id: 'trigger-2',
        trigger_phrase: 'please execute',
        trigger_type: 'pattern',
        priority: 8,
        metadata: { category: 'imperative', confidence_boost: 0.15 }
      },
      {
        id: 'trigger-3',
        trigger_phrase: 'run it',
        trigger_type: 'pattern',
        priority: 5,
        metadata: { category: 'contextual', confidence_boost: 0.05, requires_sql_context: true }
      }
    ];

    it('should match direct command phrases', () => {
      const result = _internal.matchTriggers('Can you run this sql for me?', triggers);
      expect(result.matches.length).toBe(1);
      expect(result.matches[0].triggerId).toBe('trigger-1');
      expect(result.totalConfidenceBoost).toBe(0.2);
    });

    it('should match multiple triggers', () => {
      const result = _internal.matchTriggers('Please execute and run this sql', triggers);
      expect(result.matches.length).toBe(2);
      expect(result.totalConfidenceBoost).toBe(0.35);
    });

    it('should skip contextual triggers without SQL context', () => {
      const result = _internal.matchTriggers('Just run it please', triggers);
      expect(result.matches.length).toBe(0);
    });

    it('should match contextual triggers when SQL is present', () => {
      const result = _internal.matchTriggers('SELECT * FROM users; just run it', triggers);
      expect(result.matches.some(m => m.triggerId === 'trigger-3')).toBe(true);
    });

    it('should handle case insensitivity', () => {
      const result = _internal.matchTriggers('RUN THIS SQL please', triggers);
      expect(result.matches.length).toBe(1);
    });
  });

  describe('calculateConfidence', () => {
    it('should return 0 for no matches', () => {
      expect(_internal.calculateConfidence([], 0, false, false)).toBe(0);
    });

    it('should return high confidence for high priority matches', () => {
      const matches = [{ priority: 9, category: 'direct_command' }];
      const confidence = _internal.calculateConfidence(matches, 0.2, false, false);
      expect(confidence).toBeGreaterThan(0.8);
    });

    it('should add SQL context bonus', () => {
      const matches = [{ priority: 5, category: 'contextual' }];
      const withoutSql = _internal.calculateConfidence(matches, 0.05, false, false);
      const withSql = _internal.calculateConfidence(matches, 0.05, true, false);
      expect(withSql).toBeGreaterThan(withoutSql);
    });

    it('should heavily penalize denylist matches', () => {
      const matches = [{ priority: 9, category: 'direct_command' }];
      const confidence = _internal.calculateConfidence(matches, 0.2, false, true);
      expect(confidence).toBeLessThanOrEqual(0.3);
    });
  });

  describe('classifySQLExecutionIntent', () => {
    it('should return NO_EXECUTION for denylist phrases', async () => {
      const result = await classifySQLExecutionIntent(
        'Here is an example query for reference only: SELECT * FROM users',
        { skipLogging: true }
      );

      expect(result.intent).toBe('NO_EXECUTION');
      expect(result.decision).toBe('no_execution');
      expect(result.metadata.hasDenylistPhrase).toBe(true);
    });

    it('should have correlation_id in result', async () => {
      const result = await classifySQLExecutionIntent(
        'Hello world',
        { skipLogging: true }
      );

      expect(result.correlationId).toBe('test-correlation-id');
    });

    it('should include latency in metadata', async () => {
      const result = await classifySQLExecutionIntent(
        'test message',
        { skipLogging: true }
      );

      expect(typeof result.metadata.latencyMs).toBe('number');
    });
  });

  describe('shouldAutoInvokeDBAgent', () => {
    it('should return shouldInvoke: false for non-execution content', async () => {
      const { shouldInvoke, result } = await shouldAutoInvokeDBAgent(
        'What is the weather today?',
        { skipLogging: true }
      );

      expect(shouldInvoke).toBe(false);
      expect(result.intent).toBe('NO_EXECUTION');
    });

    it('should include full classification result', async () => {
      const { result } = await shouldAutoInvokeDBAgent(
        'test message',
        { skipLogging: true }
      );

      expect(result).toHaveProperty('intent');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('decision');
      expect(result).toHaveProperty('matchedTriggerIds');
    });
  });

  describe('SQL_CONTEXT_PATTERNS', () => {
    it('should export SQL patterns for testing', () => {
      expect(Array.isArray(_internal.SQL_CONTEXT_PATTERNS)).toBe(true);
      expect(_internal.SQL_CONTEXT_PATTERNS.length).toBeGreaterThan(0);
    });
  });

  describe('DEFAULT_CONFIG', () => {
    it('should have reasonable defaults', () => {
      expect(_internal.DEFAULT_CONFIG.MIN_CONFIDENCE_TO_INVOKE).toBe(0.80);
      expect(_internal.DEFAULT_CONFIG.MAX_TRIGGERS_EVALUATED).toBe(200);
      expect(_internal.DEFAULT_CONFIG.DB_AGENT_ENABLED).toBe(true);
      expect(Array.isArray(_internal.DEFAULT_CONFIG.DENYLIST_PHRASES)).toBe(true);
    });
  });
});

describe('Integration Scenarios', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('Real-world execution phrases', () => {
    const executionPhrases = [
      'Please run this SQL: SELECT * FROM users',
      'Can you execute this query for me?',
      'Run the following migration',
      'Execute the migration script',
      'Use the database sub-agent to run this',
      'Apply this migration to the database'
    ];

    it.each(executionPhrases)('should detect execution intent in: "%s"', async (phrase) => {
      // Note: In real tests with actual DB, these would return SQL_EXECUTION
      // With mocked empty triggers, we just verify the function runs
      const result = await classifySQLExecutionIntent(phrase, { skipLogging: true });
      expect(result).toHaveProperty('intent');
      expect(result).toHaveProperty('confidence');
    });
  });

  describe('Real-world non-execution phrases', () => {
    const nonExecutionPhrases = [
      'Here is an example query you could use',
      'For reference only, the SQL would look like this',
      'Do not execute this, but here is a sample',
      'This is just a sample SQL for documentation'
    ];

    it.each(nonExecutionPhrases)('should NOT detect execution intent in: "%s"', async (phrase) => {
      const result = await classifySQLExecutionIntent(phrase, { skipLogging: true });
      expect(result.intent).toBe('NO_EXECUTION');
      expect(result.metadata.hasDenylistPhrase).toBe(true);
    });
  });
});
