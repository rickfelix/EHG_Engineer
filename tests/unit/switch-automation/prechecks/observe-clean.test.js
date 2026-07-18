/**
 * SD-LEO-INFRA-INTELLIGENT-SWITCH-AUTOMATION-001-C: PC-2 observe-clean
 */
import { describe, it, expect } from 'vitest';
import { checkObserveClean } from '../../../../lib/switch-automation/prechecks/observe-clean.js';

describe('PC-2: checkObserveClean', () => {
  it('passes when no incident and evidence is fresh', () => {
    const result = checkObserveClean({ lastIncidentAt: null, checkedAt: new Date().toISOString() });
    expect(result).toEqual({ id: 'PC-2', name: 'observe-clean', passed: true, reason: 'clean-and-fresh' });
  });

  it('fails when an incident occurred within the window', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000).toISOString();
    const result = checkObserveClean({ lastIncidentAt: twoHoursAgo, checkedAt: new Date().toISOString() }, { windowHours: 24 });
    expect(result.passed).toBe(false);
    expect(result.reason).toBe('incident-in-window');
  });

  it('passes when the incident is outside the window', () => {
    const thirtyHoursAgo = new Date(Date.now() - 30 * 3_600_000).toISOString();
    const result = checkObserveClean({ lastIncidentAt: thirtyHoursAgo, checkedAt: new Date().toISOString() }, { windowHours: 24 });
    expect(result.passed).toBe(true);
  });

  it('fails on stale evidence (fresh-at-flip) even when the incident condition alone would pass', () => {
    const twentyMinutesAgo = new Date(Date.now() - 20 * 60_000).toISOString();
    const result = checkObserveClean({ lastIncidentAt: null, checkedAt: twentyMinutesAgo }, { maxEvidenceAgeMinutes: 15 });
    expect(result.passed).toBe(false);
    expect(result.reason).toBe('stale-evidence');
  });

  it('fails closed when checkedAt is missing/unparseable', () => {
    const result = checkObserveClean({ lastIncidentAt: null, checkedAt: null });
    expect(result.passed).toBe(false);
    expect(result.reason).toBe('no-evidence-timestamp');
  });
});
