/**
 * Tests for checkEscalationThreshold — PRIORITY_QUEUE age-based escalation to EVENT
 * SD-MAN-GEN-CORRECTIVE-VISION-GAP-014 (A04: event_rounds_priority_queue_work_routing)
 */

import { describe, it, expect, vi } from 'vitest';
import { checkEscalationThreshold, ESCALATION_THRESHOLD_MS } from '../../../lib/eva/event-bus/event-router.js';

const silentLogger = { warn() {}, info() {}, error() {}, debug() {}, log() {} };

function createMockSupabase(staleItems = [], errors = {}) {
  const updates = [];
  const inserts = [];

  return {
    _updates: updates,
    _inserts: inserts,
    from(table) {
      return {
        select(cols) {
          return {
            eq(col, val) { return this; },
            lt(col, val) { return this; },
            order(col, opts) { return this; },
            limit(n) {
              if (errors.query) return Promise.resolve({ data: null, error: { message: errors.query } });
              return Promise.resolve({ data: staleItems, error: null });
            },
            single() { return Promise.resolve({ data: null, error: null }); },
          };
        },
        update(payload) {
          updates.push({ table, payload });
          return {
            eq(col, val) {
              return Promise.resolve({ error: null });
            },
          };
        },
        insert(payload) {
          inserts.push({ table, payload });
          return {
            select() {
              return {
                single() {
                  return Promise.resolve({ data: { id: 'mock-queue-id' }, error: null });
                },
              };
            },
          };
        },
      };
    },
  };
}

describe('checkEscalationThreshold (GAP-014)', () => {
  it('exports ESCALATION_THRESHOLD_MS as 30 minutes', () => {
    expect(ESCALATION_THRESHOLD_MS).toBe(30 * 60 * 1000);
  });

  it('returns zero counts when no stale items found', async () => {
    const supabase = createMockSupabase([]);
    const result = await checkEscalationThreshold(supabase, { logger: silentLogger });
    expect(result.checked).toBe(0);
    expect(result.escalated).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('returns error when no supabase client provided', async () => {
    const result = await checkEscalationThreshold(null, { logger: silentLogger });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/No supabase client/);
  });

  it('returns error on query failure', async () => {
    const supabase = createMockSupabase([], { query: 'connection refused' });
    const result = await checkEscalationThreshold(supabase, { logger: silentLogger });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/Query failed/);
  });

  it('accepts configurable threshold', async () => {
    const supabase = createMockSupabase([]);
    const result = await checkEscalationThreshold(supabase, {
      thresholdMs: 60 * 60 * 1000, // 1 hour
      logger: silentLogger,
    });
    expect(result.checked).toBe(0);
    expect(result.errors).toHaveLength(0);
  });
});
