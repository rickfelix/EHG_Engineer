/**
 * SD-LEO-INFRA-COORDINATOR-SOURCING-ENGINE-AWARENESS-001 (FR-2) — tests for the pure
 * sourcing-engine awareness helpers used by the capacity forecaster's belt-low / DEFICIT output.
 */
import { describe, it, expect } from 'vitest';
import { vi } from 'vitest';
import {
  SOURCING_ENGINE_FLAGS,
  SOURCING_ACTIVATION_TABLE,
  isSourcingFlagOn,
  readSourcingEngineFlags,
  readSourcingEngineFlagsFromDb,
  reconcileSourcingArmState,
  formatSourcingAwareness,
  diffSourcingArmStateVsDeployment,
  fetchWorkflowState,
} from '../../scripts/lib/sourcing-engine-awareness.mjs';

// Minimal supabase mock: from().select() -> {data,error}; from().upsert().select() -> {data,error}.
function fakeSb({ rows = [], selectError = null, upsertError = null } = {}) {
  return {
    from() {
      return {
        select: () => Promise.resolve({ data: selectError ? null : rows, error: selectError }),
        upsert: () => ({ select: () => Promise.resolve({ data: upsertError ? null : rows, error: upsertError }) }),
      };
    },
  };
}

describe('isSourcingFlagOn', () => {
  it('treats on/1/true (case-insensitive) as enabled', () => {
    for (const v of ['on', 'ON', '1', 'true', 'TRUE', 'True']) expect(isSourcingFlagOn(v)).toBe(true);
  });
  it('treats anything else (incl. undefined/null/off) as disabled', () => {
    for (const v of [undefined, null, '', 'off', '0', 'false', 'yes', 'enabled']) expect(isSourcingFlagOn(v)).toBe(false);
  });
});

describe('readSourcingEngineFlags', () => {
  it('reads the canonical flags from an env-like object', () => {
    const flags = readSourcingEngineFlags({ SOURCING_GAUGE_GAP_MINER_V1: 'on', SOURCING_DEFERRED_WATCHER_V1: 'off' });
    const byLabel = Object.fromEntries(flags.map((f) => [f.label, f.enabled]));
    expect(byLabel['gauge-gap-miner']).toBe(true);
    expect(byLabel['deferred-watcher']).toBe(false);
    expect(flags.length).toBe(SOURCING_ENGINE_FLAGS.length);
  });
  it('defaults every flag to OFF when env is empty', () => {
    const flags = readSourcingEngineFlags({});
    expect(flags.every((f) => f.enabled === false)).toBe(true);
  });
});

describe('formatSourcingAwareness — belt-low remediation framing', () => {
  it('DORMANT engine + backlog → recommends ACTIVATE/distill, not manual backfill', () => {
    const r = formatSourcingAwareness({
      flags: [{ label: 'gauge-gap-miner', enabled: false }, { label: 'deferred-watcher', enabled: false }],
      unpromotedCount: 42,
    });
    expect(r.anyOn).toBe(false);
    expect(r.countStr).toBe('42');
    expect(r.recommendation).toMatch(/ACTIVATE/);
    expect(r.recommendation).toMatch(/anti-pattern/);
    expect(r.line).toMatch(/gauge-gap-miner=off, deferred-watcher=off/);
    expect(r.line).toMatch(/unpromoted roadmap_wave_items: 42/);
  });

  it('OFF engine + 0 backlog → manual sourcing is appropriate (no false activate nudge)', () => {
    const r = formatSourcingAwareness({
      flags: [{ label: 'gauge-gap-miner', enabled: false }, { label: 'deferred-watcher', enabled: false }],
      unpromotedCount: 0,
    });
    expect(r.recommendation).toMatch(/genuinely empty/);
    expect(r.recommendation).not.toMatch(/ACTIVATE/);
  });

  it('engine ON + backlog → let the engine promote/distill before a hand-ask', () => {
    const r = formatSourcingAwareness({
      flags: [{ label: 'gauge-gap-miner', enabled: true }, { label: 'deferred-watcher', enabled: false }],
      unpromotedCount: 10,
    });
    expect(r.anyOn).toBe(true);
    expect(r.allOn).toBe(false);
    expect(r.recommendation).toMatch(/let the engine promote\/distill/);
  });

  it('engine ON + 0 backlog → belt-low is real worker demand', () => {
    const r = formatSourcingAwareness({
      flags: [{ label: 'gauge-gap-miner', enabled: true }, { label: 'deferred-watcher', enabled: true }],
      unpromotedCount: 0,
    });
    expect(r.allOn).toBe(true);
    expect(r.recommendation).toMatch(/real worker demand/);
  });

  it('unknown count (null) is reported as "unknown" and treated as possible-backlog', () => {
    const r = formatSourcingAwareness({
      flags: [{ label: 'gauge-gap-miner', enabled: false }, { label: 'deferred-watcher', enabled: false }],
      unpromotedCount: null,
    });
    expect(r.countStr).toBe('unknown');
    // unknown → safer assumption that backlog may exist → activate framing, not "genuinely empty"
    expect(r.recommendation).toMatch(/ACTIVATE/);
  });

  it('handles empty flags array without throwing', () => {
    const r = formatSourcingAwareness({ flags: [], unpromotedCount: 5 });
    expect(r.flagStr).toBe('none');
    expect(r.anyOn).toBe(false);
  });

  it('defaults gracefully with no arguments', () => {
    const r = formatSourcingAwareness();
    expect(r.countStr).toBe('unknown');
    expect(r.flagStr).toBe('none');
  });
});

// SD-LEO-INFRA-SOURCING-FLAG-STATE-FROM-DEPLOYMENT-001
describe('SOURCING_ENGINE_FLAGS — FR-2 registers all three arms', () => {
  it('includes gauge-gap-miner, deferred-watcher, AND auto-refill', () => {
    const labels = SOURCING_ENGINE_FLAGS.map((f) => f.label);
    expect(labels).toContain('gauge-gap-miner');
    expect(labels).toContain('deferred-watcher');
    expect(labels).toContain('auto-refill');
    const autoRefill = SOURCING_ENGINE_FLAGS.find((f) => f.label === 'auto-refill');
    expect(autoRefill.env).toBe('SOURCING_AUTO_REFILL_V1');
  });
});

describe('readSourcingEngineFlagsFromDb — FR-1/FR-5 (DB source of truth, independent of process.env)', () => {
  it('derives ON for an arm whose activation-state row is enabled, OFF when disabled — IGNORING process.env', async () => {
    // process.env says everything OFF; the DB says gauge-gap-miner ON, deferred-watcher OFF.
    const env = { SOURCING_GAUGE_GAP_MINER_V1: 'off', SOURCING_DEFERRED_WATCHER_V1: 'off', SOURCING_AUTO_REFILL_V1: 'off' };
    const sb = fakeSb({ rows: [
      { arm: 'gauge-gap-miner', enabled: true },
      { arm: 'deferred-watcher', enabled: false },
      { arm: 'auto-refill', enabled: true },
    ] });
    const flags = await readSourcingEngineFlagsFromDb(sb, env);
    const byLabel = Object.fromEntries(flags.map((f) => [f.label, f.enabled]));
    expect(byLabel['gauge-gap-miner']).toBe(true);   // DB-on despite env-off
    expect(byLabel['deferred-watcher']).toBe(false); // DB-off
    expect(byLabel['auto-refill']).toBe(true);
    expect(flags.length).toBe(SOURCING_ENGINE_FLAGS.length);
  });

  it('an arm with NO row reads OFF', async () => {
    const sb = fakeSb({ rows: [{ arm: 'gauge-gap-miner', enabled: true }] });
    const flags = await readSourcingEngineFlagsFromDb(sb, {});
    const byLabel = Object.fromEntries(flags.map((f) => [f.label, f.enabled]));
    expect(byLabel['gauge-gap-miner']).toBe(true);
    expect(byLabel['deferred-watcher']).toBe(false);
    expect(byLabel['auto-refill']).toBe(false);
  });

  it('FAIL-OPEN: on a query error (e.g. table absent pre-migration) falls back to the env reader', async () => {
    const env = { SOURCING_GAUGE_GAP_MINER_V1: 'on', SOURCING_DEFERRED_WATCHER_V1: 'off', SOURCING_AUTO_REFILL_V1: 'off' };
    const sb = fakeSb({ selectError: { message: 'relation "sourcing_engine_activation_state" does not exist' } });
    const flags = await readSourcingEngineFlagsFromDb(sb, env);
    const byLabel = Object.fromEntries(flags.map((f) => [f.label, f.enabled]));
    expect(byLabel['gauge-gap-miner']).toBe(true);  // from env fallback
    expect(byLabel['deferred-watcher']).toBe(false);
  });
});

describe('reconcileSourcingArmState — FR-3 idempotent upsert', () => {
  it('upserts the given arm→enabled map and returns the count', async () => {
    const sb = fakeSb({ rows: [{ arm: 'gauge-gap-miner' }, { arm: 'auto-refill' }] });
    const n = await reconcileSourcingArmState(sb, { 'gauge-gap-miner': true, 'auto-refill': true });
    expect(n).toBe(2);
  });
  it('returns 0 for an empty map (no write)', async () => {
    const sb = fakeSb({ rows: [] });
    expect(await reconcileSourcingArmState(sb, {})).toBe(0);
  });
  it('fail-soft: returns 0 on an upsert error (does not throw)', async () => {
    const sb = fakeSb({ upsertError: { message: 'boom' } });
    expect(await reconcileSourcingArmState(sb, { 'auto-refill': true })).toBe(0);
  });
});

// SD-LEO-INFRA-SOURCING-ENGINE-CONSUMPTION-001 (FR-1) — TS-1 through TS-4, TS-2b, TS-3b, TS-8.
describe('diffSourcingArmStateVsDeployment', () => {
  // Read-only mock: select() is genuinely wired; every write-shaped method routes through ONE
  // spy so a real accidental write is caught as a call, not a crash (TESTING finding C7 — the
  // pre-existing fakeSb above exposes no insert/update/delete/rpc at all, so a real write there
  // throws a TypeError rather than failing a zero-call assertion cleanly).
  function fakeReadOnlySb(dbRows) {
    const writeSpy = vi.fn();
    return {
      writeSpy,
      // TESTING sub-agent finding P4 (evidence 3004beaa): from() previously ignored its
      // argument entirely, so a mutant reading a completely wrong table survived every test.
      // Pinned to SOURCING_ACTIVATION_TABLE so that mutant is now caught.
      from(table) {
        if (table !== SOURCING_ACTIVATION_TABLE) {
          return { select: () => ({ limit: () => Promise.resolve({ data: null, error: { message: `unexpected table: ${table}` } }) }) };
        }
        return {
          select: () => ({ limit: () => Promise.resolve({ data: dbRows, error: null }) }),
          upsert: writeSpy, insert: writeSpy, update: writeSpy, delete: writeSpy, rpc: writeSpy,
        };
      },
    };
  }

  // URL-routing fake fetchImpl (TESTING finding C9 pattern), keyed by workflow filename so each
  // arm's fetch can independently succeed, 404, or throw.
  function fakeFetchImpl(responsesByFilename) {
    return vi.fn(async (url) => {
      const filename = url.split('/').pop();
      const entry = responsesByFilename[filename];
      if (entry === undefined) return { ok: false, status: 404, statusText: 'Not Found' };
      if (entry.networkError) throw new Error(entry.networkError);
      return { ok: true, json: async () => ({ state: entry.state }) };
    });
  }

  it('TS-1: reports no mismatch when DB and deployment agree', async () => {
    const sb = fakeReadOnlySb([{ arm: 'auto-refill', enabled: true }]);
    const fetchImpl = fakeFetchImpl({ 'sourcing-auto-refill-cron.yml': { state: 'active' } });
    const result = await diffSourcingArmStateVsDeployment(sb, { token: 't', fetchImpl, forceRefresh: true });
    const autoRefill = result.find((r) => r.arm === 'auto-refill');
    expect(autoRefill.db_state).toBe(true);
    expect(autoRefill.deployment_state).toBe('active');
    expect(autoRefill.mismatched).toBe(false);
  });

  it('TS-2: reports a mismatch when DB says enabled but deployment is disabled_manually', async () => {
    const sb = fakeReadOnlySb([{ arm: 'gauge-gap-miner', enabled: true }]);
    const fetchImpl = fakeFetchImpl({ 'sourcing-gauge-gap-miner-cron.yml': { state: 'disabled_manually' } });
    const result = await diffSourcingArmStateVsDeployment(sb, { token: 't', fetchImpl, forceRefresh: true });
    const ggm = result.find((r) => r.arm === 'gauge-gap-miner');
    expect(ggm.db_state).toBe(true);
    expect(ggm.deployment_state).toBe('disabled_manually');
    expect(ggm.mismatched).toBe(true);
  });

  it('TS-2b: reports the REVERSE mismatch direction — DB off/no-row but deployment active', async () => {
    const sb = fakeReadOnlySb([]); // no row for auto-refill at all
    const fetchImpl = fakeFetchImpl({ 'sourcing-auto-refill-cron.yml': { state: 'active' } });
    const result = await diffSourcingArmStateVsDeployment(sb, { token: 't', fetchImpl, forceRefresh: true });
    const autoRefill = result.find((r) => r.arm === 'auto-refill');
    expect(autoRefill.db_state).toBe('no_row');
    expect(autoRefill.deployment_state).toBe('active');
    expect(autoRefill.mismatched).toBe(true);
  });

  it('TS-2c: reverse mismatch with an EXPLICIT false row (not just no_row) — DB off, deployment active', async () => {
    // TESTING sub-agent finding P2 (evidence 3004beaa): TS-2b only fixtured the no_row case; a
    // mutant that special-cased "byArm always true" survived because no fixture ever set
    // enabled=false explicitly. This is the distinct case: a REAL row exists and says false.
    const sb = fakeReadOnlySb([{ arm: 'auto-refill', enabled: false }]);
    const fetchImpl = fakeFetchImpl({ 'sourcing-auto-refill-cron.yml': { state: 'active' } });
    const result = await diffSourcingArmStateVsDeployment(sb, { token: 't', fetchImpl, forceRefresh: true });
    const autoRefill = result.find((r) => r.arm === 'auto-refill');
    expect(autoRefill.db_state).toBe(false);
    expect(autoRefill.deployment_state).toBe('active');
    expect(autoRefill.mismatched).toBe(true);
  });

  it('TS-3c: a non-active, non-disabled_manually deployment state (disabled_inactivity) still reports a mismatch', async () => {
    // TESTING sub-agent finding P3 (evidence 3004beaa): a mutant computing deployBool as
    // `state !== 'disabled_manually'` (instead of `state === 'active'`) survived every prior
    // test, because none exercised the third real GitHub Actions state -- disabled_inactivity --
    // documented in this function's own JSDoc as handled but never fixtured. Under that mutant,
    // an inactivity-disabled cron reads as "active" and a real mismatch goes unreported.
    const sb = fakeReadOnlySb([{ arm: 'deferred-watcher', enabled: true }]);
    const fetchImpl = fakeFetchImpl({ 'sourcing-deferred-watcher-cron.yml': { state: 'disabled_inactivity' } });
    const result = await diffSourcingArmStateVsDeployment(sb, { token: 't', fetchImpl, forceRefresh: true });
    const dw = result.find((r) => r.arm === 'deferred-watcher');
    expect(dw.deployment_state).toBe('disabled_inactivity');
    expect(dw.mismatched).toBe(true);
  });

  it('TS-3: distinguishes API-unreachable from a 404 as different facts, never silently clean', async () => {
    const sb = fakeReadOnlySb([{ arm: 'gauge-gap-miner', enabled: true }, { arm: 'deferred-watcher', enabled: true }]);
    const fetchImpl = fakeFetchImpl({
      'sourcing-gauge-gap-miner-cron.yml': { networkError: 'ECONNRESET' },
      // deferred-watcher.yml deliberately absent -> the fake returns 404
    });
    const result = await diffSourcingArmStateVsDeployment(sb, { token: 't', fetchImpl, forceRefresh: true });
    const ggm = result.find((r) => r.arm === 'gauge-gap-miner');
    const dw = result.find((r) => r.arm === 'deferred-watcher');
    expect(ggm.deployment_state).toBe('unknown');
    expect(ggm.deployment_error).toMatch(/ECONNRESET/);
    expect(ggm.mismatched).toBeNull();
    expect(dw.deployment_state).toBe('unknown');
    expect(dw.deployment_error).toMatch(/404/);
    expect(dw.mismatched).toBeNull();
    expect(ggm.deployment_error).not.toBe(dw.deployment_error); // distinct facts, not collapsed
  });

  it('TS-3b: "no DB row + workflow active" is its own state, not coerced to false', async () => {
    const sb = fakeReadOnlySb([]); // no row for deferred-watcher
    const fetchImpl = fakeFetchImpl({ 'sourcing-deferred-watcher-cron.yml': { state: 'active' } });
    const result = await diffSourcingArmStateVsDeployment(sb, { token: 't', fetchImpl, forceRefresh: true });
    const dw = result.find((r) => r.arm === 'deferred-watcher');
    expect(dw.db_state).toBe('no_row');
    expect(dw.db_state).not.toBe(false);
  });

  it('TS-4: never writes to sourcing_engine_activation_state', async () => {
    const sb = fakeReadOnlySb([{ arm: 'auto-refill', enabled: true }]);
    const fetchImpl = fakeFetchImpl({ 'sourcing-auto-refill-cron.yml': { state: 'active' } });
    await diffSourcingArmStateVsDeployment(sb, { token: 't', fetchImpl, forceRefresh: true });
    expect(sb.writeSpy).not.toHaveBeenCalled();
  });

  it('TR-1: caches the result across calls within the TTL (fetchImpl not re-invoked)', async () => {
    const sb = fakeReadOnlySb([{ arm: 'auto-refill', enabled: true }]);
    const fetchImpl = fakeFetchImpl({ 'sourcing-auto-refill-cron.yml': { state: 'active' } });
    let t = 1000;
    const now = () => t;
    await diffSourcingArmStateVsDeployment(sb, { token: 't', fetchImpl, now, forceRefresh: true });
    const callsAfterFirst = fetchImpl.mock.calls.length;
    t += 60_000; // well within the 15-minute TTL
    await diffSourcingArmStateVsDeployment(sb, { token: 't', fetchImpl, now });
    expect(fetchImpl.mock.calls.length).toBe(callsAfterFirst); // no new calls — served from cache
  });

  it('no token: every arm reports unknown with a no_token error, never a silent clean match', async () => {
    const sb = fakeReadOnlySb([{ arm: 'auto-refill', enabled: true }]);
    const fetchImpl = vi.fn();
    const result = await diffSourcingArmStateVsDeployment(sb, { token: '', fetchImpl, forceRefresh: true });
    expect(result.every((r) => r.deployment_state === 'unknown' && r.deployment_error === 'no_token' && r.mismatched === null)).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

// TS-7 (live smoke test): deliberately NOT a vitest test in this file. The `unit` project's
// Supabase client refuses live network by design (UNIT_TIER_NETWORK_REFUSED, confirmed live
// during this SD's own EXEC phase -- the same class of finding TESTING flagged for TS-5/C2:
// asserting live state from the unit tier is dead-by-construction). See
// scripts/one-off/verify-sourcing-activation-reconciler-live.mjs (US-002) for the live
// verification instead, and docs/sourcing-engine-activation-runbook.md's FR-6 "Live observation"
// note for the recorded evidence.

describe('fetchWorkflowState', () => {
  it('returns the raw state field on a successful response', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ state: 'disabled_manually' }) }));
    const state = await fetchWorkflowState('rickfelix/EHG_Engineer', 'sourcing-auto-refill-cron.yml', 't', { fetchImpl });
    expect(state).toBe('disabled_manually');
  });
  it('throws on a non-OK response', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 404, statusText: 'Not Found' }));
    await expect(fetchWorkflowState('rickfelix/EHG_Engineer', 'x.yml', 't', { fetchImpl })).rejects.toThrow(/404/);
  });
});
