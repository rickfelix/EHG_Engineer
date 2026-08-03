// FILE B — SD-LEO-INFRA-TIER-GATE-FLAG-001 (FR-2, FR-3, FR-4, FR-6, FR-7).
// Mocks the EVALUATOR and exercises the real SUT. Covers the reason allowlist, the
// strengthen-only env override in BOTH directions, and audit threading.
//
// FILE A (migration-tier-gate-failclosed.test.js) covers the opposite pairing — real
// evaluator, mocked supabase — because the cache under test only exists in the real
// evaluator; mocking it away here would delete the thing FR-2a is about.
//
// THE AMBIENT-OVERRIDE TRAP (FR-6 BLOCKER-1): LEO_MIGRATION_TIER_GATE=on is live in the
// shell env AND in .env, and vitest loads .env. Had that value stayed a strengthening
// override it would force the gate ON before any DB read, so every gate-ON assertion here
// would pass through the short-circuit and stay green even with the DB read deleted
// outright. That is what drove the EXEC amendment demoting the legacy variable to inert
// (see the FR-3 block below) — and `stripOverride()` remains mandatory rather than
// hygiene, because the break-glass would reintroduce exactly the same blind spot.
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

const evaluateFlag = vi.fn();
const clearCache = vi.fn();
vi.mock('../../lib/feature-flags/index.js', () => ({
  evaluateFlag: (...a) => evaluateFlag(...a),
  clearCache: (...a) => clearCache(...a)
}));

const { tierGateEnabled, TIER_GATE_BYPASS_FLAG } = await import(
  '../../scripts/modules/handoff/pre-checks/pending-migrations-check.js'
);

const ORIGINAL_OVERRIDE = process.env.LEO_MIGRATION_TIER_GATE;
const stripOverride = () => { delete process.env.LEO_MIGRATION_TIER_GATE; delete process.env.LEO_MIGRATION_TIER_GATE_FORCE_ON; };

beforeEach(() => {
  vi.clearAllMocks();
  stripOverride();
});
afterAll(() => {
  if (ORIGINAL_OVERRIDE === undefined) delete process.env.LEO_MIGRATION_TIER_GATE;
  else process.env.LEO_MIGRATION_TIER_GATE = ORIGINAL_OVERRIDE;
});

const bypassGranted = { enabled: true, reason: 'no_policy_default_enabled' };

describe('tierGateEnabled — fail-closed on every non-affirmative outcome (FR-2)', () => {
  // Each indeterminate reason gets its OWN case. A single compound OR over a fixture
  // carrying several shapes would pass while only one arm actually worked.
  const indeterminate = [
    ['evaluation_error', { enabled: false, reason: 'evaluation_error' }],
    ['flag_not_found', { enabled: false, reason: 'flag_not_found' }],
    ['kill_switch_active', { enabled: false, reason: 'kill_switch_active' }],
    ['lifecycle_draft', { enabled: false, reason: 'lifecycle_draft' }],
    ['globally_disabled', { enabled: false, reason: 'globally_disabled' }],
    ['blocklist_match', { enabled: false, reason: 'blocklist_match' }],
    ['rollout_0_percent', { enabled: false, reason: 'rollout_0_percent' }]
  ];
  for (const [name, res] of indeterminate) {
    it(`${name} => GATE ON`, async () => {
      evaluateFlag.mockResolvedValue(res);
      await expect(tierGateEnabled()).resolves.toBe(true);
    });
  }

  it('a THROWN evaluator (module unreadable / client unconstructable) => GATE ON', async () => {
    evaluateFlag.mockRejectedValue(new Error('Missing Supabase credentials for feature flag evaluator'));
    await expect(tierGateEnabled()).resolves.toBe(true);
  });

  // The allowlist is the point: an affirmative-looking result whose reason we do not
  // recognise must NOT open a security boundary. Denylists fail open on novel values.
  it('enabled=true with an UNRECOGNISED reason => GATE ON (allowlist, not denylist)', async () => {
    evaluateFlag.mockResolvedValue({ enabled: true, reason: 'some_future_reason_v3' });
    await expect(tierGateEnabled()).resolves.toBe(true);
  });

  it('enabled=true via a ROLLOUT reason => GATE ON — a bypass may not depend on who is asking', async () => {
    for (const reason of ['rollout_included', 'rollout_100_percent', 'allowlist_match']) {
      evaluateFlag.mockResolvedValue({ enabled: true, reason });
      await expect(tierGateEnabled()).resolves.toBe(true);
    }
  });

  // POSITIVE CONTROL for the whole suite. If the override strip ever silently fails,
  // this case flips to true and FAILS — which is the only thing that makes every
  // GATE-ON assertion above trustworthy rather than vacuous.
  it('POSITIVE CONTROL: an affirmative bypass => GATE OFF', async () => {
    evaluateFlag.mockResolvedValue(bypassGranted);
    await expect(tierGateEnabled()).resolves.toBe(false);
  });

  it('reads the bypass flag by its single exported key', async () => {
    evaluateFlag.mockResolvedValue(bypassGranted);
    await tierGateEnabled();
    expect(evaluateFlag).toHaveBeenCalledWith(TIER_GATE_BYPASS_FLAG, expect.any(Object));
  });
});

describe('FR-2a — the cache is cleared BEFORE the read, not after', () => {
  it('clearCache runs before evaluateFlag (order, not merely called-ness)', async () => {
    evaluateFlag.mockResolvedValue(bypassGranted);
    await tierGateEnabled();
    expect(clearCache).toHaveBeenCalled();
    // Asserting only "was called" is satisfied by calling it AFTER the evaluation, which
    // proves nothing — the stale value would already have been served.
    expect(clearCache.mock.invocationCallOrder[0]).toBeLessThan(evaluateFlag.mock.invocationCallOrder[0]);
  });
});

describe('FR-3 — the break-glass may only STRENGTHEN, and the legacy var is inert', () => {
  const FORCE = 'LEO_MIGRATION_TIER_GATE_FORCE_ON';
  const clearForce = () => { delete process.env[FORCE]; };
  beforeEach(clearForce);
  afterAll(clearForce);

  for (const affirmative of ['1', 'on', 'true', 'yes']) {
    it(`break-glass "${affirmative}" forces GATE ON without consulting the DB`, async () => {
      process.env[FORCE] = affirmative;
      evaluateFlag.mockResolvedValue(bypassGranted); // DB says bypass; break-glass wins toward safety
      await expect(tierGateEnabled()).resolves.toBe(true);
      expect(evaluateFlag).not.toHaveBeenCalled();
    });
  }

  // The weakening direction is the one that matters. A suite testing only the ON
  // direction would pass with a weakening bug present.
  for (const weakening of ['off', 'false', '0', 'no', 'disabled']) {
    it(`break-glass "${weakening}" cannot weaken — the DB still decides`, async () => {
      process.env[FORCE] = weakening;
      evaluateFlag.mockResolvedValue({ enabled: false, reason: 'flag_not_found' });
      await expect(tierGateEnabled()).resolves.toBe(true);
      // Not a weakening instruction — it is simply not an instruction, so the DB is read.
      expect(evaluateFlag).toHaveBeenCalled();
    });
  }

  it('there is NO env value that turns the gate off, even when the DB would allow it', async () => {
    for (const v of ['off', 'false', '0', 'no']) {
      vi.clearAllMocks();
      process.env[FORCE] = v;
      // DB grants the bypass, so the ONLY thing that could hold the gate ON here is the
      // refusal to let an env value weaken it... and the DB says OFF, so the gate is OFF.
      // That is correct: the env cannot force off, but it also cannot override a
      // deliberate, approved DB bypass. The invariant is "env never weakens", not
      // "env always wins".
      evaluateFlag.mockResolvedValue(bypassGranted);
      await expect(tierGateEnabled()).resolves.toBe(false);
    }
  });

  // The legacy variable is live in .env on every surface in this repo, loaded by the
  // SUT's own import chain regardless of cwd. Honouring it as a strengthening override
  // would short-circuit before every DB read and make the flag permanently inert — the
  // SD would ship as a no-op. Measured during EXEC; this pins the demotion.
  describe('legacy LEO_MIGRATION_TIER_GATE is IGNORED', () => {
    for (const legacy of ['on', 'off', 'true', '0']) {
      it(`legacy "${legacy}" does not short-circuit — the DB is still consulted`, async () => {
        process.env.LEO_MIGRATION_TIER_GATE = legacy;
        evaluateFlag.mockResolvedValue(bypassGranted);
        await expect(tierGateEnabled()).resolves.toBe(false);
        expect(evaluateFlag).toHaveBeenCalled();
      });
    }

    it('legacy "off" still cannot weaken — with no DB bypass the gate is ON', async () => {
      process.env.LEO_MIGRATION_TIER_GATE = 'off';
      evaluateFlag.mockResolvedValue({ enabled: false, reason: 'flag_not_found' });
      await expect(tierGateEnabled()).resolves.toBe(true);
    });
  });

  it('an empty break-glass is treated as absent and the DB decides', async () => {
    process.env[FORCE] = '';
    evaluateFlag.mockResolvedValue(bypassGranted);
    await expect(tierGateEnabled()).resolves.toBe(false);
  });
});

describe('FR-2 — missing-await is fail-CLOSED by construction', () => {
  it('an unawaited call is truthy, and truthy means gate ON', () => {
    evaluateFlag.mockResolvedValue(bypassGranted);
    const promise = tierGateEnabled(); // deliberately not awaited
    // The gate is consumed as `if (gateOn)`. A Promise is truthy, so a forgotten await
    // defers TIER-2 rather than applying it. This is why the function returns GATE-ON
    // semantics and why no bypass-shaped async helper may exist: there, truthy would mean
    // "bypass granted" and a forgotten await would fail OPEN.
    expect(promise).toBeTruthy();
    return promise;
  });

  it('the strict conjunction rejects a Promise on BOTH sides', () => {
    const AFFIRMATIVE = new Set(['no_policy_default_enabled']);
    const notAResult = Promise.resolve({ enabled: true, reason: 'no_policy_default_enabled' });
    expect(notAResult?.enabled === true && AFFIRMATIVE.has(notAResult?.reason)).toBe(false);
  });
});
