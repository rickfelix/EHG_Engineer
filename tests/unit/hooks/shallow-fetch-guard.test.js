/**
 * QF-20260912-292 — ENF-20 shallow-fetch guard.
 *
 * Reproduces the measured 2026-09-12 05:06-05:28Z incident shape (a `--depth=1` fetch against
 * the shared fleet object store shallowing every worktree at once) against the new detector,
 * plus the --git-dir-redirect, plain-fetch, and coordinator-unshallow allow paths the fix shape
 * names.
 */
import { describe, it, expect } from 'vitest';
import { parseGitShallowCommand, decideShallowFetchGuard } from '../../../scripts/hooks/lib/shallow-fetch-guard.cjs';

const FLEET_COMMON_DIR = 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.git';

describe('parseGitShallowCommand', () => {
  it('detects a --depth fetch (measured incident shape)', () => {
    const p = parseGitShallowCommand('git fetch --depth=1 --no-tags origin abc123');
    expect(p.isGitShallowOp).toBe(true);
    expect(p.verb).toBe('fetch');
    expect(p.flags).toEqual(['--depth=1']);
    expect(p.explicitGitDir).toBeNull();
  });

  it('is NOT operative for a plain fetch with no shallow flag', () => {
    expect(parseGitShallowCommand('git fetch --no-tags origin abc123').isGitShallowOp).toBe(false);
  });

  it('extracts an explicit --git-dir=<path> override', () => {
    const p = parseGitShallowCommand('git --git-dir=/tmp/scratch/.git fetch --depth=1 origin main');
    expect(p.isGitShallowOp).toBe(true);
    expect(p.explicitGitDir).toBe('/tmp/scratch/.git');
  });

  it('extracts an explicit -C <path> override', () => {
    const p = parseGitShallowCommand('git -C /tmp/scratch clone --depth=1 https://example.com/x.git');
    expect(p.isGitShallowOp).toBe(true);
    expect(p.explicitGitDir).toBe('/tmp/scratch');
  });

  it('detects --unshallow alone', () => {
    const p = parseGitShallowCommand('git fetch --unshallow origin main');
    expect(p.isGitShallowOp).toBe(true);
    expect(p.flags).toEqual(['--unshallow']);
  });

  it('is not operative for a non-git command', () => {
    expect(parseGitShallowCommand('npm run build').isGitShallowOp).toBe(false);
  });
});

describe('decideShallowFetchGuard', () => {
  it('BLOCKS the exact measured incident shape (--depth=1, targeting the fleet object store)', () => {
    const d = decideShallowFetchGuard('git fetch --depth=1 --no-tags origin abc123', {
      targetCommonDir: FLEET_COMMON_DIR,
      fleetCommonDir: FLEET_COMMON_DIR,
      isCoordinator: false,
    });
    expect(d.matched).toBe(true);
    expect(d.outcome).toBe('block');
    expect(d.verb).toBe('fetch');
  });

  it('ALLOWS the same command when --git-dir redirects to a scratch clone (different object store)', () => {
    const d = decideShallowFetchGuard(
      'git --git-dir=/tmp/scratch/.git fetch --depth=1 --no-tags origin abc123',
      { targetCommonDir: '/tmp/scratch/.git', fleetCommonDir: FLEET_COMMON_DIR, isCoordinator: false }
    );
    expect(d.matched).toBe(false);
  });

  it('ALLOWS a plain fetch with no shallow-affecting flag', () => {
    const d = decideShallowFetchGuard('git fetch --no-tags origin abc123', {
      targetCommonDir: FLEET_COMMON_DIR,
      fleetCommonDir: FLEET_COMMON_DIR,
      isCoordinator: false,
    });
    expect(d.matched).toBe(false);
  });

  it('ALLOWS --unshallow from a coordinator-tagged session (the repair)', () => {
    const d = decideShallowFetchGuard('git fetch --unshallow origin main', {
      targetCommonDir: FLEET_COMMON_DIR,
      fleetCommonDir: FLEET_COMMON_DIR,
      isCoordinator: true,
    });
    expect(d.matched).toBe(false);
  });

  it('BLOCKS --unshallow from a non-coordinator session', () => {
    const d = decideShallowFetchGuard('git fetch --unshallow origin main', {
      targetCommonDir: FLEET_COMMON_DIR,
      fleetCommonDir: FLEET_COMMON_DIR,
      isCoordinator: false,
    });
    expect(d.matched).toBe(true);
    expect(d.outcome).toBe('block');
  });

  it('BLOCKS a coordinator session mixing --unshallow with --depth (repair claim does not cover a real shallow op)', () => {
    const d = decideShallowFetchGuard('git fetch --unshallow --depth=1 origin main', {
      targetCommonDir: FLEET_COMMON_DIR,
      fleetCommonDir: FLEET_COMMON_DIR,
      isCoordinator: true,
    });
    expect(d.matched).toBe(true);
  });

  it('BLOCKS (fails closed) when common-dir resolution is unavailable', () => {
    const d = decideShallowFetchGuard('git fetch --depth=1 origin main', {
      targetCommonDir: null,
      fleetCommonDir: null,
      isCoordinator: false,
    });
    expect(d.matched).toBe(true);
  });

  it('ALLOWS a command with no git shallow op at all', () => {
    expect(decideShallowFetchGuard('git status', {
      targetCommonDir: FLEET_COMMON_DIR, fleetCommonDir: FLEET_COMMON_DIR,
    })).toEqual({ matched: false });
  });
});
