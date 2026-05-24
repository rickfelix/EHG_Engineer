import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fsp, existsSync, readFileSync, utimesSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import {
  computeLockHash,
  readMarker,
  writeMarker,
  composeInstallDecision,
  peerSessionSnapshot,
  emitFractureForDiff,
  evaluateInstallDecision,
  checkStagingState,
  MARKER_FILENAME,
  FRACTURE_CODE,
  STAGING_DIRNAME
} from '../../lib/fleet-lock-hash.mjs';

// SD-LEO-INFRA-FLEET-SAFE-NODE-001 unit tests.

async function mkTmpRepo() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'fleet-lock-hash-'));
  await fsp.mkdir(path.join(dir, 'node_modules'), { recursive: true });
  return dir;
}

describe('fleet-lock-hash: computeLockHash', () => {
  let repo;
  beforeEach(async () => { repo = await mkTmpRepo(); });
  afterEach(async () => { await fsp.rm(repo, { recursive: true, force: true }); });

  it('returns null when package-lock.json is missing', async () => {
    expect(await computeLockHash(repo)).toBeNull();
  });

  it('returns a 12-hex-char hash when package-lock.json exists', async () => {
    await fsp.writeFile(path.join(repo, 'package-lock.json'), '{"name":"x"}');
    const h = await computeLockHash(repo);
    expect(h).toMatch(/^[0-9a-f]{12}$/);
  });

  it('is deterministic (same input -> same hash)', async () => {
    const body = '{"name":"x","lockfileVersion":3}';
    await fsp.writeFile(path.join(repo, 'package-lock.json'), body);
    const a = await computeLockHash(repo);
    const b = await computeLockHash(repo);
    expect(a).toEqual(b);
  });

  it('changes when lockfile content changes', async () => {
    await fsp.writeFile(path.join(repo, 'package-lock.json'), '{"a":1}');
    const before = await computeLockHash(repo);
    await fsp.writeFile(path.join(repo, 'package-lock.json'), '{"a":2}');
    const after = await computeLockHash(repo);
    expect(before).not.toEqual(after);
  });
});

describe('fleet-lock-hash: marker read/write round-trip', () => {
  let repo;
  beforeEach(async () => { repo = await mkTmpRepo(); });
  afterEach(async () => { await fsp.rm(repo, { recursive: true, force: true }); });

  it('readMarker returns null when marker absent', async () => {
    expect(await readMarker(repo)).toBeNull();
  });

  it('writeMarker writes hash, timestamp, session id (3 lines)', async () => {
    const hash = '0123456789ab';
    const result = await writeMarker(repo, 'session-xyz', hash);
    expect(result.written).toBe(true);
    const content = readFileSync(path.join(repo, 'node_modules', MARKER_FILENAME), 'utf8');
    const lines = content.split('\n');
    expect(lines[0]).toBe(hash);
    expect(lines[1]).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO8601
    expect(lines[2]).toBe('session-xyz');
  });

  it('readMarker returns the 12-char hash from a freshly-written marker', async () => {
    const hash = 'abcdef012345';
    await writeMarker(repo, 'self', hash);
    expect(await readMarker(repo)).toBe(hash);
  });

  it('readMarker rejects non-12-hex first-line content', async () => {
    await fsp.writeFile(path.join(repo, 'node_modules', MARKER_FILENAME), 'not-a-hash\n');
    expect(await readMarker(repo)).toBeNull();
  });

  it('writeMarker refuses to write an invalid hash', async () => {
    const r = await writeMarker(repo, 'self', 'NOT-A-HASH');
    expect(r.written).toBe(false);
    expect(r.reason).toBe('invalid_hash');
  });

  it('writeMarker silently skips when node_modules/ is missing', async () => {
    await fsp.rm(path.join(repo, 'node_modules'), { recursive: true });
    const r = await writeMarker(repo, 'self', '0123456789ab');
    expect(r.written).toBe(false);
    expect(r.reason).toBe('node_modules_missing');
  });
});

describe('fleet-lock-hash: composeInstallDecision', () => {
  const baseArgs = {
    currentHash: 'aaaaaaaaaaaa',
    storedHash: 'aaaaaaaaaaaa',
    canaryPresent: true,
    forceInstall: false
  };

  it('skips when hash matches and canary present', () => {
    const d = composeInstallDecision(baseArgs);
    expect(d.skip).toBe(true);
    expect(d.reason).toContain('install skipped: lockfile hash match');
  });

  it('installs on missing marker', () => {
    const d = composeInstallDecision({ ...baseArgs, storedHash: null });
    expect(d.skip).toBe(false);
    expect(d.reason).toBe('install required: no hash marker');
  });

  it('installs on hash drift', () => {
    const d = composeInstallDecision({
      ...baseArgs,
      currentHash: 'aaaaaaaaaaaa',
      storedHash: 'bbbbbbbbbbbb'
    });
    expect(d.skip).toBe(false);
    expect(d.reason).toBe('install required: hash drift bbbbbbbbbbbb -> aaaaaaaaaaaa');
  });

  it('installs when hash matches but canary absent (defense in depth)', () => {
    const d = composeInstallDecision({ ...baseArgs, canaryPresent: false });
    expect(d.skip).toBe(false);
    expect(d.reason).toBe('install required: canary module missing despite hash match');
  });

  it('installs unconditionally with --force-install', () => {
    const d = composeInstallDecision({ ...baseArgs, forceInstall: true });
    expect(d.skip).toBe(false);
    expect(d.reason).toBe('install required: --force-install flag present');
  });
});

describe('fleet-lock-hash: peerSessionSnapshot', () => {
  it('returns a Set of peer session IDs excluding self', async () => {
    // Mock supabase chain: from().select().is().gt() -> { data, error }
    const mockRows = [
      { session_id: 'self' },
      { session_id: 'peer-A' },
      { session_id: 'peer-B' },
      { session_id: null }
    ];
    const supa = {
      from: () => ({
        select: () => ({
          is: () => ({
            gt: async () => ({ data: mockRows, error: null })
          })
        })
      })
    };
    const peers = await peerSessionSnapshot(supa, 'self');
    expect(peers).toBeInstanceOf(Set);
    expect(peers.has('self')).toBe(false);
    expect(peers.has('peer-A')).toBe(true);
    expect(peers.has('peer-B')).toBe(true);
    expect(peers.size).toBe(2);
  });

  it('returns empty Set on query error (never blocks install)', async () => {
    const supa = {
      from: () => ({
        select: () => ({
          is: () => ({
            gt: async () => ({ data: null, error: { message: 'fail' } })
          })
        })
      })
    };
    const peers = await peerSessionSnapshot(supa, 'self');
    expect(peers.size).toBe(0);
  });

  it('returns empty Set on thrown exception', async () => {
    const supa = { from: () => { throw new Error('boom'); } };
    const peers = await peerSessionSnapshot(supa, 'self');
    expect(peers.size).toBe(0);
  });
});

describe('fleet-lock-hash: emitFractureForDiff', () => {
  it('emits nothing when before and after are equal', async () => {
    const calls = [];
    const supa = {
      from: () => ({
        update: () => ({
          eq: () => ({ is: async () => { calls.push('update'); return { error: null }; } })
        })
      })
    };
    const r = await emitFractureForDiff(supa, new Set(['a']), new Set(['a']));
    expect(r.emitted).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it('emits for each session in before not in after', async () => {
    const calls = [];
    const supa = {
      from: () => ({
        update: (payload) => {
          calls.push({ phase: 'update', payload });
          return {
            eq: (col, val) => {
              calls.push({ phase: 'eq', col, val });
              return { is: async (c, v) => { calls.push({ phase: 'is', c, v }); return { error: null }; } };
            }
          };
        }
      })
    };
    const before = new Set(['a', 'b', 'c']);
    const after = new Set(['b']); // a and c were released
    const r = await emitFractureForDiff(supa, before, after);
    expect(r.emitted).toBe(2);
    expect(r.fractured.sort()).toEqual(['a', 'c']);
    const updates = calls.filter(c => c.phase === 'update');
    expect(updates).toHaveLength(2);
    for (const u of updates) {
      expect(u.payload.released_reason).toBe(FRACTURE_CODE);
    }
    // Must scope by session_id equality
    const eqs = calls.filter(c => c.phase === 'eq');
    expect(eqs.every(e => e.col === 'session_id')).toBe(true);
    // Must only overwrite NULL released_reason
    const iss = calls.filter(c => c.phase === 'is');
    expect(iss.every(i => i.c === 'released_reason' && i.v === null)).toBe(true);
  });

  it('records failures without throwing', async () => {
    const supa = {
      from: () => ({
        update: () => ({
          eq: () => ({ is: async () => ({ error: { message: 'rls denied' } }) })
        })
      })
    };
    const r = await emitFractureForDiff(supa, new Set(['a']), new Set());
    expect(r.emitted).toBe(0);
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0].error).toBe('rls denied');
  });
});

describe('fleet-lock-hash: evaluateInstallDecision (integration of helpers)', () => {
  let repo;
  beforeEach(async () => { repo = await mkTmpRepo(); });
  afterEach(async () => { await fsp.rm(repo, { recursive: true, force: true }); });

  it('reports no hash marker as install-required reason on fresh tree', async () => {
    await fsp.writeFile(path.join(repo, 'package-lock.json'), '{"a":1}');
    // No marker, no canary module.
    const d = await evaluateInstallDecision({ repoRoot: repo });
    expect(d.skip).toBe(false);
    expect(d.reason).toBe('install required: no hash marker');
  });

  it('skips install when hash matches and canary present', async () => {
    await fsp.writeFile(path.join(repo, 'package-lock.json'), '{"a":1}');
    const hash = await computeLockHash(repo);
    await writeMarker(repo, 's1', hash);
    // Create a fake canary module.
    await fsp.mkdir(path.join(repo, 'node_modules', '@supabase', 'supabase-js'), { recursive: true });
    const d = await evaluateInstallDecision({ repoRoot: repo });
    expect(d.skip).toBe(true);
    expect(d.reason).toMatch(/lockfile hash match/);
    expect(d.currentHash).toBe(hash);
    expect(d.storedHash).toBe(hash);
    expect(d.canaryPresent).toBe(true);
  });

  it('forces install when --force-install-equivalent flag set', async () => {
    await fsp.writeFile(path.join(repo, 'package-lock.json'), '{"a":1}');
    const hash = await computeLockHash(repo);
    await writeMarker(repo, 's1', hash);
    await fsp.mkdir(path.join(repo, 'node_modules', '@supabase', 'supabase-js'), { recursive: true });
    const d = await evaluateInstallDecision({ repoRoot: repo, forceInstall: true });
    expect(d.skip).toBe(false);
    expect(d.reason).toBe('install required: --force-install flag present');
  });

  it('forces install on hash drift even when canary present', async () => {
    await fsp.writeFile(path.join(repo, 'package-lock.json'), '{"a":1}');
    const hashA = await computeLockHash(repo);
    await writeMarker(repo, 's1', hashA);
    await fsp.mkdir(path.join(repo, 'node_modules', '@supabase', 'supabase-js'), { recursive: true });
    // Drift the lockfile.
    await fsp.writeFile(path.join(repo, 'package-lock.json'), '{"a":2}');
    const d = await evaluateInstallDecision({ repoRoot: repo });
    expect(d.skip).toBe(false);
    expect(d.reason).toContain('install required: hash drift');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SD-LEO-INFRA-FLEET-LOCK-HASH-001
// FR-1: .staging contention guard (mirrors pre-tool-enforce.cjs ENF-12 base check)
// FR-3: return-shape contract pin
// FR-4: static-guard regression-pin (writer + consumer parity)
// ─────────────────────────────────────────────────────────────────────────────

function setStagingMtimeAge(stagingPath, ageMs) {
  const target = new Date(Date.now() - ageMs);
  utimesSync(stagingPath, target, target);
}

function makeStagingDir(repo, { withFile = true } = {}) {
  const sp = path.join(repo, 'node_modules', STAGING_DIRNAME);
  mkdirSync(sp, { recursive: true });
  if (withFile) writeFileSync(path.join(sp, 'marker'), 'x');
  return sp;
}

describe('fleet-lock-hash: checkStagingState (FR-1 helper)', () => {
  let repo;
  beforeEach(async () => { repo = await mkTmpRepo(); });
  afterEach(async () => { await fsp.rm(repo, { recursive: true, force: true }); });

  it('TS-1: state=absent when .staging does not exist', () => {
    const r = checkStagingState(repo);
    expect(r.state).toBe('absent');
    expect(r.stagingPath).toMatch(/\.staging$/);
  });

  it('TS-5: state=absent when .staging exists but is empty (parity with ENF-12 readdirSync.length>0)', () => {
    makeStagingDir(repo, { withFile: false });
    const r = checkStagingState(repo);
    expect(r.state).toBe('absent');
  });

  it('TS-2: state=fresh when .staging non-empty and mtime ≤ FRESHNESS_MS', () => {
    const sp = makeStagingDir(repo);
    setStagingMtimeAge(sp, 30_000);
    const r = checkStagingState(repo);
    expect(r.state).toBe('fresh');
    expect(r.mtimeAgeMs).toBeGreaterThan(0);
    expect(r.mtimeAgeMs).toBeLessThan(60_000);
  });

  it('TS-3: state=stale_cleaned when .staging mtime > FRESHNESS_MS — auto-clean succeeds', () => {
    const sp = makeStagingDir(repo);
    setStagingMtimeAge(sp, 120_000);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const r = checkStagingState(repo);
    expect(r.state).toBe('stale_cleaned');
    expect(existsSync(sp)).toBe(false);
    expect(r.mtimeAgeMs).toBeGreaterThan(60_000);
    const events = stderrSpy.mock.calls.map(c => c[0]).join('');
    expect(events).toContain('staging_orphan_cleaned');
    stderrSpy.mockRestore();
  });
});

describe('fleet-lock-hash: evaluateInstallDecision .staging guard (FR-1 a/b/c/d/e + TS-9/TS-10/TS-13)', () => {
  let repo;
  beforeEach(async () => {
    repo = await mkTmpRepo();
    await fsp.writeFile(path.join(repo, 'package-lock.json'), '{"a":1}');
  });
  afterEach(async () => { await fsp.rm(repo, { recursive: true, force: true }); });

  it('TS-1: no .staging — falls through to existing hash/canary logic (skip=false: no marker)', async () => {
    const d = await evaluateInstallDecision({ repoRoot: repo });
    expect(d.skip).toBe(false);
    expect(d.reason).toMatch(/no hash marker/);
  });

  it('TS-2: fresh .staging defers (skip=true, reason=staging_active, retry_after_seconds=60)', async () => {
    const sp = makeStagingDir(repo);
    setStagingMtimeAge(sp, 10_000);
    const d = await evaluateInstallDecision({ repoRoot: repo });
    expect(d.skip).toBe(true);
    expect(d.reason).toBe('staging_active');
    expect(d.retry_after_seconds).toBe(60);
    expect(d.staging_path).toBe(sp);
  });

  it('TS-3: stale .staging auto-cleans, then falls through to hash/canary logic', async () => {
    const sp = makeStagingDir(repo);
    setStagingMtimeAge(sp, 120_000);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const d = await evaluateInstallDecision({ repoRoot: repo });
    expect(existsSync(sp)).toBe(false);
    expect(d.skip).toBe(false);
    expect(d.reason).toMatch(/no hash marker/);
    stderrSpy.mockRestore();
  });

  it('TS-5: empty .staging (npm post-cleanup leftover) does NOT trigger contention', async () => {
    makeStagingDir(repo, { withFile: false });
    const d = await evaluateInstallDecision({ repoRoot: repo });
    expect(d.skip).toBe(false);
    expect(d.reason).toMatch(/no hash marker/);
    expect(d.reason).not.toBe('staging_active');
  });

  it('TS-7: mtime exactly at FRESHNESS_MS boundary stays in defer band (≤60s)', async () => {
    const sp = makeStagingDir(repo);
    setStagingMtimeAge(sp, 60_000);
    // QF-20260523-824 (closes feedback 414fdace): inject a deterministic clock so
    // mtimeAgeMs == 60_000 EXACTLY. The original test let wall-clock time elapse
    // between setting mtime and the freshness read, so age drifted to >60_000
    // ~1-in-3 runs and flipped fresh→stale. now = mtime + 60_000 removes the race
    // and pins the inclusive (≤) boundary.
    const mtimeMs = statSync(sp).mtimeMs;
    const d = await evaluateInstallDecision({ repoRoot: repo, now: mtimeMs + 60_000 });
    expect(d.skip).toBe(true);
    expect(d.reason).toBe('staging_active');
  });

  it('TS-7b: mtime 1ms PAST FRESHNESS_MS is stale (boundary is inclusive ≤, not <)', async () => {
    const sp = makeStagingDir(repo);
    setStagingMtimeAge(sp, 60_000);
    const mtimeMs = statSync(sp).mtimeMs;
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const d = await evaluateInstallDecision({ repoRoot: repo, now: mtimeMs + 60_001 });
    expect(d.skip).toBe(false); // stale → auto-cleaned → falls through to hash/canary logic
    expect(existsSync(sp)).toBe(false);
    stderrSpy.mockRestore();
  });

  it('TS-9: storedHash=null + fresh .staging — staging-active precedence wins', async () => {
    const sp = makeStagingDir(repo);
    setStagingMtimeAge(sp, 5_000);
    const d = await evaluateInstallDecision({ repoRoot: repo });
    expect(d.skip).toBe(true);
    expect(d.reason).toBe('staging_active');
    expect(d.currentHash).toBeNull();
    expect(d.storedHash).toBeNull();
  });

  it('TS-10: --force-install + fresh .staging — force takes precedence with override warning', async () => {
    const sp = makeStagingDir(repo);
    setStagingMtimeAge(sp, 5_000);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const d = await evaluateInstallDecision({ repoRoot: repo, forceInstall: true });
    expect(d.skip).toBe(false);
    expect(d.reason).toBe('install required: --force-install flag present');
    const events = stderrSpy.mock.calls.map(c => c[0]).join('');
    expect(events).toContain('staging_contention_overridden_by_force');
    stderrSpy.mockRestore();
  });

  it('TS-11 (FR-3): return-shape contract — fresh-staging branch keys', async () => {
    const sp = makeStagingDir(repo);
    setStagingMtimeAge(sp, 5_000);
    const d = await evaluateInstallDecision({ repoRoot: repo });
    expect(Object.keys(d).sort()).toEqual([
      'canaryPresent',
      'currentHash',
      'reason',
      'retry_after_seconds',
      'skip',
      'staging_path',
      'storedHash'
    ]);
  });

  it('TS-11 (FR-3): return-shape contract — no-staging branch keys (existing baseline)', async () => {
    const d = await evaluateInstallDecision({ repoRoot: repo });
    expect(Object.keys(d).sort()).toEqual([
      'canaryPresent',
      'currentHash',
      'reason',
      'skip',
      'storedHash'
    ]);
  });
});

describe('fleet-lock-hash: TS-4 stale-staging clean FAILURE → fail-CLOSED', () => {
  let repo;
  beforeEach(async () => {
    repo = await mkTmpRepo();
    await fsp.writeFile(path.join(repo, 'package-lock.json'), '{"a":1}');
  });
  afterEach(async () => { await fsp.rm(repo, { recursive: true, force: true }); vi.restoreAllMocks(); });

  it('TS-4: when safeRecursiveRm throws (Windows EBUSY simulation), evaluateInstallDecision returns staging_orphan_clean_failed', async () => {
    // We cannot easily mock the dep mid-run without vi.mock at module load,
    // so simulate the failure by making the staging directory undeletable in
    // a portable way: replace the directory entry with an inaccessible path
    // (use a chmod-locked dir on POSIX). Instead, we exercise the fail-CLOSED
    // contract by mocking process.stderr.write and asserting our helper's
    // own code path: we invoke it directly with a stale dir, then verify the
    // event surface. Since the actual rm could succeed on this platform, we
    // gate this assertion on the 'stale_clean_failed' branch's stderr emit.
    //
    // Portable approach: spy on safeRecursiveRm by importing the module's
    // re-export and mocking. We mock the worktree-manager module so the
    // import inside fleet-lock-hash.mjs receives our throwing helper.
    vi.resetModules();
    vi.doMock('../../lib/worktree-manager.js', () => ({
      safeRecursiveRm: () => { throw new Error('EBUSY simulated'); }
    }));
    const mod = await import('../../lib/fleet-lock-hash.mjs?freshTS4=' + Date.now());
    const sp = makeStagingDir(repo);
    setStagingMtimeAge(sp, 120_000);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const d = await mod.evaluateInstallDecision({ repoRoot: repo });
    expect(d.skip).toBe(true);
    expect(d.reason).toBe('staging_orphan_clean_failed');
    expect(d.staging_path).toBe(sp);
    const events = stderrSpy.mock.calls.map(c => c[0]).join('');
    expect(events).toContain('staging_orphan_clean_failed');
    expect(events).toContain('EBUSY simulated');
    stderrSpy.mockRestore();
    vi.doUnmock('../../lib/worktree-manager.js');
  });
});

describe('fleet-lock-hash: TS-12 (FR-4) static-guard — .staging signal in writer + consumer', () => {
  it('lib/fleet-lock-hash.mjs references .staging signal', () => {
    const src = readFileSync(path.resolve(__dirname, '../../lib/fleet-lock-hash.mjs'), 'utf8');
    expect(src).toMatch(/\.staging/);
  });

  it('scripts/hooks/pre-tool-enforce.cjs references .staging signal (writer-side parity per ENF-12)', () => {
    const src = readFileSync(path.resolve(__dirname, '../../scripts/hooks/pre-tool-enforce.cjs'), 'utf8');
    expect(src).toMatch(/\.staging/);
    // PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 14th-witness regression-pin:
    // if either surface drops the .staging check in future, CI fails here with
    // a clear pointer to the asymmetry pattern.
  });

  it('TS-8: concurrent FR-1c clean race — second call sees ENOENT, tolerated', async () => {
    const repo = await mkTmpRepo();
    try {
      await fsp.writeFile(path.join(repo, 'package-lock.json'), '{"a":1}');
      const sp = makeStagingDir(repo);
      setStagingMtimeAge(sp, 120_000);
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      // Run two concurrent evaluateInstallDecision calls. First will clean;
      // second will see absent (or in a true race, ENOENT swallowed by
      // safeRecursiveRm's force=true). Both must return WITHOUT throwing.
      const [a, b] = await Promise.all([
        evaluateInstallDecision({ repoRoot: repo }),
        evaluateInstallDecision({ repoRoot: repo })
      ]);
      // At least one returns the post-clean fall-through; both have skip=false
      // (no contention). Neither should be staging_orphan_clean_failed.
      expect(a.reason).not.toBe('staging_orphan_clean_failed');
      expect(b.reason).not.toBe('staging_orphan_clean_failed');
      expect(existsSync(sp)).toBe(false);
      stderrSpy.mockRestore();
    } finally {
      await fsp.rm(repo, { recursive: true, force: true });
    }
  });
});
