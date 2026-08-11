/**
 * SD-LEO-INFRA-CHAIRMAN-QUIET-WINDOW-001 FR-1b.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE IS SEPARATE FROM tests/unit/chairman/chairman-preference-store-upsert.test.js
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * The unit-level file proves getPreference's JS-side multi-row handling with a mocked client.
 * This file proves the actual Postgres constraint fix (UNIQUE NULLS NOT DISTINCT) behaves as
 * designed — and that means a REAL Postgres connection, which is a db-tier test (vitest.config.js:
 * the db project is gated off by default — tests/setup.db.js skips every test and refuses all
 * network unless DB_TARGET is an explicitly designated non-production database).
 *
 * NEVER the live chairman_preferences table. Both suites below create their own session-scoped
 * TEMP TABLE (auto-dropped on connection close, invisible to any other connection) — zero blast
 * radius, and no dependency on the SD-LEO-INFRA-CHAIRMAN-QUIET-WINDOW-001 migration having been
 * applied anywhere. The migration itself (supabase/migrations/
 * 20260811_chairman_preferences_nulls_not_distinct.sql) requires human/chairman authorization to
 * apply to the live table (a DELETE + constraint change on chairman-critical data) — this suite
 * exists so the FIX ITSELF is independently verified before that authorization is sought, not as
 * a substitute for applying it.
 *
 * NOT A VACUOUS TEST: the second suite is a negative control using the OLD (default,
 * indnullsnotdistinct=false) constraint shape, proving the double-write bug reproduces — so the
 * first suite passing is evidence the fix works, not evidence the test can't fail.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabaseClient } from '../../scripts/lib/supabase-connection.js';

describe('FR-1b — chairman_preferences upsert fix (runs only where a real DB is reachable)', () => {
  let client;
  const TABLE = 'temp_cpref_upsert_fix_test';
  const OLD_TABLE = 'temp_cpref_upsert_old_test';

  beforeAll(async () => {
    client = await createDatabaseClient('engineer', { verify: false });
    // Fixed: mirrors the migration's target shape (UNIQUE NULLS NOT DISTINCT).
    await client.query(`
      CREATE TEMP TABLE ${TABLE} (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        chairman_id TEXT NOT NULL,
        venture_id TEXT,
        preference_key TEXT NOT NULL,
        preference_value JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT ${TABLE}_uq UNIQUE NULLS NOT DISTINCT (chairman_id, venture_id, preference_key)
      )
    `);
    // Negative control: the OLD (default, pre-fix) constraint shape -- proves the bug is
    // reproducible and that the fixed table above isn't passing vacuously.
    await client.query(`
      CREATE TEMP TABLE ${OLD_TABLE} (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        chairman_id TEXT NOT NULL,
        venture_id TEXT,
        preference_key TEXT NOT NULL,
        preference_value JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT ${OLD_TABLE}_uq UNIQUE (chairman_id, venture_id, preference_key)
      )
    `);
  }, 30000);

  afterAll(async () => {
    if (client) {
      await client.query(`DROP TABLE IF EXISTS ${TABLE}`).catch(() => {});
      await client.query(`DROP TABLE IF EXISTS ${OLD_TABLE}`).catch(() => {});
      await client.end();
    }
  });

  /** The exact upsert shape ChairmanPreferenceStore.setPreference emits via supabase-js's onConflict. */
  async function upsert(table, value) {
    return client.query(
      `INSERT INTO ${table} (chairman_id, venture_id, preference_key, preference_value, updated_at)
       VALUES ('ehg_chairman', NULL, 'notifications.timezone', $1, NOW())
       ON CONFLICT (chairman_id, venture_id, preference_key)
       DO UPDATE SET preference_value = EXCLUDED.preference_value, updated_at = EXCLUDED.updated_at`,
      [JSON.stringify(value)],
    );
  }

  it('FIXED constraint: a second write updates in place -- exactly 1 row, holding the 2nd value', async () => {
    await upsert(TABLE, 'America/New_York');
    await upsert(TABLE, 'America/Jamaica');
    const { rows } = await client.query(
      `SELECT preference_value FROM ${TABLE} WHERE chairman_id = 'ehg_chairman' AND venture_id IS NULL AND preference_key = 'notifications.timezone'`,
    );
    expect(rows.length).toBe(1);
    expect(rows[0].preference_value).toBe('America/Jamaica');
  });

  it('OLD constraint (negative control): the same double-write reproduces the bug -- 2 rows, not 1', async () => {
    await upsert(OLD_TABLE, 'America/New_York');
    await upsert(OLD_TABLE, 'America/Jamaica');
    const { rows } = await client.query(
      `SELECT preference_value FROM ${OLD_TABLE} WHERE chairman_id = 'ehg_chairman' AND venture_id IS NULL AND preference_key = 'notifications.timezone'`,
    );
    expect(rows.length).toBe(2);
  });
});
