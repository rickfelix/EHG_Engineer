// SD-LEO-INFRA-WIRE-ALL-POOLS-001 (FR-1/FR-2/FR-4)
// Pins that the hourly worktree-reaper tick passes --all-pools to the reaper by default (so
// the ehg pool is reaped, not just EHG_Engineer) and omits it under the
// WORKTREE_REAPER_ALL_POOLS=off opt-out. Tests the pure exported helpers directly —
// isAllPoolsEnabled (env predicate) feeds buildReaperArgs (argv builder) — so no spawn / git
// / temp dirs are needed and the flag wiring is asserted deterministically.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { isAllPoolsEnabled, buildReaperArgs } = require('../../../scripts/fleet/worktree-reaper-tick.cjs');

const REAPER = '/repo/scripts/worktree-reaper.mjs';

describe('isAllPoolsEnabled (SD-LEO-INFRA-WIRE-ALL-POOLS-001 FR-2)', () => {
  it('defaults ON when the env var is unset or empty', () => {
    expect(isAllPoolsEnabled({})).toBe(true);
    expect(isAllPoolsEnabled({ WORKTREE_REAPER_ALL_POOLS: '' })).toBe(true);
  });

  it('opts out on any falsey token (case/space-insensitive)', () => {
    for (const v of ['false', '0', 'off', 'no', 'OFF', 'No', ' off ']) {
      expect(isAllPoolsEnabled({ WORKTREE_REAPER_ALL_POOLS: v }), `"${v}"`).toBe(false);
    }
  });

  it('stays ON for any non-falsey value', () => {
    for (const v of ['true', '1', 'on', 'yes', 'anything']) {
      expect(isAllPoolsEnabled({ WORKTREE_REAPER_ALL_POOLS: v }), `"${v}"`).toBe(true);
    }
  });
});

describe('buildReaperArgs (SD-LEO-INFRA-WIRE-ALL-POOLS-001 FR-1)', () => {
  it('appends --all-pools when allPools is true (the reaper fans out to every pool)', () => {
    const args = buildReaperArgs({ reaperScript: REAPER, allPools: true });
    expect(args).toContain('--all-pools');
    expect(args[0]).toBe(REAPER);
  });

  it('omits --all-pools when allPools is false (current-repo-only, pre-2026-06-20 behavior)', () => {
    const args = buildReaperArgs({ reaperScript: REAPER, allPools: false });
    expect(args).not.toContain('--all-pools');
  });

  it('composes with the existing execute / stage2 flags', () => {
    const args = buildReaperArgs({ reaperScript: REAPER, execute: true, stage2: true, allPools: true });
    expect(args).toEqual([REAPER, '--execute', '--stage2', '--yes', '--all-pools']);
  });

  it('dry-run default: no --execute unless asked, even with --all-pools on', () => {
    const args = buildReaperArgs({ reaperScript: REAPER, allPools: true });
    expect(args).not.toContain('--execute');
  });
});

describe('end-to-end flag derivation (FR-1 + FR-2)', () => {
  it('default env -> argv carries --all-pools', () => {
    const args = buildReaperArgs({ reaperScript: REAPER, allPools: isAllPoolsEnabled({}) });
    expect(args).toContain('--all-pools');
  });

  it('WORKTREE_REAPER_ALL_POOLS=off -> argv omits --all-pools', () => {
    const args = buildReaperArgs({ reaperScript: REAPER, allPools: isAllPoolsEnabled({ WORKTREE_REAPER_ALL_POOLS: 'off' }) });
    expect(args).not.toContain('--all-pools');
  });
});
