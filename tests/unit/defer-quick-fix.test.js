/**
 * SD-LEO-FIX-QUICK-FIXES-NEEDS-001: operator-facing not_before setter.
 */
import { describe, it, expect, vi } from 'vitest';
import { parseDeferArgs, validateNotBefore, deferQuickFix } from '../../scripts/defer-quick-fix.js';

describe('parseDeferArgs', () => {
  it('parses QF id, --not-before value, and --reopen flag', () => {
    const parsed = parseDeferArgs(['QF-X', '--not-before', '2026-07-05T21:00:00Z', '--reopen']);
    expect(parsed).toEqual({ showHelp: false, qfId: 'QF-X', notBefore: '2026-07-05T21:00:00Z', reopen: true });
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
