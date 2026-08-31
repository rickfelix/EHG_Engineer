/**
 * SD-LEO-INFRA-COMPLETION-GATE-DATA-001-A — FR-5 wiring test: the SD completion path
 * (scripts/hooks/stop-subagent-enforcement/post-completion-validator.js) exercises the
 * SAME positive/negative readback behavior as the QF path (TS-5), plus TS-6 (bypass),
 * TS-8 (malformed always hard-refuses), and TS-9 (infra failure never blocks).
 *
 * validatePostCompletion() reads sd.metadata.data_claim (the SD row is already fetched
 * with status='completed' by this hook's caller — this check runs POST-write). Mocks
 * lib/supabase-client.js's createSupabaseServiceClient (the seam verifyReadback() uses
 * internally) separately from the `supabase` param validatePostCompletion itself takes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockCreateServiceClient } = vi.hoisted(() => ({ mockCreateServiceClient: vi.fn() }));
vi.mock('../../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: (...args) => mockCreateServiceClient(...args),
}));

import { validatePostCompletion } from '../../../scripts/hooks/stop-subagent-enforcement/post-completion-validator.js';
import { correctWriteFixture, fenceNoOpFixture } from '../../../lib/checkers/readback-fixtures.mjs';

function readbackClientReturning(rows) {
  return {
    from: () => ({
      select: () => ({
        match: () => Promise.resolve({ data: rows, error: null }),
      }),
    }),
  };
}

/** Minimal validator-supabase: every table query resolves to an empty result set, and
 * the completion-flags witness feedback query resolves to an already-satisfied record so
 * only the readback-gate advisory under test is asserted. */
function buildValidatorSupabase() {
  const chain = {
    select: () => chain,
    eq: () => chain,
    ilike: () => chain,
    order: () => chain,
    limit: () => Promise.resolve({ data: [], error: null }),
    then: (resolve) => resolve({
      data: [{ id: 'fb-1', metadata: { reflection: { checklist_items: 1 } } }],
      error: null,
    }),
  };
  return { from: () => chain };
}

const sd = {
  id: 'sd-uuid-1',
  sd_key: 'SD-TEST-READBACK-001',
  sd_type: 'infrastructure',
  completion_date: '2026-08-31T00:00:00Z',
};

let exitSpy, errSpy, logSpy;
beforeEach(() => {
  mockCreateServiceClient.mockReset();
  exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('UNEXPECTED_EXIT'); });
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  exitSpy.mockRestore(); errSpy.mockRestore(); logSpy.mockRestore();
  vi.restoreAllMocks();
});

describe('TS-6: SD completion with no metadata.data_claim bypasses the readback gate', () => {
  it('does not touch the readback client and does not block', async () => {
    const supabase = buildValidatorSupabase();
    await validatePostCompletion(supabase, { ...sd, metadata: {} }, sd.sd_key);
    expect(mockCreateServiceClient).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });
});

describe('TS-5: SD path positive control — a genuine underlying write passes unchanged', () => {
  it('does not block and does not surface a readback advisory', async () => {
    const { intendedRow, persistedRow } = correctWriteFixture();
    mockCreateServiceClient.mockReturnValue(readbackClientReturning([persistedRow]));
    const supabase = buildValidatorSupabase();
    await validatePostCompletion(supabase, {
      ...sd,
      metadata: {
        data_claim: {
          table: 'sub_agent_execution_results',
          match: { id: intendedRow.id },
          expectedFields: { verdict: intendedRow.verdict },
        },
      },
    }, sd.sd_key);
    expect(exitSpy).not.toHaveBeenCalled();
    const advisories = errSpy.mock.calls.map((c) => String(c[0])).join('\n');
    // NOTE: the sd_key itself ("SD-TEST-READBACK-001") contains the substring
    // "READBACK", so this asserts against the specific advisory tokens rather than a
    // bare /READBACK/ match.
    expect(advisories).not.toMatch(/READBACK_WOULD_HAVE_BLOCKED|READBACK_UNVERIFIABLE|READBACK_CLAIM_MALFORMED|READBACK_GATE_BLOCKED/);
  });
});

describe('TS-5: SD path negative — LEO_READBACK_GATE_ENABLED=true blocks a fence no-op claim', () => {
  const ENV_BAK = process.env.LEO_READBACK_GATE_ENABLED;
  beforeEach(() => { process.env.LEO_READBACK_GATE_ENABLED = 'true'; });
  afterEach(() => {
    if (ENV_BAK === undefined) delete process.env.LEO_READBACK_GATE_ENABLED;
    else process.env.LEO_READBACK_GATE_ENABLED = ENV_BAK;
  });

  it('escalates into missingRequired and exits(2)', async () => {
    const { intendedRow } = fenceNoOpFixture();
    mockCreateServiceClient.mockReturnValue(readbackClientReturning([]));
    const supabase = buildValidatorSupabase();
    await expect(validatePostCompletion(supabase, {
      ...sd,
      metadata: {
        data_claim: {
          table: 'sub_agent_execution_results',
          match: { id: intendedRow.id },
          expectedFields: { verdict: intendedRow.verdict },
        },
      },
    }, sd.sd_key)).rejects.toThrow('UNEXPECTED_EXIT');
    expect(exitSpy).toHaveBeenCalledWith(2);
  });
});

describe('TS-8: SD path — a malformed claim always hard-refuses, kill-switch OFF', () => {
  it('exits(2) with READBACK_CLAIM_MALFORMED, without ever constructing the readback client', async () => {
    const supabase = buildValidatorSupabase();
    await expect(validatePostCompletion(supabase, {
      ...sd,
      metadata: { data_claim: { table: 'x', match: { id: 1 } } }, // missing expectedFields
    }, sd.sd_key)).rejects.toThrow('UNEXPECTED_EXIT');
    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(mockCreateServiceClient).not.toHaveBeenCalled();
    const output = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('READBACK_CLAIM_MALFORMED');
  });
});

describe('TS-9: SD path — verifyReadback() infra failure never blocks', () => {
  it('surfaces READBACK_UNVERIFIABLE as an advisory instead of exiting', async () => {
    mockCreateServiceClient.mockImplementation(() => { throw new Error('client construction failed'); });
    const supabase = buildValidatorSupabase();
    await validatePostCompletion(supabase, {
      ...sd,
      metadata: {
        data_claim: { table: 'sub_agent_execution_results', match: { id: 'x' }, expectedFields: { verdict: 'PASS' } },
      },
    }, sd.sd_key);
    expect(exitSpy).not.toHaveBeenCalled();
    const advisories = errSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(advisories).toContain('READBACK_UNVERIFIABLE');
  });
});
