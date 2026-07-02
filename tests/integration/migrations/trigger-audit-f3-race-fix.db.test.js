/**
 * SD-FDBK-INFRA-TRIGGER-AUDIT-MEDIUM-001 (TRIGGER-AUDIT F-3) / FR-1, FR-2, FR-3.
 *
 * assign_sequence_rank() and fn_sync_sd_to_baseline() both computed SELECT MAX(sequence_rank)+1
 * with no locking. Live-confirmed before this fix: rank 1 appeared 69x across 4800 SDs. This
 * suite proves the fix under real concurrency (Promise.all() against the live DB -- the same
 * shape as this repo's actual multi-worker fleet, not a simulated race), plus a static
 * structural guard on the exception-safety shape (TS-3), which live-DB negative-injection
 * cannot reliably exercise via the PostgREST/supabase-js surface (see comment on that test).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createSupabaseServiceClient } from '../../../lib/supabase-client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_SQL = readFileSync(
  resolve(__dirname, '../../../database/migrations/20260702_trigger_audit_f3_race_fix.sql'),
  'utf8'
);

const HAS_REAL_DB = process.env.SUPABASE_URL
  && !process.env.SUPABASE_URL.includes('test.invalid.local')
  && process.env.SUPABASE_SERVICE_ROLE_KEY
  && !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('test-service-role-key-not-real');

const supabase = createSupabaseServiceClient();

// Anchor on the CREATE OR REPLACE FUNCTION declaration (not a bare name split, which is
// fragile against the name also appearing in comments/RAISE strings elsewhere in the file).
function extractFunctionBody(sql, fnName) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${fnName}`);
  if (start === -1) throw new Error(`function ${fnName} not found in migration SQL`);
  return sql.slice(start);
}

describe('TRIGGER-AUDIT F-3 — static exception-safety shape (TS-3)', () => {
  it('the advisory lock is acquired BEFORE/outside the BEGIN...EXCEPTION sub-block, not inside it', () => {
    const fn = extractFunctionBody(MIGRATION_SQL, 'fn_sync_sd_to_baseline');
    const lockIdx = fn.indexOf("pg_advisory_xact_lock(hashtext('sd_baseline_items_seq_'");
    const beginIdx = fn.indexOf('BEGIN\n        INSERT INTO sd_baseline_items');
    expect(lockIdx).toBeGreaterThan(-1);
    expect(beginIdx).toBeGreaterThan(-1);
    expect(lockIdx, 'advisory lock must precede the exception-guarded BEGIN block').toBeLessThan(beginIdx);
  });

  it('EXCEPTION WHEN OTHERS wraps ONLY the sd_baseline_items INSERT, not the MAX+1 SELECT', () => {
    const fn = extractFunctionBody(MIGRATION_SQL, 'fn_sync_sd_to_baseline');
    const beginIdx = fn.indexOf('BEGIN\n        INSERT INTO sd_baseline_items');
    const exceptionIdx = fn.indexOf('EXCEPTION WHEN OTHERS THEN');
    const endIdx = fn.indexOf('END;', exceptionIdx);
    expect(beginIdx).toBeGreaterThan(-1);
    expect(exceptionIdx).toBeGreaterThan(beginIdx);
    expect(endIdx).toBeGreaterThan(exceptionIdx);
    // The MAX+1 SELECT must be OUTSIDE (before) this sub-block
    const selectMaxIdx = fn.indexOf('SELECT COALESCE(MAX(sequence_rank) + 1, 1)');
    expect(selectMaxIdx).toBeGreaterThan(-1);
    expect(selectMaxIdx, 'the MAX+1 computation must run before the exception-guarded INSERT block').toBeLessThan(beginIdx);
  });

  it('a caught baseline-insert failure logs a WARNING referencing the SD, not a silent swallow', () => {
    expect(MIGRATION_SQL).toMatch(/RAISE WARNING 'fn_sync_sd_to_baseline: baseline-item insert failed for SD %.*NEW\.sd_key, SQLERRM/);
  });

  it('assign_sequence_rank() only locks/computes when NEW.sequence_rank IS NULL (explicit-rank path unchanged)', () => {
    const fn = extractFunctionBody(MIGRATION_SQL, 'assign_sequence_rank');
    const ifIdx = fn.indexOf('IF NEW.sequence_rank IS NULL THEN');
    const lockIdx = fn.indexOf("pg_advisory_xact_lock(hashtext('strategic_directives_v2_sequence_rank')");
    expect(ifIdx).toBeGreaterThan(-1);
    expect(lockIdx).toBeGreaterThan(ifIdx);
  });
});

describe.skipIf(!HAS_REAL_DB)('TRIGGER-AUDIT F-3 — live concurrent-insert race fix (TS-1, TS-2, TS-4)', () => {
  const fixtureIds = [];

  afterEach(async () => {
    if (fixtureIds.length > 0) {
      await supabase.from('sd_baseline_items').delete().in('sd_id', fixtureIds);
      await supabase.from('strategic_directives_v2').delete().in('id', fixtureIds);
      fixtureIds.length = 0;
    }
  });

  function buildFixtureSD(ts, i) {
    const id = `TEST-F3-RACE-${ts}-${i}`;
    return {
      id,
      sd_key: id,
      title: `Test SD for F-3 race fix concurrency probe ${i}`,
      category: 'infrastructure',
      status: 'draft',
      priority: 'low',
      description: 'Test fixture for TRIGGER-AUDIT F-3 concurrent-insert race regression test',
      rationale: 'Integration test fixture',
      scope: 'Test scope',
      sd_code_user_facing: id,
    };
  }

  it('TS-1: N concurrent strategic_directives_v2 inserts (sequence_rank omitted) receive N distinct ranks', async () => {
    const ts = Date.now();
    const N = 5;
    const rows = Array.from({ length: N }, (_, i) => buildFixtureSD(ts, i));
    rows.forEach((r) => fixtureIds.push(r.id));

    const results = await Promise.all(
      rows.map((row) => supabase.from('strategic_directives_v2').insert(row).select('id, sequence_rank').single())
    );

    for (const r of results) {
      expect(r.error, `insert failed: ${r.error?.message}`).toBeNull();
    }
    const ranks = results.map((r) => r.data.sequence_rank);
    const uniqueRanks = new Set(ranks);
    expect(uniqueRanks.size, `expected ${N} distinct ranks, got duplicates: ${ranks.join(',')}`).toBe(N);
  }, 30_000);

  it('TS-4: a single-threaded SD creation (no concurrency) behaves identically to pre-migration', async () => {
    const ts = Date.now();
    const row = buildFixtureSD(ts, 'single');
    fixtureIds.push(row.id);

    const { data, error } = await supabase.from('strategic_directives_v2').insert(row).select('id, sequence_rank, category').single();
    expect(error).toBeNull();
    expect(data.sequence_rank).toBeGreaterThan(0);
    expect(data.category).toBe('infrastructure');
  }, 15_000);

  it('TS-2: N concurrent inserts against the same active baseline receive N distinct sd_baseline_items ranks', async () => {
    const { data: baseline } = await supabase
      .from('sd_execution_baselines')
      .select('id')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    if (!baseline) {
      // No active baseline in this environment -- fn_sync_sd_to_baseline no-ops (RAISE NOTICE
      // path), nothing to assert. Skip rather than false-fail on an environment precondition.
      return;
    }

    const ts = Date.now();
    const N = 5;
    const rows = Array.from({ length: N }, (_, i) => buildFixtureSD(ts, `bl${i}`));
    rows.forEach((r) => fixtureIds.push(r.id));

    const results = await Promise.all(
      rows.map((row) => supabase.from('strategic_directives_v2').insert(row).select('id').single())
    );
    for (const r of results) {
      expect(r.error, `insert failed: ${r.error?.message}`).toBeNull();
    }

    const { data: items, error: itemsErr } = await supabase
      .from('sd_baseline_items')
      .select('sd_id, sequence_rank')
      .eq('baseline_id', baseline.id)
      .in('sd_id', rows.map((r) => r.id));
    expect(itemsErr).toBeNull();
    expect(items.length, 'every concurrently-inserted SD should get a baseline_items row').toBe(N);
    const ranks = items.map((i) => i.sequence_rank);
    expect(new Set(ranks).size, `expected ${N} distinct baseline ranks, got duplicates: ${ranks.join(',')}`).toBe(N);
  }, 30_000);
});
