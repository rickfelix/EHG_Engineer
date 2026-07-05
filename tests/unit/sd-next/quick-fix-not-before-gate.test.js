/**
 * Unit test: durable time-gated defer (not_before) in classifyQuickFixes
 * SD-LEO-FIX-QUICK-FIXES-NEEDS-001
 *
 * A QF with not_before set to a future timestamp is genuinely not ready yet (e.g.
 * needs a clean 24h observation window). It must be flagged `_deferred` and held
 * OUT of `topStartableQF` -- mirroring the worker-checkin.cjs isAutoStartableQF()
 * guard -- so a human operator can't manually claim off the sd:next display what
 * the auto-claim pickers already refuse (validation-agent finding, LEAD phase).
 */
import { describe, it, expect } from 'vitest';
import { classifyQuickFixes } from '../../../scripts/modules/sd-next/display/quick-fixes.js';

const HOUR_MS = 60 * 60 * 1000;
const hoursFromNow = (n) => new Date(Date.now() + n * HOUR_MS).toISOString();

const qf = (over = {}) => ({
  id: 'QF-X',
  title: 'x',
  type: 'bug',
  severity: 'medium',
  status: 'open',
  estimated_loc: 10,
  created_at: new Date().toISOString(),
  claiming_session_id: null,
  pr_url: null,
  commit_sha: null,
  not_before: null,
  ...over,
});

describe('QF durable time-gated defer (SD-LEO-FIX-QUICK-FIXES-NEEDS-001)', () => {
  it('flags a QF with a future not_before as deferred and excludes it from topStartableQF', () => {
    const { summary, classified } = classifyQuickFixes([qf({ id: 'QF-GATED', not_before: hoursFromNow(1) })]);
    expect(classified[0]._deferred).toBe(true);
    expect(summary.topStartableQF).toBeNull();
    expect(summary.topQF).not.toBeNull(); // still visible in the queue
  });

  it('does NOT flag a QF with a past not_before (gate has passed)', () => {
    const { summary, classified } = classifyQuickFixes([qf({ id: 'QF-CLEARED', not_before: hoursFromNow(-1) })]);
    expect(classified[0]._deferred).toBe(false);
    expect(summary.topStartableQF?.id).toBe('QF-CLEARED');
  });

  it('does NOT flag a QF with not_before null (no regression to pre-existing behavior)', () => {
    const { summary, classified } = classifyQuickFixes([qf({ id: 'QF-PLAIN', not_before: null })]);
    expect(classified[0]._deferred).toBe(false);
    expect(summary.topStartableQF?.id).toBe('QF-PLAIN');
  });

  it('prefers a non-gated QF over a deferred one as the auto-startable pick', () => {
    const { summary } = classifyQuickFixes([
      qf({ id: 'QF-GATED', not_before: hoursFromNow(5) }),
      qf({ id: 'QF-OPEN', not_before: null }),
    ]);
    expect(summary.topStartableQF?.id).toBe('QF-OPEN');
  });
});
