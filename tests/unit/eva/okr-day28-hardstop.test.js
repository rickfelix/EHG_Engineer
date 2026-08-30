import { describe, it, expect, vi } from 'vitest';
import {
  isDay28OrLater,
  periodFor,
  runOkrDay28HardStop,
} from '../../../lib/eva/jobs/okr-day28-hardstop.js';

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

function mockSupabase({ existingDecision = [], krs = [], insertedId = 'decision-1' } = {}) {
  const insertCalls = [];
  const tables = {};

  const makeTable = (table) => {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      limit: vi.fn(() => Promise.resolve(
        table === 'chairman_decisions'
          ? { data: existingDecision, error: null }
          : table === 'key_results'
            ? { data: krs, error: null }
            : { data: [], error: null }
      )),
      insert: vi.fn((payload) => {
        insertCalls.push({ table, payload });
        return {
          select: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: { id: insertedId }, error: null })),
          })),
        };
      }),
      then: (resolve) => resolve(
        table === 'key_results'
          ? { data: krs, error: null }
          : { data: [], error: null }
      ),
    };
    return chain;
  };

  const supabase = {
    from: vi.fn((table) => {
      tables[table] = tables[table] || makeTable(table);
      return tables[table];
    }),
    __insertCalls: insertCalls,
  };
  return supabase;
}

describe('okr-day28-hardstop', () => {
  describe('isDay28OrLater', () => {
    it('returns false for day 27', () => {
      expect(isDay28OrLater(new Date('2026-08-27T12:00:00Z'))).toBe(false);
    });

    it('returns true for day 28', () => {
      expect(isDay28OrLater(new Date('2026-08-28T00:00:00Z'))).toBe(true);
    });

    it('returns true for day 31', () => {
      expect(isDay28OrLater(new Date('2026-08-31T23:59:59Z'))).toBe(true);
    });
  });

  describe('periodFor', () => {
    it('formats as YYYY-MM', () => {
      expect(periodFor(new Date('2026-08-28T00:00:00Z'))).toBe('2026-08');
    });
  });

  describe('runOkrDay28HardStop', () => {
    it('does not fire before day 28', async () => {
      const supabase = mockSupabase();
      const result = await runOkrDay28HardStop({
        supabase,
        logger: silentLogger,
        now: new Date('2026-08-27T12:00:00Z'),
      });
      expect(result).toEqual({ fired: false, reason: 'before-day-28' });
      expect(supabase.__insertCalls).toHaveLength(0);
    });

    it('fires exactly once on day 28 with active KRs, carrying live readings', async () => {
      const supabase = mockSupabase({
        krs: [
          { id: 'kr-1', code: 'KR-GOV-3.3', title: 'Monthly OKR automation operational', objective_id: 'obj-1', baseline_value: 0, current_value: 2, target_value: 3, direction: 'increase', status: 'on_track' },
        ],
      });
      const result = await runOkrDay28HardStop({
        supabase,
        logger: silentLogger,
        now: new Date('2026-08-28T00:00:00Z'),
      });

      expect(result.fired).toBe(true);
      expect(result.period).toBe('2026-08');
      expect(result.decisionId).toBe('decision-1');
      expect(supabase.__insertCalls).toHaveLength(1);

      const [{ table, payload }] = supabase.__insertCalls;
      expect(table).toBe('chairman_decisions');
      expect(payload.decision_type).toBe('okr_month_close_review');
      expect(payload.venture_id).toBeNull();
      expect(payload.lifecycle_stage).toBe(0);
      expect(payload.decision).toBe('pending');
      expect(payload.status).toBe('pending');
      expect(payload.context.period).toBe('2026-08');
      expect(payload.context.eligible_subjects).toBe(1);
      expect(payload.context.krs[0].code).toBe('KR-GOV-3.3');
    });

    it('is idempotent per period — second call in same period is a no-op', async () => {
      const supabase = mockSupabase({
        existingDecision: [{ id: 'decision-existing' }],
      });
      const result = await runOkrDay28HardStop({
        supabase,
        logger: silentLogger,
        now: new Date('2026-08-28T00:00:00Z'),
      });
      expect(result).toEqual({ fired: false, reason: 'already-fired-this-period', period: '2026-08' });
      expect(supabase.__insertCalls).toHaveLength(0);
    });

    it('surfaces an explicit zero-subjects record when no active KRs exist', async () => {
      const supabase = mockSupabase({ krs: [] });
      const result = await runOkrDay28HardStop({
        supabase,
        logger: silentLogger,
        now: new Date('2026-08-28T00:00:00Z'),
      });
      expect(result.fired).toBe(true);
      const [{ payload }] = supabase.__insertCalls;
      expect(payload.context.eligible_subjects).toBe(0);
      expect(payload.summary).toMatch(/no active KRs this cycle/);
    });

    it('never writes to ventures or strategic_directives_v2', async () => {
      const supabase = mockSupabase({
        krs: [
          { id: 'kr-1', code: 'KR-GOV-3.3', title: 'x', objective_id: 'obj-1', baseline_value: 0, current_value: 2, target_value: 3, direction: 'increase', status: 'on_track' },
        ],
      });
      await runOkrDay28HardStop({ supabase, logger: silentLogger, now: new Date('2026-08-28T00:00:00Z') });

      const touchedTables = supabase.from.mock.calls.map(([table]) => table);
      expect(touchedTables).not.toContain('ventures');
      expect(touchedTables).not.toContain('strategic_directives_v2');
      expect(supabase.__insertCalls.every((c) => c.table === 'chairman_decisions')).toBe(true);
    });
  });
});
