/**
 * QF-20260807-013 — CANNOT_DRIVE reasons must come from a live probe, not a hardcoded string.
 *
 * The O6 reason claimed "no payment-attribution machinery found in EHG_Engineer lib/ (attribution
 * rail lives with the venture app)". Nothing ever probed — it was written once and believed
 * thereafter — and it was false at every checkable layer: lib/payments/attribution-resolver.js,
 * the ops_payment_events store, api/webhooks/stripe.js and the test-charge driver are all in this
 * repo. Second instance in one instrument of assertion-without-measurement.
 *
 * Also covers the §H5.1 spawn-env fence, which until this commit existed ONLY as an uncommitted
 * edit in the shared working tree despite being a binding green-light condition.
 */
import { describe, it, expect } from 'vitest';
import { assertSpawnEnvStripeFence, probeAttributionRail, runPostLaunchDrivers } from '../../../scripts/harness/s20-run.mjs';

const TEST_ENV = { STRIPE_SECRET_KEY: 'sk_test_abc' };

describe('QF-20260807-013: O6 precondition is PROBED, never asserted', () => {
  it('reports drivable ONLY after confirming the export exists — with a real test key', async () => {
    const res = await probeAttributionRail({ env: TEST_ENV });
    expect(res.drivable).toBe(true);
    expect(res.probe).toBe('export');
  });

  it('THE REGRESSION: it does not claim the machinery is absent — the real module resolves', async () => {
    const res = await probeAttributionRail({ env: TEST_ENV });
    expect(res.reason).not.toMatch(/no payment-attribution machinery/i);
    expect(res.reason).not.toMatch(/lives with the venture app/i);
  });

  // ACCEPTANCE, side 2: key deliberately absent still CANNOT_DRIVEs, with the HONEST reason.
  it('ACCEPTANCE: with no test key it is undrivable, and the reason names the key — not the machinery', async () => {
    for (const env of [{}, { STRIPE_SECRET_KEY: 'sk_live_real' }, { STRIPE_SECRET_KEY: 'placeholder' }]) {
      const res = await probeAttributionRail({ env });
      expect(res.drivable).toBe(false);
      expect(res.probe).toBe('env');
      expect(res.reason).toMatch(/sk_test_/);
      expect(res.reason).not.toMatch(/no payment-attribution machinery/i);
    }
  });

  it('a genuinely missing module yields a MEASURED module-level reason, not a guess', async () => {
    const res = await probeAttributionRail({ env: TEST_ENV, importer: async () => { throw new Error('ENOENT'); } });
    expect(res).toMatchObject({ drivable: false, probe: 'module' });
    expect(res.reason).toMatch(/not importable: ENOENT/);
  });

  it('a module present but missing the export is distinguished from a module that is absent', async () => {
    const res = await probeAttributionRail({ env: TEST_ENV, importer: async () => ({}) });
    expect(res).toMatchObject({ drivable: false, probe: 'export' });
    expect(res.reason).toMatch(/exports no resolveUnattributedEvents/);
  });
});

/**
 * WIRING, not just the unit. My first pass tested probeAttributionRail directly, and a mutation
 * that reverted runPostLaunchDrivers to the hardcoded string left every test GREEN — the probe
 * worked and nothing checked that the runner CALLED it. A test that cannot see the wiring is the
 * same blindness this QF set exists to remove, so these drive the real code path.
 */
describe('QF-20260807-013: the RUNNER actually calls the probe', () => {
  const mkJournal = () => {
    const entries = [];
    return {
      entries,
      append: (e) => entries.push(e),
      finding: (finding_type, event, detail) => entries.push({ kind: 'finding', finding_type, event, detail }),
    };
  };
  const clock = { now: () => '2026-08-07T13:00:00Z' };
  const o6Entry = (j) => j.entries.find((e) => String(e.event).includes('test_rail_payment'));

  it('journals the PROBE-measured reason, and attaches the probe evidence', async () => {
    const journal = mkJournal();
    await runPostLaunchDrivers({
      supabase: null, journal, ventureId: 'v1', clock,
      seams: { probeAttributionRail: async () => ({ drivable: false, reason: 'measured thing', probe: 'env' }) },
    });
    const entry = o6Entry(journal);
    expect(entry.event).toContain('measured thing');
    expect(entry.event).toContain('measured, probe=env');
    expect(entry.detail.probe).toEqual({ drivable: false, reason: 'measured thing', probe: 'env' });
  });

  it('THE MUTATION GUARD: the hardcoded absent-machinery claim can never be journaled again', async () => {
    const journal = mkJournal();
    await runPostLaunchDrivers({
      supabase: null, journal, ventureId: 'v1', clock,
      seams: { probeAttributionRail: async () => ({ drivable: true, reason: 'rail present', probe: 'export' }) },
    });
    const entry = o6Entry(journal);
    expect(entry.event).not.toMatch(/no payment-attribution machinery/i);
    expect(entry.event).not.toMatch(/lives with the venture app/i);
    // When the precondition IS met, the honest blocker is the driver seam — not capability.
    expect(entry.event).toMatch(/blocked only on the harness driver seam, not on capability/);
  });
});

describe('QF-20260807-013: §H5.1 spawn-env fence (now committed, not tree-local)', () => {
  it('REFUSES to start on a live key — both sk_live_ and rk_live_', () => {
    for (const k of ['sk_live_x', 'rk_live_x']) {
      expect(() => assertSpawnEnvStripeFence({ STRIPE_SECRET_KEY: k })).toThrow(/SPAWN-ENV FENCE/);
    }
  });

  it('permits an unset, placeholder, or test-mode key, and records which', () => {
    expect(assertSpawnEnvStripeFence({}).detail.stripe_key_mode).toBe('absent_or_placeholder');
    expect(assertSpawnEnvStripeFence({ STRIPE_SECRET_KEY: 'UNSET_FOR_SIM_RUN' }).detail.stripe_key_mode).toBe('absent_or_placeholder');
    expect(assertSpawnEnvStripeFence(TEST_ENV).detail.stripe_key_mode).toBe('test');
  });

  it('returns a journalable fence_assertion asserting the live key is unreachable', () => {
    const a = assertSpawnEnvStripeFence(TEST_ENV);
    expect(a.kind).toBe('fence_assertion');
    expect(a.detail.live_key_reachable).toBe(false);
  });
});
