// SD-WRITERCONSUMER-ASYMMETRY-DETECTION-SCOPECOMPLETION-ORCH-001-0 / FR-C0-6
// KILL-SWITCH boundary scenarios: 100% / 90% / 80% / post-release block.
import { describe, it, expect } from 'vitest';
import { checkKillSwitch } from '../../scripts/promote-child-0-2.mjs';
import { KILL_SWITCH_ACCURACY_THRESHOLD } from '../../scripts/lineage/constants.mjs';

function makeSupabaseStub(value) {
  return {
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        maybeSingle: async () => ({ data: value ? { value } : null, error: null }),
      };
    },
  };
}

describe('KILL-SWITCH activation thresholds', () => {
  it('threshold constant is 90', () => {
    expect(KILL_SWITCH_ACCURACY_THRESHOLD).toBe(90);
  });

  it('100% accuracy / kill_switch=false → not active (promotion allowed)', async () => {
    const stub = makeSupabaseStub({ kill_switch: false, pilot_accuracy: 100 });
    const res = await checkKillSwitch(stub);
    expect(res.active).toBe(false);
  });

  it('90% accuracy / kill_switch=false → not active (boundary inclusive)', async () => {
    const stub = makeSupabaseStub({ kill_switch: false, pilot_accuracy: 90 });
    const res = await checkKillSwitch(stub);
    expect(res.active).toBe(false);
  });

  it('80% accuracy with kill_switch=true → active (BLOCKED)', async () => {
    const stub = makeSupabaseStub({ kill_switch: true, blocked: true, pilot_accuracy: 80 });
    const res = await checkKillSwitch(stub);
    expect(res.active).toBe(true);
    expect(res.payload.blocked).toBe(true);
  });

  it('blocked=true (post-release manual lock) → active regardless', async () => {
    const stub = makeSupabaseStub({ kill_switch: false, blocked: true, pilot_accuracy: 100 });
    const res = await checkKillSwitch(stub);
    expect(res.active).toBe(true);
  });

  it('app_config row missing → not active (graceful default)', async () => {
    const stub = makeSupabaseStub(null);
    const res = await checkKillSwitch(stub);
    expect(res.active).toBe(false);
    expect(res.source).toBe('unset');
  });
});
