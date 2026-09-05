/**
 * SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-E (FR-1) — census-completeness lint for the terminal-status
 * chokepoint. classifyUpdateSite is pure (no I/O) so it's tested directly against synthetic
 * statement windows; scanRepo is re-verified against the REAL repo as a live regression pin (the
 * two-sided control this SD's own memory trail says is load-bearing: a vacuous "always green"
 * detector is worse than none).
 */
import { describe, it, expect } from 'vitest';
import { classifyUpdateSite, scanRepo } from '../../../scripts/lint/claude-sessions-terminal-chokepoint-lint.mjs';

describe('classifyUpdateSite', () => {
  it('a bare literal status:"released" with no is_alive and no chokepoint is needs-review', () => {
    const win = '.update({ status: \'released\', released_at: new Date().toISOString() })';
    expect(classifyUpdateSite(win)).toBe('needs-review');
  });

  it('a bare literal status:"stale" with no is_alive and no chokepoint is needs-review', () => {
    const win = '.update({ status: \'stale\', stale_reason: \'X\' })';
    expect(classifyUpdateSite(win)).toBe('needs-review');
  });

  it('routing through terminalSessionUpdate() is compliant', () => {
    const win = '.update(terminalSessionUpdate(\'released\', { released_at: now }))';
    expect(classifyUpdateSite(win)).toBe('chokepoint');
  });

  it('routing through sessionStatusUpdate() is compliant', () => {
    const win = '.update(sessionStatusUpdate(targetStatus, { released_at: now }))';
    expect(classifyUpdateSite(win)).toBe('chokepoint');
  });

  it('an inline is_alive:false alongside the literal status is compliant (the pre-chokepoint reference pattern)', () => {
    const win = '.update({ status: \'released\', is_alive: false, released_at: now })';
    expect(classifyUpdateSite(win)).toBe('inline-compliant');
  });

  it('an unrelated update (status set to something other than released/stale) is not-applicable', () => {
    const win = '.update({ status: \'idle\' })';
    expect(classifyUpdateSite(win)).toBe('not-applicable');
  });

  it('an update with no status field at all is not-applicable', () => {
    const win = '.update({ heartbeat_at: now })';
    expect(classifyUpdateSite(win)).toBe('not-applicable');
  });
});

describe('scanRepo — live regression pin against the real repo', () => {
  it('the detector actually detects — a deliberately unguarded synthetic site is reported needs-review (positive control via classifyUpdateSite, proven above); the live repo currently has zero', () => {
    // POSITIVE CONTROL is classifyUpdateSite's own "bare literal" tests above — this pins that the
    // live repo's CURRENT state is genuinely clean, not that the classifier is vacuous.
    const sites = scanRepo();
    const needsReview = sites.filter((s) => s.classification === 'needs-review');
    expect(needsReview).toEqual([]);
    // And the scan is not vacuously empty: it must have found real claude_sessions update sites.
    expect(sites.length).toBeGreaterThan(5);
  });

  it('the pre-chokepoint reference site (inline is_alive:false, predates terminalSessionUpdate) classifies inline-compliant', () => {
    const sites = scanRepo();
    const inlineCompliantSweepSites = sites.filter(
      (s) => s.site.startsWith('scripts/stale-session-sweep.cjs:') && s.classification === 'inline-compliant',
    );
    expect(inlineCompliantSweepSites.length).toBeGreaterThanOrEqual(1);
    // And the OTHER 9 chokepoint-wrapped writers in the same file are found too, not shadowed by
    // this one -- both classifications should be present.
    const chokepointSweepSites = sites.filter(
      (s) => s.site.startsWith('scripts/stale-session-sweep.cjs:') && s.classification === 'chokepoint',
    );
    expect(chokepointSweepSites.length).toBeGreaterThanOrEqual(5);
  });
});
