/**
 * SD-LEO-INFRA-STATIC-PREFIX-DIET-001 (burn-lever A4) — unit tests for the per-seat static
 * prefix composition audit. Covers PRD TS-1 (canonical MEMORY.md resolver, not a rival),
 * TS-2 (fail-loud, never silent zero, including in aggregation), and TS-6 (destination
 * single-read-cap check).
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  measureRepoFile,
  measureMemoryMd,
  aggregateComponents,
  auditSeat,
  checkDestinationFits,
  SEAT_PROFILES,
} from '../../../lib/protocol/static-prefix-audit.mjs';
import { resolveMemoryDir } from '../../../scripts/modules/memory/reindex.mjs';

describe('TS-1: MEMORY.md resolution uses the canonical resolver', () => {
  it('measureMemoryMd resolves via resolveMemoryDir, matching it exactly for a divergent cwd', () => {
    const root = mkdtempSync(join(tmpdir(), 'prefix-audit-ts1-'));
    const home = join(root, 'home');
    // A worktree-shaped cwd, the exact kind that diverges across the 3 rival resolvers
    // TESTING found in-repo (reindex.mjs replaces every non-alphanumeric char with '-';
    // a naive resolver might only replace [\\/:] and leave dots/underscores untouched).
    const cwd = join(root, 'repos', 'ehg.worktrees', 'wt-1');
    mkdirSync(cwd, { recursive: true });

    const expectedDir = resolveMemoryDir(undefined, { home, cwd });
    mkdirSync(expectedDir, { recursive: true });
    writeFileSync(join(expectedDir, 'MEMORY.md'), '# memory\n');

    const result = measureMemoryMd({ opts: { home, cwd } });
    expect(result.path).toBe(join(expectedDir, 'MEMORY.md'));
    expect(result.bytes).toBeGreaterThan(0);
    expect(result.harnessTokens).toBeGreaterThan(0);

    rmSync(root, { recursive: true, force: true });
  });

  it('honors an explicit CLAUDE_MEMORY_DIR override, same as resolveMemoryDir itself', () => {
    const root = mkdtempSync(join(tmpdir(), 'prefix-audit-ts1-env-'));
    writeFileSync(join(root, 'MEMORY.md'), 'x'.repeat(100));
    const result = measureMemoryMd({ opts: { env: { CLAUDE_MEMORY_DIR: root } } });
    expect(result.bytes).toBe(100);
    rmSync(root, { recursive: true, force: true });
  });
});

describe('TS-2: fail-loud, never silent zero', () => {
  it('throws MEMORY_MD_UNRESOLVABLE when the resolved directory has no MEMORY.md', () => {
    const root = mkdtempSync(join(tmpdir(), 'prefix-audit-ts2-'));
    // A dir that exists but has no MEMORY.md — direct-injection path.
    expect(() => measureMemoryMd({ memoryDir: root })).toThrow(/MEMORY_MD_UNRESOLVABLE/);
    rmSync(root, { recursive: true, force: true });
  });

  it('throws (does not silently continue) for a memoryDir that does not exist at all', () => {
    expect(() => measureMemoryMd({ memoryDir: 'C:/definitely/not/a/real/path/xyz' })).toThrow(/MEMORY_MD_UNRESOLVABLE/);
  });

  it('measureRepoFile returns null (not a zero-byte record) for a missing file', () => {
    const root = mkdtempSync(join(tmpdir(), 'prefix-audit-ts2-repo-'));
    expect(measureRepoFile(root, 'DOES_NOT_EXIST.md')).toBeNull();
    rmSync(root, { recursive: true, force: true });
  });

  it('aggregateComponents never substitutes 0 for an unmeasurable (null-harnessTokens) component in the reported unmeasurable list', () => {
    const measurements = [
      { component: 'a.md', bytes: 1000, harnessTokens: 413 },
      { component: 'weird.bin', bytes: 0, harnessTokens: null }, // e.g. harnessTokensFromBytes(0) === null
    ];
    const agg = aggregateComponents(measurements);
    expect(agg.unmeasurable).toEqual(['weird.bin']);
    // The total must still be computable from the measurable components, but must not
    // pretend the unmeasurable one contributed a real 0-token cost — it's surfaced, not hidden.
    expect(agg.totalHarnessTokens).toBe(413);
  });

  it('auditSeat rejects an unknown seat profile rather than silently returning an empty audit', () => {
    expect(() => auditSeat('nonexistent-seat', { repoRoot: '/tmp' })).toThrow(/UNKNOWN_SEAT_PROFILE/);
  });
});

describe('TS-6: destination single-read-cap check', () => {
  it('flags a file whose bytes exceed the calibrated single-read token cap', () => {
    // CLAUDE_CORE.md is real-world over cap at ~94,414 bytes / ~39,051 harness-tokens.
    const result = checkDestinationFits(94414);
    expect(result.fits).toBe(false);
    expect(result.harnessTokens).toBeGreaterThan(25000);
  });

  it('passes a file comfortably under the cap', () => {
    const result = checkDestinationFits(19703); // CLAUDE.md-sized
    expect(result.fits).toBe(true);
  });

  it('never reports fits=true for an unmeasurable (non-positive) byte count', () => {
    expect(checkDestinationFits(0).fits).toBe(false);
    expect(checkDestinationFits(-5).fits).toBe(false);
  });
});

describe('SEAT_PROFILES', () => {
  it('worker and adam profiles are both non-empty and include CLAUDE.md', () => {
    expect(SEAT_PROFILES.worker).toContain('CLAUDE.md');
    expect(SEAT_PROFILES.adam).toContain('CLAUDE.md');
  });
});
