/**
 * FR-C generator cron entrypoint tests.
 *
 * SD: SD-LEO-INFRA-FIX-FR-C-CRON-DROP-POOLER-001
 *
 * Covers the post-SUPABASE_POOLER_URL refactor: the script now claims a TTL
 * row in cron_run_locks via the try_claim_cron_lock RPC instead of taking a
 * session-scoped pg_advisory_lock. These tests verify the lock-contention
 * branch (no-op + audit) and the lock-acquired branch (generator invoked,
 * release_cron_lock called with the same owner).
 *
 * Pure unit: mocks the sd-generator and supabase client at the import boundary,
 * no DB or network needed.
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';

// Mock the sd-generator BEFORE importing the cron entrypoint so the cron's
// `import { generateRemediationSdsBatch, writeAuditLog } from '...sd-generator.js'`
// resolves to these spies.
const generateRemediationSdsBatchSpy = vi.fn();
const writeAuditLogSpy = vi.fn();
vi.mock('../../../../lib/eva/quality-findings/sd-generator.js', () => ({
  generateRemediationSdsBatch: (...args) => generateRemediationSdsBatchSpy(...args),
  writeAuditLog: (...args) => writeAuditLogSpy(...args),
}));

// SD-LEO-INFRA-SOURCING-ENGINE-BELT-GATED-001 (FR-2): the demand gate is consulted BEFORE the
// generator runs, so every test in this file now has to state which belt condition it describes.
// Only the IO half is mocked — measureDemand reads the live gauge and cannot run here. mayProduce
// and formatDemandDecision are deliberately left REAL: mocking the permission logic itself would
// leave the thing under test unexercised.
const measureDemandSpy = vi.fn();
const recordDemandDecisionSpy = vi.fn();
vi.mock('../../../../lib/governance/demand-gate-emit.js', () => ({
  measureDemand: (...args) => measureDemandSpy(...args),
  recordDemandDecision: (...args) => recordDemandDecisionSpy(...args),
  resolveDemandFloor: () => 3,
}));

// Stub the supabase-js client so buildSupabase() doesn't need real env wiring.
// We construct the supabase shape inline per test and pass it through runOnce.
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({})),
}));

const cronModule = await import('../../../../scripts/cron/fr-c-generator.mjs');
const { runOnce, computeLockTtlSec, LOCK_NAME, tryClaimLock, releaseLock } = cronModule;
const { decideDemand, normalizeGaugeReading } = await import('../../../../lib/governance/demand-gate.js');

function makeSupabaseMock(rpcResponses) {
  // rpcResponses: Map<rpcName, () => { data, error }>
  const rpc = vi.fn((name, _params) => {
    const responder = rpcResponses.get(name);
    if (!responder) throw new Error(`unmocked rpc: ${name}`);
    return Promise.resolve(responder());
  });
  return { rpc, _rpc: rpc };
}

// Built with the REAL decider so these fixtures cannot drift from the shape production emits.
const STARVED = decideDemand(normalizeGaugeReading(0), 3, { engine: 'fr-c-generator' });
const FULL = decideDemand(normalizeGaugeReading(11), 3, { engine: 'fr-c-generator' });
const BLIND = decideDemand(normalizeGaugeReading(null), 3, { engine: 'fr-c-generator' });

describe('fr-c-generator cron — lock primitive', () => {
  beforeEach(() => {
    generateRemediationSdsBatchSpy.mockReset();
    writeAuditLogSpy.mockReset();
    // Default: a STARVED belt — the condition under which this cron is supposed to produce. The
    // pre-existing success/throw tests below describe that world and are unchanged by the gate.
    measureDemandSpy.mockReset().mockResolvedValue(STARVED);
    recordDemandDecisionSpy.mockReset().mockResolvedValue(true);
  });

  test('computeLockTtlSec floors at 600s and otherwise returns 2x interval', () => {
    expect(computeLockTtlSec(60)).toBe(600);     // floor wins
    expect(computeLockTtlSec(300)).toBe(600);    // floor wins
    expect(computeLockTtlSec(3600)).toBe(7200);  // 2x interval wins
    expect(computeLockTtlSec(86400)).toBe(172800);
  });

  test('tryClaimLock surfaces the boolean from try_claim_cron_lock RPC', async () => {
    const supabase = makeSupabaseMock(new Map([
      ['try_claim_cron_lock', () => ({ data: true, error: null })],
    ]));
    await expect(tryClaimLock(supabase, 'owner-uuid-1', 600)).resolves.toBe(true);
    expect(supabase._rpc).toHaveBeenCalledWith('try_claim_cron_lock', {
      p_name: LOCK_NAME,
      p_owner: 'owner-uuid-1',
      p_ttl_seconds: 600,
    });
  });

  test('tryClaimLock throws when RPC returns an error', async () => {
    const supabase = makeSupabaseMock(new Map([
      ['try_claim_cron_lock', () => ({ data: null, error: { message: 'boom' } })],
    ]));
    await expect(tryClaimLock(supabase, 'owner-uuid-1', 600)).rejects.toThrow(/try_claim_cron_lock RPC failed: boom/);
  });

  test('runOnce no-ops when lock is held by another tick', async () => {
    const supabase = makeSupabaseMock(new Map([
      ['try_claim_cron_lock', () => ({ data: false, error: null })],
    ]));

    const result = await runOnce({
      args: { dryRun: false, daemon: false },
      supabase,
      owner: 'owner-uuid-other-tick',
      ttlSec: 7200,
    });

    expect(result).toEqual({ exitCode: 0, summary: { lockHeld: true } });
    // Generator must NOT be invoked when contention is detected.
    expect(generateRemediationSdsBatchSpy).not.toHaveBeenCalled();
    // Audit must be written with event=lock_held and the correct payload.
    expect(writeAuditLogSpy).toHaveBeenCalledWith(
      supabase,
      'lock_held',
      expect.objectContaining({ lock_name: LOCK_NAME, owner: 'owner-uuid-other-tick' }),
      expect.objectContaining({ entityType: 'fr_c_generator_run', entityId: LOCK_NAME, severity: 'info' }),
    );
    // We did NOT acquire the lock, so we must NOT call release_cron_lock.
    const rpcCalls = supabase._rpc.mock.calls.map((c) => c[0]);
    expect(rpcCalls).toEqual(['try_claim_cron_lock']);
  });

  test('runOnce invokes generator and releases lock on the success path', async () => {
    generateRemediationSdsBatchSpy.mockResolvedValue({
      ventures: ['v1'], totalCreated: 1, totalAppended: 0, totalSkippedRateLimited: 0, totalErrors: 0, perVenture: { v1: { created: 1 } },
    });
    const supabase = makeSupabaseMock(new Map([
      ['try_claim_cron_lock', () => ({ data: true, error: null })],
      ['release_cron_lock', () => ({ data: true, error: null })],
    ]));

    const result = await runOnce({
      args: { dryRun: false, daemon: false },
      supabase,
      owner: 'owner-uuid-this-tick',
      ttlSec: 7200,
    });

    expect(result.exitCode).toBe(0);
    expect(result.summary.totalCreated).toBe(1);
    expect(generateRemediationSdsBatchSpy).toHaveBeenCalledTimes(1);
    expect(writeAuditLogSpy).not.toHaveBeenCalled(); // success path doesn't audit on its own
    // Both RPCs must be called: claim then release with the same owner.
    const rpcCalls = supabase._rpc.mock.calls;
    expect(rpcCalls[0]).toEqual(['try_claim_cron_lock', { p_name: LOCK_NAME, p_owner: 'owner-uuid-this-tick', p_ttl_seconds: 7200 }]);
    expect(rpcCalls[1]).toEqual(['release_cron_lock',  { p_name: LOCK_NAME, p_owner: 'owner-uuid-this-tick' }]);
  });

  test('runOnce releases lock and audits when generator throws', async () => {
    generateRemediationSdsBatchSpy.mockRejectedValue(new Error('generator boom'));
    const supabase = makeSupabaseMock(new Map([
      ['try_claim_cron_lock', () => ({ data: true, error: null })],
      ['release_cron_lock', () => ({ data: true, error: null })],
    ]));

    const result = await runOnce({
      args: { dryRun: false, daemon: false },
      supabase,
      owner: 'owner-uuid-this-tick',
      ttlSec: 7200,
    });

    expect(result.exitCode).toBe(1);
    expect(result.summary.error).toBe('generator boom');
    // Audit captures generator_failed.
    expect(writeAuditLogSpy).toHaveBeenCalledWith(
      supabase,
      'generator_failed',
      expect.objectContaining({ error: 'generator boom' }),
      expect.objectContaining({ entityType: 'fr_c_generator_run', entityId: LOCK_NAME, severity: 'error' }),
    );
    // Release MUST still be called via finally{}.
    const rpcNames = supabase._rpc.mock.calls.map((c) => c[0]);
    expect(rpcNames).toContain('release_cron_lock');
  });

  test('releaseLock swallows RPC errors so finally{} cannot mask the original failure', async () => {
    const supabase = makeSupabaseMock(new Map([
      ['release_cron_lock', () => ({ data: null, error: { message: 'release exploded' } })],
    ]));
    // Should not throw despite the RPC error response.
    await expect(releaseLock(supabase, 'owner-uuid-1')).resolves.toBeUndefined();
  });
});

// ── SD-LEO-INFRA-SOURCING-ENGINE-BELT-GATED-001 (FR-2): belt-depth demand gate ────────────────
// This generator inserts status='draft', unclaimed SDs (sd-generator.js:632-654) — rows the
// dispatchable gauge counts one-for-one — so it mints belt depth and is gated.
describe('fr-c-generator cron — demand gate', () => {
  const lockedSupabase = () => makeSupabaseMock(new Map([
    ['try_claim_cron_lock', () => ({ data: true, error: null })],
    ['release_cron_lock', () => ({ data: true, error: null })],
  ]));
  const run = (supabase) => runOnce({
    args: { dryRun: false, daemon: false }, supabase, owner: 'owner-uuid-this-tick', ttlSec: 7200,
  });

  beforeEach(() => {
    generateRemediationSdsBatchSpy.mockReset().mockResolvedValue({
      ventures: ['v1'], totalCreated: 1, totalAppended: 0, totalSkippedRateLimited: 0, totalErrors: 0, perVenture: {},
    });
    writeAuditLogSpy.mockReset();
    measureDemandSpy.mockReset().mockResolvedValue(STARVED);
    recordDemandDecisionSpy.mockReset().mockResolvedValue(true);
  });

  test('DIFFERENTIAL — identical run, only the belt differs, and the generator runs or does not', async () => {
    measureDemandSpy.mockResolvedValue(STARVED);
    await run(lockedSupabase());
    const whenStarved = generateRemediationSdsBatchSpy.mock.calls.length;

    generateRemediationSdsBatchSpy.mockClear();
    measureDemandSpy.mockResolvedValue(FULL);
    await run(lockedSupabase());
    const whenFull = generateRemediationSdsBatchSpy.mock.calls.length;

    expect(whenStarved).toBe(1);
    expect(whenFull).toBe(0);   // the load-bearing assertion
  });

  test('a withheld run still RELEASES THE LOCK — staying quiet must not fence the next tick out', async () => {
    // The failure this catches is nastier than over-production: an early return that skipped
    // finally{} would leave a TTL lock held, so the cron stays silent long after the belt drains,
    // and the silence looks exactly like a correctly-withholding gate.
    measureDemandSpy.mockResolvedValue(FULL);
    const supabase = lockedSupabase();
    const result = await run(supabase);

    expect(result.exitCode).toBe(0);
    expect(result.summary.withheldByDemand).toBe(true);
    expect(supabase._rpc.mock.calls.map((c) => c[0])).toContain('release_cron_lock');
  });

  test('an UNMEASURABLE gauge withholds — a gauge we could not read is not a licence to mint', async () => {
    measureDemandSpy.mockResolvedValue(BLIND);
    const result = await run(lockedSupabase());
    expect(generateRemediationSdsBatchSpy).not.toHaveBeenCalled();
    expect(result.summary.demand.decision).toBe('unmeasurable');
  });

  test('the decision is RECORDED on every run, produced or not', async () => {
    // Recording only the interesting runs is how a withheld tick becomes indistinguishable from a
    // tick that never fired — the ambiguity this SD exists to remove.
    measureDemandSpy.mockResolvedValue(FULL);
    await run(lockedSupabase());
    expect(recordDemandDecisionSpy).toHaveBeenCalledTimes(1);

    recordDemandDecisionSpy.mockClear();
    measureDemandSpy.mockResolvedValue(STARVED);
    await run(lockedSupabase());
    expect(recordDemandDecisionSpy).toHaveBeenCalledTimes(1);
  });

  test('the demand verdict travels in the run summary, so the cron log carries its own evidence', async () => {
    measureDemandSpy.mockResolvedValue(STARVED);
    const result = await run(lockedSupabase());
    expect(result.summary.demand).toMatchObject({ engine: 'fr-c-generator', gauge_value: 0, floor: 3, decision: 'sourced' });
  });
});
