/**
 * SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001 FR-4 (SECURITY finding SEC-H1) -- ledger-execution-mode-
 * probe.js, mirroring lib/eva/stage-write-token-probe.js's proven pattern for a chairman-gated
 * column that may ship un-applied for an indeterminate period. Every writer must degrade
 * gracefully, never error.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  probeExecutionModeExists,
  executionModeField,
  __resetExecutionModeProbeForTests,
} from '../../../lib/marketing/ledger-execution-mode-probe.js';

beforeEach(() => {
  __resetExecutionModeProbeForTests();
});

function makeSupabase(error) {
  return {
    from: () => ({ select: () => ({ limit: () => Promise.resolve({ data: error ? null : [], error }) }) }),
  };
}

describe('probeExecutionModeExists', () => {
  it('returns true when the select succeeds (column present)', async () => {
    expect(await probeExecutionModeExists(makeSupabase(null))).toBe(true);
  });

  it('returns false on 42703 (Postgres undefined_column)', async () => {
    expect(await probeExecutionModeExists(makeSupabase({ code: '42703', message: 'column "execution_mode" does not exist' }))).toBe(false);
  });

  it('returns false on PGRST204 (PostgREST schema-cache miss)', async () => {
    expect(await probeExecutionModeExists(makeSupabase({ code: 'PGRST204', message: 'schema cache' }))).toBe(false);
  });

  it('returns false (uncached) on an unrelated error, and retries fresh next call', async () => {
    const flaky = makeSupabase({ code: 'ECONNRESET', message: 'network blip' });
    expect(await probeExecutionModeExists(flaky)).toBe(false);
    expect(await probeExecutionModeExists(makeSupabase(null))).toBe(true);
  });

  it('caches a confirmed "absent" result across calls, even if supabase would now say present', async () => {
    await probeExecutionModeExists(makeSupabase({ code: '42703', message: 'nope' }));
    expect(await probeExecutionModeExists(makeSupabase(null))).toBe(false);
  });

  it('caches a confirmed "present" result across calls', async () => {
    await probeExecutionModeExists(makeSupabase(null));
    expect(await probeExecutionModeExists(makeSupabase({ code: '42703' }))).toBe(true);
  });

  it('returns false when supabase is missing', async () => {
    expect(await probeExecutionModeExists(null)).toBe(false);
  });

  it('returns false (does not throw) when supabase.from(...).select is not a function', async () => {
    const throwingSupabase = { from: () => ({ insert: () => ({ select: () => ({ single: () => Promise.resolve({ error: null }) }) }) }) };
    await expect(probeExecutionModeExists(throwingSupabase)).resolves.toBe(false);
  });

  it('a thrown exception is not cached -- a subsequent healthy call still flips to true', async () => {
    const throwingSupabase = { from: () => ({}) };
    expect(await probeExecutionModeExists(throwingSupabase)).toBe(false);
    expect(await probeExecutionModeExists(makeSupabase(null))).toBe(true);
  });
});

describe('executionModeField', () => {
  it('returns a spreadable {execution_mode} object when the column exists', async () => {
    expect(await executionModeField(makeSupabase(null), 'live')).toEqual({ execution_mode: 'live' });
  });

  it('returns {} (no-op spread) when the column is absent -- the pre-migration INSERT shape is unaffected', async () => {
    expect(await executionModeField(makeSupabase({ code: '42703' }), 'live')).toEqual({});
  });
});
