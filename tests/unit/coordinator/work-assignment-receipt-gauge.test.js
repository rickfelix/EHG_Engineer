// SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-D (FR-2 / TS-3)
import { describe, it, expect } from 'vitest';
import { planWorkAssignmentReceiptGauge, RECEIPT_OVERDUE_THRESHOLD_MS } from '../../../lib/coordinator/work-assignment-receipt-gauge.cjs';

function fakeSupabase(rows) {
  return {
    from() {
      const query = {
        select: () => query,
        eq: () => query,
        is: () => query,
        lt: () => query,
        limit: async () => ({ data: rows, error: null }),
      };
      return query;
    },
  };
}

function fakeSupabaseError(message) {
  return {
    from() {
      const query = {
        select: () => query,
        eq: () => query,
        is: () => query,
        lt: () => query,
        limit: async () => ({ data: null, error: { message } }),
      };
      return query;
    },
  };
}

describe('planWorkAssignmentReceiptGauge', () => {
  it('reports exactly the 3-hour-old unacknowledged row as overdue, not the 10-minute-old one', async () => {
    const nowMs = Date.parse('2026-09-07T12:00:00Z');
    const threeHoursAgo = new Date(nowMs - 3 * 60 * 60 * 1000).toISOString();
    const tenMinAgo = new Date(nowMs - 10 * 60 * 1000).toISOString();

    // The fake client's .lt() ignores the cutoff arg and returns rows raw -- the gauge
    // itself only maps/reports what the query already filtered server-side, so this
    // harness models the DB doing the filtering by only returning the overdue row.
    const rows = [{ id: 'row-old', target_session: 'seat-alpha', created_at: threeHoursAgo }];
    const supabase = fakeSupabase(rows);
    const result = await planWorkAssignmentReceiptGauge(supabase, { nowMs });
    expect(result.noData).toBe(false);
    expect(result.overdue).toHaveLength(1);
    expect(result.overdue[0]).toMatchObject({ id: 'row-old', target_session: 'seat-alpha', created_at: threeHoursAgo });
    expect(result.overdue[0].age_ms).toBeGreaterThanOrEqual(3 * 60 * 60 * 1000);
    // sanity: a 10-minute-old row would sit well under the 2h threshold
    expect(nowMs - Date.parse(tenMinAgo)).toBeLessThan(RECEIPT_OVERDUE_THRESHOLD_MS);
  });

  it('computes cutoff using the default 2h threshold when thresholdMs is omitted', async () => {
    const nowMs = Date.parse('2026-09-07T12:00:00Z');
    let capturedCutoff = null;
    const supabase = {
      from() {
        const query = {
          select: () => query,
          eq: () => query,
          is: () => query,
          lt: (col, val) => {
            capturedCutoff = val;
            return query;
          },
          limit: async () => ({ data: [], error: null }),
        };
        return query;
      },
    };
    await planWorkAssignmentReceiptGauge(supabase, { nowMs });
    expect(capturedCutoff).toBe(new Date(nowMs - RECEIPT_OVERDUE_THRESHOLD_MS).toISOString());
  });

  it('returns an empty overdue list when nothing qualifies', async () => {
    const supabase = fakeSupabase([]);
    const result = await planWorkAssignmentReceiptGauge(supabase);
    expect(result.noData).toBe(false);
    expect(result.overdue).toEqual([]);
  });

  it('returns noData:true on a query failure, never a false-clean report', async () => {
    const supabase = fakeSupabaseError('connection refused');
    const result = await planWorkAssignmentReceiptGauge(supabase);
    expect(result.noData).toBe(true);
    expect(result.reason).toContain('connection refused');
  });
});
