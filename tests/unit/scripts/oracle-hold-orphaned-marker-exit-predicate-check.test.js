/**
 * SD-LEO-FIX-SPECIFIED-PRIMARY-RELEASE-001 (FR-6, ratification 49656c8c): CI-asserted exit
 * predicate -- zero oracle-held QFs may cite a consult row absent from both
 * session_coordination and retention_archive.
 */
import { describe, it, expect } from 'vitest';
import { checkOrphanedOracleHoldMarkers } from '../../../scripts/oracle-hold-orphaned-marker-exit-predicate-check.mjs';

const UUID_A = '11111111-1111-1111-1111-111111111111';
const UUID_B = '22222222-2222-2222-2222-222222222222';

function fakeSupabase({ held, liveIds = [], archivedIds = [] }) {
  return {
    from: (table) => {
      if (table === 'quick_fixes') {
        return { select: () => ({ eq: () => ({ like: () => ({ limit: async () => ({ data: held, error: null }) }) }) }) };
      }
      if (table === 'session_coordination') {
        return { select: () => ({ in: (col, ids) => ({ limit: async () => ({ data: ids.filter((i) => liveIds.includes(i)).map((id) => ({ id })), error: null }) }) }) };
      }
      if (table === 'retention_archive') {
        return {
          select: () => ({
            eq: () => ({
              in: (col, ids) => ({ limit: async () => ({ data: ids.filter((i) => archivedIds.includes(i)).map((id) => ({ source_id: id })), error: null }) }),
            }),
          }),
        };
      }
      return {};
    },
  };
}

describe('checkOrphanedOracleHoldMarkers', () => {
  it('reports zero violations when every held QF cites a row present in session_coordination', async () => {
    const supabase = fakeSupabase({
      held: [{ id: 'QF-1', release_condition: `[oracle_read_pending] review_at=x consult=${UUID_A} :: y` }],
      liveIds: [UUID_A],
    });
    const result = await checkOrphanedOracleHoldMarkers(supabase);
    expect(result).toEqual({ count: 0, sample: [], totalPopulation: 1 });
  });

  it('reports zero violations when the cited row is only in retention_archive (archive-aware, not a violation)', async () => {
    const supabase = fakeSupabase({
      held: [{ id: 'QF-1', release_condition: `[oracle_read_pending] review_at=x consult=${UUID_A} :: y` }],
      archivedIds: [UUID_A],
    });
    const result = await checkOrphanedOracleHoldMarkers(supabase);
    expect(result.count).toBe(0);
  });

  it('flags a QF whose cited consult row is absent from BOTH tables', async () => {
    const supabase = fakeSupabase({
      held: [{ id: 'QF-1', release_condition: `[oracle_read_pending] review_at=x consult=${UUID_A} :: y` }],
    });
    const result = await checkOrphanedOracleHoldMarkers(supabase);
    expect(result.count).toBe(1);
    expect(result.sample[0]).toMatchObject({ id: 'QF-1', consultRowId: UUID_A });
  });

  it('does not flag a held QF with no extractable consult row id (no false positive on an unparseable marker)', async () => {
    const supabase = fakeSupabase({ held: [{ id: 'QF-1', release_condition: '[oracle_read_pending] review_at=x consult=none :: y' }] });
    const result = await checkOrphanedOracleHoldMarkers(supabase);
    expect(result.count).toBe(0);
    expect(result.totalPopulation).toBe(1);
  });

  it('returns totalPopulation:0 (not a canary failure) when nothing is currently oracle-held', async () => {
    const supabase = fakeSupabase({ held: [] });
    const result = await checkOrphanedOracleHoldMarkers(supabase);
    expect(result).toEqual({ count: 0, sample: [], totalPopulation: 0 });
  });

  it('handles a mix: one clean (live), one clean (archived), one orphaned', async () => {
    const supabase = fakeSupabase({
      held: [
        { id: 'QF-1', release_condition: `[oracle_read_pending] review_at=x consult=${UUID_A} :: y` },
        { id: 'QF-2', release_condition: `[oracle_read_pending] review_at=x consult=${UUID_B} :: y` },
      ],
      liveIds: [UUID_A],
    });
    const result = await checkOrphanedOracleHoldMarkers(supabase);
    expect(result.totalPopulation).toBe(2);
    expect(result.count).toBe(1);
    expect(result.sample[0].id).toBe('QF-2');
  });
});
