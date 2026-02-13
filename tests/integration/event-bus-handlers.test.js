/**
 * Integration Tests: EVA Event Bus Handler Wiring
 * SD: SD-EVA-FEAT-EVENT-BUS-001
 *
 * Tests the full event processing pipeline:
 * - Handler registration (idempotent)
 * - Event routing to correct handlers
 * - Retry logic with exponential backoff
 * - DLQ for permanently failed events
 * - Idempotency (duplicate delivery)
 * - Feature flag gating
 * - DLQ replay
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Import event bus modules
import {
  initializeEventBus,
  registerHandler,
  getHandler,
  listRegisteredTypes,
  getHandlerCount,
  clearHandlers,
  getRegistryCounts,
  processEvent,
  replayDLQEntry,
} from '../../lib/eva/event-bus/index.js';

// Test fixtures
let testVentureId;
let testEventIds = [];
let testDlqIds = [];

let createdTestVenture = false;

async function createTestVenture() {
  // Find an existing eva_venture to use (FK references eva_ventures)
  const { data: ventures } = await supabase
    .from('eva_ventures')
    .select('id')
    .limit(1);

  if (ventures && ventures.length > 0) {
    return ventures[0].id;
  }

  // Create a test eva_venture
  const { data: newVenture, error } = await supabase
    .from('eva_ventures')
    .insert({ name: 'Test Venture (event-bus-tests)', status: 'active' })
    .select('id')
    .single();

  if (error) {
    console.warn('Could not create test venture:', error.message);
    return null;
  }
  createdTestVenture = true;
  return newVenture.id;
}

async function createTestEvent(eventType, eventData, ventureId) {
  const { data, error } = await supabase
    .from('eva_events')
    .insert({
      eva_venture_id: ventureId,
      event_type: eventType,
      event_source: 'test',
      event_data: eventData,
      processed: false,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to create test event: ${error.message}`);
  testEventIds.push(data.id);
  return data.id;
}

async function cleanup() {
  // Clean up test DLQ entries
  if (testDlqIds.length > 0) {
    await supabase.from('eva_events_dlq').delete().in('id', testDlqIds);
  }

  // Clean up test ledger entries
  if (testEventIds.length > 0) {
    await supabase.from('eva_event_ledger').delete().in('event_id', testEventIds);
    // Clean up DLQ entries by event_id
    await supabase.from('eva_events_dlq').delete().in('event_id', testEventIds);
  }

  // Clean up test events
  if (testEventIds.length > 0) {
    await supabase.from('eva_events').delete().in('id', testEventIds);
  }

  // Clean up test venture if we created one
  if (createdTestVenture && testVentureId) {
    // Clean up any audit log entries first (FK)
    await supabase.from('eva_audit_log').delete().eq('eva_venture_id', testVentureId);
    await supabase.from('eva_events').delete().eq('eva_venture_id', testVentureId);
    await supabase.from('eva_ventures').delete().eq('id', testVentureId);
  }
}

describe('EVA Event Bus Handler Wiring', () => {
  beforeAll(async () => {
    testVentureId = await createTestVenture();
    // Enable event bus for tests
    await supabase
      .from('eva_config')
      .upsert({ key: 'event_bus.enabled', value: 'true' });
  });

  afterAll(async () => {
    await cleanup();
    clearHandlers();
    // Reset feature flag
    await supabase
      .from('eva_config')
      .upsert({ key: 'event_bus.enabled', value: 'false' });
  });

  beforeEach(() => {
    clearHandlers();
  });

  describe('Handler Registration', () => {
    it('should register handlers idempotently', async () => {
      const result1 = await initializeEventBus(supabase);
      expect(result1.registered).toBe(true);
      expect(result1.handlerCount).toBe(3);
      expect(result1.types).toContain('stage.completed');
      expect(result1.types).toContain('decision.submitted');
      expect(result1.types).toContain('gate.evaluated');

      // Second registration should not increase count
      const result2 = await initializeEventBus(supabase);
      expect(result2.handlerCount).toBe(3);
    });

    it('should register exactly 1 subscriber per event type', () => {
      registerHandler('stage.completed', async () => ({}), { name: 'test1' });
      registerHandler('stage.completed', async () => ({}), { name: 'test2' }); // replaces

      const counts = getRegistryCounts();
      expect(counts.get('stage.completed')).toBe(1);
      expect(getHandlerCount()).toBe(1);
    });

    it('should not register handlers when feature flag is OFF', async () => {
      await supabase.from('eva_config').upsert({ key: 'event_bus.enabled', value: 'false' });

      const result = await initializeEventBus(supabase);
      expect(result.registered).toBe(false);
      expect(result.handlerCount).toBe(0);

      // Re-enable for remaining tests
      await supabase.from('eva_config').upsert({ key: 'event_bus.enabled', value: 'true' });
    });
  });

  describe('Event Processing: stage.completed', () => {
    beforeEach(async () => {
      await initializeEventBus(supabase);
    });

    it('should invoke handler and record success in ledger', async () => {
      if (!testVentureId) return; // Skip if no venture

      const eventId = await createTestEvent('stage.completed', {
        ventureId: testVentureId,
        stageId: 'test-stage-1',
        completedAt: new Date().toISOString(),
      }, testVentureId);

      const result = await processEvent(supabase, {
        id: eventId,
        event_type: 'stage.completed',
        event_data: { ventureId: testVentureId, stageId: 'test-stage-1' },
        eva_venture_id: testVentureId,
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('success');
      expect(result.attempts).toBeGreaterThanOrEqual(1);

      // Verify ledger entry
      const { data: ledger } = await supabase
        .from('eva_event_ledger')
        .select('status, handler_name, attempts')
        .eq('event_id', eventId)
        .eq('status', 'success')
        .single();

      expect(ledger).toBeTruthy();
      expect(ledger.status).toBe('success');
      expect(ledger.handler_name).toBe('StageCompletedHandler');
    });
  });

  describe('Event Processing: decision.submitted', () => {
    beforeEach(async () => {
      await initializeEventBus(supabase);
    });

    it('should handle decision submitted for non-blocked venture', async () => {
      if (!testVentureId) return;

      // Find any existing decision
      const { data: decisions } = await supabase
        .from('chairman_decisions')
        .select('id, venture_id')
        .limit(1);

      if (!decisions || decisions.length === 0) return; // Skip if no decisions

      const decisionId = decisions[0].id;
      const decVentureId = decisions[0].venture_id;

      const eventId = await createTestEvent('decision.submitted', {
        ventureId: decVentureId,
        decisionId: decisionId,
      }, testVentureId);

      const result = await processEvent(supabase, {
        id: eventId,
        event_type: 'decision.submitted',
        event_data: { ventureId: decVentureId, decisionId: decisionId },
        eva_venture_id: testVentureId,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Event Processing: gate.evaluated', () => {
    beforeEach(async () => {
      await initializeEventBus(supabase);
    });

    it('should route proceed/block/kill correctly', async () => {
      if (!testVentureId) return;

      // Test proceed
      const proceedEventId = await createTestEvent('gate.evaluated', {
        ventureId: testVentureId,
        gateId: 'test-gate-1',
        outcome: 'proceed',
      }, testVentureId);

      const proceedResult = await processEvent(supabase, {
        id: proceedEventId,
        event_type: 'gate.evaluated',
        event_data: { ventureId: testVentureId, gateId: 'test-gate-1', outcome: 'proceed' },
        eva_venture_id: testVentureId,
      });
      expect(proceedResult.success).toBe(true);

      // Test block
      const blockEventId = await createTestEvent('gate.evaluated', {
        ventureId: testVentureId,
        gateId: 'test-gate-2',
        outcome: 'block',
        reason: 'Quality threshold not met',
      }, testVentureId);

      const blockResult = await processEvent(supabase, {
        id: blockEventId,
        event_type: 'gate.evaluated',
        event_data: { ventureId: testVentureId, gateId: 'test-gate-2', outcome: 'block', reason: 'Quality threshold not met' },
        eva_venture_id: testVentureId,
      });
      expect(blockResult.success).toBe(true);

      // Test kill
      const killEventId = await createTestEvent('gate.evaluated', {
        ventureId: testVentureId,
        gateId: 'test-gate-3',
        outcome: 'kill',
      }, testVentureId);

      const killResult = await processEvent(supabase, {
        id: killEventId,
        event_type: 'gate.evaluated',
        event_data: { ventureId: testVentureId, gateId: 'test-gate-3', outcome: 'kill' },
        eva_venture_id: testVentureId,
      });
      expect(killResult.success).toBe(true);
    });
  });

  describe('Validation & DLQ', () => {
    beforeEach(async () => {
      await initializeEventBus(supabase);
    });

    it('should route to DLQ on missing required field (non-retryable)', async () => {
      // Missing ventureId
      const eventId = await createTestEvent('stage.completed', {
        stageId: 'test-stage-no-venture',
      }, testVentureId);

      const result = await processEvent(supabase, {
        id: eventId,
        event_type: 'stage.completed',
        event_data: { stageId: 'test-stage-no-venture' },
        eva_venture_id: testVentureId,
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('validation_error');

      // Verify DLQ entry
      const { data: dlqEntries } = await supabase
        .from('eva_events_dlq')
        .select('id, failure_reason, attempt_count, status')
        .eq('event_id', eventId);

      expect(dlqEntries.length).toBeGreaterThanOrEqual(1);
      expect(dlqEntries[0].failure_reason).toBe('validation_error');
      expect(dlqEntries[0].attempt_count).toBe(1);
      expect(dlqEntries[0].status).toBe('dead');
    });

    it('should retry transient failures then succeed', async () => {
      if (!testVentureId) return;

      let callCount = 0;
      registerHandler('stage.completed', async (payload, ctx) => {
        callCount++;
        if (callCount <= 2) {
          const err = new Error('503 Service Temporarily Unavailable');
          err.retryable = true;
          throw err;
        }
        return { outcome: 'advanced' };
      }, { name: 'RetryTestHandler', retryable: true, maxRetries: 3 });

      const eventId = await createTestEvent('stage.completed', {
        ventureId: testVentureId,
        stageId: 'test-retry-stage',
      }, testVentureId);

      const result = await processEvent(supabase, {
        id: eventId,
        event_type: 'stage.completed',
        event_data: { ventureId: testVentureId, stageId: 'test-retry-stage' },
        eva_venture_id: testVentureId,
      }, { maxRetries: 3, baseDelayMs: 10 }); // Fast delays for test

      expect(result.success).toBe(true);
      expect(result.status).toBe('success');
      expect(result.attempts).toBe(3);
      expect(callCount).toBe(3);
    });

    it('should move to DLQ after all retries exhausted', async () => {
      registerHandler('stage.completed', async () => {
        throw new Error('503 Persistent failure');
      }, { name: 'AlwaysFailHandler', retryable: true, maxRetries: 3 });

      const eventId = await createTestEvent('stage.completed', {
        ventureId: testVentureId || 'fake-venture',
        stageId: 'test-exhausted-stage',
      }, testVentureId);

      const result = await processEvent(supabase, {
        id: eventId,
        event_type: 'stage.completed',
        event_data: { ventureId: testVentureId || 'fake-venture', stageId: 'test-exhausted-stage' },
        eva_venture_id: testVentureId,
      }, { maxRetries: 3, baseDelayMs: 10 });

      expect(result.success).toBe(false);
      expect(result.status).toBe('max_retries_exhausted');
      expect(result.attempts).toBe(3);

      // Verify DLQ entry
      const { data: dlqEntries } = await supabase
        .from('eva_events_dlq')
        .select('failure_reason, attempt_count, status, error_message')
        .eq('event_id', eventId);

      expect(dlqEntries.length).toBeGreaterThanOrEqual(1);
      const dlq = dlqEntries[0];
      expect(dlq.failure_reason).toBe('max_retries_exhausted');
      expect(dlq.attempt_count).toBe(3);
      expect(dlq.status).toBe('dead');
      expect(dlq.error_message).toContain('Persistent failure');
    });
  });

  describe('Idempotency', () => {
    beforeEach(async () => {
      await initializeEventBus(supabase);
    });

    it('should skip duplicate event delivery', async () => {
      if (!testVentureId) return;

      const eventId = await createTestEvent('stage.completed', {
        ventureId: testVentureId,
        stageId: 'test-idempotency-stage',
      }, testVentureId);

      // First processing
      const result1 = await processEvent(supabase, {
        id: eventId,
        event_type: 'stage.completed',
        event_data: { ventureId: testVentureId, stageId: 'test-idempotency-stage' },
        eva_venture_id: testVentureId,
      });
      expect(result1.success).toBe(true);
      expect(result1.status).toBe('success');

      // Second processing (duplicate)
      const result2 = await processEvent(supabase, {
        id: eventId,
        event_type: 'stage.completed',
        event_data: { ventureId: testVentureId, stageId: 'test-idempotency-stage' },
        eva_venture_id: testVentureId,
      });
      expect(result2.success).toBe(true);
      expect(result2.status).toBe('duplicate_event');
      expect(result2.attempts).toBe(0);

      // Only 1 success entry in ledger
      const { data: ledgerEntries } = await supabase
        .from('eva_event_ledger')
        .select('id, status')
        .eq('event_id', eventId)
        .eq('status', 'success');

      expect(ledgerEntries.length).toBe(1);
    });
  });

  describe('DLQ Replay', () => {
    beforeEach(async () => {
      await initializeEventBus(supabase);
    });

    it('should replay DLQ entry and mark as replayed', async () => {
      if (!testVentureId) return;

      // First, create a handler that always fails
      let shouldFail = true;
      registerHandler('stage.completed', async (payload) => {
        if (shouldFail) throw new Error('503 Temporary failure for replay test');
        return { outcome: 'replay_success' };
      }, { name: 'ReplayTestHandler', retryable: true, maxRetries: 1 });

      const eventId = await createTestEvent('stage.completed', {
        ventureId: testVentureId,
        stageId: 'test-replay-stage',
      }, testVentureId);

      // Process - will fail and go to DLQ
      await processEvent(supabase, {
        id: eventId,
        event_type: 'stage.completed',
        event_data: { ventureId: testVentureId, stageId: 'test-replay-stage' },
        eva_venture_id: testVentureId,
      }, { maxRetries: 1, baseDelayMs: 10 });

      // Get DLQ entry
      const { data: dlqEntries } = await supabase
        .from('eva_events_dlq')
        .select('id')
        .eq('event_id', eventId)
        .eq('status', 'dead');

      expect(dlqEntries.length).toBeGreaterThanOrEqual(1);
      const dlqId = dlqEntries[0].id;
      testDlqIds.push(dlqId);

      // Now "fix" the downstream - make handler succeed
      shouldFail = false;
      registerHandler('stage.completed', async (payload) => {
        return { outcome: 'replay_success' };
      }, { name: 'ReplayTestHandler' });

      // Replay
      const replayResult = await replayDLQEntry(supabase, dlqId, { replayedBy: 'test' });
      expect(replayResult.success).toBe(true);

      // Verify DLQ entry is marked replayed
      const { data: updatedDlq } = await supabase
        .from('eva_events_dlq')
        .select('status, replayed_at, replayed_by')
        .eq('id', dlqId)
        .single();

      expect(updatedDlq.status).toBe('replayed');
      expect(updatedDlq.replayed_by).toBe('test');
      expect(updatedDlq.replayed_at).toBeTruthy();
    });
  });
});
