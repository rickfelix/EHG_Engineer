/**
 * SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-A -- lib/fleet/seat-checkpoint-mirror.cjs.
 * TS-1 (dedup + freshness-stamp), TS-5 (fail-soft), TS-7 (torn-read guard),
 * TS-9/TS-10 (no-liveness-gate, unstaffed role is a silent no-op).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import os from 'os';

const require = createRequire(import.meta.url);
const {
  pickNewestCandidate,
  readStableFile,
  writeSeatCheckpoint,
  mirrorSeat,
} = require('../../../lib/fleet/seat-checkpoint-mirror.cjs');

/** Minimal Supabase double: role_seat_checkpoints select/insert/update only. */
function stubSupabase({ latest = null, selectError = null, insertError = null, updateError = null } = {}) {
  const inserted = [];
  const updated = [];
  const chain = {
    select() { return chain; },
    eq() { return chain; },
    order() { return chain; },
    limit() { return chain; },
    maybeSingle() { return Promise.resolve({ data: latest, error: selectError }); },
    insert(row) {
      inserted.push(row);
      return Promise.resolve({ data: null, error: insertError });
    },
    update(patch) {
      updated.push(patch);
      return { eq: () => Promise.resolve({ data: null, error: updateError }) };
    },
  };
  return { supabase: { from: () => chain }, inserted, updated };
}

describe('pickNewestCandidate', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seat-ck-')); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('returns null for an empty list', () => {
    expect(pickNewestCandidate([])).toBeNull();
  });

  it('returns the single candidate when only one exists', () => {
    const f = path.join(tmpDir, 'a.md');
    fs.writeFileSync(f, 'x');
    expect(pickNewestCandidate([f])).toBe(f);
  });

  it('picks the newest-by-mtime when no tie', async () => {
    const a = path.join(tmpDir, 'a.md');
    const b = path.join(tmpDir, 'b.md');
    fs.writeFileSync(a, 'x');
    await new Promise((r) => setTimeout(r, 10));
    fs.writeFileSync(b, 'y');
    expect(pickNewestCandidate([a, b])).toBe(b);
  });

  it('skips a candidate that no longer exists (stat failure)', () => {
    const a = path.join(tmpDir, 'a.md');
    fs.writeFileSync(a, 'x');
    const missing = path.join(tmpDir, 'missing.md');
    expect(pickNewestCandidate([missing, a])).toBe(a);
  });
});

describe('readStableFile', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seat-ck-')); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('reads stable content when the file does not change between reads', async () => {
    const f = path.join(tmpDir, 'a.md');
    fs.writeFileSync(f, 'stable content');
    const result = await readStableFile(f, 5);
    expect(result).toEqual({ content: 'stable content', torn: false });
  });

  // TS-7: a torn/mid-write read must never be accepted.
  it('detects a torn read when content changes between the two reads', async () => {
    const f = path.join(tmpDir, 'a.md');
    fs.writeFileSync(f, 'first');
    const promise = readStableFile(f, 20);
    // Mutate the file DURING the gap, simulating a concurrent overwrite.
    setTimeout(() => fs.writeFileSync(f, 'second'), 5);
    const result = await promise;
    expect(result.torn).toBe(true);
    expect(result.content).toBeNull();
  });

  it('returns content:null, torn:false for a missing file', async () => {
    const result = await readStableFile(path.join(tmpDir, 'nope.md'), 1);
    expect(result).toEqual({ content: null, torn: false });
  });
});

describe('writeSeatCheckpoint', () => {
  it('inserts a new row when no prior checkpoint exists for the seat', async () => {
    const { supabase, inserted } = stubSupabase({ latest: null });
    const result = await writeSeatCheckpoint(supabase, { seatName: 'adam', content: 'hello' });
    expect(result.action).toBe('inserted');
    expect(inserted).toHaveLength(1);
    expect(inserted[0].seat_name).toBe('adam');
    expect(inserted[0].content_hash).toBeTruthy();
  });

  // TS-1: dedup-by-hash.
  it('refreshes last_verified_at (no new row) when content_hash is unchanged', async () => {
    const { approvedArtifactHash } = await import('../../../scripts/lib/approved-artifact-hash.js');
    const hash = approvedArtifactHash('same content');
    const { supabase, inserted, updated } = stubSupabase({ latest: { id: 'row-1', content_hash: hash } });
    const result = await writeSeatCheckpoint(supabase, { seatName: 'adam', content: 'same content' });
    expect(result.action).toBe('refreshed');
    expect(inserted).toHaveLength(0);
    expect(updated).toHaveLength(1);
    expect(updated[0].last_verified_at).toBeTruthy();
  });

  it('inserts a new row when content_hash differs from the latest stored one', async () => {
    const { supabase, inserted } = stubSupabase({ latest: { id: 'row-1', content_hash: 'stale-hash' } });
    const result = await writeSeatCheckpoint(supabase, { seatName: 'adam', content: 'new content' });
    expect(result.action).toBe('inserted');
    expect(inserted).toHaveLength(1);
  });

  // TS-5: fail-soft.
  it('never throws on a select error, reports action:error', async () => {
    const { supabase } = stubSupabase({ selectError: { message: 'boom' } });
    const result = await writeSeatCheckpoint(supabase, { seatName: 'adam', content: 'x' });
    expect(result.action).toBe('error');
    expect(result.reason).toContain('boom');
  });

  it('never throws on an insert error, reports action:error', async () => {
    const { supabase } = stubSupabase({ latest: null, insertError: { message: 'insert boom' } });
    const result = await writeSeatCheckpoint(supabase, { seatName: 'adam', content: 'x' });
    expect(result.action).toBe('error');
  });
});

describe('mirrorSeat', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seat-ck-claude-')); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  // TS-9/TS-10: an unstaffed role (zero matching files) is a silent no-op, not an error --
  // and this happens regardless of live-session status, since mirrorSeat never checks liveness.
  it('a role with no matching local file is a silent no-op', async () => {
    const { supabase, inserted } = stubSupabase({ latest: null });
    const result = await mirrorSeat(supabase, tmpDir, 'michael');
    expect(result.action).toBe('no_candidate');
    expect(inserted).toHaveLength(0);
  });

  it('mirrors the newest file for a seat unconditionally (no liveness dependency)', async () => {
    fs.writeFileSync(path.join(tmpDir, 'alpha-michael-seat-state-fa09a46d.md'), 'michael memory');
    const { supabase, inserted } = stubSupabase({ latest: null });
    const result = await mirrorSeat(supabase, tmpDir, 'michael');
    expect(result.action).toBe('inserted');
    expect(inserted[0].seat_name).toBe('michael');
    expect(inserted[0].content).toBe('michael memory');
  });

  it('never throws when the .claude directory itself is unreadable', async () => {
    const { supabase } = stubSupabase({ latest: null });
    const result = await mirrorSeat(supabase, path.join(tmpDir, 'does-not-exist'), 'adam');
    expect(result.action).toBe('no_candidate');
  });
});
