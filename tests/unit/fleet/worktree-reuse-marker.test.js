// SD-LEO-INFRA-CLAIM-GUARD-BRANCH-DERIVED-001 FR-2: coordinator-written reuse marker.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeReuseMarker, readReuseMarker, WORKTREE_REUSE_MARKER_FILENAME } from '../../../lib/fleet/worktree-reuse-marker.js';

let tmpDir;

afterEach(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  tmpDir = undefined;
});

describe('writeReuseMarker', () => {
  it('writes the established {key, writer_session, marked_at} shape and never throws', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reuse-marker-'));
    const result = writeReuseMarker(tmpDir, { key: 'SD-Z-001', writerSession: 'sess-abc' });
    expect(result.written).toBe(true);
    expect(result.error).toBeNull();
    const raw = JSON.parse(fs.readFileSync(path.join(tmpDir, WORKTREE_REUSE_MARKER_FILENAME), 'utf8'));
    expect(raw.key).toBe('SD-Z-001');
    expect(raw.writer_session).toBe('sess-abc');
    expect(typeof raw.marked_at).toBe('string');
  });

  it('returns { written: false, error } rather than throwing when the path is not writable', () => {
    const result = writeReuseMarker('/definitely/not/a/real/writable/path/xyz', { key: 'SD-Z-001' });
    expect(result.written).toBe(false);
    expect(result.markerPath).toBeNull();
    expect(typeof result.error).toBe('string');
  });
});

describe('readReuseMarker', () => {
  it('reads back a freshly written marker', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reuse-marker-'));
    writeReuseMarker(tmpDir, { key: 'SD-Z-001', writerSession: 'sess-abc' });
    const marker = readReuseMarker(tmpDir);
    expect(marker).not.toBeNull();
    expect(marker.key).toBe('SD-Z-001');
  });

  it('returns null when absent', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reuse-marker-'));
    expect(readReuseMarker(tmpDir)).toBeNull();
  });

  it('returns null when corrupt (invalid JSON)', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reuse-marker-'));
    fs.writeFileSync(path.join(tmpDir, WORKTREE_REUSE_MARKER_FILENAME), '{not valid json');
    expect(readReuseMarker(tmpDir)).toBeNull();
  });

  it('returns null when the key field is missing or empty', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reuse-marker-'));
    fs.writeFileSync(path.join(tmpDir, WORKTREE_REUSE_MARKER_FILENAME), JSON.stringify({ marked_at: new Date().toISOString() }));
    expect(readReuseMarker(tmpDir)).toBeNull();
  });

  // C4 (prospective TESTING sub-agent finding): a stale marker naming a since-superseded key
  // must not carry authority indefinitely -- mirrors lib/worktree-reaper/reap-eligible-marker.js's
  // own documented incident (a 5.5h-stale marker licensed deleting unrelated work).
  it('treats a marker older than the TTL as absent', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reuse-marker-'));
    const staleTimestamp = new Date(Date.now() - 200 * 60 * 1000).toISOString(); // 200min ago
    fs.writeFileSync(path.join(tmpDir, WORKTREE_REUSE_MARKER_FILENAME), JSON.stringify({ key: 'SD-Z-001', marked_at: staleTimestamp }));
    expect(readReuseMarker(tmpDir, { ttlMin: 120 })).toBeNull();
  });

  it('accepts a marker within the TTL', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reuse-marker-'));
    const freshTimestamp = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5min ago
    fs.writeFileSync(path.join(tmpDir, WORKTREE_REUSE_MARKER_FILENAME), JSON.stringify({ key: 'SD-Z-001', marked_at: freshTimestamp }));
    expect(readReuseMarker(tmpDir, { ttlMin: 120 })?.key).toBe('SD-Z-001');
  });
});
