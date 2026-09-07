// QF-20260905-060 — isCwdWorktreeLiveClaim, DB-injected (hermetic: fake `sb`, no live DB).
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { isCwdWorktreeLiveClaim, readReuseMarkerKey } = require('../../../lib/fleet/cwd-worktree-liveness.cjs');

function fakeSb(table, row, error = null) {
  return {
    from: (t) => {
      expect(t).toBe(table);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: row, error }),
          }),
        }),
      };
    },
  };
}

/** A fake worktree dir under a real .worktrees/<dirName> path, optionally with a reuse marker. */
function makeWorktreeDir(dirName, markerFields) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cwd-liveness-'));
  const repoDir = path.join(dir, '.worktrees', dirName);
  fs.mkdirSync(repoDir, { recursive: true });
  if (markerFields) {
    fs.writeFileSync(path.join(repoDir, '.worktree-reuse.json'), JSON.stringify(markerFields));
  }
  return repoDir;
}

describe('isCwdWorktreeLiveClaim', () => {
  const SD_CWD = 'C:/Users/x/EHG_Engineer/.worktrees/SD-FOO-001';
  const QF_CWD = 'C:/Users/x/EHG_Engineer/.worktrees/qf/QF-999';

  it('no worktree segment at all: true (irrelevant -- repo-match axis skips it anyway)', async () => {
    const sb = { from: () => { throw new Error('must not query when no worktree key'); } };
    await expect(isCwdWorktreeLiveClaim(sb, 'C:/Users/x/EHG_Engineer')).resolves.toBe(true);
  });

  it('SD worktree, non-terminal status + a live claiming_session_id: true (LIVE)', async () => {
    const sb = fakeSb('strategic_directives_v2', { status: 'in_progress', claiming_session_id: 'sess-1' });
    await expect(isCwdWorktreeLiveClaim(sb, SD_CWD)).resolves.toBe(true);
  });

  it('SD worktree, terminal status: false (a "leftover" -- its own build already shipped)', async () => {
    const sb = fakeSb('strategic_directives_v2', { status: 'completed', claiming_session_id: null });
    await expect(isCwdWorktreeLiveClaim(sb, SD_CWD)).resolves.toBe(false);
  });

  it('SD worktree, non-terminal status but no active claim: false (never actually built here)', async () => {
    const sb = fakeSb('strategic_directives_v2', { status: 'draft', claiming_session_id: null });
    await expect(isCwdWorktreeLiveClaim(sb, SD_CWD)).resolves.toBe(false);
  });

  it('QF worktree, status=in_progress: true (LIVE)', async () => {
    const sb = fakeSb('quick_fixes', { status: 'in_progress' });
    await expect(isCwdWorktreeLiveClaim(sb, QF_CWD)).resolves.toBe(true);
  });

  it('QF worktree, status=completed: false (a "leftover")', async () => {
    const sb = fakeSb('quick_fixes', { status: 'completed' });
    await expect(isCwdWorktreeLiveClaim(sb, QF_CWD)).resolves.toBe(false);
  });

  it('row not found: true (could-not-determine -> old, stricter default)', async () => {
    const sb = fakeSb('strategic_directives_v2', null);
    await expect(isCwdWorktreeLiveClaim(sb, SD_CWD)).resolves.toBe(true);
  });

  it('query error: true (fail toward the pre-fix default, never toward new leniency)', async () => {
    const sb = fakeSb('strategic_directives_v2', null, new Error('boom'));
    await expect(isCwdWorktreeLiveClaim(sb, SD_CWD)).resolves.toBe(true);
  });

  it('a thrown error inside the client never propagates: true', async () => {
    const sb = { from: () => { throw new Error('boom'); } };
    await expect(isCwdWorktreeLiveClaim(sb, SD_CWD)).resolves.toBe(true);
  });
});

describe('readReuseMarkerKey', () => {
  it('present, fresh, well-formed: returns the key', () => {
    const dir = makeWorktreeDir('SD-OLD-001', { key: 'SD-NEW-001', writer_session: 's1', marked_at: new Date().toISOString() });
    expect(readReuseMarkerKey(dir)).toBe('SD-NEW-001');
  });

  it('absent: null', () => {
    const dir = makeWorktreeDir('SD-OLD-001');
    expect(readReuseMarkerKey(dir)).toBeNull();
  });

  it('corrupt JSON: null, never throws', () => {
    const dir = makeWorktreeDir('SD-OLD-001');
    fs.writeFileSync(path.join(dir, '.worktree-reuse.json'), '{not json');
    expect(readReuseMarkerKey(dir)).toBeNull();
  });

  it('past its TTL (120min): null', () => {
    const staleAt = new Date(Date.now() - 121 * 60 * 1000).toISOString();
    const dir = makeWorktreeDir('SD-OLD-001', { key: 'SD-NEW-001', marked_at: staleAt });
    expect(readReuseMarkerKey(dir)).toBeNull();
  });

  it('within its TTL: returns the key', () => {
    const freshAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const dir = makeWorktreeDir('SD-OLD-001', { key: 'SD-NEW-001', marked_at: freshAt });
    expect(readReuseMarkerKey(dir)).toBe('SD-NEW-001');
  });

  it('missing/invalid marked_at: null', () => {
    const dir = makeWorktreeDir('SD-OLD-001', { key: 'SD-NEW-001' });
    expect(readReuseMarkerKey(dir)).toBeNull();
  });

  it('missing/empty key field: null', () => {
    const dir = makeWorktreeDir('SD-OLD-001', { marked_at: new Date().toISOString() });
    expect(readReuseMarkerKey(dir)).toBeNull();
  });
});

// Two rounds of adversarial deep-tier review on this QF's own PR. Round 1: worktreeKeyOfCwd parses
// the DIRECTORY NAME only, and a reused slot's directory keeps its PREVIOUS occupant's name while a
// NEW branch is checked out inside it. Round 2: a branch-substring sanity check (the round-1 fix)
// is defeated when the stale key is a PREFIX of the new key -- routine in this codebase's own
// parent/child SD naming (e.g. 'SD-X-001' -> 'SD-X-001-F'). Fixed with the purpose-built reuse
// marker instead of a substring heuristic: it names the TRUE occupant directly, so a prefix
// relationship between the old and new keys cannot fool it.
describe('slot-reuse correction via the reuse marker (two rounds of adversarial review)', () => {
  it('marker present, names a DIFFERENT key: the MARKER key is queried, not the stale path key', async () => {
    // The exact round-2 collision shape: stale path key IS A PREFIX of the marker/new key.
    const dir = makeWorktreeDir('SD-X-001', { key: 'SD-X-001-F', marked_at: new Date().toISOString() });
    const sb = {
      from: (t) => {
        expect(t).toBe('strategic_directives_v2');
        return {
          select: () => ({
            eq: (col, val) => {
              expect(val).toBe('SD-X-001-F'); // the marker's key, NOT the stale 'SD-X-001' path key
              return { maybeSingle: async () => ({ data: { status: 'in_progress', claiming_session_id: 'sess-1' }, error: null }) };
            },
          }),
        };
      },
    };
    await expect(isCwdWorktreeLiveClaim(sb, dir)).resolves.toBe(true);
  });

  it('marker present, names the SAME key as the path: queries that key once, no behavior change', async () => {
    const dir = makeWorktreeDir('SD-X-001', { key: 'SD-X-001', marked_at: new Date().toISOString() });
    const sb = fakeSb('strategic_directives_v2', { status: 'completed', claiming_session_id: null });
    await expect(isCwdWorktreeLiveClaim(sb, dir)).resolves.toBe(false);
  });

  it('no marker present (the common, unreused case): resolves via the path-derived key exactly as before', async () => {
    const dir = makeWorktreeDir('SD-X-001');
    const sb = {
      from: (t) => ({
        select: () => ({
          eq: (col, val) => {
            expect(val).toBe('SD-X-001');
            return { maybeSingle: async () => ({ data: { status: 'in_progress', claiming_session_id: 'sess-1' }, error: null }) };
          },
        }),
      }),
    };
    await expect(isCwdWorktreeLiveClaim(sb, dir)).resolves.toBe(true);
  });

  it('DISCLOSED RESIDUAL, expressed as a test: an EXPIRED marker cannot correct a reuse -- falls back to the stale path key', async () => {
    const staleAt = new Date(Date.now() - 121 * 60 * 1000).toISOString();
    const dir = makeWorktreeDir('SD-X-001', { key: 'SD-X-001-F', marked_at: staleAt });
    const sb = {
      from: (t) => ({
        select: () => ({
          eq: (col, val) => {
            expect(val).toBe('SD-X-001'); // marker expired -> the stale path key is used, as documented
            return { maybeSingle: async () => ({ data: { status: 'completed', claiming_session_id: null }, error: null }) };
          },
        }),
      }),
    };
    await expect(isCwdWorktreeLiveClaim(sb, dir)).resolves.toBe(false);
  });
});
