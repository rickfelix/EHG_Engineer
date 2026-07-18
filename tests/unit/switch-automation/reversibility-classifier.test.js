import { describe, it, expect } from 'vitest';
import { classifySwitchOn, SWITCHON_VERDICT, NEVER_AUTO_CLASSES } from '../../../lib/switch-automation/reversibility-classifier.js';

describe('classifySwitchOn', () => {
  it('classifies a reversible, in-role, non-live-money component as reversible', () => {
    const r = classifySwitchOn({
      component: 'ops-scheduler', action: 'enable-scheduler',
      reversible: true, inRole: true, isReversibleByMechanism: true,
    });
    expect(r.verdict).toBe(SWITCHON_VERDICT.REVERSIBLE);
    expect(r.neverAuto).toBe(false);
  });

  it('classifies a live-money action as consequential via the ADAM rubric', () => {
    const r = classifySwitchOn({
      component: 'billing', action: 'enable-billing',
      reversible: true, inRole: true, isReversibleByMechanism: true, isLiveMoney: true,
    });
    expect(r.verdict).toBe(SWITCHON_VERDICT.CONSEQUENTIAL);
  });

  it('classifies missing required fields as unknown, never reversible', () => {
    const r = classifySwitchOn({ component: 'ops-scheduler' }); // action missing
    expect(r.verdict).toBe(SWITCHON_VERDICT.UNKNOWN);
    expect(r.reasons).toContain('missing:action');
  });

  it('classifies empty-string required fields as unknown', () => {
    const r = classifySwitchOn({ component: '  ', action: 'enable-scheduler' });
    expect(r.verdict).toBe(SWITCHON_VERDICT.UNKNOWN);
  });

  for (const action of NEVER_AUTO_CLASSES) {
    it(`NEVER-AUTO class "${action}" always classifies as consequential`, () => {
      const r = classifySwitchOn({ component: 'x', action, reversible: true, inRole: true, isReversibleByMechanism: true });
      expect(r.verdict).toBe(SWITCHON_VERDICT.CONSEQUENTIAL);
      expect(r.neverAuto).toBe(true);
    });
  }

  it('NEVER-AUTO precedence: a NEVER-AUTO action with a missing component still classifies as consequential, not unknown', () => {
    const r = classifySwitchOn({ action: 'live-money-enablement' }); // component missing too
    expect(r.verdict).toBe(SWITCHON_VERDICT.CONSEQUENTIAL);
    expect(r.neverAuto).toBe(true);
  });

  it('reversible=true but isReversibleByMechanism=false (untested revert path) is NOT reversible', () => {
    const r = classifySwitchOn({
      component: 'x', action: 'enable-x', reversible: true, inRole: true, isReversibleByMechanism: false,
    });
    expect(r.verdict).toBe(SWITCHON_VERDICT.CONSEQUENTIAL);
  });

  it('uncertain reversibility (missing isReversibleByMechanism) is conservative -> consequential, never reversible', () => {
    const r = classifySwitchOn({ component: 'x', action: 'enable-x', reversible: true, inRole: true });
    expect(r.verdict).toBe(SWITCHON_VERDICT.CONSEQUENTIAL);
  });

  it('venture-commitment action classifies as consequential', () => {
    const r = classifySwitchOn({
      component: 'x', action: 'enable-x', reversible: true, inRole: true, isReversibleByMechanism: true, isVentureCommitment: true,
    });
    expect(r.verdict).toBe(SWITCHON_VERDICT.CONSEQUENTIAL);
  });
});
