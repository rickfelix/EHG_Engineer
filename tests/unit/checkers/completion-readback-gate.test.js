/**
 * SD-LEO-INFRA-COMPLETION-GATE-DATA-001-A — FR-4/FR-5/FR-6 unit tests for
 * lib/checkers/completion-readback-gate.mjs (TS-3, TS-4, TS-6, TS-7, TS-8, TS-9).
 *
 * TS-5 (SD completion path exercises the same positive/negative behavior) and the
 * QF-path equivalent are covered here at the shared-gate level (both write paths call
 * this exact function — see the static wiring assertions in
 * tests/unit/complete-quick-fix/readback-gate-wiring.test.js and
 * tests/unit/stop-subagent-enforcement/post-completion-validator-readback-gate.test.js),
 * plus reuses the SAME founding fixtures as readback-checker.test.js (FR-6: no new
 * fixtures authored).
 *
 * Mocks the client FACTORY (lib/supabase-client.js createSupabaseServiceClient), same
 * seam as tests/unit/checkers/readback-checker.test.js — verifyReadback's real logic
 * still runs against the mocked return value.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

const { mockCreateClient } = vi.hoisted(() => ({ mockCreateClient: vi.fn() }));
vi.mock('../../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: (...args) => mockCreateClient(...args),
}));

import { applyCompletionReadbackGate, ClaimMalformedError } from '../../../lib/checkers/completion-readback-gate.mjs';
import { ReadbackCheckError } from '../../../lib/checkers/readback-checker.mjs';
import {
  correctWriteFixture,
  fenceNoOpFixture,
} from '../../../lib/checkers/readback-fixtures.mjs';

function mockClientReturning(rows) {
  return {
    from: () => ({
      select: () => ({
        match: () => Promise.resolve({ data: rows, error: null }),
      }),
    }),
  };
}

const ENV_BAK = process.env.LEO_READBACK_GATE_ENABLED;

beforeEach(() => {
  mockCreateClient.mockReset();
  delete process.env.LEO_READBACK_GATE_ENABLED;
});

afterAll(() => {
  if (ENV_BAK === undefined) delete process.env.LEO_READBACK_GATE_ENABLED;
  else process.env.LEO_READBACK_GATE_ENABLED = ENV_BAK;
});

function claimFor(intendedRow) {
  return {
    table: 'sub_agent_execution_results',
    match: { id: intendedRow.id },
    expectedFields: { verdict: intendedRow.verdict },
  };
}

describe('TS-6: no metadata.data_claim at all bypasses the check entirely', () => {
  it('returns BYPASSED and never constructs a Supabase client', async () => {
    const result = await applyCompletionReadbackGate({});
    expect(result).toEqual({ status: 'BYPASSED' });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it('BYPASSED for null/undefined metadata too', async () => {
    expect(await applyCompletionReadbackGate(null)).toEqual({ status: 'BYPASSED' });
    expect(await applyCompletionReadbackGate(undefined)).toEqual({ status: 'BYPASSED' });
  });
});

describe('TS-3: a genuine underlying write with a well-formed claim passes', () => {
  it('resolves PASS when the fixture write is correct', async () => {
    const { intendedRow, persistedRow } = correctWriteFixture();
    mockCreateClient.mockReturnValue(mockClientReturning([persistedRow]));
    const result = await applyCompletionReadbackGate({ data_claim: claimFor(intendedRow) });
    expect(result.status).toBe('PASS');
  });
});

describe('TS-4: LEO_READBACK_GATE_ENABLED=true refuses a well-formed claim with no genuine write (fence no-op)', () => {
  it('throws the underlying ReadbackCheckError (hard block)', async () => {
    process.env.LEO_READBACK_GATE_ENABLED = 'true';
    const { intendedRow } = fenceNoOpFixture();
    mockCreateClient.mockReturnValue(mockClientReturning([]));
    await expect(applyCompletionReadbackGate({ data_claim: claimFor(intendedRow) }))
      .rejects.toBeInstanceOf(ReadbackCheckError);
  });
});

describe('TS-7: LEO_READBACK_GATE_ENABLED unset (default off) — same mismatch warns, does not block', () => {
  it('resolves WOULD_HAVE_BLOCKED instead of throwing', async () => {
    const { intendedRow } = fenceNoOpFixture();
    mockCreateClient.mockReturnValue(mockClientReturning([]));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await applyCompletionReadbackGate({ data_claim: claimFor(intendedRow) });
    expect(result.status).toBe('WOULD_HAVE_BLOCKED');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('READBACK_WOULD_HAVE_BLOCKED'));
    warnSpy.mockRestore();
  });
});

describe('TS-8: a present-but-malformed claim is always hard-refused, regardless of the kill-switch', () => {
  it('throws ClaimMalformedError when a required key is missing (kill-switch OFF)', async () => {
    await expect(applyCompletionReadbackGate({ data_claim: { table: 'x', match: { id: 1 } } }))
      .rejects.toBeInstanceOf(ClaimMalformedError);
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it('throws ClaimMalformedError when a required key is missing (kill-switch ON)', async () => {
    process.env.LEO_READBACK_GATE_ENABLED = 'true';
    await expect(applyCompletionReadbackGate({ data_claim: { match: { id: 1 }, expectedFields: {} } }))
      .rejects.toBeInstanceOf(ClaimMalformedError);
  });

  it('throws ClaimMalformedError when data_claim is not an object', async () => {
    await expect(applyCompletionReadbackGate({ data_claim: 'not-an-object' }))
      .rejects.toBeInstanceOf(ClaimMalformedError);
  });
});

describe('TS-9: verifyReadback() itself cannot execute — infra failure, distinct from a mismatch', () => {
  it('logs READBACK_UNVERIFIABLE and never blocks when the client factory throws (kill-switch OFF)', async () => {
    mockCreateClient.mockImplementation(() => { throw new Error('client construction failed'); });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await applyCompletionReadbackGate({
      data_claim: claimFor({ id: 'x', verdict: 'PASS' }),
    });
    expect(result.status).toBe('UNVERIFIABLE');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('READBACK_UNVERIFIABLE'));
    warnSpy.mockRestore();
  });

  it('logs READBACK_UNVERIFIABLE and never blocks when the client factory throws (kill-switch ON)', async () => {
    process.env.LEO_READBACK_GATE_ENABLED = 'true';
    mockCreateClient.mockImplementation(() => { throw new Error('client construction failed'); });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await applyCompletionReadbackGate({
      data_claim: claimFor({ id: 'x', verdict: 'PASS' }),
    });
    expect(result.status).toBe('UNVERIFIABLE');
    warnSpy.mockRestore();
  });

  it('logs READBACK_UNVERIFIABLE (not a rowcount mismatch) when the query itself errors (e.g. timeout)', async () => {
    mockCreateClient.mockReturnValue({
      from: () => ({
        select: () => ({
          match: () => Promise.resolve({ data: null, error: { message: 'timeout' } }),
        }),
      }),
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await applyCompletionReadbackGate({
      data_claim: claimFor({ id: 'x', verdict: 'PASS' }),
    });
    expect(result.status).toBe('UNVERIFIABLE');
    warnSpy.mockRestore();
  });
});
