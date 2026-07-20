/**
 * SD-LEO-INFRA-WORKTREE-REAPER-RESIDENT-001 — residency guard + marker + chokepoint.
 *
 * TS-1 cwd containment blocks at the chokepoint; TS-2 fresh-vs-stale heartbeat
 * residency; TS-3 fail-closed on query error; TS-7 kill-switch bypass (loud);
 * marker roundtrip; FR-6 e2e composition: block while fresh, collect after stale.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  cwdResidencyBlocks,
  heartbeatResidencyBlocksRemoval,
  REAP_BLOCKED_RESIDENT,
  REAP_RESIDENCY_UNKNOWN,
} from '../../lib/worktree-reaper/residency-guard.js';
import {
  writeReapEligibleMarker,
  readReapEligibleMarker,
  hasReapEligibleMarker,
  MARKER_FILENAME,
} from '../../lib/worktree-reaper/reap-eligible-marker.js';
import { removeWorktreeViaGit } from '../../lib/worktree-manager.js';

const noop = () => {};

function sbReturning(result) {
  // FR-6 batch 8: heartbeatResidencyBlocksRemoval now paginates via fetchAllPaginated
  // (.not().order().range()) — not()/order() are chainable, range() is the terminal.
  const chain = {
    select: () => chain,
    not: () => chain,
    order: () => chain,
    range: (from, to) => Promise.resolve({
      data: Array.isArray(result.data) ? result.data.slice(from, to + 1) : result.data,
      error: result.error,
    }),
  };
  return { from: () => chain };
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wt-residency-'));
}

afterEach(() => {
  delete process.env.WORKTREE_RESIDENCY_GUARD;
});

describe('cwdResidencyBlocks (TS-1, TS-7)', () => {
  it('blocks when cwd IS the target', () => {
    const d = tmpDir();
    expect(cwdResidencyBlocks(d, { cwd: d, logger: noop })).toEqual({ blocked: true, reason: REAP_BLOCKED_RESIDENT });
  });

  it('blocks when cwd is a subdirectory of the target', () => {
    const d = tmpDir();
    const sub = path.join(d, 'a', 'b');
    expect(cwdResidencyBlocks(d, { cwd: sub, logger: noop }).blocked).toBe(true);
  });

  it('does NOT block a sibling path sharing a prefix (no substring false-positive)', () => {
    const d = tmpDir();
    expect(cwdResidencyBlocks(d, { cwd: d + '-sibling', logger: noop }).blocked).toBe(false);
  });

  it('does NOT block when cwd is outside the target', () => {
    const d = tmpDir();
    expect(cwdResidencyBlocks(d, { cwd: os.tmpdir(), logger: noop }).blocked).toBe(false);
  });

  it('kill-switch bypasses LOUDLY (TS-7)', () => {
    process.env.WORKTREE_RESIDENCY_GUARD = 'off';
    const d = tmpDir();
    const lines = [];
    const res = cwdResidencyBlocks(d, { cwd: d, logger: (m) => lines.push(m) });
    expect(res.blocked).toBe(false);
    expect(res.bypassed).toBe(true);
    expect(lines.join(' ')).toMatch(/BYPASSING/);
  });
});

describe('heartbeatResidencyBlocksRemoval (TS-2, TS-3)', () => {
  it('a FRESH-heartbeat session whose worktree_path is the target blocks', async () => {
    const d = tmpDir();
    const sb = sbReturning({ data: [{ session_id: 's1', heartbeat_at: new Date().toISOString(), worktree_path: d }], error: null });
    const res = await heartbeatResidencyBlocksRemoval(sb, d, { logger: noop });
    expect(res.blocked).toBe(true);
    expect(res.reason).toBe(REAP_BLOCKED_RESIDENT);
    expect(res.detail).toContain('s1');
  });

  it('a STALE-heartbeat session does not block', async () => {
    const d = tmpDir();
    const stale = new Date(Date.now() - 3600_000).toISOString();
    const sb = sbReturning({ data: [{ session_id: 's1', heartbeat_at: stale, worktree_path: d }], error: null });
    expect((await heartbeatResidencyBlocksRemoval(sb, d, { logger: noop })).blocked).toBe(false);
  });

  it('a fresh session on a DIFFERENT worktree does not block', async () => {
    const d = tmpDir();
    const other = tmpDir();
    const sb = sbReturning({ data: [{ session_id: 's1', heartbeat_at: new Date().toISOString(), worktree_path: other }], error: null });
    expect((await heartbeatResidencyBlocksRemoval(sb, d, { logger: noop })).blocked).toBe(false);
  });

  it('fails CLOSED on a query error (TS-3)', async () => {
    const d = tmpDir();
    const sb = sbReturning({ data: null, error: new Error('connection reset') });
    const res = await heartbeatResidencyBlocksRemoval(sb, d, { logger: noop });
    expect(res.blocked).toBe(true);
    expect(res.reason).toBe(REAP_RESIDENCY_UNKNOWN);
  });
});

describe('chokepoint integration (TS-1): removeWorktreeViaGit refuses a cwd-resident delete', () => {
  it('returns blocked+skipped without executing the delete when the process stands inside the target', () => {
    const d = tmpDir();
    const prev = process.cwd();
    try {
      process.chdir(d);
      const res = removeWorktreeViaGit(d, os.tmpdir(), { allowFail: true, logger: noop });
      expect(res.blocked).toBe(true);
      expect(res.skipped).toBe(true);
      expect(res.reason).toBe(REAP_BLOCKED_RESIDENT);
      expect(fs.existsSync(d)).toBe(true); // nothing was deleted
    } finally {
      process.chdir(prev);
    }
  });
});

describe('reap-eligible marker (FR-3)', () => {
  it('write/read roundtrip carries sd_key, merged_pr, marked_at', () => {
    const d = tmpDir();
    const w = writeReapEligibleMarker(d, { sd_key: 'SD-X-001', merged_pr: 123 });
    expect(w.written).toBe(true);
    expect(hasReapEligibleMarker(d)).toBe(true);
    const m = readReapEligibleMarker(d);
    expect(m.sd_key).toBe('SD-X-001');
    expect(m.merged_pr).toBe(123);
    expect(typeof m.marked_at).toBe('string');
  });

  it('a corrupt marker reads as null; a missing dir write is non-fatal', () => {
    const d = tmpDir();
    fs.writeFileSync(path.join(d, MARKER_FILENAME), '{not json', 'utf8');
    expect(readReapEligibleMarker(d)).toBeNull();
    const w = writeReapEligibleMarker(path.join(d, 'no-such-dir', 'x'));
    expect(w.written).toBe(false);
    expect(w.error).toBeTruthy();
  });
});

describe('FR-6 e2e composition: block while resident, collectable after residency clears', () => {
  it('the same marked worktree is blocked fresh and clear after the heartbeat stales', async () => {
    const d = tmpDir();
    writeReapEligibleMarker(d, { sd_key: 'SD-E2E-001' });
    expect(hasReapEligibleMarker(d)).toBe(true);

    const freshRow = { session_id: 'resident', heartbeat_at: new Date().toISOString(), worktree_path: d };
    const fresh = await heartbeatResidencyBlocksRemoval(sbReturning({ data: [freshRow], error: null }), d, { logger: noop });
    expect(fresh.blocked).toBe(true);

    const staleRow = { ...freshRow, heartbeat_at: new Date(Date.now() - 3600_000).toISOString() };
    const cleared = await heartbeatResidencyBlocksRemoval(sbReturning({ data: [staleRow], error: null }), d, { logger: noop });
    expect(cleared.blocked).toBe(false);

    // Residency clear -> the chokepoint (called from outside the worktree) proceeds
    // past the residency guard; actual git removal is exercised by reaper e2e suites.
    const res = cwdResidencyBlocks(d, { cwd: os.tmpdir(), logger: noop });
    expect(res.blocked).toBe(false);
  });
});
