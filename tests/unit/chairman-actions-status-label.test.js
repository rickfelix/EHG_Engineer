import { describe, it, expect } from 'vitest';
import { resolveActionsStatusLabel } from '../../lib/chairman/actions-status-label.mjs';

// Gauge-trust map C6 (SD-LEO-INFRA-CHAIRMAN-GAUGE-FABRICATIONS-FIX4-001): a chairman_pending_decisions
// read failure must never render as the same "all clear" a genuinely empty queue renders.
describe('resolveActionsStatusLabel', () => {
  it('renders the action count when there are pending decisions, regardless of read-failed flag', () => {
    const ok = resolveActionsStatusLabel({ nActions: 3, decisionsReadFailed: false });
    expect(ok.subject).toBe('3 actions for you');
    expect(ok.plaintext).toBe('3 actions for you');
    expect(ok.html).toBe('3 actions for you');

    const singular = resolveActionsStatusLabel({ nActions: 1, decisionsReadFailed: false });
    expect(singular.subject).toBe('1 action for you');
  });

  it('renders honest "all clear" when the read genuinely succeeded with zero rows', () => {
    const clear = resolveActionsStatusLabel({ nActions: 0, decisionsReadFailed: false });
    expect(clear.subject).toBe('all clear');
    expect(clear.plaintext).toBe('No decisions need you right now.');
    expect(clear.html).toBe('No decisions need you right now.');
  });

  it('never renders "all clear" when the read failed -- the exact C6 fabrication this fixes', () => {
    const failed = resolveActionsStatusLabel({ nActions: 0, decisionsReadFailed: true });
    expect(failed.subject).not.toMatch(/all clear/i);
    expect(failed.plaintext).not.toMatch(/no decisions need you/i);
    expect(failed.html).not.toMatch(/no decisions need you/i);
    expect(failed.subject).toBe('decisions status unknown');
    expect(failed.plaintext).toMatch(/status unknown/i);
    expect(failed.html).toMatch(/status unknown/i);
  });
});
