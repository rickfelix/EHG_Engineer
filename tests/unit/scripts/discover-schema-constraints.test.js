/**
 * QF-20260903-935 — leo_schema_constraints documented user_stories.status as CHECK IN
 * ('draft', 'completed', 'in_progress', 'ready'), but the live constraint (verified against
 * pg_constraint) also accepts 'testing' and 'blocked'. A doc row this far behind made a live,
 * reachable code path (phase4-evidence.js excluding status='blocked') look dead by
 * construction to anyone trusting the doc plus a zero-count measurement.
 *
 * This is a pure-unit test (no live DB): tests/database's db-tier vitest project is
 * permanently DB_TIER_BLOCKED in this repo (no workflow sets VITEST_DB_ALLOW_REF against a
 * designated non-production ref), so a live-catalog-comparison spec placed there would report
 * "skipped" forever and never actually catch drift. Pinning the parser against the real,
 * captured constraint_definition string is the part of this defect a unit test CAN own.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  parseCheckConstraint,
  discoverConstraintsViaSupabase,
  upsertConstraintRecord
} from '../../../scripts/discover-schema-constraints.js';

describe('parseCheckConstraint', () => {
  it('extracts every value from the live user_stories.status CHECK definition', () => {
    // Captured verbatim from pg_constraint via exec_sql -- the exact live definition that the
    // stale doc row (4 of 6 values) was measured against.
    const definition =
      "CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'ready'::character varying, " +
      "'in_progress'::character varying, 'testing'::character varying, 'completed'::character varying, " +
      "'blocked'::character varying])::text[])))";

    expect(new Set(parseCheckConstraint(definition))).toEqual(
      new Set(['draft', 'ready', 'in_progress', 'testing', 'completed', 'blocked'])
    );
  });

  it('extracts values from a plain IN (...) CHECK definition', () => {
    expect(new Set(parseCheckConstraint("CHECK (status IN ('draft', 'completed'))"))).toEqual(
      new Set(['draft', 'completed'])
    );
  });

  // QF-20260913-767 — Alpha-2 27423594 measured this exact definition against pg_constraint:
  // sd_phase_handoffs.validation_score's chk_handoff_validation_threshold. A multi-branch OR
  // check is NOT an enumeration; deriving ['blocked'] from it made the pre-validator reject
  // every real numeric validation_score fleet-wide.
  it('derives [] for a multi-branch OR CHECK, never a bogus single-value enumeration (row 59)', () => {
    const definition = "CHECK ((validation_score IS NULL) OR ((status)::text = 'blocked'::text) OR ((validation_score >= 0) AND (validation_score <= 100)))";
    expect(parseCheckConstraint(definition)).toEqual([]);
  });

  it('derives [] for a BETWEEN-shaped numeric range CHECK', () => {
    expect(parseCheckConstraint('CHECK ((score BETWEEN 0 AND 100))')).toEqual([]);
  });

  it('derives [] for a plain comparison CHECK (not an enumeration)', () => {
    expect(parseCheckConstraint("CHECK ((priority > 0) OR (status = 'draft'))")).toEqual([]);
  });
});

describe('upsertConstraintRecord (QF-20260913-767: kept-manual-NULL guard)', () => {
  const record = {
    table_name: 'sd_phase_handoffs',
    column_name: 'validation_score',
    constraint_type: 'check',
    constraint_definition: 'CHECK ((validation_score IS NULL) OR ((status)::text = \'blocked\'::text) OR ((validation_score >= 0) AND (validation_score <= 100)))',
    valid_values: [],
    remediation_hint: null,
  };

  function fakeSupabase({ existing, updateError = null, insertError = null }) {
    const updateFn = vi.fn(() => ({ eq: vi.fn(async () => ({ error: updateError })) }));
    const insertFn = vi.fn(async () => ({ error: insertError }));
    const fromChain = {
      select: vi.fn(() => fromChain),
      eq: vi.fn(() => fromChain),
      single: vi.fn(async () => ({ data: existing, error: null })),
      update: updateFn,
      insert: insertFn,
    };
    return { from: vi.fn(() => fromChain), updateFn, insertFn };
  }

  it('re-run over a fixture row with valid_values NULL and the SAME definition leaves it NULL ("kept")', async () => {
    const supabase = fakeSupabase({ existing: { id: 'row-1', valid_values: null, constraint_definition: record.constraint_definition } });
    const outcome = await upsertConstraintRecord(supabase, record);
    expect(outcome.action).toBe('kept');
    expect(supabase.updateFn).not.toHaveBeenCalled();
  });

  it('a row whose valid_values is NULL but whose constraint_definition CHANGED is still updated', async () => {
    const supabase = fakeSupabase({ existing: { id: 'row-1', valid_values: null, constraint_definition: 'CHECK (status IN (\'old\'))' } });
    const outcome = await upsertConstraintRecord(supabase, record);
    expect(outcome.action).toBe('updated');
    expect(supabase.updateFn).toHaveBeenCalledTimes(1);
  });

  it('a row with a non-null valid_values is updated normally (no manual-NULL guard)', async () => {
    const supabase = fakeSupabase({ existing: { id: 'row-1', valid_values: ['old'], constraint_definition: record.constraint_definition } });
    const outcome = await upsertConstraintRecord(supabase, record);
    expect(outcome.action).toBe('updated');
  });

  it('inserts a new record when no existing row is found', async () => {
    const supabase = fakeSupabase({ existing: null });
    const outcome = await upsertConstraintRecord(supabase, record);
    expect(outcome.action).toBe('inserted');
    expect(supabase.insertFn).toHaveBeenCalledWith(record);
  });
});

describe('discoverConstraintsViaSupabase', () => {
  it('queries pg_constraint through exec_sql and returns the result rows', async () => {
    const rows = [{ constraint_name: 'user_stories_status_check', column_name: 'status' }];
    const rpc = vi.fn().mockResolvedValue({ data: [{ result: rows }], error: null });
    const supabase = { rpc };

    const result = await discoverConstraintsViaSupabase(supabase, 'user_stories');

    expect(result).toEqual(rows);
    expect(rpc).toHaveBeenCalledWith('exec_sql', expect.objectContaining({
      sql_text: expect.stringContaining("t.relname = 'user_stories'")
    }));
  });

  it('throws a named error when exec_sql fails, instead of swallowing it', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    await expect(discoverConstraintsViaSupabase({ rpc }, 'user_stories'))
      .rejects.toThrow(/user_stories.*permission denied/);
  });
});
