/**
 * QF-20260911-593 — lib/fleet/parent-completion.mjs getLatestPlanToLead().
 *
 * DEFECT: reading the newest PLAN-TO-LEAD row by created_at with no status filter let later
 * manual retries that failed a downstream gate (e.g. CHILD_SCOPE_COVERAGE) bury an already-
 * ACCEPTED row -- the parent then read as freshly 'blocked' and orchestrator completion stopped
 * at manual remediation even though PLAN-TO-LEAD had genuinely already succeeded. SPECIMEN:
 * SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001 (accepted 23:53:49Z, three blocked retries 00:18-00:20Z).
 *
 * FIX: prefer the newest row with status='accepted'; fall back to the newest row of any status
 * only when no accepted row exists (first-attempt / genuine-blocked-retrigger paths unaffected).
 */
import { describe, it, expect } from 'vitest';
import { getLatestPlanToLead } from '../../../lib/fleet/parent-completion.mjs';

/**
 * Tiny fake DB matching exactly the query shape getLatestPlanToLead issues:
 * .from('sd_phase_handoffs').select(...).or(...).eq('handoff_type', 'PLAN-TO-LEAD')
 *   [.eq('status', 'accepted')].order('created_at', {ascending:false}).limit(1)
 * The `.or()` clause itself is not re-validated here (unchanged by this QF, and every fixture
 * row is already scoped to the one SD under test) -- only handoff_type/status filtering,
 * created_at-descending order, and the limit are simulated.
 */
function fakeSupabase(rows) {
  return {
    from() {
      const filters = {};
      const builder = {
        select() { return builder; },
        or() { return builder; },
        eq(col, val) { filters[col] = val; return builder; },
        order() { return builder; }, // this function only ever orders created_at desc
        async limit(n) {
          const matched = rows.filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v));
          const sorted = [...matched].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
          return { data: sorted.slice(0, n), error: null };
        },
      };
      return builder;
    },
  };
}

const parent = { id: 'parent-uuid', sd_key: 'SD-PARENT-001' };
const row = (status, createdAt, id) => ({
  id, status, metadata: {}, created_at: createdAt, accepted_at: null, created_by: 'test',
  handoff_type: 'PLAN-TO-LEAD',
});

describe('getLatestPlanToLead (QF-20260911-593)', () => {
  it('history [accepted, blocked, blocked, blocked] -- returns the ACCEPTED row, not the newest blocked one', async () => {
    const rows = [
      row('accepted', '2026-09-11T23:53:49Z', 'r-accepted'),
      row('blocked', '2026-09-12T00:18:00Z', 'r-blocked-1'),
      row('blocked', '2026-09-12T00:19:00Z', 'r-blocked-2'),
      row('blocked', '2026-09-12T00:20:00Z', 'r-blocked-3'), // newest by created_at
    ];
    const result = await getLatestPlanToLead(fakeSupabase(rows), parent);
    expect(result.id).toBe('r-accepted');
    expect(result.status).toBe('accepted');
  });

  it('history [blocked] only -- falls back to the newest row (retrigger path unchanged)', async () => {
    const rows = [row('blocked', '2026-09-12T00:00:00Z', 'r-blocked')];
    const result = await getLatestPlanToLead(fakeSupabase(rows), parent);
    expect(result.id).toBe('r-blocked');
    expect(result.status).toBe('blocked');
  });

  it('history [] -- returns null (unchanged, first-attempt path)', async () => {
    const result = await getLatestPlanToLead(fakeSupabase([]), parent);
    expect(result).toBeNull();
  });

  it('multiple accepted rows -- returns the NEWEST accepted one, not an older accepted row', async () => {
    const rows = [
      row('accepted', '2026-09-01T00:00:00Z', 'r-old-accepted'),
      row('blocked', '2026-09-05T00:00:00Z', 'r-blocked-between'),
      row('accepted', '2026-09-10T00:00:00Z', 'r-new-accepted'),
    ];
    const result = await getLatestPlanToLead(fakeSupabase(rows), parent);
    expect(result.id).toBe('r-new-accepted');
  });

  it('newest row already accepted (no later retries) -- unchanged behavior', async () => {
    const rows = [
      row('blocked', '2026-09-01T00:00:00Z', 'r-old-blocked'),
      row('accepted', '2026-09-10T00:00:00Z', 'r-latest-accepted'),
    ];
    const result = await getLatestPlanToLead(fakeSupabase(rows), parent);
    expect(result.id).toBe('r-latest-accepted');
  });
});
