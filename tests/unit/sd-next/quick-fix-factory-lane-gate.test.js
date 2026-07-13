/**
 * Unit test: factory_lane exclusion in classifyQuickFixes
 * SD-FDBK-FIX-DISPATCH-ELIGIBILITY-HONOR-001
 *
 * Adversarial review (deep-tier /ship gate, PR #6069) found that the original fix only
 * closed the automated worker self-claim loop (isAutoStartableQF() in worker-checkin.cjs)
 * but left the sd:next recommendation path (classifyQuickFixes -> topStartableQF ->
 * AUTO_PROCEED_ACTION:qf_start) unaware of factory_lane -- a coordinator-dispatch-only QF
 * could still be recommended and manually worked via that path, reproducing the same bug
 * class this SD closes. Mirrors quick-fix-not-before-gate.test.js exactly.
 */
import { describe, it, expect } from 'vitest';
import { classifyQuickFixes } from '../../../scripts/modules/sd-next/display/quick-fixes.js';

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
  factory_lane: false,
  ...over,
});

describe('QF factory_lane exclusion (SD-FDBK-FIX-DISPATCH-ELIGIBILITY-HONOR-001)', () => {
  it('flags a QF with factory_lane=true and excludes it from topStartableQF', () => {
    const { summary, classified } = classifyQuickFixes([qf({ id: 'QF-FACTORY', factory_lane: true })]);
    expect(classified[0]._factoryLane).toBe(true);
    expect(summary.topStartableQF).toBeNull();
    expect(summary.topQF).not.toBeNull(); // still visible in the queue
  });

  it('does NOT flag a QF with factory_lane=false (the default)', () => {
    const { summary, classified } = classifyQuickFixes([qf({ id: 'QF-PLAIN', factory_lane: false })]);
    expect(classified[0]._factoryLane).toBe(false);
    expect(summary.topStartableQF?.id).toBe('QF-PLAIN');
  });

  it('does NOT flag a QF with factory_lane absent (undefined) -- no regression to pre-migration rows', () => {
    const row = qf({ id: 'QF-ABSENT' });
    delete row.factory_lane;
    const { summary, classified } = classifyQuickFixes([row]);
    expect(classified[0]._factoryLane).toBe(false);
    expect(summary.topStartableQF?.id).toBe('QF-ABSENT');
  });

  it('prefers a non-factory-lane QF over a factory-lane one as the auto-startable pick', () => {
    const { summary } = classifyQuickFixes([
      qf({ id: 'QF-FACTORY', factory_lane: true }),
      qf({ id: 'QF-OPEN', factory_lane: false }),
    ]);
    expect(summary.topStartableQF?.id).toBe('QF-OPEN');
  });

  it('reproduces the QF-20260712-481 shape: factory_lane=true, benign title, low tier', () => {
    const { summary } = classifyQuickFixes([
      qf({
        id: 'QF-20260712-481',
        title: 'V10: venture-2 approval stamped pre-isfixture-merge never got a chairman_decisions row',
        factory_lane: true,
      }),
    ]);
    expect(summary.topStartableQF).toBeNull();
  });
});
