/**
 * SD-LEO-INFRA-TIERED-SOURCING-CLAIM-001 (FR-1/FR-4, TESTING finding D-2):
 * scripts/cron/batch-mint-sweep.mjs — the missing production consumer that wires the pure
 * batch-mint detector to the hold writer.
 */
import { describe, it, expect } from 'vitest';
import { runBatchMintSweep, checkVerdictsAndRelease } from '../../../scripts/cron/batch-mint-sweep.mjs';

function fakeSupabase({ mints, existingHolds = [], updateResults = {} }) {
  return {
    from: (table) => {
      if (table === 'quick_fixes') {
        return {
          select: (cols) => {
            if (cols.includes('created_by')) {
              // mints.length is well below the default pageSize, so the first page is already
              // "short" and fetchAllPaginated stops after one call — no need to track pages here.
              return { gte: () => ({ not: () => ({ range: async () => ({ data: mints, error: null }) }) }) };
            }
            // the existing-holds lookup: select(...).in('id', [...]).limit(999)
            return { in: () => ({ limit: async (n) => (n === 999 ? { data: existingHolds, error: null } : { data: [], error: null }) }) };
          },
          update: (payload) => ({
            eq: (col, id) => ({
              or: () => ({
                select: () => ({
                  maybeSingle: async () => (updateResults[id] || { data: { id, ...payload }, error: null }),
                }),
              }),
            }),
          }),
        };
      }
      return {};
    },
  };
}

describe('runBatchMintSweep', () => {
  it('holds a genuine batch and skips ids already oracle-held', async () => {
    const t0 = Date.parse('2026-08-01T00:00:00Z');
    const mints = [
      { id: 'QF-1', created_by: 'sess-A', created_at: new Date(t0).toISOString() },
      { id: 'QF-2', created_by: 'sess-A', created_at: new Date(t0 + 3 * 60000).toISOString() },
      { id: 'QF-3', created_by: 'sess-A', created_at: new Date(t0 + 8 * 60000).toISOString() },
    ];
    const supabase = fakeSupabase({
      mints,
      existingHolds: [{ id: 'QF-1', owner: 'chairman', release_condition: '[oracle_read_pending] review_at=x :: already held' }],
    });
    const openConsult = async (sb, group) => ({ id: 'consult-1', created_at: group.anchorAt });
    const result = await runBatchMintSweep(supabase, { nowMs: t0 + 9 * 60000, openConsult });
    expect(result.groups).toBe(1);
    expect(result.alreadyHeld).toBe(1);
    expect(result.held).toBe(2); // QF-2, QF-3 newly held; QF-1 already held
    expect(result.failed).toEqual([]);
  });

  // VALIDATION finding V-2: one consult row is opened per GROUP (not per QF), and its id is
  // forwarded into every held member's marker.
  it('V-2: opens one consult row per group and embeds its id in every held member', async () => {
    const t0 = Date.parse('2026-08-01T00:00:00Z');
    const mints = [
      { id: 'QF-1', created_by: 'sess-A', created_at: new Date(t0).toISOString() },
      { id: 'QF-2', created_by: 'sess-A', created_at: new Date(t0 + 3 * 60000).toISOString() },
      { id: 'QF-3', created_by: 'sess-A', created_at: new Date(t0 + 8 * 60000).toISOString() },
    ];
    const supabase = fakeSupabase({ mints });
    const openConsultCalls = [];
    const heldConditions = [];
    // Wrap the fake's update chain to capture the release_condition each writeQfOracleHold sends.
    const supabaseSpy = {
      from: (table) => {
        if (table !== 'quick_fixes') return supabase.from(table);
        const real = supabase.from(table);
        return {
          ...real,
          update: (payload) => {
            heldConditions.push(payload.release_condition);
            return real.update(payload);
          },
        };
      },
    };
    const openConsult = async (sb, group) => { openConsultCalls.push(group); return { id: 'consult-1', created_at: group.anchorAt }; };
    await runBatchMintSweep(supabaseSpy, { nowMs: t0 + 9 * 60000, openConsult });
    expect(openConsultCalls).toHaveLength(1); // ONE consult for the whole group, not 3
    expect(heldConditions).toHaveLength(3);
    for (const cond of heldConditions) expect(cond).toContain('consult=consult-1');
  });

  it('returns scanned:true with zero groups when nothing crosses the batch threshold', async () => {
    const supabase = fakeSupabase({ mints: [{ id: 'QF-1', created_by: 'sess-A', created_at: '2026-08-01T00:00:00Z' }] });
    const result = await runBatchMintSweep(supabase, { nowMs: Date.parse('2026-08-01T00:01:00Z') });
    expect(result).toEqual({ scanned: true, groups: 0, held: 0, alreadyHeld: 0, failed: [] });
  });
});

/**
 * SD-LEO-FIX-SPECIFIED-PRIMARY-RELEASE-001 (FR-3): checkVerdictsAndRelease -- the specified
 * PRIMARY release path. Fake models three tables: quick_fixes (held QFs), session_coordination
 * (consult rows + live replies), retention_archive (unused in these fixtures).
 */
function fakeVerdictSupabase({ heldQfs = [], consultRows = {}, replies = [] }) {
  return {
    from: (table) => {
      if (table === 'quick_fixes') {
        return {
          // Serves BOTH checkVerdictsAndRelease's held-QF query (.eq().like()) AND
          // releaseQfOracleHold's internal provenance read (.eq().maybeSingle()) on the same chain.
          select: () => ({
            eq: () => ({
              like: () => ({ limit: async () => ({ data: heldQfs, error: null }) }),
              maybeSingle: async () => ({ data: { verification_notes: null }, error: null }),
            }),
          }),
          update: (_payload) => ({
            eq: (col, id) => ({
              eq: () => ({
                like: () => ({
                  select: () => ({
                    maybeSingle: async () => ({ data: { id }, error: null }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'session_coordination') {
        return {
          select: (cols) => {
            if (cols === 'created_at, payload') {
              // lookupConsultRowRecord's live query: select('created_at, payload').eq('id', id).maybeSingle()
              return { eq: (col, id) => ({ maybeSingle: async () => ({ data: consultRows[id] || null, error: null }) }) };
            }
            // findConsultReply's live query: select('id, created_at, payload')...
            return {
              or: () => ({
                eq: () => ({
                  order: () => ({
                    limit: async () => ({ data: replies, error: null }),
                  }),
                }),
              }),
            };
          },
        };
      }
      if (table === 'retention_archive') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }), order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) };
      }
      return {};
    },
  };
}

describe('checkVerdictsAndRelease (FR-3, the specified primary release path)', () => {
  it('TS-3: releases immediately when a matching Solomon reply exists, tagged solomon-verdict', async () => {
    const supabase = fakeVerdictSupabase({
      heldQfs: [{ id: 'QF-1', release_condition: '[oracle_read_pending] review_at=x consult=11111111-1111-1111-1111-111111111111 :: batch mint detected' }],
      consultRows: { '11111111-1111-1111-1111-111111111111': { created_at: '2026-08-01T00:00:00Z', payload: { correlation_id: 'corr-1' } } },
      replies: [{ created_at: '2026-08-01T00:10:00Z' }],
    });
    const result = await checkVerdictsAndRelease(supabase);
    expect(result.checked).toBe(1);
    expect(result.released).toBe(1);
    expect(result.failed).toEqual([]);
  });

  // TS-4: no reply exists -- the caller (main()) leaves the hold for the existing timer path.
  it('TS-4: releases nothing when no reply exists (falls through to the existing timer path)', async () => {
    const supabase = fakeVerdictSupabase({
      heldQfs: [{ id: 'QF-1', release_condition: '[oracle_read_pending] review_at=x consult=11111111-1111-1111-1111-111111111111 :: batch mint detected' }],
      consultRows: { '11111111-1111-1111-1111-111111111111': { created_at: '2026-08-01T00:00:00Z', payload: { correlation_id: 'corr-1' } } },
      replies: [],
    });
    const result = await checkVerdictsAndRelease(supabase);
    expect(result.checked).toBe(1);
    expect(result.released).toBe(0);
  });

  it('returns zeroed result when nothing is currently oracle-held', async () => {
    const supabase = fakeVerdictSupabase({ heldQfs: [] });
    const result = await checkVerdictsAndRelease(supabase);
    expect(result).toEqual({ checked: 0, released: 0, failed: [] });
  });

  it('releases every member of a shared consult row group, not just one', async () => {
    const supabase = fakeVerdictSupabase({
      heldQfs: [
        { id: 'QF-1', release_condition: '[oracle_read_pending] review_at=x consult=11111111-1111-1111-1111-111111111111 :: batch mint detected' },
        { id: 'QF-2', release_condition: '[oracle_read_pending] review_at=x consult=11111111-1111-1111-1111-111111111111 :: batch mint detected' },
      ],
      consultRows: { '11111111-1111-1111-1111-111111111111': { created_at: '2026-08-01T00:00:00Z', payload: { correlation_id: 'corr-1' } } },
      replies: [{ created_at: '2026-08-01T00:10:00Z' }],
    });
    const result = await checkVerdictsAndRelease(supabase);
    expect(result.checked).toBe(2);
    expect(result.released).toBe(2);
  });
});
