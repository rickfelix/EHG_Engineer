/**
 * DB Invariant: create_or_replace_session MERGES claude_sessions.metadata on re-init.
 *
 * SD: SD-LEO-INFRA-FIX-CREATE-REPLACE-001
 *
 * The ON CONFLICT branch previously set `metadata = EXCLUDED.metadata`, which REPLACED the
 * whole JSONB on a session re-init — silently wiping is_coordinator / claim flags the live
 * session already carried. The fix merges instead:
 *   metadata = COALESCE(claude_sessions.metadata,'{}'::jsonb) || COALESCE(EXCLUDED.metadata,'{}'::jsonb)
 *
 * Fleet-safe runtime verification: we apply the CORRECTED migration inside a transaction we
 * always ROLL BACK, so the test proves the real function's behavior against the live DB schema
 * WITHOUT any permanent change and independent of whether prod has been upgraded yet. The
 * migration also self-verifies via its in-file DO $verify$ ASSERT block, so simply applying it
 * here re-runs that assertion; we additionally seed our own synthetic session and assert the
 * merge explicitly.
 *
 * Skips cleanly without a real Supabase connection (db project / describeDb).
 */

import { it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describeDb, itDb, HAS_REAL_DB } from '../helpers/db-available.js';
import createDatabaseClient from '../../lib/supabase-connection.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(
  __dirname,
  '../../database/migrations/20260614_fix_create_or_replace_session_metadata_merge.sql'
);

describeDb('create_or_replace_session metadata merge (SD-LEO-INFRA-FIX-CREATE-REPLACE-001)', () => {
  let client;

  beforeAll(async () => {
    if (!HAS_REAL_DB) return;
    client = await createDatabaseClient('engineer', { verify: false });
  });

  afterAll(async () => {
    if (client) await client.end();
  });

  it('re-init preserves is_coordinator + claim flags and applies new keys (rolled-back txn)', async () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    // Random suffix is safe here: every statement runs inside a transaction we ROLL BACK,
    // so nothing is ever committed or journaled.
    const rnd = () => Math.random().toString(36).slice(2);
    const sid = 'vitest-fix-create-replace-' + rnd();
    const term = 'vitest-machine-fix-create-replace-' + rnd(); // unique machine id; the ROLLBACK is the real safety net
    const tty = 'vitest-tty-' + rnd();

    await client.query('BEGIN');
    try {
      // Apply the corrected function (its in-file DO $verify$ ASSERT block runs here too;
      // a merge regression would throw at this point).
      await client.query(sql);

      // Seed a live session carrying coordinator + claim flags.
      await client.query(
        `SELECT create_or_replace_session($1,$2,NULL,$3,999002,'vitest-host','vitest-codebase',
           '{"is_coordinator": true, "claim_flag": "held"}'::jsonb)`,
        [sid, term, tty]
      );
      // Re-init the SAME session with metadata that OMITS those flags.
      await client.query(
        `SELECT create_or_replace_session($1,$2,NULL,$3,999002,'vitest-host','vitest-codebase',
           '{"auto_proceed": true}'::jsonb)`,
        [sid, term, tty]
      );

      const { rows } = await client.query(
        'SELECT metadata FROM claude_sessions WHERE session_id = $1',
        [sid]
      );
      expect(rows).toHaveLength(1);
      const meta = rows[0].metadata;
      // Preserved (the bug would have wiped these):
      expect(meta.is_coordinator).toBe(true);
      expect(meta.claim_flag).toBe('held');
      // Applied (the re-init's new key):
      expect(meta.auto_proceed).toBe(true);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('regression guard: the migration merges and never reverts to a bare replace', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    // The ON CONFLICT branch must merge ...
    expect(sql).toMatch(
      /metadata\s*=\s*COALESCE\(\s*claude_sessions\.metadata[\s\S]*\|\|[\s\S]*EXCLUDED\.metadata/
    );
    // ... and must NOT contain the old replace assignment.
    expect(sql).not.toMatch(/metadata\s*=\s*EXCLUDED\.metadata\s*,/);
  });

  // SD-FDBK-FIX-FLEET-WIDE-CLAUDE-001 (FR-2): the two tests above only ever prove the
  // MIGRATION FILE's logic is correct — the first re-applies it inside a transaction it
  // always ROLLS BACK ("independent of whether prod has been upgraded yet", per its own
  // top-of-file comment), and the second inspects the file's text, not the DB. Neither can
  // detect a "migration written but never deployed" gap — which is exactly what caused the
  // fleet-wide claude_sessions.metadata clobber incident this SD fixes: this migration
  // (SD-LEO-INFRA-FIX-CREATE-REPLACE-001, dated 20260614) sat correct-but-undeployed for
  // weeks while the LIVE create_or_replace_session function still ran the old
  // `metadata = EXCLUDED.metadata` wholesale replace. This test queries the ACTUAL deployed
  // function body (pg_get_functiondef, no transaction/rollback) so a future regression of
  // "the fix exists in git but isn't live" is caught, not just "the fix's SQL text is
  // correct".
  itDb('live-deployed-state guard: the DEPLOYED create_or_replace_session actually merges metadata (not just the migration file)', async () => {
    const { rows } = await client.query(
      `SELECT pg_get_functiondef(oid) AS def
         FROM pg_proc
        WHERE proname = 'create_or_replace_session'`
    );
    expect(rows).toHaveLength(1);
    const deployedDef = rows[0].def;
    expect(deployedDef).toMatch(
      /metadata\s*=\s*COALESCE\(\s*claude_sessions\.metadata[\s\S]*\|\|[\s\S]*EXCLUDED\.metadata/
    );
    expect(deployedDef).not.toMatch(/metadata\s*=\s*EXCLUDED\.metadata\s*,/);
  });
});
