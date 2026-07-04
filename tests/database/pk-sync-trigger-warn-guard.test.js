/**
 * SD-FDBK-FIX-TRIGGER-AUDIT-MEDIUM-003 (F-6) — sync_sd_code_user_facing /
 * sync_uuid_internal_pk gain a RAISE WARNING on their PK-rewrite UPDATE branch;
 * every other branch (INSERT null-fill, forward id->alias sync) is UNCHANGED.
 * A consumer audit found lib/sourcing-engine/refill-auto-promote.js is a live,
 * test-guarded dependency of the INSERT null-fill branch -- this suite proves
 * that path (and scripts/leo-create-sd.js's trigger-avoidant pattern) are
 * unaffected, and that the dangerous UPDATE branch still rewrites the PK
 * exactly as before (only observability was added, not a behavior fix).
 *
 * Live-DB integration test, gated like the other tests/database suites so CI
 * skips cleanly without service-role creds. Fixture rows use the TEST-F6-PKSYNC-
 * prefix and are swept both before and after the suite (mirrors the F-3 race-fix
 * test's leak-resilient cleanup, QF-20260703-773 lesson).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_SQL = readFileSync(
  resolve(__dirname, '../../database/migrations/20260704_pk_sync_trigger_warn_guard.sql'),
  'utf8'
);

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const HAS_REAL_DB = process.env.SUPABASE_URL
  && !process.env.SUPABASE_URL.includes('test.invalid.local')
  && process.env.SUPABASE_SERVICE_ROLE_KEY
  && !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('test-service-role-key-not-real');

function extractFunctionBody(sql, fnName) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${fnName}`);
  if (start === -1) throw new Error(`function ${fnName} not found in migration SQL`);
  const end = sql.indexOf('$function$;', start) + '$function$;'.length;
  return sql.slice(start, end);
}

describe('pk-sync-trigger warn guard — static shape (SD-FDBK-FIX-TRIGGER-AUDIT-MEDIUM-003)', () => {
  it('sync_sd_code_user_facing: RAISE WARNING precedes the id-rewrite, INSERT branch untouched', () => {
    const fn = extractFunctionBody(MIGRATION_SQL, 'sync_sd_code_user_facing');
    const warnIdx = fn.indexOf('RAISE WARNING');
    const rewriteIdx = fn.indexOf('NEW.id := NEW.sd_code_user_facing;');
    expect(warnIdx).toBeGreaterThan(-1);
    expect(rewriteIdx).toBeGreaterThan(-1);
    expect(warnIdx, 'warning must be emitted before the PK is actually rewritten').toBeLessThan(rewriteIdx);
    // INSERT branch is byte-for-byte identical to the pre-fix function
    expect(fn).toContain("IF TG_OP = 'INSERT' THEN");
    expect(fn).toContain('NEW.sd_code_user_facing := NEW.id;');
    expect(fn).toContain('NEW.id := NEW.sd_code_user_facing;');
    expect(fn).toContain('ELSIF NEW.id IS NULL THEN');
  });

  it('sync_uuid_internal_pk: RAISE WARNING precedes the uuid_id-rewrite, INSERT branch untouched', () => {
    const fn = extractFunctionBody(MIGRATION_SQL, 'sync_uuid_internal_pk');
    const warnIdx = fn.indexOf('RAISE WARNING');
    const rewriteIdx = fn.indexOf('NEW.uuid_id := NEW.uuid_internal_pk;');
    expect(warnIdx).toBeGreaterThan(-1);
    expect(rewriteIdx).toBeGreaterThan(-1);
    expect(warnIdx).toBeLessThan(rewriteIdx);
    expect(fn).toContain("IF TG_OP = 'INSERT' THEN");
  });
});

const FIXTURE_KEY_PREFIX = 'TEST-F6-PKSYNC-';
const STALE_FIXTURE_MS = 10 * 60 * 1000;

async function purgeStaleFixtures() {
  const cutoff = new Date(Date.now() - STALE_FIXTURE_MS).toISOString();
  const { data: stale } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .like('sd_key', `${FIXTURE_KEY_PREFIX}%`)
    .lt('created_at', cutoff);
  const ids = (stale || []).map((r) => r.id);
  if (!ids.length) return;
  await supabase.from('strategic_directives_v2').delete().in('id', ids);
}

function buildFixtureSD(ts, i, extra = {}) {
  const id = `${FIXTURE_KEY_PREFIX}${ts}-${i}`;
  return {
    id,
    sd_key: id,
    title: `Test SD for F-6 PK-sync warn-guard regression ${i}`,
    category: 'infrastructure',
    status: 'draft',
    priority: 'low',
    description: 'Test fixture for TRIGGER-AUDIT F-6 warn-guard regression test',
    rationale: 'Integration test fixture',
    scope: 'Test scope',
    ...extra,
  };
}

describe.skipIf(!HAS_REAL_DB)('pk-sync-trigger warn guard — live-DB behavior (SD-FDBK-FIX-TRIGGER-AUDIT-MEDIUM-003)', () => {
  const cleanupIds = [];

  beforeAll(purgeStaleFixtures);
  afterAll(purgeStaleFixtures);

  afterEach(async () => {
    if (cleanupIds.length) {
      await supabase.from('strategic_directives_v2').delete().in('id', cleanupIds);
      cleanupIds.length = 0;
    }
  });

  it('TS-1: refill-auto-promote pattern (sd_code_user_facing/uuid_internal_pk omitted) — INSERT null-fill unaffected', async () => {
    const ts = Date.now();
    const row = buildFixtureSD(ts, 'insert-omit');
    cleanupIds.push(row.id);

    const { data, error } = await supabase.from('strategic_directives_v2')
      .insert(row).select('id, sd_code_user_facing, uuid_id, uuid_internal_pk').single();

    expect(error).toBeNull();
    expect(data.sd_code_user_facing).toBe(row.id);
    expect(data.uuid_internal_pk).toBe(data.uuid_id);
    expect(data.uuid_internal_pk).not.toBeNull();
  });

  it('TS-2: leo-create-sd pattern (id and sd_code_user_facing pre-set equal) — no mutation, no-op', async () => {
    const ts = Date.now();
    const row = buildFixtureSD(ts, 'insert-preset', { sd_code_user_facing: `${FIXTURE_KEY_PREFIX}${ts}-insert-preset` });
    cleanupIds.push(row.id);

    const { data, error } = await supabase.from('strategic_directives_v2')
      .insert(row).select('id, sd_code_user_facing').single();

    expect(error).toBeNull();
    expect(data.id).toBe(row.id);
    expect(data.sd_code_user_facing).toBe(row.id);
  });

  it('TS-3: UPDATE writing sd_code_user_facing directly still rewrites id (unchanged behavior)', async () => {
    const ts = Date.now();
    const row = buildFixtureSD(ts, 'update-alias');
    const { data: inserted, error: insErr } = await supabase.from('strategic_directives_v2')
      .insert(row).select('id').single();
    expect(insErr).toBeNull();
    cleanupIds.push(inserted.id);

    const newAlias = `${FIXTURE_KEY_PREFIX}${ts}-update-alias-NEW`;
    const { data: updated, error: updErr } = await supabase.from('strategic_directives_v2')
      .update({ sd_code_user_facing: newAlias })
      .eq('id', inserted.id)
      .select('id, sd_code_user_facing')
      .single();

    expect(updErr).toBeNull();
    // Behavior UNCHANGED: writing the alias column still rewrites the PK to match.
    expect(updated.id).toBe(newAlias);
    expect(updated.sd_code_user_facing).toBe(newAlias);
    // Track the row under its NEW id for cleanup (the PK was rewritten).
    cleanupIds[cleanupIds.length - 1] = newAlias;
  });

  it('TS-4: UPDATE writing uuid_internal_pk directly still rewrites uuid_id (unchanged behavior)', async () => {
    const ts = Date.now();
    const row = buildFixtureSD(ts, 'update-uuid-alias');
    const { data: inserted, error: insErr } = await supabase.from('strategic_directives_v2')
      .insert(row).select('id, uuid_internal_pk').single();
    expect(insErr).toBeNull();
    cleanupIds.push(inserted.id);

    const newUuid = '00000000-0000-4000-8000-000000000001';
    const { data: updated, error: updErr } = await supabase.from('strategic_directives_v2')
      .update({ uuid_internal_pk: newUuid })
      .eq('id', inserted.id)
      .select('uuid_id, uuid_internal_pk')
      .single();

    expect(updErr).toBeNull();
    expect(updated.uuid_internal_pk).toBe(newUuid);
    expect(updated.uuid_id).toBe(newUuid);

    // restore a distinct uuid so as not to collide with any other fixture reusing this sentinel
    await supabase.from('strategic_directives_v2').update({ uuid_internal_pk: inserted.uuid_internal_pk }).eq('id', inserted.id);
  });
});
