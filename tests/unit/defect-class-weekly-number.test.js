import { describe, it, expect } from 'vitest';
import { computeWeeklyNumber } from '../../scripts/defect-class-weekly-number.js';

function makeMockSupabase({ recurredRows = [], unclassifiedCount = 0 } = {}) {
  const calls = { viewFilters: [] };
  return {
    calls,
    from(table) {
      if (table === 'v_defect_class_weekly_recurrence') {
        const builder = {
          select: () => builder,
          gte(field, value) {
            calls.viewFilters.push(['gte', field, value]);
            return builder;
          },
          lt(field, value) {
            calls.viewFilters.push(['lt', field, value]);
            return builder;
          },
          then(resolve) {
            return resolve({ data: recurredRows, error: null });
          },
        };
        return builder;
      }
      if (table === 'defect_class_specimens') {
        return {
          select: () => ({
            is: async () => ({ count: unclassifiedCount, error: null }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

describe('defect-class-weekly-number', () => {
  it('returns 0 (never null/error) with zero recurred classes', async () => {
    const supabase = makeMockSupabase({ recurredRows: [], unclassifiedCount: 0 });
    const result = await computeWeeklyNumber({ supabase });
    expect(result.recurredClassCount).toBe(0);
    expect(result.recurredClasses).toEqual([]);
    expect(result.unclassifiedCount).toBe(0);
  });

  it('counts recurred classes from the view', async () => {
    const supabase = makeMockSupabase({
      recurredRows: [
        { class_key: 'presence_read_as_value', verified_fix_date: '2026-09-05T00:00:00Z', recurrence_specimen_count: 3 },
      ],
      unclassifiedCount: 5,
    });
    const result = await computeWeeklyNumber({ supabase });
    expect(result.recurredClassCount).toBe(1);
    expect(result.recurredClasses[0].class_key).toBe('presence_read_as_value');
    expect(result.unclassifiedCount).toBe(5);
  });

  it('applies week-window filters to the view query', async () => {
    const supabase = makeMockSupabase();
    await computeWeeklyNumber({ weekStart: '2026-09-01T00:00:00Z', weekEnd: '2026-09-08T00:00:00Z', supabase });
    expect(supabase.calls.viewFilters).toContainEqual(['gte', 'first_recurrence_at', '2026-09-01T00:00:00Z']);
    expect(supabase.calls.viewFilters).toContainEqual(['lt', 'first_recurrence_at', '2026-09-08T00:00:00Z']);
  });

  it('surfaces the UNCLASSIFIED count alongside the recurrence number (never dropped)', async () => {
    const supabase = makeMockSupabase({ recurredRows: [], unclassifiedCount: 24 });
    const result = await computeWeeklyNumber({ supabase });
    expect(result.unclassifiedCount).toBe(24);
  });
});
