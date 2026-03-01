import { describe, it, expect, vi } from 'vitest';
import {
  trackAuthorityCoverage,
  getAuthorityEnforcementSummary,
  getDimensionInfo,
} from '../../../lib/eva/cli-authority-tracker.js';

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

describe('cli-authority-tracker', () => {
  describe('trackAuthorityCoverage', () => {
    it('returns error when no supabase', async () => {
      const result = await trackAuthorityCoverage(null);
      expect(result.metrics.totalEvents).toBe(0);
      expect(result.error).toBeDefined();
    });

    it('returns zero coverage with no events', async () => {
      const supabase = mockSupabase({
        eva_event_log: { data: [], error: null },
      });

      const result = await trackAuthorityCoverage(supabase, { logger: silentLogger });
      expect(result.metrics.totalEvents).toBe(0);
      expect(result.coverage.overallPercent).toBe(0);
    });

    it('detects validator types from enforcement events', async () => {
      const events = [
        { event_type: 'aegis_enforcement', event_data: { validator_type: 'FieldCheckValidator', action: 'BLOCK' }, created_at: new Date().toISOString() },
        { event_type: 'aegis_violation', event_data: { validator_type: 'ThresholdValidator', action: 'WARN' }, created_at: new Date().toISOString() },
      ];

      const supabase = mockSupabase({
        eva_event_log: { data: events, error: null },
      });

      const result = await trackAuthorityCoverage(supabase, { logger: silentLogger });
      expect(result.metrics.enforcementEvents).toBe(2);
      expect(result.metrics.validatorTypesSeen).toBe(2);
      expect(result.metrics.actionsSeen).toBe(2);
      // 2/5 validators = 40%, 2/3 actions = 67%
      expect(result.coverage.validatorCoverage).toBe(40);
      expect(result.coverage.actionCoverage).toBe(67);
    });

    it('detects command category coverage', async () => {
      const events = [
        { event_type: 'handoff_command_run', event_data: {}, created_at: new Date().toISOString() },
        { event_type: 'ship_command_run', event_data: {}, created_at: new Date().toISOString() },
        { event_type: 'claim_command_run', event_data: {}, created_at: new Date().toISOString() },
        { event_type: 'status_command_run', event_data: {}, created_at: new Date().toISOString() },
      ];

      const supabase = mockSupabase({
        eva_event_log: { data: events, error: null },
      });

      const result = await trackAuthorityCoverage(supabase, { logger: silentLogger });
      expect(result.metrics.commandCategoriesSeen).toBe(4); // handoff, ship, claim, status
      expect(result.coverage.commandCoverage).toBe(50); // 4/8
    });

    it('identifies gaps for missing validators', async () => {
      const supabase = mockSupabase({
        eva_event_log: { data: [], error: null },
      });

      const result = await trackAuthorityCoverage(supabase, { logger: silentLogger });
      const validatorGaps = result.gaps.filter((g) => g.category === 'validator');
      expect(validatorGaps).toHaveLength(5); // All 5 validator types missing
    });

    it('identifies gaps for missing enforcement actions', async () => {
      const supabase = mockSupabase({
        eva_event_log: { data: [], error: null },
      });

      const result = await trackAuthorityCoverage(supabase, { logger: silentLogger });
      const actionGaps = result.gaps.filter((g) => g.category === 'action');
      expect(actionGaps).toHaveLength(3); // BLOCK, WARN, AUDIT
    });

    it('handles query error', async () => {
      const supabase = mockSupabase({
        eva_event_log: { data: null, error: { message: 'Connection lost' } },
      });

      const result = await trackAuthorityCoverage(supabase, { logger: silentLogger });
      expect(result.error).toBe('Connection lost');
      expect(result.metrics.totalEvents).toBe(0);
    });

    it('calculates overall coverage as average of three dimensions', async () => {
      // 3/5 validators = 60%, 3/3 actions = 100%, 4/8 commands = 50%
      const events = [
        { event_type: 'aegis_enforcement', event_data: { validator_type: 'FieldCheckValidator', action: 'BLOCK' }, created_at: new Date().toISOString() },
        { event_type: 'enforcement_run', event_data: { validator_type: 'ThresholdValidator', action: 'WARN' }, created_at: new Date().toISOString() },
        { event_type: 'aegis_violation', event_data: { validator_type: 'CustomValidator', action: 'AUDIT' }, created_at: new Date().toISOString() },
        { event_type: 'handoff_command', event_data: {}, created_at: new Date().toISOString() },
        { event_type: 'create_command', event_data: {}, created_at: new Date().toISOString() },
        { event_type: 'status_command', event_data: {}, created_at: new Date().toISOString() },
        { event_type: 'heal_command', event_data: {}, created_at: new Date().toISOString() },
      ];

      const supabase = mockSupabase({
        eva_event_log: { data: events, error: null },
      });

      const result = await trackAuthorityCoverage(supabase, { logger: silentLogger });
      expect(result.coverage.validatorCoverage).toBe(60);
      expect(result.coverage.actionCoverage).toBe(100);
      expect(result.coverage.commandCoverage).toBe(50); // 4/8: handoff, create, status, heal
      // (60 + 100 + 50) / 3 = 70
      expect(result.coverage.overallPercent).toBe(70);
    });
  });

  describe('getAuthorityEnforcementSummary', () => {
    it('returns error when no supabase', async () => {
      const { summary, error } = await getAuthorityEnforcementSummary(null);
      expect(summary.coveragePercent).toBe(0);
      expect(error).toBeDefined();
    });

    it('returns summary with event counts', async () => {
      const events = [
        { event_type: 'aegis_enforcement', event_data: { validator_type: 'FieldCheckValidator', action: 'BLOCK' }, created_at: new Date().toISOString() },
      ];

      const supabase = mockSupabase({
        eva_event_log: { data: events, error: null },
      });

      const { summary } = await getAuthorityEnforcementSummary(supabase, { logger: silentLogger });
      expect(summary.totalEvents).toBe(1);
      expect(summary.enforcementEvents).toBe(1);
    });
  });

  describe('getDimensionInfo', () => {
    it('returns V06 info', () => {
      const info = getDimensionInfo();
      expect(info.dimension).toBe('V06');
      expect(info.name).toBe('CLI Authority');
      expect(info.validatorTypes).toHaveLength(5);
      expect(info.enforcementActions).toHaveLength(3);
      expect(info.commandCategories).toHaveLength(8);
    });
  });
});
