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

// Stub the supabase-js client so buildSupabase() doesn't need real env wiring.
// We construct the supabase shape inline per test and pass it through runOnce.
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({})),
}));

const cronModule = await import('../../../../scripts/cron/fr-c-generator.mjs');
const { runOnce, computeLockTtlSec, LOCK_NAME, tryClaimLock, releaseLock } = cronModule;

function makeSupabaseMock(rpcResponses) {
  // rpcResponses: Map<rpcName, () => { data, error }>
  const rpc = vi.fn((name, _params) => {
    const responder = rpcResponses.get(name);
    if (!responder) throw new Error(`unmocked rpc: ${name}`);
    return Promise.resolve(responder());
  });
  return { rpc, _rpc: rpc };
}

describe('fr-c-generator cron — lock primitive', () => {
  beforeEach(() => {
    generateRemediationSdsBatchSpy.mockReset();
    writeAuditLogSpy.mockReset();
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
