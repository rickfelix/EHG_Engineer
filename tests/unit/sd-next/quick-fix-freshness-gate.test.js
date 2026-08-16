/**
 * Unit test: QF freshness/supersession gate in classifyQuickFixes
 * QF-20260525-522
 *
 * A QF that is old, still 'open', unclaimed, and has no PR/commit may have been
 * resolved by a *different* SD (one with no PR of its own). Such QFs must be
 * flagged `_verifyFirst` and held OUT of `topStartableQF` so AUTO-PROCEED does
 * not emit AUTO_PROCEED_ACTION:qf_start and route a session to dead/regressive
 * work (e.g. QF-20260521-962, which sat open 4 days after a sibling SD fixed it).
 */
import { describe, it, expect } from 'vitest';
import { classifyQuickFixes } from '../../../scripts/modules/sd-next/display/quick-fixes.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n) => new Date(Date.now() - n * DAY_MS).toISOString();

// Default gate is 3 days (SD_NEXT_QF_STALE_DAYS). Build a minimal open QF.
const qf = (over = {}) => ({
  id: 'QF-X',
  title: 'x',
  type: 'bug',
  severity: 'medium',
  status: 'open',
  estimated_loc: 10,
  created_at: daysAgo(5),
  claiming_session_id: null,
  pr_url: null,
  commit_sha: null,
  ...over,
});

describe('QF freshness/supersession gate (QF-20260525-522)', () => {
  it('flags an old, open, unclaimed, PR-less QF as verify-first and excludes it from topStartableQF', () => {
    const { summary, classified } = classifyQuickFixes([qf({ id: 'QF-STALE', created_at: daysAgo(5) })]);
    expect(classified[0]._verifyFirst).toBe(true);
    expect(summary.topStartableQF).toBeNull(); // not auto-routed
    expect(summary.topQF).not.toBeNull();      // still visible in the queue
  });

  it('keeps a fresh QF startable (not verify-first)', () => {
    const { summary, classified } = classifyQuickFixes([qf({ id: 'QF-FRESH', created_at: daysAgo(0) })]);
    expect(classified[0]._verifyFirst).toBe(false);
    expect(summary.topStartableQF?.id).toBe('QF-FRESH');
  });

  it('prefers the fresh QF over a stale one as the auto-startable pick', () => {
    const { summary } = classifyQuickFixes([
      qf({ id: 'QF-STALE', created_at: daysAgo(10) }),
      qf({ id: 'QF-FRESH', created_at: daysAgo(0) }),
    ]);
    expect(summary.topStartableQF?.id).toBe('QF-FRESH');
  });

  it('does NOT flag a stale QF that already has a PR/commit (own work in flight)', () => {
    const { classified } = classifyQuickFixes([
      qf({ id: 'QF-PR', created_at: daysAgo(9), pr_url: 'https://github.com/x/y/pull/1' }),
      qf({ id: 'QF-SHA', created_at: daysAgo(9), commit_sha: 'abc123' }),
    ]);
    expect(classified.find(q => q.id === 'QF-PR')._verifyFirst).toBe(false);
    expect(classified.find(q => q.id === 'QF-SHA')._verifyFirst).toBe(false);
  });

  it('does NOT flag a stale in_progress QF (actively being worked)', () => {
    const { classified } = classifyQuickFixes([qf({ id: 'QF-WIP', created_at: daysAgo(9), status: 'in_progress' })]);
    expect(classified[0]._verifyFirst).toBe(false);
  });

  it('does NOT flag a stale QF claimed by the current session', () => {
    const { summary, classified } = classifyQuickFixes(
      [qf({ id: 'QF-MINE', created_at: daysAgo(9), claiming_session_id: 'sess-1' })],
      new Map(),
      { currentSession: { session_id: 'sess-1' } },
    );
    expect(classified[0]._verifyFirst).toBe(false);
    expect(summary.topStartableQF?.id).toBe('QF-MINE');
  });

  it('treats a QF under the default 3-day threshold (2d old) as startable', () => {
    const { summary } = classifyQuickFixes([qf({ id: 'QF-2D', created_at: daysAgo(2) })]);
    expect(summary.topStartableQF?.id).toBe('QF-2D');
  });

  // SD-LEO-INFRA-STALE-QF-DISPOSITION-SWEEP-001 (FR-6): a disposition-sweep re-verify
  // (verified_at) resets this gate's staleness clock the same way it resets
  // lib/fleet/qf-auto-start.cjs's auto-start predicate — the two must agree.
  it('a stale-by-created_at QF with a RECENT verified_at is no longer verify-first', () => {
    const { summary, classified } = classifyQuickFixes([
      qf({ id: 'QF-REVERIFIED', created_at: daysAgo(60), verified_at: daysAgo(1) }),
    ]);
    expect(classified[0]._verifyFirst).toBe(false);
    expect(summary.topStartableQF?.id).toBe('QF-REVERIFIED');
  });

  it('verified_at absent/undefined degrades to created_at-only (pre-migration / not-yet-selected column)', () => {
    const { classified } = classifyQuickFixes([qf({ id: 'QF-NOVER', created_at: daysAgo(9) })]);
    expect(classified[0]._verifyFirst).toBe(true);
  });

  it('an OLDER verified_at than created_at does not resurrect staleness — created_at (the more recent) still wins', () => {
    const { classified } = classifyQuickFixes([
      qf({ id: 'QF-OLDVER', created_at: daysAgo(1), verified_at: daysAgo(90) }),
    ]);
    expect(classified[0]._verifyFirst).toBe(false);
  });
});
