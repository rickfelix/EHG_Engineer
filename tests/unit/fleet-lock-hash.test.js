import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fsp, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  computeLockHash,
  readMarker,
  writeMarker,
  composeInstallDecision,
  peerSessionSnapshot,
  emitFractureForDiff,
  evaluateInstallDecision,
  MARKER_FILENAME,
  FRACTURE_CODE
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
