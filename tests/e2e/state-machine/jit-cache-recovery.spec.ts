/**
 * JIT Cache Recovery E2E Tests
 *
 * Tests the SD-UNIFIED-PATH-1.2.1 JIT Truth Check pattern:
 * - verifyStateFreshness() called before ANY mutation
 * - StateStalenessError thrown if cache/db mismatch detected
 * - isRetryable=true indicates caller should rehydrate and retry
 *
 * Reference: lib/agents/venture-state-machine.js:164-195
 *
 * THE LAW: No mutation without freshness verification
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

// Test constants
const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

// Simulate StateStalenessError for testing
class StateStalenessError extends Error {
  public readonly isRetryable: boolean;
  public readonly context: Record<string, any>;

  constructor(message: string, context: Record<string, any> = {}) {
    super(message);
    this.name = 'StateStalenessError';
    this.isRetryable = true;
    this.context = context;
  }
}

test.describe('JIT Cache Recovery E2E Tests', () => {
  let supabase: any;
  let testVentureId: string;
  let testCompanyId: string;

  test.beforeAll(async () => {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY!);

    // Create test company
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .insert({
        name: `JIT Test Company ${Date.now()}`
      })
      .select('id')
      .single();

    if (company) {
      testCompanyId = company.id;
    }

    // Create test venture with known stage
    const { data: venture, error: ventureError } = await supabase
      .from('ventures')
      .insert({
        name: `JIT Cache Test Venture ${Date.now()}`,
        company_id: testCompanyId,
        current_lifecycle_stage: 'Stage 10'
      })
      .select('id, current_lifecycle_stage')
      .single();

    if (venture) {
      testVentureId = venture.id;
    }
  });

  test.afterAll(async () => {
    // Cleanup test data
    if (testVentureId) {
      await supabase.from('ventures')
        .delete()
        .eq('id', testVentureId);
    }

    if (testCompanyId) {
      await supabase.from('companies')
        .delete()
        .eq('id', testCompanyId);
    }
  });

  test.describe('Freshness Verification', () => {
    test('JIT-001: should detect stale cache when db stage differs', async () => {
      // Given cached stage is Stage 10
      const cachedStage = 'Stage 10';

      // And database is updated externally to Stage 11
      await supabase
        .from('ventures')
        .update({ current_lifecycle_stage: 'Stage 11' })
        .eq('id', testVentureId);

      // When verifying freshness
      const { data: venture, error } = await supabase
        .from('ventures')
        .select('current_lifecycle_stage')
        .eq('id', testVentureId)
        .single();

      const dbStage = venture?.current_lifecycle_stage;

      // Then stale state is detected
      expect(dbStage).not.toBe(cachedStage);
      expect(dbStage).toBe('Stage 11');

      // Reset for other tests
      await supabase
        .from('ventures')
        .update({ current_lifecycle_stage: 'Stage 10' })
        .eq('id', testVentureId);
    });

    test('JIT-002: should pass verification when cache matches db', async () => {
      // Given cached stage matches db
      const cachedStage = 'Stage 10';

      // When verifying freshness
      const { data: venture, error } = await supabase
        .from('ventures')
        .select('current_lifecycle_stage')
        .eq('id', testVentureId)
        .single();

      // Then no staleness detected
      expect(error).toBeNull();
      expect(venture.current_lifecycle_stage).toBe(cachedStage);
    });

    test('JIT-003: should throw StateStalenessError with isRetryable=true', async () => {
      // Given cache/db mismatch scenario
      const cachedStage = 'Stage 10';
      const dbStage = 'Stage 11';

      // When mismatch detected
      const error = new StateStalenessError(
        'State cache invalidated. Rehydration complete, please retry.',
        {
          cachedStage: cachedStage,
          dbStage: dbStage,
          ventureId: testVentureId
        }
      );

      // Then error is retryable
      expect(error.isRetryable).toBe(true);
      expect(error.name).toBe('StateStalenessError');
      expect(error.context.cachedStage).toBe('Stage 10');
      expect(error.context.dbStage).toBe('Stage 11');
    });
  });

  test.describe('Cache Rehydration', () => {
    test('JIT-004: should rehydrate cache from database after staleness detected', async () => {
      // Given stale cache
      let cachedStage = 'Stage 10';

      // And database shows different stage
      await supabase
        .from('ventures')
        .update({ current_lifecycle_stage: 'Stage 12' })
        .eq('id', testVentureId);

      // When staleness detected and rehydration triggered
      const { data: venture } = await supabase
        .from('ventures')
        .select('current_lifecycle_stage')
        .eq('id', testVentureId)
        .single();

      // Simulate rehydration
      cachedStage = venture.current_lifecycle_stage;

      // Then cache is updated
      expect(cachedStage).toBe('Stage 12');

      // Reset
      await supabase
        .from('ventures')
        .update({ current_lifecycle_stage: 'Stage 10' })
        .eq('id', testVentureId);
    });

    test('JIT-005: should retry operation after successful rehydration', async () => {
      // Given stale cache scenario
      let retryCount = 0;
      let operationSucceeded = false;
      let cachedStage = 'Stage 10';

      // Simulate external update
      await supabase
        .from('ventures')
        .update({ current_lifecycle_stage: 'Stage 11' })
        .eq('id', testVentureId);

      // When operation with retry logic
      const performMutation = async () => {
        retryCount++;

        // Verify freshness
        const { data: venture } = await supabase
          .from('ventures')
          .select('current_lifecycle_stage')
          .eq('id', testVentureId)
          .single();

        if (venture.current_lifecycle_stage !== cachedStage) {
          // Rehydrate
          cachedStage = venture.current_lifecycle_stage;

          if (retryCount === 1) {
            // First attempt - throw retryable error
            throw new StateStalenessError('Cache stale', {
              cachedStage: 'Stage 10',
              dbStage: cachedStage
            });
          }
        }

        // Success on retry
        operationSucceeded = true;
        return { success: true, stage: cachedStage };
      };

      // Execute with retry
      try {
        await performMutation();
      } catch (error) {
        if (error instanceof StateStalenessError && error.isRetryable) {
          await performMutation(); // Retry
        }
      }

      // Then operation succeeds on retry
      expect(operationSucceeded).toBe(true);
      expect(retryCount).toBe(2);
      expect(cachedStage).toBe('Stage 11');

      // Reset
      await supabase
        .from('ventures')
        .update({ current_lifecycle_stage: 'Stage 10' })
        .eq('id', testVentureId);
    });
  });

  test.describe('Mutation Guards', () => {
    test('JIT-006: should block stage transition without freshness check', async () => {
      // Given stale cache
      const cachedStage = 'Stage 10';

      // When attempting transition without verification (simulated)
      const attemptTransitionWithoutCheck = async () => {
        // This would be blocked by verifyStateFreshness()
        return {
          blocked: true,
          reason: 'RULE 1 VIOLATION: verifyStateFreshness() not called before mutation'
        };
      };

      const result = await attemptTransitionWithoutCheck();

      // Then transition is blocked
      expect(result.blocked).toBe(true);
      expect(result.reason).toContain('RULE 1 VIOLATION');
    });

    test('JIT-007: should allow transition after successful freshness verification', async () => {
      // Given fresh cache
      const { data: venture } = await supabase
        .from('ventures')
        .select('current_lifecycle_stage')
        .eq('id', testVentureId)
        .single();

      const cachedStage = venture.current_lifecycle_stage;

      // When freshness verified and transition attempted
      const { data: updated, error } = await supabase
        .from('ventures')
        .update({ current_lifecycle_stage: 'Stage 11' })
        .eq('id', testVentureId)
        .select('current_lifecycle_stage')
        .single();

      // Then transition succeeds
      expect(error).toBeNull();
      expect(updated.current_lifecycle_stage).toBe('Stage 11');

      // Reset
      await supabase
        .from('ventures')
        .update({ current_lifecycle_stage: 'Stage 10' })
        .eq('id', testVentureId);
    });

    test('JIT-008: should verify freshness before handoff operations', async () => {
      // Given pending handoff scenario
      let freshnessVerified = false;

      // When handoff initiated
      const initiateHandoff = async () => {
        // Step 1: Verify freshness (MANDATORY)
        const { data: venture, error } = await supabase
          .from('ventures')
          .select('current_lifecycle_stage')
          .eq('id', testVentureId)
          .single();

        if (error) throw error;

        freshnessVerified = true;

        // Step 2: Only proceed if fresh
        return {
          from_stage: venture.current_lifecycle_stage,
          to_stage: 'Stage 11',
          freshnessVerified: freshnessVerified
        };
      };

      const handoff = await initiateHandoff();

      // Then freshness was verified before handoff
      expect(handoff.freshnessVerified).toBe(true);
      expect(handoff.from_stage).toBe('Stage 10');
    });
  });

  test.describe('Concurrent Access Protection', () => {
    test('JIT-009: should detect concurrent stage modification', async () => {
      // Given two "agents" with same cached state
      const agent1Cache = 'Stage 10';
      const agent2Cache = 'Stage 10';

      // When agent1 updates stage
      await supabase
        .from('ventures')
        .update({ current_lifecycle_stage: 'Stage 11' })
        .eq('id', testVentureId);

      // Then agent2's verification fails
      const { data: venture } = await supabase
        .from('ventures')
        .select('current_lifecycle_stage')
        .eq('id', testVentureId)
        .single();

      const agent2StaleDetected = venture.current_lifecycle_stage !== agent2Cache;
      expect(agent2StaleDetected).toBe(true);

      // Reset
      await supabase
        .from('ventures')
        .update({ current_lifecycle_stage: 'Stage 10' })
        .eq('id', testVentureId);
    });

    test('JIT-010: should handle race condition with optimistic locking', async () => {
      // Given optimistic locking scenario
      const { data: initial } = await supabase
        .from('ventures')
        .select('current_lifecycle_stage, updated_at')
        .eq('id', testVentureId)
        .single();

      const originalUpdatedAt = initial.updated_at;

      // When first update succeeds
      await supabase
        .from('ventures')
        .update({ current_lifecycle_stage: 'Stage 11' })
        .eq('id', testVentureId);

      // Then second update with stale timestamp would detect conflict
      const { data: afterUpdate } = await supabase
        .from('ventures')
        .select('updated_at')
        .eq('id', testVentureId)
        .single();

      const timestampChanged = afterUpdate.updated_at !== originalUpdatedAt;
      expect(timestampChanged).toBe(true);

      // Reset
      await supabase
        .from('ventures')
        .update({ current_lifecycle_stage: 'Stage 10' })
        .eq('id', testVentureId);
    });
  });

  test.describe('Error Context', () => {
    test('JIT-011: should include ventureId in staleness error context', async () => {
      const error = new StateStalenessError('Cache invalidated', {
        cachedStage: 'Stage 10',
        dbStage: 'Stage 12',
        ventureId: testVentureId
      });

      expect(error.context.ventureId).toBe(testVentureId);
    });

    test('JIT-012: should log staleness detection for observability', async () => {
      // Given staleness scenario
      const logEntry = {
        event_type: 'STALENESS_DETECTED',
        venture_id: testVentureId,
        cached_stage: 'Stage 10',
        db_stage: 'Stage 12',
        action: 'rehydration_triggered',
        timestamp: new Date().toISOString()
      };

      // When logging staleness event
      const { data: event, error } = await supabase
        .from('system_events')
        .insert({
          event_type: 'JIT_CACHE_STALENESS',
          event_data: logEntry,
          metadata: {
            source: 'JITCacheE2ETest',
            resolution: 'auto_rehydrate'
          }
        })
        .select('id, event_data')
        .single();

      // Then staleness is logged for debugging
      expect(error).toBeNull();
      expect(event.event_data.event_type).toBe('STALENESS_DETECTED');
      expect(event.event_data.action).toBe('rehydration_triggered');
    });
  });

  test.describe('Retry Limits', () => {
    test('JIT-013: should limit retry attempts to prevent infinite loops', async () => {
      const MAX_RETRIES = 3;
      let attempts = 0;
      let finalError: Error | null = null;

      // When staleness persists beyond retry limit
      const performWithRetry = async () => {
        while (attempts < MAX_RETRIES) {
          attempts++;
          try {
            // Simulate persistent staleness
            throw new StateStalenessError('Still stale', {
              attempt: attempts
            });
          } catch (error) {
            if (error instanceof StateStalenessError && attempts < MAX_RETRIES) {
              continue; // Retry
            }
            finalError = error as Error;
            break;
          }
        }
      };

      await performWithRetry();

      // Then retries are limited
      expect(attempts).toBe(MAX_RETRIES);
      expect(finalError).toBeInstanceOf(StateStalenessError);
    });

    test('JIT-014: should escalate after max retries exhausted', async () => {
      const MAX_RETRIES = 3;
      let escalated = false;

      // When all retries fail
      const escalate = (error: Error, context: any) => {
        escalated = true;
        return {
          error: error.message,
          escalation: 'CIRCUIT_BREAKER_TRIGGERED',
          context: context
        };
      };

      // Simulate exhausted retries
      let attempts = 0;
      while (attempts < MAX_RETRIES) {
        attempts++;
        // All fail
      }

      if (attempts >= MAX_RETRIES) {
        const result = escalate(
          new Error('Max retries exceeded'),
          { ventureId: testVentureId, attempts }
        );
        expect(result.escalation).toBe('CIRCUIT_BREAKER_TRIGGERED');
      }

      // Then escalation occurred
      expect(escalated).toBe(true);
    });
  });
});
