/**
 * SD-LEO-INFRA-UNCAPPED-ROADMAP-ITEMS-001 FR-1 — pagination to completion, proved two-sided.
 *
 * WHY A NEW FIXTURE EXISTS HERE. The incumbent `makeFakeSupabase` in plan-of-record-linkage.test.js
 * has a NO-OP `.range()` (it returns the builder and ignores from/to) and its `then()` always
 * resolves the complete filtered table. Against that mock, a query that never paginates and a query
 * that paginates correctly are INDISTINGUISHABLE — both return everything. Every assertion about
 * completeness written on it would pass whether or not the fix shipped.
 *
 * So this fixture does the two things that make the claim falsifiable:
 *   1. `.range(from,to)` genuinely SLICES, so paginated reads assemble the full set across pages.
 *   2. An UN-RANGED read is implicitly CAPPED at 1000, mirroring PostgREST's server-side clamp —
 *      the behaviour that makes the real defect silent (no error, just a short answer).
 *
 * Without (2) the mutation arm is theatre: the unpaginated variant would return everything and
 * "pagination works" would pass against code that does not paginate.
 *
 * The pagination primitive itself is NEVER mocked. `fetchAllPaginated` runs for real; only the
 * query builder underneath it is faked — otherwise the test would prove the caller trusts a mock,
 * not that it chains `.range()` correctly.
 */

import { describe, it, expect } from 'vitest';
import { computePlanCheckStatus, NEXT_LIMIT, COMMITTING_LIMIT } from '../../../lib/roadmap/plan-check-status.js';

/** PostgREST's server-side clamp on an un-ranged read. The number that makes the defect silent. */
const PG_MAX_ROWS = 1000;

/**
 * A Supabase-shaped fake whose `.range()` is REAL.
 * @param {{ tables: Record<string, object[]>, honorRange?: boolean }} cfg
 *   honorRange=false models the UNPAGINATED production variant: `.range()` is ignored AND the
 *   result is clamped at PG_MAX_ROWS, exactly as the server would.
 */
function makeRangeAwareSupabase({ tables, honorRange = true }) {
  const from = (table) => {
    let rows = [...(tables[table] || [])];
    let rangeFrom = null, rangeTo = null;
    const b = {
      select() { return b; },
      eq(col, val) { rows = rows.filter((r) => r[col] === val); return b; },
      in(col, vals) { rows = rows.filter((r) => vals.includes(r[col])); return b; },
      // Chainable no-ops: filters this suite does not vary. They must EXIST or the builder
      // throws before the assertion under test is ever reached.
      not() { return b; },
      ilike() { return b; },
      or() { return b; },
      is() { return b; },
      neq() { return b; },
      gte() { return b; },
      lte() { return b; },
      gt() { return b; },
      lt() { return b; },
      limit(n) { rows = rows.slice(0, n); return b; },
      order(col, opts = {}) {
        const asc = opts.ascending !== false;
        rows.sort((x, y) => (x[col] > y[col] ? 1 : x[col] < y[col] ? -1 : 0) * (asc ? 1 : -1));
        return b;
      },
      range(f, t) { if (honorRange) { rangeFrom = f; rangeTo = t; } return b; },
      maybeSingle() { return Promise.resolve({ data: rows[0] || null, error: null }); },
      single() { return Promise.resolve({ data: rows[0] || null, error: null }); },
      then(resolve) {
        // A ranged read slices. An UN-ranged read is clamped by the server at PG_MAX_ROWS —
        // silently, with no error. That clamp is the whole defect.
        const out = rangeFrom !== null ? rows.slice(rangeFrom, rangeTo + 1) : rows.slice(0, PG_MAX_ROWS);
        return Promise.resolve({ data: out, error: null }).then(resolve);
      }
    };
    return b;
  };
  return { from };
}

const ROADMAP_ID = 'roadmap-1';
const WAVE_ID = 'wave-1';

/** Build a population of N open, SD-linked items. */
function buildTables(itemCount, { linkEvery = 1 } = {}) {
  const items = Array.from({ length: itemCount }, (_, i) => ({
    id: `item-${String(i).padStart(5, '0')}`,
    wave_id: WAVE_ID,
    title: `Item ${i}`,
    promoted_to_sd_key: i % linkEvery === 0 ? `SD-TEST-${String(i).padStart(5, '0')}` : null,
    item_disposition: 'pending',
    priority_rank: i,
    remainder_state: 'promotable_now'
  }));
  const sds = items.filter((i) => i.promoted_to_sd_key).map((i) => ({
    sd_key: i.promoted_to_sd_key,
    status: 'active',
    completion_date: null,
    claiming_session_id: null
  }));
  return {
    strategic_roadmaps: [{ id: ROADMAP_ID, title: 'Canonical', status: 'active', current_baseline_version: 1 }],
    roadmap_waves: [{ id: WAVE_ID, title: 'Wave 1', sequence_rank: 1, status: 'approved', roadmap_id: ROADMAP_ID }],
    v_plan_of_record_remainder: items,
    strategic_directives_v2: sds,
    adam_task_ledger: []
  };
}

const OVER_CAP = 1300; // deliberately > PG_MAX_ROWS

describe('FR-1: the join enumerates the COMPLETE population', () => {
  it('THE POINT: an over-cap population returns its TRUE count, not the cap', async () => {
    const sb = makeRangeAwareSupabase({ tables: buildTables(OVER_CAP) });
    const status = await computePlanCheckStatus(sb);
    expect(status.open_total).toBe(OVER_CAP);
    expect(status.open_total).not.toBe(PG_MAX_ROWS);
  });

  it('the uncapped field carries every item, not a display slice', async () => {
    const sb = makeRangeAwareSupabase({ tables: buildTables(OVER_CAP) });
    const status = await computePlanCheckStatus(sb);
    expect(status.open_items_all).toHaveLength(OVER_CAP);
  });

  it('MUTATION ARM: the pre-fix query SHAPE returns the cap on this exact data', async () => {
    // This is the arm that makes the two tests above mean something: it proves the population is
    // genuinely over-cap and that an unpaginated read of it WOULD have been silently short — so
    // "open_total === 1300" is a real result, not the answer any implementation would give.
    //
    // It models the pre-fix code by issuing the ORIGINAL query shape (bare .select().in(), no
    // .range()) against the same fixture, rather than by feeding a range-ignoring builder to
    // fetchAllPaginated. That alternative does NOT work, and the reason is worth recording:
    // fetchAllPaginated carries its own infinite-loop guard and THROWS
    // "exceeded 10000 pages — query builder likely ignores .range()". The helper already
    // defends against a builder that lies about pagination, so a broken builder cannot be used
    // to simulate an unpaginated caller — it simulates a broken helper instead, which is a
    // different defect and not this one.
    const tables = buildTables(OVER_CAP);
    const sb = makeRangeAwareSupabase({ tables });

    const { data: unpaginated } = await sb
      .from('v_plan_of_record_remainder')
      .select('id, wave_id, title, promoted_to_sd_key, item_disposition, priority_rank, remainder_state')
      .in('wave_id', [WAVE_ID]);

    const status = await computePlanCheckStatus(makeRangeAwareSupabase({ tables }));

    expect(unpaginated).toHaveLength(PG_MAX_ROWS);        // what the old code would have seen
    expect(status.open_total).toBe(OVER_CAP);             // what the fixed code reports
    expect(status.open_total).toBeGreaterThan(unpaginated.length); // and they DIFFER
  });
});

describe('FR-1: the deliberate caps are UNTOUCHED', () => {
  it('next/committing stay capped even with an over-cap population', async () => {
    // The docblock is explicit that uncapping these would change a chairman-facing report as a
    // side effect. Capacity is ADDED via open_items_all, never taken from here.
    const sb = makeRangeAwareSupabase({ tables: buildTables(OVER_CAP) });
    const status = await computePlanCheckStatus(sb);
    expect(status.next).toHaveLength(NEXT_LIMIT);
    expect(status.committing).toHaveLength(COMMITTING_LIMIT);
    expect(status.next_truncated).toBe(true);
    expect(status.committing_truncated).toBe(true);
  });
});

describe('FR-6: linkage is two-sided — the join can neither fabricate nor blanket-deny it', () => {
  it('a linked item reads linked AND an unlinked item reads unlinked', async () => {
    // One-sided would pass for a join that always answers the same way.
    const sb = makeRangeAwareSupabase({ tables: buildTables(20, { linkEvery: 2 }) });
    const status = await computePlanCheckStatus(sb);
    const linked = status.open_items_all.filter((i) => i.sd_key !== null);
    const unlinked = status.open_items_all.filter((i) => i.sd_key === null);
    expect(linked.length).toBeGreaterThan(0);
    expect(unlinked.length).toBeGreaterThan(0);
    expect(linked.every((i) => i.sd !== null)).toBe(true);
    expect(unlinked.every((i) => i.sd === null)).toBe(true);
  });
});

describe('CONTROL: the fixture itself behaves as claimed', () => {
  it('an un-ranged read really is clamped at 1000 by this fake', async () => {
    // If the fake did not clamp, the mutation arm above would be vacuous. Assert the fixture's
    // own load-bearing property rather than trusting it.
    const sb = makeRangeAwareSupabase({ tables: buildTables(OVER_CAP), honorRange: false });
    const { data } = await sb.from('v_plan_of_record_remainder').select('*').in('wave_id', [WAVE_ID]);
    expect(data).toHaveLength(PG_MAX_ROWS);
  });

  it('a ranged read really slices', async () => {
    const sb = makeRangeAwareSupabase({ tables: buildTables(50) });
    const { data } = await sb.from('v_plan_of_record_remainder').select('*').in('wave_id', [WAVE_ID]).range(10, 19);
    expect(data).toHaveLength(10);
  });
});
