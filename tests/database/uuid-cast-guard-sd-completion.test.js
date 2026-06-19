/**
 * SD-LEO-INFRA-UUID-CAST-GUARD-SD-COMPLETION-001 — FR-3
 *
 * Two SD-completion AFTER triggers cast a metadata text field to UUID without a
 * format guard, so a malformed metadata.proposal_id / metadata.venture_id raised
 * 22P02 (invalid_text_representation) and ABORTED the whole SD-completion UPDATE:
 *   - record_mttr_on_sd_completion : (NEW.metadata->>'proposal_id')::UUID
 *   - fn_emit_sd_completed_event   : (NEW.metadata->>'venture_id')::UUID
 *
 * The fix routes both casts through public.safe_uuid(text), a format-guarded cast
 * that returns NULL on any non-canonical-UUID input.
 *
 * DORMANT-MIGRATION AWARE: the migration mutates SECURITY DEFINER trigger functions
 * on strategic_directives_v2 (fires on every SD completion fleet-wide), so its live
 * apply is chairman-gated / Adam-delegated and ships DORMANT (worker authors + tests,
 * does not self-apply). This suite therefore has three layers:
 *   (A) SQL-content assertions on the migration file — always validate the fix is
 *       authored correctly (the dormant-migration verification pattern).
 *   (B) the 22P02 hazard proof — `'x'::uuid` throwing is built-in Postgres behavior,
 *       independent of the migration.
 *   (C) live DB probes (safe_uuid + both trigger defs) — run only once the migration
 *       is APPLIED; skipped (not failed) while dormant, so the suite is green now and
 *       fully validates post-apply. WHY not a full SD completion: the completion path
 *       is gated by ~20 BEFORE-completion triggers, so a bare probe-SD completion
 *       throws for unrelated reasons — safe_uuid IS the exact unit that prevents the
 *       22P02, so proving it (+ that both triggers route through it) is complete.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createDatabaseClient } from '../../scripts/lib/supabase-connection.js';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = join(__dirname, '../../database/migrations/20260619_uuid_cast_guard_sd_completion.sql');
const VALID_UUID = '11111111-2222-3333-4444-555555555555';

// ── (A) SQL content assertions — always run, no DB needed ──
describe('FR-1/FR-2/FR-3: migration SQL content (authored fix)', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  it('defines safe_uuid with a STRICT canonical-UUID regex (not the loose 36-char form)', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.safe_uuid\(p_text text\)/);
    expect(sql).toMatch(/\^\[0-9a-fA-F\]\{8\}-\[0-9a-fA-F\]\{4\}-\[0-9a-fA-F\]\{4\}-\[0-9a-fA-F\]\{4\}-\[0-9a-fA-F\]\{12\}\$/);
  });

  it('routes both trigger casts through safe_uuid', () => {
    // (The file's header comment intentionally mentions the OLD ::UUID cast to document
    //  the fix; the "no bare cast remains" assertion is made against the LIVE applied
    //  function definitions in block C, not the SQL text.)
    expect(sql).toMatch(/public\.safe_uuid\(NEW\.metadata->>'proposal_id'\)/);
    expect(sql).toMatch(/public\.safe_uuid\(NEW\.metadata->>'venture_id'\)/);
  });

  it('preserves SECURITY DEFINER + search_path on record_mttr and CREATE OR REPLACE only', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.record_mttr_on_sd_completion[\s\S]*SECURITY DEFINER[\s\S]*SET search_path TO 'public'/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.fn_emit_sd_completed_event[\s\S]*SET search_path TO 'public', 'extensions'/);
    expect(sql).not.toMatch(/DROP\s+FUNCTION/i);
  });

  it('includes a DO $verify$ self-check', () => {
    expect(sql).toMatch(/VERIFY FAILED: safe_uuid did not NULL a malformed value/);
  });
});

// ── (B)+(C) DB-backed checks ──
let client;
let applied = false;
beforeAll(async () => {
  client = await createDatabaseClient('engineer', {
    connectionString: process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL,
  });
  const r = await client.query('SELECT to_regprocedure(\'public.safe_uuid(text)\') IS NOT NULL AS exists');
  applied = r.rows[0].exists === true;
});
afterAll(async () => { if (client) await client.end(); });

describe('FR-3: the 22P02 hazard exists (built-in, migration-independent)', () => {
  it('a bare ::uuid cast of garbage raises invalid_text_representation (22P02)', async () => {
    await expect(client.query('SELECT \'not-a-uuid\'::uuid')).rejects.toMatchObject({ code: '22P02' });
  });
});

describe('FR-1/FR-2: safe_uuid + triggers (live — runs once the dormant migration is applied)', () => {
  it('safe_uuid guards garbage / 36-dash / NULL and passes a valid UUID', async () => {
    if (!applied) { console.warn('[dormant] safe_uuid not applied yet — skipping live guard probe'); return; }
    const r = await client.query(
      'SELECT public.safe_uuid(\'not-a-uuid\') AS a, public.safe_uuid(repeat(\'-\',36)) AS b, public.safe_uuid(NULL) AS c, public.safe_uuid($1) AS d',
      [VALID_UUID],
    );
    expect(r.rows[0].a).toBeNull();
    expect(r.rows[0].b).toBeNull();
    expect(r.rows[0].c).toBeNull();
    expect(r.rows[0].d).toBe(VALID_UUID);
  });

  it('both SD-completion triggers route their cast through safe_uuid', async () => {
    if (!applied) { console.warn('[dormant] migration not applied yet — skipping live trigger-def probe'); return; }
    const mttr = (await client.query('SELECT pg_get_functiondef(\'public.record_mttr_on_sd_completion\'::regproc) AS def')).rows[0].def;
    const emit = (await client.query('SELECT pg_get_functiondef(\'public.fn_emit_sd_completed_event\'::regproc) AS def')).rows[0].def;
    expect(mttr).toMatch(/safe_uuid\(\s*NEW\.metadata->>'proposal_id'\s*\)/);
    expect(mttr).not.toMatch(/\(\s*NEW\.metadata->>'proposal_id'\s*\)::UUID/i);
    expect(emit).toMatch(/safe_uuid\(\s*NEW\.metadata->>'venture_id'\s*\)/);
    expect(emit).not.toMatch(/\(\s*NEW\.metadata->>'venture_id'\s*\)::UUID/i);
  });
});
