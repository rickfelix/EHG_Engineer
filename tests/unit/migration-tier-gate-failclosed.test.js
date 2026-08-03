// FILE A — SD-LEO-INFRA-TIER-GATE-FLAG-001 (FR-2a, FR-2).
// Mocks @supabase/supabase-js and runs the REAL evaluator, because the 30s cache this
// file exists to test lives in the evaluator: mocking the evaluator (as FILE B does)
// would delete the very thing under test and leave TS-4 asserting a mock's return value.
//
// WHY MOCKING THE CLIENT IS MANDATORY HERE, not stylistic: .env supplies real credentials
// to the vitest process and the db-project guard does not cover the `unit` project, so an
// unmocked case would open a live client against the production ref.
//
// THE MIS-DRIVE THIS FILE AVOIDS: failing the FLAGS read does NOT produce evaluation_error.
// refreshCacheIfNeeded swallows it (evaluator.js:80-82) and the lookup then reports
// flag_not_found. To actually reach evaluation_error you must reject the KILL-SWITCH query,
// which sits OUTSIDE that try. Both are asserted below so the distinction stays pinned.
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

// Mutable mode: the mock must be re-aimed WITHOUT re-creating the client, because
// clearCache() does not null the evaluator's module-level supabaseClient singleton.
let mode = { flags: [], flagsThrows: false, killThrows: false, killActive: false };

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table) {
      if (table === 'leo_kill_switches') {
        const res = () => {
          if (mode.killThrows) return Promise.reject(new Error('kill switch read failed'));
          return Promise.resolve({ data: { switch_key: 'CONST-009', is_active: mode.killActive }, error: null });
        };
        const chain = { select: () => chain, eq: () => chain, single: res, then: undefined };
        return chain;
      }
      // leo_feature_flags — fetchAllPaginated drives select().order().range()
      const chain = {
        select: () => chain,
        order: () => chain,
        range: () => (mode.flagsThrows
          ? Promise.reject(new Error('flags read failed'))
          : Promise.resolve({ data: mode.flags, error: null })),
        then: undefined
      };
      return chain;
    }
  })
}));

const BYPASS_KEY = 'LEO_MIGRATION_TIER_GATE_BYPASS';

const enabledBypassRow = {
  flag_key: BYPASS_KEY,
  is_enabled: true,
  lifecycle_state: 'enabled',
  leo_feature_flag_policies: []
};

const ORIGINAL = process.env.LEO_MIGRATION_TIER_GATE;
beforeEach(() => {
  delete process.env.LEO_MIGRATION_TIER_GATE; // see FILE B: without this the suite cannot fail
  mode = { flags: [], flagsThrows: false, killThrows: false, killActive: false };
});
afterAll(() => {
  if (ORIGINAL === undefined) delete process.env.LEO_MIGRATION_TIER_GATE;
  else process.env.LEO_MIGRATION_TIER_GATE = ORIGINAL;
});

/**
 * Fresh SUT with the ambient override stripped AT CALL TIME.
 *
 * The strip cannot live only in beforeEach. `vi.resetModules()` re-executes the import
 * chain, and something in it imports `dotenv/config`, which re-reads .env and RE-INJECTS
 * LEO_MIGRATION_TIER_GATE=on over the deletion. The override then short-circuits
 * tierGateEnabled() before it ever reaches the DB — so every case here silently became
 * "assert the override works", and the two GATE-OFF cases failed while the five GATE-ON
 * cases passed for entirely the wrong reason. Measured: the SUT never reached its own
 * evaluateFlag call.
 *
 * This is the FR-6 ambient-override trap re-armed one level deeper by module reset. The
 * deletion must therefore happen after the re-import, immediately before each invocation.
 */
async function freshGate() {
  vi.resetModules();
  const mod = await import('../../scripts/modules/handoff/pre-checks/pending-migrations-check.js');
  return async (...args) => {
    delete process.env.LEO_MIGRATION_TIER_GATE;
    // The break-glass is stripped too, for symmetry with FILE B. It is set nowhere today,
    // but an operator exporting the documented LEO_MIGRATION_TIER_GATE_FORCE_ON would
    // otherwise short-circuit every case here — reintroducing the exact blind spot that
    // made the original suite unfalsifiable.
    delete process.env.LEO_MIGRATION_TIER_GATE_FORCE_ON;
    return mod.tierGateEnabled(...args);
  };
}

describe('FR-2a — a stale AFFIRMATIVE bypass is never served through a partial degradation', () => {
  it('warm with bypass, then degrade the flags read: gate is ON, not the cached OFF', async () => {
    const tierGateEnabled = await freshGate();

    // 1. Warm: the flag is affirmatively enabled, so the gate is OFF. This also proves the
    //    fixture is real — if this first leg did not go OFF, the second leg would be
    //    asserting ON against a cache that never held an affirmative, i.e. nothing.
    mode.flags = [enabledBypassRow];
    await expect(tierGateEnabled()).resolves.toBe(false);

    // 2. Degrade the FLAGS read only (the partial case). Without the forced clearCache()
    //    the evaluator returns early inside its TTL and re-serves the cached affirmative,
    //    which would resolve OFF and fail this assertion.
    mode.flagsThrows = true;
    await expect(tierGateEnabled()).resolves.toBe(true);
  });

  it('NEGATIVE CONTROL: with the flags read healthy the affirmative still resolves OFF', async () => {
    // Guards against the previous case passing for the wrong reason — e.g. a gate that is
    // simply always ON would satisfy leg 2 above while proving nothing about staleness.
    const tierGateEnabled = await freshGate();
    mode.flags = [enabledBypassRow];
    await expect(tierGateEnabled()).resolves.toBe(false);
    await expect(tierGateEnabled()).resolves.toBe(false);
  });
});

describe('FR-2 — indeterminate reads through the REAL evaluator', () => {
  it('flag absent from the table => flag_not_found => GATE ON', async () => {
    const tierGateEnabled = await freshGate();
    mode.flags = [];
    await expect(tierGateEnabled()).resolves.toBe(true);
  });

  it('a failing FLAGS read yields flag_not_found (NOT evaluation_error) => GATE ON', async () => {
    const tierGateEnabled = await freshGate();
    mode.flagsThrows = true;
    await expect(tierGateEnabled()).resolves.toBe(true);
  });

  it('a failing KILL-SWITCH read is the one that reaches evaluation_error => GATE ON', async () => {
    const tierGateEnabled = await freshGate();
    mode.flags = [enabledBypassRow]; // affirmative present, yet the error must still win
    mode.killThrows = true;
    await expect(tierGateEnabled()).resolves.toBe(true);
  });

  it('CONST-009 kill switch active => GATE ON (an unrelated kill switch cannot OPEN a security boundary)', async () => {
    const tierGateEnabled = await freshGate();
    mode.flags = [enabledBypassRow];
    mode.killActive = true;
    await expect(tierGateEnabled()).resolves.toBe(true);
  });

  it('a draft-lifecycle bypass flag => GATE ON', async () => {
    const tierGateEnabled = await freshGate();
    mode.flags = [{ ...enabledBypassRow, is_enabled: false, lifecycle_state: 'draft' }];
    await expect(tierGateEnabled()).resolves.toBe(true);
  });
});

describe('FR-2 — unconstructable client', () => {
  it('missing credentials => GATE ON', async () => {
    // Must re-import AFTER stripping credentials: the evaluator caches its client in a
    // module-level singleton that clearCache() does not reset, so once any earlier case
    // has constructed one this path is unreachable and would pass for the wrong reason.
    const url = process.env.SUPABASE_URL;
    const nextUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      const tierGateEnabled = await freshGate();
      await expect(tierGateEnabled()).resolves.toBe(true);
    } finally {
      if (url !== undefined) process.env.SUPABASE_URL = url;
      if (nextUrl !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = nextUrl;
      if (key !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = key;
    }
  });
});
