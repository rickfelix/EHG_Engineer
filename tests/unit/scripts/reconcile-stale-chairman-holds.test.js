/**
 * SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-B FR-4 (Population A).
 *
 * scripts/reconcile-stale-chairman-holds.mjs backfills strategic_directives_v2 rows
 * completed with an unreleased review_hold_reason. Mirrors the mocking pattern established
 * by tests/unit/fleet/claim-eligibility-release-hold.test.js: the script loads
 * lib/fleet/claim-eligibility.cjs via a real (non-mocked) require, so the REAL releaseHold()
 * runs against a supabase mock — including its own readback-mismatch consistency check
 * (Solomon a05d6f0c hard acceptance), which is why this file's mergeMetadataKeys mock
 * CAPTURES each patch and feeds it back through the supabase mock's readback rather than
 * returning a static fixture — a static readback would make every releaseHold() call
 * report released:false (readback mismatch) regardless of what actually happened.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/coordinator/safe-metadata-merge.mjs', () => ({
  mergeMetadataKeys: vi.fn(),
}));
const { mergeMetadataKeys } = await import('../../../lib/coordinator/safe-metadata-merge.mjs');

let supabaseInstance;
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => supabaseInstance),
}));

/**
 * @param {object[]} sds rows carry: sd_key, status, metadata.
 * @param {{current: object|undefined}} stampedMetadataRef mutable ref set by the
 *   mergeMetadataKeys mock's implementation (configured per-test) so releaseHold()'s own
 *   readback sees whatever was "written".
 */
function makeSupabaseMock(sds, stampedMetadataRef) {
  const readCalls = [];
  const from = vi.fn(() => {
    let lastEqSdKey = null;
    const builder = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn((col, val) => {
      if (col === 'sd_key') lastEqSdKey = val;
      return builder;
    });
    builder.not = vi.fn(() => builder);
    // findTargetRows's read terminates on the bare (thenable) builder.
    builder.then = (resolve) => {
      readCalls.push('findTargetRows-read');
      resolve({ data: sds, error: null });
    };
    // releaseHold()'s readback terminates on .maybeSingle(). If mergeMetadataKeys "wrote"
    // something (stampedMetadataRef.current set), the readback reflects THAT, not the
    // original fixture — matching what a real DB round-trip would show.
    builder.maybeSingle = vi.fn(async () => {
      if (stampedMetadataRef?.current && lastEqSdKey) {
        return { data: { metadata: stampedMetadataRef.current }, error: null };
      }
      const row = sds.find((r) => r.sd_key === lastEqSdKey);
      return { data: row ? { metadata: row.metadata } : null, error: null };
    });
    return builder;
  });
  return { from, _calls: { readCalls } };
}

beforeEach(() => {
  mergeMetadataKeys.mockReset();
  process.env.SUPABASE_URL = 'http://test.supabase';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
});

async function importScript() {
  vi.resetModules();
  return await import('../../../scripts/reconcile-stale-chairman-holds.mjs');
}

describe('findTargetRows — filters to genuinely unreleased holds, splits into known/unknown', () => {
  it('a completed row with review_hold_reason but ALSO a valid unfenced_at is excluded (already released)', async () => {
    const sds = [
      { sd_key: 'SD-RELEASED-001', status: 'completed', metadata: { review_hold_reason: 'x', unfenced_at: '2026-08-01T00:00:00Z' } },
    ];
    supabaseInstance = makeSupabaseMock(sds, {});

    const { findTargetRows } = await importScript();
    const result = await findTargetRows(supabaseInstance);
    expect(result.known).toEqual([]);
    expect(result.unknown).toEqual([]);
  });

  it('a row in the DISPOSITIONS manifest is classified known', async () => {
    const { DISPOSITIONS } = await importScript();
    const anyKnownKey = Object.keys(DISPOSITIONS)[0];
    const sds = [
      { sd_key: anyKnownKey, status: 'completed', metadata: { review_hold_reason: 'x' } },
    ];
    supabaseInstance = makeSupabaseMock(sds, {});

    const { findTargetRows } = await importScript();
    const result = await findTargetRows(supabaseInstance);
    expect(result.known.map((r) => r.sd_key)).toEqual([anyKnownKey]);
  });

  it('an unreleased-hold row NOT in DISPOSITIONS is classified unknown, never guessed at', async () => {
    const sds = [
      { sd_key: 'SD-BRAND-NEW-UNSEEN-001', status: 'completed', metadata: { review_hold_reason: 'x' } },
    ];
    supabaseInstance = makeSupabaseMock(sds, {});

    const { findTargetRows } = await importScript();
    const result = await findTargetRows(supabaseInstance);
    expect(result.unknown.map((r) => r.sd_key)).toEqual(['SD-BRAND-NEW-UNSEEN-001']);
    expect(result.known).toEqual([]);
  });
});

describe('backfillRow — Group 1 (released) calls the REAL releaseHold(); Group 2 (flagged) does NOT', () => {
  it('Group 1: releaseHold() lands (readback matches the stamped value) — reports released=true', async () => {
    const { DISPOSITIONS, backfillRow } = await importScript();
    const group1Key = Object.entries(DISPOSITIONS).find(([, d]) => d.released)[0];
    const sds = [{ sd_key: group1Key, status: 'completed', metadata: { review_hold_reason: 'x' } }];
    const stampedRef = {};
    supabaseInstance = makeSupabaseMock(sds, stampedRef);

    mergeMetadataKeys.mockImplementation(async (sdKey, patch) => {
      // Simulate a real merge: fold the patch onto whatever's on the row today.
      const base = sds.find((r) => r.sd_key === sdKey)?.metadata || {};
      stampedRef.current = { ...base, ...patch };
      return { merged: true, sdKey };
    });

    const result = await backfillRow(supabaseInstance, group1Key, DISPOSITIONS[group1Key]);
    expect(result.released).toBe(true);
    expect(result.disposition).toBe('informally_released_stamp_backfilled');
    // Two merges: the sanctioned releaseHold() stamp, then the chairman_hold_backfill marker.
    expect(mergeMetadataKeys).toHaveBeenCalledTimes(2);
    const releaseCallPatch = mergeMetadataKeys.mock.calls[0][1];
    expect(releaseCallPatch.unfenced_at).toBeTruthy();
    expect(releaseCallPatch.unfenced_by).toBe('scripts/reconcile-stale-chairman-holds.mjs');
    const markerCallPatch = mergeMetadataKeys.mock.calls[1][1];
    expect(markerCallPatch.chairman_hold_backfill.disposition).toBe('informally_released_stamp_backfilled');
  });

  it('Group 2: never calls releaseHold() at all — only the flag marker is written, released=false', async () => {
    const { DISPOSITIONS, backfillRow } = await importScript();
    const group2Key = Object.entries(DISPOSITIONS).find(([, d]) => !d.released)[0];
    supabaseInstance = makeSupabaseMock([], {}); // empty: releaseHold() readback would find no row
    mergeMetadataKeys.mockImplementation(async (sdKey, patch) => ({ merged: true, sdKey }));

    const result = await backfillRow(supabaseInstance, group2Key, DISPOSITIONS[group2Key]);
    expect(result.released).toBe(false);
    expect(result.disposition).toBe('genuinely_still_held_flagged');
    // Only ONE merge call (the marker) — releaseHold() (which would also call
    // mergeMetadataKeys) must never have run.
    expect(mergeMetadataKeys).toHaveBeenCalledTimes(1);
    const markerCallPatch = mergeMetadataKeys.mock.calls[0][1];
    expect(markerCallPatch.chairman_hold_backfill.disposition).toBe('genuinely_still_held_flagged');
    expect(markerCallPatch).not.toHaveProperty('unfenced_at');
  });
});

describe('TS-dry-run: dry-run performs zero mergeMetadataKeys calls', () => {
  it('reports the split without writing anything', async () => {
    const { DISPOSITIONS } = await importScript();
    const group1Key = Object.entries(DISPOSITIONS).find(([, d]) => d.released)[0];
    const sds = [{ sd_key: group1Key, status: 'completed', metadata: { review_hold_reason: 'x' } }];
    supabaseInstance = makeSupabaseMock(sds, {});

    const { run } = await importScript();
    const result = await run({ supabase: supabaseInstance, live: false, log: () => {} });
    expect(result.group1.map((r) => r.sd_key)).toEqual([group1Key]);
    expect(result.backfilled).toBeUndefined();
    expect(mergeMetadataKeys).not.toHaveBeenCalled();
  });
});

describe('DISPOSITIONS manifest integrity', () => {
  it('has exactly 11 entries, split 7 released / 4 flagged (measured live 2026-09-04)', async () => {
    const { DISPOSITIONS } = await importScript();
    const entries = Object.entries(DISPOSITIONS);
    expect(entries.length).toBe(11);
    expect(entries.filter(([, d]) => d.released).length).toBe(7);
    expect(entries.filter(([, d]) => !d.released).length).toBe(4);
  });

  it('every released entry has a releaseReason; every flagged entry has a note', async () => {
    const { DISPOSITIONS } = await importScript();
    for (const [sdKey, d] of Object.entries(DISPOSITIONS)) {
      if (d.released) {
        expect(d.releaseReason, sdKey).toBeTruthy();
      } else {
        expect(d.note, sdKey).toBeTruthy();
      }
    }
  });
});
