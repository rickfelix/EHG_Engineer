import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { resolveRepoPathDbFirst } from '../../lib/repo-paths.js';

/**
 * SD-LEO-INFRA-VENTURE-LIFECYCLE-SOFT-001 — applications soft-delete reconciliation.
 *
 * Live-DB regression test for the reversible tombstone model on the applications
 * registry (migration 20260530_applications_soft_delete_reconcile.sql). Covers the
 * deleted_at-driven behavior (AC-1/2/4/5/6); the venture-retire TRIGGER (AC-3) is
 * verified separately by the database-agent in a rolled-back transaction at apply time.
 *
 * Skips cleanly when no service-role key is present (CI without DB access). Uses a
 * unique sentinel name and hard-deletes its own rows in afterAll — never touches real
 * application registry rows.
 */
const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LIVE = Boolean(URL && KEY);

const SENTINEL = 'ZZZ_SOFTDEL_TEST_SD_LIFECYCLE_SOFT_001';
const supabase = LIVE ? createClient(URL, KEY) : null;

async function cleanup() {
  if (!supabase) return;
  await supabase.from('applications').delete().eq('normalized_name', SENTINEL.toLowerCase());
}

describe.skipIf(!LIVE)('applications soft-delete reconciliation (live DB)', () => {
  let kind = 'venture';

  beforeAll(async () => {
    // Reuse an existing row's `kind` so we satisfy whatever NOT NULL/enum applies.
    const { data } = await supabase.from('applications').select('kind').limit(1);
    if (data?.[0]?.kind) kind = data[0].kind;
    await cleanup();
  });
  afterAll(cleanup);

  it('AC-1: tombstone columns exist and default to null (live row)', async () => {
    const { data, error } = await supabase
      .from('applications')
      .insert({ name: SENTINEL, normalized_name: SENTINEL.toLowerCase(), kind, status: 'active', local_path: '/tmp/zzz-softdel-1' })
      .select('id, deleted_at, deleted_by, deletion_reason')
      .single();
    expect(error).toBeNull();
    expect(data.deleted_at).toBeNull();
    expect(data.deleted_by).toBeNull();
    expect(data.deletion_reason).toBeNull();
  });

  it('AC-2: a second LIVE row with the same name is rejected (partial unique index still enforces among live)', async () => {
    const { error } = await supabase
      .from('applications')
      .insert({ name: SENTINEL, normalized_name: SENTINEL.toLowerCase(), kind, status: 'active', local_path: '/tmp/zzz-softdel-dup' });
    expect(error).not.toBeNull(); // unique violation among live rows
  });

  it('AC-2/AC-4/AC-5: tombstone hides the row from the resolver, frees the name for reuse, and clearing it restores', async () => {
    // Tombstone the live row (simulating the venture-retire path's effect).
    const { error: upErr } = await supabase
      .from('applications')
      .update({ status: 'inactive', deleted_at: new Date().toISOString(), deleted_by: 'test', deletion_reason: 'regression test' })
      .eq('normalized_name', SENTINEL.toLowerCase());
    expect(upErr).toBeNull();

    // AC-4: resolver no longer returns the tombstoned app (falls through to registry fallback,
    // which has no such name -> resolveRepoPath returns null for an unknown app).
    const hiddenPath = await resolveRepoPathDbFirst(SENTINEL, supabase);
    expect(hiddenPath).not.toBe('/tmp/zzz-softdel-1');

    // AC-2: the retired name can be reused by a NEW live row (partial unique index allows it).
    const { data: reused, error: reuseErr } = await supabase
      .from('applications')
      .insert({ name: SENTINEL, normalized_name: SENTINEL.toLowerCase(), kind, status: 'active', local_path: '/tmp/zzz-softdel-2' })
      .select('id')
      .single();
    expect(reuseErr).toBeNull();
    expect(reused.id).toBeTruthy();

    // Remove the reused live row so we can test restoring the original cleanly.
    await supabase.from('applications').delete().eq('id', reused.id);

    // AC-5: clearing the tombstone restores the original row (resolver returns it again).
    const { error: restoreErr } = await supabase
      .from('applications')
      .update({ status: 'active', deleted_at: null, deleted_by: null, deletion_reason: null })
      .eq('normalized_name', SENTINEL.toLowerCase());
    expect(restoreErr).toBeNull();

    const restoredPath = await resolveRepoPathDbFirst(SENTINEL, supabase);
    expect(restoredPath).toBe(path.resolve('/tmp/zzz-softdel-1'));
  });
});
