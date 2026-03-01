import { describe, it, expect, vi } from 'vitest';
import {
  enforceGuardrail,
  requestOverride,
  getEnforcementSummary,
  getEnforcementPolicy,
  getEnforcementModes,
} from '../../../lib/eva/guardrail-enforcement-engine.js';

function mockSupabase(tableData = {}) {
  return {
    from: vi.fn((table) => {
      const data = tableData[table] || { data: [], error: null };
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        gte: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        insert: vi.fn(() => ({ data: null, error: null })),
        then: (resolve) => resolve(data),
      };
      return chain;
    }),
  };
}

const silentLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('guardrail-enforcement-engine', () => {
  describe('enforceGuardrail', () => {
    it('returns error when missing params', async () => {
      const result = await enforceGuardrail(null, {});
      expect(result.enforced).toBe(false);
      expect(result.error).toBe('Missing required params');
    });

    it('passes when check result is passed', async () => {
      const result = await enforceGuardrail(null, {
        guardrailId: 'GR-VISION-ALIGNMENT',
        checkResult: { passed: true },
        sdId: 'sd-1',
      });

      expect(result.enforced).toBe(true);
      expect(result.blocked).toBe(false);
      expect(result.mode).toBe('blocking');
    });

    it('warns but does not block in advisory mode', async () => {
      const supabase = mockSupabase({
        eva_event_log: { data: null, error: null },
      });

      const result = await enforceGuardrail(supabase, {
        guardrailId: 'GR-CORRECTIVE-EXEMPT',  // advisory in default policy
        checkResult: { passed: false, violations: ['Missing exemption'] },
        sdId: 'sd-1',
      }, { logger: silentLogger });

      expect(result.enforced).toBe(true);
      expect(result.blocked).toBe(false);
      expect(result.mode).toBe('advisory');
    });

    it('blocks in blocking mode without override', async () => {
      const supabase = mockSupabase({
        chairman_decisions: { data: [], error: null },
        eva_event_log: { data: null, error: null },
      });

      const result = await enforceGuardrail(supabase, {
        guardrailId: 'GR-RISK-ASSESSMENT',  // blocking in default policy
        checkResult: { passed: false, violations: ['No risks identified'] },
        sdId: 'sd-1',
      }, { logger: silentLogger });

      expect(result.enforced).toBe(true);
      expect(result.blocked).toBe(true);
      expect(result.mode).toBe('blocking');
    });

    it('passes blocking mode when override exists', async () => {
      const supabase = mockSupabase({
        chairman_decisions: {
          data: [{ id: 'override-1' }],
          error: null,
        },
        eva_event_log: { data: null, error: null },
      });

      const result = await enforceGuardrail(supabase, {
        guardrailId: 'GR-RISK-ASSESSMENT',
        checkResult: { passed: false, violations: ['No risks'] },
        sdId: 'sd-1',
      }, { logger: silentLogger });

      expect(result.enforced).toBe(true);
      expect(result.blocked).toBe(false);
      expect(result.overrideAvailable).toBe(true);
    });

    it('respects policy overrides', async () => {
      const supabase = mockSupabase({
        eva_event_log: { data: null, error: null },
      });

      const result = await enforceGuardrail(supabase, {
        guardrailId: 'GR-RISK-ASSESSMENT',
        checkResult: { passed: false, violations: ['No risks'] },
        sdId: 'sd-1',
      }, {
        logger: silentLogger,
        policyOverrides: { 'GR-RISK-ASSESSMENT': 'advisory' },
      });

      expect(result.blocked).toBe(false);
      expect(result.mode).toBe('advisory');
    });

    it('skips when mode is disabled', async () => {
      const result = await enforceGuardrail(null, {
        guardrailId: 'GR-RISK-ASSESSMENT',
        checkResult: { passed: false },
        sdId: 'sd-1',
      }, {
        policyOverrides: { 'GR-RISK-ASSESSMENT': 'disabled' },
      });

      expect(result.enforced).toBe(false);
      expect(result.blocked).toBe(false);
      expect(result.mode).toBe('disabled');
    });
  });

  describe('requestOverride', () => {
    it('returns error when no supabase', async () => {
      const result = await requestOverride(null, {
        guardrailId: 'GR-RISK-ASSESSMENT',
        sdId: 'sd-1',
        rationale: 'Low risk SD',
      });
      expect(result.requested).toBe(false);
      expect(result.error).toBe('No supabase client');
    });

    it('returns error when missing params', async () => {
      const supabase = mockSupabase();
      const result = await requestOverride(supabase, {
        guardrailId: 'GR-RISK-ASSESSMENT',
        sdId: 'sd-1',
      });
      expect(result.requested).toBe(false);
      expect(result.error).toBe('Missing required params');
    });

    it('creates override request', async () => {
      const supabase = mockSupabase({
        chairman_decisions: { data: null, error: null },
      });

      const result = await requestOverride(supabase, {
        guardrailId: 'GR-RISK-ASSESSMENT',
        sdId: 'sd-1',
        rationale: 'Low risk infrastructure SD',
        beforeState: { score: 50 },
      }, { logger: silentLogger });

      expect(result.requested).toBe(true);
      expect(result.decisionId).toBeDefined();
    });
  });

  describe('getEnforcementSummary', () => {
    it('returns empty when no supabase', async () => {
      const { summary, error } = await getEnforcementSummary(null);
      expect(summary.totalGuardrails).toBe(0);
      expect(error).toBeDefined();
    });

    it('returns summary with event counts', async () => {
      const events = [
        { id: 'e1', payload: { action: 'blocked' }, created_at: new Date().toISOString() },
        { id: 'e2', payload: { action: 'blocked' }, created_at: new Date().toISOString() },
        { id: 'e3', payload: { action: 'warned' }, created_at: new Date().toISOString() },
        { id: 'e4', payload: { action: 'override_applied' }, created_at: new Date().toISOString() },
      ];

      const overrides = [
        { id: 'o1', status: 'approved', context: {}, created_at: new Date().toISOString() },
        { id: 'o2', status: 'pending', context: {}, created_at: new Date().toISOString() },
        { id: 'o3', status: 'rejected', context: {}, created_at: new Date().toISOString() },
      ];

      const supabase = mockSupabase({
        eva_event_log: { data: events, error: null },
        chairman_decisions: { data: overrides, error: null },
      });

      const { summary } = await getEnforcementSummary(supabase, { logger: silentLogger });
      expect(summary.totalGuardrails).toBe(9); // All guardrails in policy
      expect(summary.totalBlocked).toBe(2);
      expect(summary.totalWarned).toBe(1);
      expect(summary.totalOverrideApplied).toBe(1);
      expect(summary.pendingOverrides).toBe(1);
      expect(summary.approvedOverrides).toBe(1);
      expect(summary.rejectedOverrides).toBe(1);
      expect(summary.approvalRate).toBe(33); // 1/3 = 33%
    });

    it('returns correct blocking/advisory counts', async () => {
      const supabase = mockSupabase({
        eva_event_log: { data: [], error: null },
        chairman_decisions: { data: [], error: null },
      });

      const { summary } = await getEnforcementSummary(supabase, { logger: silentLogger });
      expect(summary.blockingCount).toBe(8); // 8 blocking in default policy
      expect(summary.advisoryCount).toBe(1); // 1 advisory (GR-CORRECTIVE-EXEMPT)
    });
  });

  describe('getEnforcementPolicy', () => {
    it('returns policy with all guardrails', () => {
      const policy = getEnforcementPolicy();
      expect(Object.keys(policy)).toHaveLength(9);
      expect(policy['GR-VISION-ALIGNMENT']).toBe('blocking');
      expect(policy['GR-CORRECTIVE-EXEMPT']).toBe('advisory');
      expect(policy['GR-RISK-ASSESSMENT']).toBe('blocking'); // Upgraded
      expect(policy['GR-BRAINSTORM-INTENT']).toBe('blocking'); // Upgraded
    });

    it('returns a copy', () => {
      const policy = getEnforcementPolicy();
      policy['GR-VISION-ALIGNMENT'] = 'disabled';
      expect(getEnforcementPolicy()['GR-VISION-ALIGNMENT']).toBe('blocking');
    });
  });

  describe('getEnforcementModes', () => {
    it('returns all modes', () => {
      const modes = getEnforcementModes();
      expect(modes.ADVISORY).toBe('advisory');
      expect(modes.BLOCKING).toBe('blocking');
      expect(modes.DISABLED).toBe('disabled');
    });
  });
});
