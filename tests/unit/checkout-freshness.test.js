/**
 * checkout-freshness unit tests — SD-LEO-INFRA-FLEET-FRESHNESS-GUARD-001.
 * Pure evaluateFreshness + checkoutFreshness via an INJECTED git seam. ZERO real git/network.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  evaluateFreshness, checkoutFreshness, freshnessBadge, CRITICAL_PROTOCOL_FILES, VERDICT,
} from '../../lib/governance/checkout-freshness.js';

describe('evaluateFreshness (pure)', () => {
  it('FRESH when behind 0 and no critical diff', () => {
    expect(evaluateFreshness({ behind: 0, criticalDiff: [] }).verdict).toBe(VERDICT.FRESH);
  });
  it('STALE when behind > 0 and no critical diff', () => {
    const r = evaluateFreshness({ behind: 3, criticalDiff: [] });
    expect(r.verdict).toBe(VERDICT.STALE);
    expect(r.reason).toMatch(/3 commit/);
  });
  it('STALE-CRITICAL when a protocol file drifted (precedence over STALE)', () => {
    const r = evaluateFreshness({ behind: 3, criticalDiff: ['CLAUDE.md'] });
    expect(r.verdict).toBe(VERDICT.STALE_CRITICAL);
    expect(r.reason).toContain('CLAUDE.md');
  });
  it('STALE-CRITICAL even when behind is 0 (a diff can exist without a behind-count)', () => {
    expect(evaluateFreshness({ behind: 0, criticalDiff: ['CLAUDE_CORE.md'] }).verdict).toBe(VERDICT.STALE_CRITICAL);
  });
  it('honors criticalThreshold (>1 requires that many drifted files)', () => {
    expect(evaluateFreshness({ behind: 0, criticalDiff: ['CLAUDE.md'] }, { criticalThreshold: 2 }).verdict).toBe(VERDICT.FRESH);
    expect(evaluateFreshness({ behind: 0, criticalDiff: ['CLAUDE.md', 'CLAUDE_LEAD.md'] }, { criticalThreshold: 2 }).verdict).toBe(VERDICT.STALE_CRITICAL);
  });
  it('coerces missing/garbage state to FRESH (defensive)', () => {
    expect(evaluateFreshness(null).verdict).toBe(VERDICT.FRESH);
    expect(evaluateFreshness({ behind: 'x', criticalDiff: 'nope' }).verdict).toBe(VERDICT.FRESH);
  });
});

function fakeGit({ behind = 0, diff = [], throwOn = null } = {}) {
  return {
    fetch: vi.fn(() => { if (throwOn === 'fetch') throw new Error('fetch boom'); }),
    behindCount: vi.fn(() => { if (throwOn === 'behindCount') throw new Error('rev-list boom'); return behind; }),
    diffPaths: vi.fn(() => { if (throwOn === 'diffPaths') throw new Error('diff boom'); return diff; }),
  };
}

describe('checkoutFreshness (injected git seam, no real git)', () => {
  it('STALE from a behind-count, FRESH-base diff empty', () => {
    const git = fakeGit({ behind: 2, diff: [] });
    const r = checkoutFreshness('/repo', { git });
    expect(r.verdict).toBe(VERDICT.STALE);
    expect(r.behind).toBe(2);
    expect(git.behindCount).toHaveBeenCalledWith('origin/main');
  });
  it('STALE-CRITICAL when diffPaths returns a protocol file', () => {
    const r = checkoutFreshness('/repo', { git: fakeGit({ behind: 5, diff: ['CLAUDE.md'] }) });
    expect(r.verdict).toBe(VERDICT.STALE_CRITICAL);
    expect(r.criticalDiff).toEqual(['CLAUDE.md']);
  });
  it('FRESH when up to date', () => {
    expect(checkoutFreshness('/repo', { git: fakeGit({ behind: 0, diff: [] }) }).verdict).toBe(VERDICT.FRESH);
  });
  it('FAIL-OPEN: a git error -> FRESH with an error field, never throws', () => {
    const r = checkoutFreshness('/repo', { git: fakeGit({ throwOn: 'behindCount' }) });
    expect(r.verdict).toBe(VERDICT.FRESH);
    expect(r.error).toMatch(/rev-list boom/);
  });
  it('fetch is opt-in: not called by default, called when config.fetch=true', () => {
    const g1 = fakeGit({ behind: 0 });
    checkoutFreshness('/repo', { git: g1 });
    expect(g1.fetch).not.toHaveBeenCalled();
    const g2 = fakeGit({ behind: 0 });
    checkoutFreshness('/repo', { git: g2, fetch: true });
    expect(g2.fetch).toHaveBeenCalled();
  });
  it('a fetch flake does NOT abort the check (non-fatal)', () => {
    const r = checkoutFreshness('/repo', { git: fakeGit({ behind: 1, throwOn: 'fetch' }), fetch: true });
    expect(r.verdict).toBe(VERDICT.STALE); // behindCount/diffPaths still ran
  });
  it('criticalPaths override is passed through (e.g. resolver paths)', () => {
    const git = fakeGit({ behind: 0, diff: ['lib/x.js'] });
    const r = checkoutFreshness('/repo', { git, criticalPaths: ['lib/x.js'] });
    expect(r.verdict).toBe(VERDICT.STALE_CRITICAL);
    expect(git.diffPaths).toHaveBeenCalledWith('origin/main', ['lib/x.js']);
  });
});

describe('freshnessBadge + constants', () => {
  it('renders a badge per verdict (never throws)', () => {
    expect(freshnessBadge({ verdict: VERDICT.FRESH, baseRef: 'origin/main' })).toMatch(/FRESH/);
    expect(freshnessBadge({ verdict: VERDICT.STALE, behind: 4, baseRef: 'origin/main' })).toMatch(/behind .* 4/);
    expect(freshnessBadge({ verdict: VERDICT.STALE_CRITICAL, criticalDiff: ['CLAUDE.md'] })).toMatch(/PROTOCOL DRIFT/);
    expect(freshnessBadge({ verdict: VERDICT.FRESH, error: 'boom' })).toMatch(/git error/);
    expect(freshnessBadge(undefined)).toMatch(/FRESH/);
  });
  it('CRITICAL_PROTOCOL_FILES lists the CLAUDE protocol files', () => {
    expect(CRITICAL_PROTOCOL_FILES).toContain('CLAUDE.md');
    expect(CRITICAL_PROTOCOL_FILES).toContain('CLAUDE_CORE.md');
  });
});
