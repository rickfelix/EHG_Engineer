/**
 * SD-LEO-FIX-QUICK-FIXES-NEEDS-001: operator-facing not_before setter.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseDeferArgs, validateNotBefore, deferQuickFix } from '../../scripts/defer-quick-fix.js';

describe('parseDeferArgs', () => {
  it('parses QF id, --not-before value, and --reopen flag', () => {
    const parsed = parseDeferArgs(['QF-X', '--not-before', '2026-07-05T21:00:00Z', '--reopen']);
    expect(parsed).toEqual({ showHelp: false, qfId: 'QF-X', notBefore: '2026-07-05T21:00:00Z', reopen: true, reason: null, owner: null, releaseCondition: null });
  });

  it('defaults reopen to false when omitted', () => {
    const parsed = parseDeferArgs(['QF-X', '--not-before', '2026-07-05T21:00:00Z']);
    expect(parsed.reopen).toBe(false);
  });

  it('shows help with no args', () => {
    expect(parseDeferArgs([])).toEqual({ showHelp: true });
  });

  it('shows help with --help', () => {
    expect(parseDeferArgs(['--help'])).toEqual({ showHelp: true });
  });

  it('SD-LEO-INFRA-HOLD-STATE-CONTRACT-001: parses --reason, --owner, --release-condition', () => {
    const parsed = parseDeferArgs(['QF-X', '--not-before', '2026-07-05T21:00:00Z', '--reason', 'waiting on X', '--owner', 'coordinator', '--release-condition', 'X lands']);
    expect(parsed.reason).toBe('waiting on X');
    expect(parsed.owner).toBe('coordinator');
    expect(parsed.releaseCondition).toBe('X lands');
  });
});

describe('validateNotBefore', () => {
  it('accepts a valid ISO-8601 timestamp', () => {
    const result = validateNotBefore('2026-07-05T21:00:00Z');
    expect(result.valid).toBe(true);
    expect(result.iso).toBe('2026-07-05T21:00:00.000Z');
  });

  it('rejects a missing value', () => {
    expect(validateNotBefore(null).valid).toBe(false);
    expect(validateNotBefore(undefined).valid).toBe(false);
  });

  it('rejects an unparseable string', () => {
    const result = validateNotBefore('not-a-date');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/could not parse/);
  });
});

describe('deferQuickFix', () => {
  function makeSupabaseStub(returnData, returnError = null) {
    const update = vi.fn().mockReturnThis();
    const eq = vi.fn().mockReturnThis();
    const select = vi.fn().mockReturnThis();
    const single = vi.fn().mockResolvedValue({ data: returnData, error: returnError });
    return {
      client: { from: () => ({ update, eq, select, single }) },
      update, eq, select, single,
    };
  }

  it('rejects an invalid --not-before before touching the database', async () => {
    await expect(deferQuickFix('QF-X', 'garbage', {})).rejects.toThrow(/could not parse/);
  });

  it('updates not_before (and not status) when reopen is not set', async () => {
    const stub = makeSupabaseStub({ id: 'QF-X', status: 'escalated', not_before: '2026-07-05T21:00:00.000Z' });
    const result = await deferQuickFix('QF-X', '2026-07-05T21:00:00Z', { supabaseClient: stub.client });
    expect(stub.update).toHaveBeenCalledWith({ not_before: '2026-07-05T21:00:00.000Z' });
    expect(result.id).toBe('QF-X');
  });

  it('updates both not_before and status=open when reopen=true', async () => {
    const stub = makeSupabaseStub({ id: 'QF-X', status: 'open', not_before: '2026-07-05T21:00:00.000Z' });
    await deferQuickFix('QF-X', '2026-07-05T21:00:00Z', { reopen: true, supabaseClient: stub.client });
    expect(stub.update).toHaveBeenCalledWith({ not_before: '2026-07-05T21:00:00.000Z', status: 'open' });
  });

  it('throws when the row is not found', async () => {
    const stub = makeSupabaseStub(null, null);
    await expect(deferQuickFix('QF-MISSING', '2026-07-05T21:00:00Z', { supabaseClient: stub.client }))
      .rejects.toThrow(/not found/);
  });

  it('throws with the Supabase error message on a write failure', async () => {
    const stub = makeSupabaseStub(null, { message: 'permission denied' });
    await expect(deferQuickFix('QF-X', '2026-07-05T21:00:00Z', { supabaseClient: stub.client }))
      .rejects.toThrow(/permission denied/);
  });
});

describe('deferQuickFix — far-future park requires release-condition (QF-20260720-137)', () => {
  function makeSupabaseStub(returnData, returnError = null) {
    const update = vi.fn().mockReturnThis();
    const eq = vi.fn().mockReturnThis();
    const select = vi.fn().mockReturnThis();
    const single = vi.fn().mockResolvedValue({ data: returnData, error: returnError });
    return { client: { from: () => ({ update, eq, select, single }) }, update, eq, select, single };
  }

  function daysFromNowIso(days) {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  }

  it('rejects a >30-day park with no --release-condition before any DB write', async () => {
    const stub = makeSupabaseStub({ id: 'QF-X' });
    await expect(deferQuickFix('QF-X', daysFromNowIso(60), { supabaseClient: stub.client }))
      .rejects.toThrow(/FAR_FUTURE_PARK_REQUIRES_RELEASE_CONDITION|release-condition/);
    expect(stub.update).not.toHaveBeenCalled();
  });

  it('allows a >30-day park when --release-condition is provided', async () => {
    const stub = makeSupabaseStub({ id: 'QF-X', status: 'open', not_before: daysFromNowIso(60) });
    await expect(deferQuickFix('QF-X', daysFromNowIso(60), {
      releaseCondition: 'sibling SD ships', supabaseClient: stub.client,
    })).resolves.toMatchObject({ id: 'QF-X' });
  });

  it('does not require --release-condition for a near-future (<=30 day) park', async () => {
    const stub = makeSupabaseStub({ id: 'QF-X', status: 'open', not_before: daysFromNowIso(5) });
    await expect(deferQuickFix('QF-X', daysFromNowIso(5), { supabaseClient: stub.client }))
      .resolves.toMatchObject({ id: 'QF-X' });
  });
});

describe('deferQuickFix — hold-state contract (SD-LEO-INFRA-HOLD-STATE-CONTRACT-001)', () => {
  const ORIGINAL = process.env.HOLD_STATE_CONTRACT_MODE;
  afterEach(() => { process.env.HOLD_STATE_CONTRACT_MODE = ORIGINAL; });

  function makeSupabaseStub(returnData, returnError = null) {
    const update = vi.fn().mockReturnThis();
    const eq = vi.fn().mockReturnThis();
    const select = vi.fn().mockReturnThis();
    const single = vi.fn().mockResolvedValue({ data: returnData, error: returnError });
    const insert = vi.fn().mockResolvedValue({ error: null });
    return {
      client: { from: () => ({ update, eq, select, single, insert }) },
      update, eq, select, single, insert,
    };
  }

  it('TS-7 (regression): omitting reason/owner/release_condition is unchanged behavior in observe mode (default) — update object has no stamp keys', async () => {
    delete process.env.HOLD_STATE_CONTRACT_MODE;
    const stub = makeSupabaseStub({ id: 'QF-X', status: 'open', not_before: '2026-07-05T21:00:00.000Z' });
    await deferQuickFix('QF-X', '2026-07-05T21:00:00Z', { supabaseClient: stub.client });
    expect(stub.update).toHaveBeenCalledWith({ not_before: '2026-07-05T21:00:00.000Z' });
  });

  it('TS-4: enforce mode with a full stamp writes reason/owner/release_condition alongside not_before', async () => {
    process.env.HOLD_STATE_CONTRACT_MODE = 'enforce';
    const stub = makeSupabaseStub({ id: 'QF-X', status: 'open', not_before: '2026-07-05T21:00:00.000Z' });
    await deferQuickFix('QF-X', '2026-07-05T21:00:00Z', {
      reason: 'waiting on sibling', owner: 'coordinator', releaseCondition: 'sibling merges',
      supabaseClient: stub.client,
    });
    expect(stub.update).toHaveBeenCalledWith({
      not_before: '2026-07-05T21:00:00.000Z',
      reason: 'waiting on sibling', owner: 'coordinator', release_condition: 'sibling merges',
    });
  });

  it('TS-1 style: enforce mode rejects a defer missing reason/owner/release_condition before any DB write', async () => {
    process.env.HOLD_STATE_CONTRACT_MODE = 'enforce';
    const stub = makeSupabaseStub({ id: 'QF-X' });
    await expect(deferQuickFix('QF-X', '2026-07-05T21:00:00Z', { supabaseClient: stub.client }))
      .rejects.toThrow(/Hold-state contract violation/);
    expect(stub.update).not.toHaveBeenCalled();
  });

  it('observe mode (default) logs a violation but still writes not_before unchanged', async () => {
    delete process.env.HOLD_STATE_CONTRACT_MODE;
    const stub = makeSupabaseStub({ id: 'QF-X', status: 'open', not_before: '2026-07-05T21:00:00.000Z' });
    const result = await deferQuickFix('QF-X', '2026-07-05T21:00:00Z', { supabaseClient: stub.client });
    expect(result.id).toBe('QF-X');
    expect(stub.insert).toHaveBeenCalledTimes(1);
    expect(stub.insert.mock.calls[0][0]).toMatchObject({ surface: 'quick_fix_defer' });
  });
});
