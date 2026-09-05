/**
 * SD-LEO-INFRA-LIVENESS-LADDER-OWNER-ROUTING-001 / FR-1, FR-1b -- unit coverage for
 * lib/periodic-liveness/owner-directive-writer.mjs.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  OWNER_DIRECTIVE_KIND,
  isOwnerDirectiveActioned,
  buildOwnerDirectiveRow,
  writeOwnerDirective,
  resolveOwnerDirective,
} from '../../../lib/periodic-liveness/owner-directive-writer.mjs';

describe('isOwnerDirectiveActioned', () => {
  it('is false for a fresh row with no actioned_at', () => {
    expect(isOwnerDirectiveActioned({ payload: { kind: OWNER_DIRECTIVE_KIND } })).toBe(false);
  });
  it('is true once payload.actioned_at is stamped (genuine ack, not read_at)', () => {
    expect(isOwnerDirectiveActioned({ payload: { actioned_at: '2026-09-05T00:00:00Z' } })).toBe(true);
  });
  it('never throws on a null/missing row', () => {
    expect(isOwnerDirectiveActioned(null)).toBe(false);
    expect(isOwnerDirectiveActioned({})).toBe(false);
  });
});

describe('buildOwnerDirectiveRow', () => {
  it('uses the DIRECTIVE_KINDS-registered kind, not an ad-hoc string', () => {
    const row = buildOwnerDirectiveRow({ targetSession: 'sess-1', processKey: 'proc-1' });
    expect(row.payload.kind).toBe('periodic_liveness_owner_directive');
    expect(row.target_session).toBe('sess-1');
  });

  it('requires targetSession and processKey', () => {
    expect(() => buildOwnerDirectiveRow({ processKey: 'proc-1' })).toThrow(/targetSession/);
    expect(() => buildOwnerDirectiveRow({ targetSession: 'sess-1' })).toThrow(/processKey/);
  });

  it('includes the required invocation in the body when present', () => {
    const row = buildOwnerDirectiveRow({ targetSession: 'sess-1', processKey: 'proc-1', requiredInvocation: 'npm run fix' });
    expect(row.body).toContain('npm run fix');
    expect(row.payload.required_invocation).toBe('npm run fix');
  });
});

describe('writeOwnerDirective', () => {
  it('inserts a new row when none exists', async () => {
    const insertSelect = vi.fn().mockResolvedValue({ data: { id: 'row-1' }, error: null });
    const supabase = { from: () => ({ insert: () => ({ select: () => ({ single: insertSelect }) }) }) };
    const findExisting = vi.fn().mockResolvedValue(null);
    const result = await writeOwnerDirective(supabase, { targetSession: 'sess-1', processKey: 'proc-1' }, { findExisting });
    expect(result).toEqual({ written: true, id: 'row-1', reused: false });
  });

  it('reuses an existing unresolved directive rather than inserting a duplicate', async () => {
    const insert = vi.fn();
    const supabase = { from: () => ({ insert }) };
    const findExisting = vi.fn().mockResolvedValue({ id: 'row-existing', payload: {} });
    const result = await writeOwnerDirective(supabase, { targetSession: 'sess-1', processKey: 'proc-1' }, { findExisting });
    expect(result).toEqual({ written: true, id: 'row-existing', reused: true });
    expect(insert).not.toHaveBeenCalled();
  });

  it('does not reuse a resolved directive (writes a fresh one for a new episode)', async () => {
    const insertSelect = vi.fn().mockResolvedValue({ data: { id: 'row-2' }, error: null });
    const supabase = { from: () => ({ insert: () => ({ select: () => ({ single: insertSelect }) }) }) };
    const findExisting = vi.fn().mockResolvedValue({ id: 'row-old', payload: { ladder_resolved_at: '2026-09-01T00:00:00Z' } });
    const result = await writeOwnerDirective(supabase, { targetSession: 'sess-1', processKey: 'proc-1' }, { findExisting });
    expect(result).toEqual({ written: true, id: 'row-2', reused: false });
  });

  it('fails soft (never throws) on an insert error, and logs loudly', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const insertSelect = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
    const supabase = { from: () => ({ insert: () => ({ select: () => ({ single: insertSelect }) }) }) };
    const result = await writeOwnerDirective(supabase, { targetSession: 'sess-1', processKey: 'proc-1' }, { findExisting: async () => null });
    expect(result).toEqual({ written: false, error: 'boom' });
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('fails soft on a thrown exception', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const supabase = { from: () => { throw new Error('down'); } };
    const result = await writeOwnerDirective(supabase, { targetSession: 'sess-1', processKey: 'proc-1' }, { findExisting: async () => null });
    expect(result.written).toBe(false);
    errSpy.mockRestore();
  });
});

describe('resolveOwnerDirective', () => {
  it('stamps payload.ladder_resolved_at on the given row id', async () => {
    const single = vi.fn().mockResolvedValue({ data: { payload: { kind: 'x' } }, error: null });
    const update = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));
    const supabase = { from: () => ({ select: () => ({ eq: () => ({ single }) }), update }) };
    const result = await resolveOwnerDirective(supabase, 'row-1');
    expect(result).toEqual({ resolved: true });
    expect(update).toHaveBeenCalledWith({ payload: expect.objectContaining({ kind: 'x', ladder_resolved_at: expect.any(String) }) });
  });

  it('fails soft when the row cannot be read', async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } });
    const supabase = { from: () => ({ select: () => ({ eq: () => ({ single }) }) }) };
    const result = await resolveOwnerDirective(supabase, 'missing');
    expect(result.resolved).toBe(false);
  });
});
