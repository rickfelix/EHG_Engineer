/**
 * SD-LEO-FIX-STRATEGIC-DIRECTIVES-UPDATED-001 (FR-2): concurrent metadata read-modify-write race.
 *
 * Reproduces, deterministically, the live-observed bug: two writers each add a distinct
 * strategic_directives_v2.metadata key to the same row. Under the OLD pattern (read the whole
 * metadata object, locally merge one key, full-blob .update({metadata: merged})), a writer whose
 * READ happened before a concurrent writer's WRITE silently clobbers that writer's key when its
 * own (now-stale) write lands. Under the FIXED pattern (mergeMetadataKeys' atomic Postgres
 * jsonb `||` merge, touching ONLY the patched key), the outcome no longer depends on read timing
 * at all -- both writers' keys always survive.
 *
 * The BASELINE test recreates the old shape inline (the real source no longer contains it) and
 * demonstrably FAILS under this exact interleaving, so this is a genuine regression guard, not a
 * tautology.
 */
import { describe, it, expect } from 'vitest';
import { stampClaim, stampCompletion } from '../../../lib/fleet/claim-stamp.cjs';

const SD_KEY = 'SD-RACE-001';

function makeSharedRow() {
  return { id: 'sd-1', sd_key: SD_KEY, metadata: {} };
}

/** Minimal readSd-compatible supabase double. `deferRead` lets a test hold the read open. */
function makeSupabase(row, { deferRead = false } = {}) {
  let releaseRead = () => {};
  const readGate = deferRead ? new Promise((res) => { releaseRead = res; }) : Promise.resolve();
  return {
    releaseRead,
    from() {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              await readGate;
              return { data: { id: row.id, sd_key: row.sd_key, metadata: row.metadata }, error: null };
            },
          }),
        }),
      };
    },
  };
}

/** Emulates the REAL Postgres semantics: UPDATE ... SET metadata = COALESCE(metadata,'{}') || $patch. */
function makeAtomicMergeFn(row) {
  return async (sdKey, patch) => {
    if (sdKey !== row.sd_key) return { merged: false, sdKey, error: 'not_found' };
    row.metadata = { ...row.metadata, ...patch };
    return { merged: true, sdKey };
  };
}

describe('FR-2: concurrent metadata writers no longer clobber each other', () => {
  it('BASELINE (proves this is a real regression guard, not a tautology): the OLD read-then-full-blob-replace pattern LOSES a concurrent writer key', async () => {
    const row = makeSharedRow();
    // Writer A reads metadata (empty) first...
    const aSnapshot = { ...row.metadata };
    // ...then writer B reads (also empty) AND completes its own full-blob write before A does.
    const bSnapshot = { ...row.metadata };
    row.metadata = { ...bSnapshot, completed_by_session: 'session-B' }; // B's full-blob write
    expect(row.metadata.completed_by_session).toBe('session-B');
    // Writer A now writes, using its STALE snapshot taken before B's write existed.
    row.metadata = { ...aSnapshot, claim_history: [{ session_id: 'session-A' }] }; // A's full-blob write
    expect(row.metadata.claim_history).toEqual([{ session_id: 'session-A' }]);
    // THE BUG: B's key is gone -- clobbered by A's full-blob write of a stale snapshot.
    expect(row.metadata.completed_by_session).toBeUndefined();
  });

  it('FIXED: the migrated lib/fleet/claim-stamp.cjs functions (mergeMetadataKeys) do NOT lose a concurrent writer key under the identical interleaving', async () => {
    const row = makeSharedRow();
    const mergeFn = makeAtomicMergeFn(row);

    // Writer A (stampClaim) starts and is blocked mid-read (its own readSd call has not resolved).
    const supabaseA = makeSupabase(row, { deferRead: true });
    const claimPromise = stampClaim(supabaseA, SD_KEY, 'session-A', 'env', mergeFn);

    // Writer B (stampCompletion) completes an entire read-then-write cycle while A is still
    // blocked mid-read -- the identical interleaving the baseline test used.
    const supabaseB = makeSupabase(row);
    await stampCompletion(supabaseB, SD_KEY, 'session-B', mergeFn);
    expect(row.metadata.completed_by_session).toBe('session-B');

    // Release A's read and let its write land.
    supabaseA.releaseRead();
    const entry = await claimPromise;

    // THE FIX: both keys survive. A's merge touched ONLY claim_history -- read timing no longer
    // matters, because the write is scoped to the patched key, not the whole object.
    expect(entry.session_id).toBe('session-A');
    expect(row.metadata.claim_history?.[0]?.session_id).toBe('session-A');
    expect(row.metadata.completed_by_session).toBe('session-B');
    expect(row.metadata.completed_stamp_at).toBeTruthy();
  });

  it('order-independence: reversing which writer is blocked mid-read produces the same non-lossy outcome', async () => {
    const row = makeSharedRow();
    const mergeFn = makeAtomicMergeFn(row);

    const supabaseB = makeSupabase(row, { deferRead: true });
    const completionPromise = stampCompletion(supabaseB, SD_KEY, 'session-B', mergeFn);

    const supabaseA = makeSupabase(row);
    await stampClaim(supabaseA, SD_KEY, 'session-A', 'env', mergeFn);
    expect(row.metadata.claim_history?.[0]?.session_id).toBe('session-A');

    supabaseB.releaseRead();
    await completionPromise;

    expect(row.metadata.claim_history?.[0]?.session_id).toBe('session-A');
    expect(row.metadata.completed_by_session).toBe('session-B');
  });
});
