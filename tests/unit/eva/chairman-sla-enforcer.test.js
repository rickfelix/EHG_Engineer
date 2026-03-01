import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  enforceDecisionSLAs,
  escalateDecision,
  getDecisionSLAStatus,
  DEFAULT_SLA_MATRIX,
} from '../../../lib/eva/chairman-sla-enforcer.js';

function makeDecision(overrides = {}) {
  return {
    id: 'dec-001',
    decision_type: 'gate_decision',
    created_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // 5h ago (overdue for gate_decision 4h SLA)
    blocking: false,
    venture_id: 'v-1',
    metadata: {},
    ...overrides,
  };
}

function mockSupabase(overrides = {}) {
  const selectResult = overrides.selectData
    ? { data: overrides.selectData, error: null }
    : overrides.selectError
      ? { data: null, error: { message: overrides.selectError } }
      : { data: [], error: null };

  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    then: (resolve) => resolve(selectResult),
  };

  const updateResult = overrides.updateError
    ? { error: { message: overrides.updateError } }
    : { error: null };

  const insertResult = overrides.insertError
    ? { error: { message: overrides.insertError } }
    : { error: null };

  return {
    from: vi.fn((table) => ({
      ...chain,
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve(updateResult)),
      })),
      insert: vi.fn(() => Promise.resolve(insertResult)),
    })),
  };
}

const silentLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('chairman-sla-enforcer', () => {
  describe('DEFAULT_SLA_MATRIX', () => {
    it('has expected decision types', () => {
      expect(DEFAULT_SLA_MATRIX.gate_decision).toBe(4 * 60 * 60 * 1000);
      expect(DEFAULT_SLA_MATRIX.budget_review).toBe(2 * 60 * 60 * 1000);
      expect(DEFAULT_SLA_MATRIX.advisory).toBe(24 * 60 * 60 * 1000);
      expect(Object.isFrozen(DEFAULT_SLA_MATRIX)).toBe(true);
    });
  });

  describe('enforceDecisionSLAs', () => {
    it('returns empty result when no pending decisions', async () => {
      const supabase = mockSupabase({ selectData: [] });
      const result = await enforceDecisionSLAs(supabase, { logger: silentLogger });

      expect(result.checked).toBe(0);
      expect(result.escalated).toBe(0);
    });

    it('escalates overdue decisions', async () => {
      const overdueDecision = makeDecision(); // 5h old, gate_decision SLA is 4h
      const supabase = mockSupabase({ selectData: [overdueDecision] });

      const result = await enforceDecisionSLAs(supabase, { logger: silentLogger });

      expect(result.checked).toBe(1);
      expect(result.escalated).toBe(1);
      expect(result.skipped).toBe(0);
    });

    it('skips blocking decisions', async () => {
      const blockingDecision = makeDecision({ blocking: true });
      const supabase = mockSupabase({ selectData: [blockingDecision] });

      const result = await enforceDecisionSLAs(supabase, { logger: silentLogger });

      expect(result.checked).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.escalated).toBe(0);
    });

    it('skips already-escalated decisions', async () => {
      const escalatedDecision = makeDecision({
        metadata: { escalation: { escalated_at: '2026-01-01' } },
      });
      const supabase = mockSupabase({ selectData: [escalatedDecision] });

      const result = await enforceDecisionSLAs(supabase, { logger: silentLogger });

      expect(result.skipped).toBe(1);
      expect(result.escalated).toBe(0);
    });

    it('does not escalate decisions within SLA', async () => {
      const recentDecision = makeDecision({
        created_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // 1h ago
      });
      const supabase = mockSupabase({ selectData: [recentDecision] });

      const result = await enforceDecisionSLAs(supabase, { logger: silentLogger });

      expect(result.checked).toBe(1);
      expect(result.escalated).toBe(0);
    });

    it('returns error when no supabase', async () => {
      const result = await enforceDecisionSLAs(null);
      expect(result.errors).toContain('No supabase client');
    });
  });

  describe('escalateDecision', () => {
    it('flags decision and writes audit event', async () => {
      const decision = makeDecision();
      const supabase = mockSupabase();

      const result = await escalateDecision(supabase, decision, {
        slaMs: 4 * 3600000,
        ageMs: 5 * 3600000,
        logger: silentLogger,
      });

      expect(result.escalated).toBe(true);
      // Verify audit write
      expect(supabase.from).toHaveBeenCalledWith('eva_orchestration_events');
    });

    it('returns escalated=true even if audit write fails', async () => {
      const decision = makeDecision();
      const supabase = mockSupabase({ insertError: 'Audit write failed' });

      const result = await escalateDecision(supabase, decision, {
        slaMs: 4 * 3600000,
        ageMs: 5 * 3600000,
        logger: silentLogger,
      });

      expect(result.escalated).toBe(true);
      expect(result.warning).toBeDefined();
    });
  });

  describe('getDecisionSLAStatus', () => {
    it('returns overdue for expired decisions', () => {
      const decision = {
        decision_type: 'gate_decision',
        created_at: new Date(Date.now() - 5 * 3600000).toISOString(),
      };

      const status = getDecisionSLAStatus(decision);
      expect(status.overdue).toBe(true);
      expect(status.remainingMs).toBe(0);
    });

    it('returns not overdue for recent decisions', () => {
      const decision = {
        decision_type: 'advisory',
        created_at: new Date(Date.now() - 1 * 3600000).toISOString(), // 1h ago, SLA is 24h
      };

      const status = getDecisionSLAStatus(decision);
      expect(status.overdue).toBe(false);
      expect(status.remainingMs).toBeGreaterThan(0);
    });

    it('uses fallback SLA for unknown decision types', () => {
      const decision = {
        decision_type: 'unknown_type',
        created_at: new Date(Date.now() - 1 * 3600000).toISOString(),
      };

      const status = getDecisionSLAStatus(decision);
      expect(status.slaMs).toBe(24 * 3600000); // Default 24h
    });
  });
});
