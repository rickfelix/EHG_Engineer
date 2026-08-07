/**
 * SD-FDBK-INFRA-SPAWN-SOURCE-CURRENCY-001 FR-1 — the siting guard.
 *
 * spawn-control.js exempts any cwd under `.worktrees/` from the tree-currency check. That
 * exemption is CORRECT for per-SD worktrees, which are off-main and behind by construction —
 * asserting currency there would refuse every worktree spawn while proving nothing.
 *
 * The hazard is narrower: a DEDICATED spawn-source worktree would be caught by the same path
 * test and silently exempted from the invariant it exists to uphold. It would appear to work
 * while asserting nothing — the failure mode is invisible by construction.
 *
 * These pin the predicate and the guard TOGETHER, so the exemption and the constraint that
 * depends on it cannot drift apart.
 */
import { describe, it, expect } from 'vitest';
import { isWorktreeExemptPath, assertSpawnSourceNotExempt } from '../../../lib/fleet/spawn-control.js';

describe('FR-1: isWorktreeExemptPath', () => {
  it('matches worktree paths on both separators', () => {
    expect(isWorktreeExemptPath('/repo/.worktrees/SD-X/lib')).toBe(true);
    expect(isWorktreeExemptPath('C:\\repo\\.worktrees\\SD-X\\lib')).toBe(true);
  });

  it('does NOT match the shared root or near-miss directories', () => {
    expect(isWorktreeExemptPath('/repo')).toBe(false);
    expect(isWorktreeExemptPath('C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer')).toBe(false);
    // near-misses that must not trip it — a substring test is easy to get wrong
    expect(isWorktreeExemptPath('/repo/worktrees/x')).toBe(false);
    expect(isWorktreeExemptPath('/repo/.worktrees-backup/x')).toBe(false);
  });

  it('is total on empty/nullish input rather than throwing', () => {
    for (const v of [undefined, null, '']) expect(isWorktreeExemptPath(v)).toBe(false);
  });
});

describe('FR-1: assertSpawnSourceNotExempt', () => {
  it('THROWS for a spawn-source sited under .worktrees/ — the silent-disable case', () => {
    expect(() => assertSpawnSourceNotExempt('/repo/.worktrees/spawn-source'))
      .toThrow(/may not sit under \.worktrees\//);
  });

  it('names the CONSEQUENCE, not just the rule, so the operator knows why it matters', () => {
    let msg = '';
    try { assertSpawnSourceNotExempt('/repo/.worktrees/spawn-source'); } catch (e) { msg = e.message; }
    expect(msg).toContain('EXEMPT');
    expect(msg).toContain('asserting nothing');
    expect(msg).toContain('SD-FDBK-INFRA-SPAWN-SOURCE-CURRENCY-001');
  });

  it('passes a legal siting through unchanged, so it is usable inline', () => {
    expect(assertSpawnSourceNotExempt('/repo/.spawn-source')).toBe('/repo/.spawn-source');
  });

  it('guard and predicate agree on every input — one representation, no drift', () => {
    for (const p of ['/repo/.worktrees/a', '/repo/x', 'C:\\r\\.worktrees\\b', '', '/repo/worktrees/y']) {
      const exempt = isWorktreeExemptPath(p);
      let threw = false;
      try { assertSpawnSourceNotExempt(p); } catch { threw = true; }
      expect(threw).toBe(exempt);
    }
  });
});
