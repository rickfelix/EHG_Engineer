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
  discoverConstraintsViaSupabase
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

  // QF-20260913-092: a composite/multi-clause OR constraint must derive NO values (the existing
  // "could not parse" path) rather than wrongly attributing another column's quoted literal to
  // this one.
  it('derives no values for a composite OR constraint mixing IS NULL + a string literal + a numeric range (live sd_phase_handoffs.chk_handoff_validation_threshold)', () => {
    // Captured verbatim via discoverConstraintsViaSupabase('sd_phase_handoffs') this session --
    // the exact live definition that, pre-fix, wrongly derived valid_values=['blocked'] for the
    // NUMERIC validation_score column (and clobbered a curated valid_values=null override on
    // rerun, per SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-E).
    const definition =
      "CHECK (((validation_score IS NULL) OR ((status)::text = 'blocked'::text) OR " +
      "((validation_score >= 0) AND (validation_score <= 100))))";
    expect(parseCheckConstraint(definition)).toEqual([]);
  });

  it('derives no values for an OR constraint mixing IS NULL + a string literal (no numeric range)', () => {
    const definition = "CHECK ((col IS NULL) OR (status = 'blocked'))";
    expect(parseCheckConstraint(definition)).toEqual([]);
  });

  it('derives no values for an OR constraint mixing a string literal + a numeric comparison (no IS NULL)', () => {
    const definition = "CHECK ((status = 'blocked') OR (score >= 0))";
    expect(parseCheckConstraint(definition)).toEqual([]);
  });

  it('still extracts values from a plain numeric-range constraint with no OR (unchanged behavior)', () => {
    expect(parseCheckConstraint('CHECK (((validation_score >= 0) AND (validation_score <= 100)))')).toEqual([]);
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
