/**
 * SD-LEO-INFRA-AUTO-REFILL-READ-DB-ACTIVATION-FLAG-001
 *
 * The auto-refill cron's ENABLE gate must read the DB activation SSOT (sourcing_engine_activation_state,
 * arm 'auto-refill') — the SAME source the capacity-forecaster gauge reads via readSourcingEngineFlagsFromDb
 * — so the gauge and the action can't diverge (the defect: env gate OFF while the seeded DB arm was ON =>
 * 0/414 promoted). SOURCING_AUTO_REFILL_V1 is demoted to an optional emergency force-off kill-switch.
 * Fail-closed: an absent/disabled arm => dormant.
 */
import { describe, it, expect } from 'vitest';
import { resolveAutoRefillEnabled } from '../../../scripts/sourcing-engine/refill-cron.mjs';
import { readSourcingEngineFlagsFromDb, SOURCING_ENGINE_FLAGS } from '../../../scripts/lib/sourcing-engine-awareness.mjs';

// flags array exactly as readSourcingEngineFlagsFromDb returns it: [{env,label,enabled}].
const flagsWith = (autoRefillEnabled) => SOURCING_ENGINE_FLAGS.map((f) => ({
  env: f.env, label: f.label, enabled: f.label === 'auto-refill' ? autoRefillEnabled : false,
}));

describe('resolveAutoRefillEnabled — DB activation SSOT gate', () => {
  it('TS-1: DB arm enabled=true => enabled (cron proceeds)', () => {
    expect(resolveAutoRefillEnabled(flagsWith(true), {})).toBe(true);
  });

  it('TS-2: DB arm enabled=false => dormant', () => {
    expect(resolveAutoRefillEnabled(flagsWith(false), {})).toBe(false);
  });

  it('TS-3: env force-off (false/off/0) overrides an enabled DB arm (emergency kill)', () => {
    expect(resolveAutoRefillEnabled(flagsWith(true), { SOURCING_AUTO_REFILL_V1: 'false' })).toBe(false);
    expect(resolveAutoRefillEnabled(flagsWith(true), { SOURCING_AUTO_REFILL_V1: 'off' })).toBe(false);
    expect(resolveAutoRefillEnabled(flagsWith(true), { SOURCING_AUTO_REFILL_V1: '0' })).toBe(false);
  });

  it('env unset => the DB flag alone controls (the fix: no longer requires env===true)', () => {
    expect(resolveAutoRefillEnabled(flagsWith(true), {})).toBe(true);   // DB on, env unset => ON
    expect(resolveAutoRefillEnabled(flagsWith(false), {})).toBe(false); // DB off, env unset => OFF
  });

  it('a legacy env=true does NOT enable when the DB arm is off (DB is primary, not the env)', () => {
    expect(resolveAutoRefillEnabled(flagsWith(false), { SOURCING_AUTO_REFILL_V1: 'true' })).toBe(false);
  });

  it('TS-4: fail-closed — empty/missing flags (e.g. read error or arm absent) => dormant', () => {
    expect(resolveAutoRefillEnabled([], {})).toBe(false);
    expect(resolveAutoRefillEnabled(undefined, {})).toBe(false);
    expect(resolveAutoRefillEnabled([{ env: 'SOURCING_GAUGE_GAP_MINER_V1', label: 'gauge-gap-miner', enabled: true }], {})).toBe(false);
  });
});

describe('gauge/action parity — both read the same source', () => {
  it('the gate reads the auto-refill arm from the SAME flags shape the forecaster produces', async () => {
    // A fake supabase returning a seeded auto-refill arm; readSourcingEngineFlagsFromDb is what the
    // forecaster gauge also calls, so feeding its output into resolveAutoRefillEnabled proves parity.
    const fakeSupabase = {
      from: () => ({ select: async () => ({ data: [{ arm: 'auto-refill', enabled: true }], error: null }) }),
    };
    const flags = await readSourcingEngineFlagsFromDb(fakeSupabase, {});
    const armEnabled = flags.find((f) => f.label === 'auto-refill')?.enabled;
    expect(armEnabled).toBe(true);
    // the cron gate decision === what the gauge sees for that arm (no divergence)
    expect(resolveAutoRefillEnabled(flags, {})).toBe(armEnabled);
  });

  it('a disabled DB arm => gauge sees false AND the gate is dormant (parity)', async () => {
    const fakeSupabase = {
      from: () => ({ select: async () => ({ data: [{ arm: 'auto-refill', enabled: false }], error: null }) }),
    };
    const flags = await readSourcingEngineFlagsFromDb(fakeSupabase, {});
    const armEnabled = flags.find((f) => f.label === 'auto-refill')?.enabled;
    expect(armEnabled).toBe(false);
    expect(resolveAutoRefillEnabled(flags, {})).toBe(false);
  });
});
