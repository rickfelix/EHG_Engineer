/**
 * Tests for lib/git/commit-pin-resolver.mjs
 * SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-B, FR-2 / TS-1 / TS-2 / TS-3.
 *
 * Runs against the REAL git object database of this checkout, deliberately — same rationale as
 * lib/chairman/__tests__/pinned-contract-read.test.js: the behaviour under test IS "what git says
 * about these object names", and a mocked git would only assert the mock was configured as
 * expected.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TIER, SHAPE, resolveWorktreePathTier } from '../commit-pin-resolver.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const HEAD = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
const FAKE_PATH = '.worktrees/SD-FAKE-EXAMPLE-001';

describe('resolveWorktreePathTier — TIER.EXACT (TS-1)', () => {
  it('a real commit sha touching a real path pins exactly', async () => {
    const v = await resolveWorktreePathTier(
      { path: FAKE_PATH, recordedSha: HEAD },
      { repoRoot: REPO_ROOT }
    );
    expect(v.tier).toBe(TIER.EXACT);
    expect(v.approximate).toBe(false);
    expect(v.value).toBe(`${FAKE_PATH}@${HEAD}`);
    expect(v.value).toMatch(SHAPE.EXACT);
  });
});

describe('resolveWorktreePathTier — TIER.APPROXIMATE (TS-2)', () => {
  it('a nonexistent sha with a recorded timestamp reconstructs via last-commit-touching-path', async () => {
    const notAnObject = '650bd77d4f394818'; // hex-shaped, 16 chars — NOT a real git object in this repo
    const v = await resolveWorktreePathTier(
      { path: 'package.json', recordedSha: notAnObject, recordedAt: '2026-09-03T00:00:00Z' },
      { repoRoot: REPO_ROOT }
    );
    expect(v.tier).toBe(TIER.APPROXIMATE);
    expect(v.approximate).toBe(true);
    expect(v.value).toMatch(SHAPE.APPROXIMATE);
    expect(v.value).toMatch(/^package\.json@[0-9a-f]{40}~asof:2026-09-03T00:00:00Z$/);
    expect(v.reason).toContain('not a verifiable commit object');
  });

  it('an absent recordedSha (never recorded at all) still reconstructs when a timestamp exists', async () => {
    const v = await resolveWorktreePathTier(
      { path: 'package.json', recordedSha: null, recordedAt: '2026-09-03T00:00:00Z' },
      { repoRoot: REPO_ROOT }
    );
    expect(v.tier).toBe(TIER.APPROXIMATE);
    expect(v.reason).toContain('(absent)');
  });
});

describe('resolveWorktreePathTier — TIER.HISTORICAL, never fabricated (TS-3)', () => {
  it('no sha and no timestamp falls back to HISTORICAL rather than guessing', async () => {
    const v = await resolveWorktreePathTier(
      { path: FAKE_PATH, recordedSha: null, recordedAt: null },
      { repoRoot: REPO_ROOT }
    );
    expect(v.tier).toBe(TIER.HISTORICAL);
    expect(v.approximate).toBe(false);
    expect(v.value).toBe(`HISTORICAL:${FAKE_PATH}`);
    expect(v.value).toMatch(SHAPE.HISTORICAL);
  });

  it('a nonexistent sha with a timestamp that finds nothing (unknown path) also falls back to HISTORICAL', async () => {
    const v = await resolveWorktreePathTier(
      { path: 'no-such-file-xyz-12345.md', recordedSha: 'deadbeef', recordedAt: '2026-09-03T00:00:00Z' },
      { repoRoot: REPO_ROOT }
    );
    expect(v.tier).toBe(TIER.HISTORICAL);
    expect(v.value).toBe('HISTORICAL:no-such-file-xyz-12345.md');
  });
});

describe('resolveWorktreePathTier — input validation', () => {
  it.each([[''], [null], [undefined], ['   ']])('throws for invalid path %s', async (bad) => {
    await expect(resolveWorktreePathTier({ path: bad }, { repoRoot: REPO_ROOT })).rejects.toThrow(
      'path must be a non-empty string'
    );
  });
});

describe('SHAPE regexes — must agree with the chairman-gated CHECK constraint (FR-1)', () => {
  it('EXACT/APPROXIMATE/HISTORICAL are mutually exclusive on representative values', () => {
    const exact = `${FAKE_PATH}@${HEAD}`;
    const approx = `${FAKE_PATH}@${HEAD}~asof:2026-09-03T00:00:00Z`;
    const historical = `HISTORICAL:${FAKE_PATH}`;

    expect(exact).toMatch(SHAPE.EXACT);
    expect(exact).not.toMatch(SHAPE.HISTORICAL);

    expect(approx).not.toMatch(SHAPE.EXACT); // EXACT's trailing `$` correctly rejects the ~asof: suffix
    expect(approx).toMatch(SHAPE.APPROXIMATE);

    expect(historical).not.toMatch(SHAPE.EXACT);
    expect(historical).toMatch(SHAPE.HISTORICAL);
  });
});
