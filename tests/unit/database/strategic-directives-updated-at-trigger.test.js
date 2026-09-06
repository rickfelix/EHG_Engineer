/**
 * QF-20260903-095 -- codifies strategic_directives_v2's existing (working)
 * updated_at trigger into a tracked migration.
 *
 * PREMISE CORRECTION: the QF as filed claimed updated_at "is not auto-
 * maintained" / "does not advance with the write." Both claims were measured
 * FALSE against the live database on 2026-09-03 -- two triggers
 * (update_sd_timestamp, update_strategic_directives_v2_updated_at) already
 * fire on every UPDATE and were empirically confirmed to advance the column.
 * Neither trigger was represented in database/migrations/, so this migration
 * codifies the shared update_updated_at_column() convention (already used
 * across 15+ other tables) as a no-op CREATE OR REPLACE + DROP-IF-EXISTS.
 *
 * The QF's genuinely real, separately-reproduced bug (concurrent client-side
 * read-modify-write on the metadata JSONB column silently losing a writer's
 * key, even though updated_at advances correctly on both writes) is NOT
 * fixed by this migration -- it requires an atomic-merge or optimistic-
 * concurrency pattern across ~30+ call sites and is out of scope for this
 * quick fix. Hermetic source-assertions on the migration file (no DB
 * connection) -- mirrors tests/unit/database/claim-sd-claim-switch-clobber-
 * guard.test.js.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const migration = readFileSync(
  path.resolve(process.cwd(), 'database/migrations', '20260903_codify_strategic_directives_updated_at_trigger.sql'),
  'utf8'
);

describe('QF-20260903-095: codify strategic_directives_v2 updated_at trigger', () => {
  it('is a CREATE OR REPLACE + DROP-IF-EXISTS pair (idempotent, no-op against the already-correct live state)', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.update_updated_at_column\(\)/);
    expect(migration).toMatch(/DROP TRIGGER IF EXISTS update_strategic_directives_v2_updated_at ON public\.strategic_directives_v2;/);
    expect(migration).toMatch(/CREATE TRIGGER update_strategic_directives_v2_updated_at/);
  });

  it('the trigger function sets NEW.updated_at = now() unconditionally', () => {
    const fnBody = migration.slice(
      migration.indexOf('AS $function$'),
      migration.indexOf('$function$;')
    );
    expect(fnBody).toMatch(/NEW\.updated_at\s*=\s*now\(\)/);
    expect(fnBody).toMatch(/RETURN NEW;/);
  });

  it('the trigger fires BEFORE UPDATE, for each row, on strategic_directives_v2', () => {
    const triggerIdx = migration.indexOf('CREATE TRIGGER update_strategic_directives_v2_updated_at');
    const triggerStatement = migration.slice(triggerIdx, migration.indexOf(';', triggerIdx) + 1);
    expect(triggerStatement).toMatch(/BEFORE UPDATE ON public\.strategic_directives_v2/);
    expect(triggerStatement).toMatch(/FOR EACH ROW/);
    expect(triggerStatement).toMatch(/EXECUTE FUNCTION public\.update_updated_at_column\(\)/);
  });

  it('documents the premise correction and the separately-scoped real bug, so a future reader does not re-open the false claim', () => {
    expect(migration).toMatch(/PREMISE CORRECTION/);
    expect(migration).toMatch(/Both claims are FALSE as measured against the live/);
    expect(migration).toMatch(/THE REAL BUG/);
    expect(migration).toMatch(/race on a JSONB column/);
  });
});
