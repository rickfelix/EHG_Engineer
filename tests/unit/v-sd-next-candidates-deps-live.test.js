/**
 * v_sd_next_candidates deps_satisfied = live-deps migration — SD-REFILL-002WFTGJ.
 *
 * The view's deps_satisfied used to read the stale sd_baseline_items.dependencies_snapshot, so it
 * reported TRUE for SDs that the authoritative claim guard (live strategic_directives_v2.dependencies)
 * correctly blocks — causing self-claim churn. This migration aligns the view's dependency_status CTE
 * with the live source. These static assertions pin the migration body so a future edit can't silently
 * revert to the snapshot or drop the live join.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATION = resolve(
  import.meta.dirname || __dirname,
  '../../database/migrations/20260621_v_sd_next_candidates_deps_satisfied_live.sql'
);

describe('v_sd_next_candidates deps_satisfied live-deps migration (SD-REFILL-002WFTGJ)', () => {
  const sql = readFileSync(MIGRATION, 'utf8');

  it('recreates the view and is wrapped in a transaction', () => {
    expect(sql).toMatch(/CREATE OR REPLACE VIEW public\.v_sd_next_candidates/);
    expect(sql).toMatch(/BEGIN;/);
    expect(sql).toMatch(/COMMIT;/);
    expect(sql).toMatch(/^-- @approved-by:/m);
  });

  it('the dependency_status CTE joins strategic_directives_v2 and reads LIVE sdx.dependencies', () => {
    expect(sql).toMatch(/JOIN strategic_directives_v2 sdx ON sdx\.sd_key = bi_1\.sd_id/);
    expect(sql).toMatch(/jsonb_typeof\(sdx\.dependencies\)\s*=\s*'array'::text THEN sdx\.dependencies/);
  });

  it('does NOT compute deps_satisfied from the stale dependencies_snapshot', () => {
    // The snapshot column may still be SELECTed for back-compat, but the deps_satisfied jsonb_array_elements
    // source must be sdx.dependencies — never bi_1.dependencies_snapshot inside the CASE feeding the count.
    expect(sql).not.toMatch(/THEN bi_1\.dependencies_snapshot\s*\n\s*ELSE '\[\]'::jsonb/);
    expect(sql).not.toMatch(/jsonb_typeof\(bi_1\.dependencies_snapshot\)\s*=\s*'array'::text THEN bi_1\.dependencies_snapshot/);
  });

  it('preserves the verbatim guards: none-filter, non-completed EXISTS, COALESCE true default, fixture exclusions', () => {
    expect(sql).toMatch(/lower\(r\.ref\) <> 'none'::text/);
    expect(sql).toMatch(/sd2\.status::text <> 'completed'::text/);
    expect(sql).toMatch(/\), true\) AS deps_satisfied/);
    expect(sql).toMatch(/sd\.sd_key NOT LIKE 'TEST-%'/);
    expect(sql).toMatch(/sd\.sd_key NOT LIKE 'SD-DEMO-%'/);
  });
});
