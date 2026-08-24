/**
 * SD-LEO-INFRA-SMS-DELIVERY-STATUS-001 FR-3/FR-7 group 5 — unit tests for the extracted
 * owed-delivery-truth writer (lib/chairman/owed-delivery-truth.js), the module carved out of
 * api/webhooks/twilio-sms.js so both the legacy direct webhook and the new relay-staged drain
 * can call the same writer without an api/->lib/ import cycle (TESTING findings C1-C4,
 * sub_agent_execution_results cbcb68fa-d415-426c-93b8-6e61f4a044fc).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { owedRowUpdateForStatus, applyOwedDeliveryTruth } from '../../../lib/chairman/owed-delivery-truth.js';

describe('owedRowUpdateForStatus', () => {
  it('delivered: includes delivered_at from the CALLER-supplied timestamp and the caller-supplied source', () => {
    const patch = owedRowUpdateForStatus('delivered', '2026-08-24T18:00:00.000Z', 'carrier_push');
    expect(patch).toEqual({ status: 'delivered', delivered_at: '2026-08-24T18:00:00.000Z', delivery_status_source: 'carrier_push' });
  });

  it('undelivered: terminal-fail patch carries no delivered_at or source', () => {
    expect(owedRowUpdateForStatus('undelivered', '2026-08-24T18:00:00.000Z', 'carrier_push')).toEqual({ status: 'undelivered' });
  });

  it('failed: terminal-fail patch carries no delivered_at or source', () => {
    expect(owedRowUpdateForStatus('failed', '2026-08-24T18:00:00.000Z', 'carrier_push')).toEqual({ status: 'failed' });
  });

  it('queued/sending/sent: transient statuses return null (no owed-row write)', () => {
    expect(owedRowUpdateForStatus('queued', 'x', 'carrier_push')).toBeNull();
    expect(owedRowUpdateForStatus('sending', 'x', 'carrier_push')).toBeNull();
    expect(owedRowUpdateForStatus('sent', 'x', 'carrier_push')).toBeNull();
  });
});

describe('applyOwedDeliveryTruth', () => {
  function chainable(terminalResult) {
    const obj = {
      update: vi.fn(() => obj),
      not: vi.fn(() => obj),
      or: vi.fn(() => obj),
      eq: vi.fn(() => obj),
      select: vi.fn(() => Promise.resolve(terminalResult)),
    };
    return obj;
  }
  function makeSupabase(result) {
    const builder = chainable(result);
    return { from: vi.fn(() => builder), _builder: builder };
  }

  let warnSpy;
  beforeEach(() => { warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
  afterEach(() => { warnSpy.mockRestore(); });

  // TR-5/C3: the writer must use the CALLER's deliveredAt, never synthesize now() internally.
  it('C3 regression guard: a matched delivered write patches with the caller-supplied deliveredAt, not a freshly-computed timestamp', async () => {
    const supabase = makeSupabase({ data: [{ id: 'row-1' }], error: null });
    await applyOwedDeliveryTruth(supabase, { messageSid: 'SM1', status: 'delivered', deliveredAt: '2020-01-01T00:00:00.000Z', source: 'carrier_push' });
    expect(supabase._builder.update).toHaveBeenCalledWith({ status: 'delivered', delivered_at: '2020-01-01T00:00:00.000Z', delivery_status_source: 'carrier_push' });
  });

  it('C4 regression guard: returns a structured outcome, not void', async () => {
    const supabase = makeSupabase({ data: [{ id: 'row-1' }], error: null });
    const result = await applyOwedDeliveryTruth(supabase, { messageSid: 'SM1', status: 'delivered', deliveredAt: 'x', source: 'carrier_push' });
    expect(result).toEqual({ matched: true, updated: true, error: null, tableAbsent: false, columnAbsent: false });
  });

  it('no match (zero rows, no error): matched=false, updated=false, stays silent', async () => {
    const supabase = makeSupabase({ data: [], error: null });
    const result = await applyOwedDeliveryTruth(supabase, { messageSid: 'SM1', status: 'delivered', deliveredAt: 'x', source: 'carrier_push' });
    expect(result.matched).toBe(false);
    expect(result.updated).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('table-absent (42P01): tableAbsent=true, no error surfaced, never warns', async () => {
    const supabase = makeSupabase({ data: null, error: { code: '42P01', message: 'relation does not exist' } });
    const result = await applyOwedDeliveryTruth(supabase, { messageSid: 'SM1', status: 'delivered', deliveredAt: 'x', source: 'carrier_push' });
    expect(result.tableAbsent).toBe(true);
    expect(result.error).toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('table-absent (PGRST205): tableAbsent=true, never warns', async () => {
    const supabase = makeSupabase({ data: null, error: { code: 'PGRST205', message: 'table not found' } });
    const result = await applyOwedDeliveryTruth(supabase, { messageSid: 'SM1', status: 'delivered', deliveredAt: 'x', source: 'carrier_push' });
    expect(result.tableAbsent).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  // FR-3 AC-6 / W3: a missing delivery_status_source column must be distinguishable from a
  // table-absent no-op, so the caller (the drain) can choose not to mark its work complete.
  it('column-absent (PGRST204): columnAbsent=true, distinct from tableAbsent, never warns', async () => {
    const supabase = makeSupabase({ data: null, error: { code: 'PGRST204', message: "Could not find the 'delivery_status_source' column" } });
    const result = await applyOwedDeliveryTruth(supabase, { messageSid: 'SM1', status: 'delivered', deliveredAt: 'x', source: 'carrier_push' });
    expect(result.columnAbsent).toBe(true);
    expect(result.tableAbsent).toBe(false);
    expect(result.error).toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('a genuine write failure is visible: warns with SID + message, error surfaced in the return', async () => {
    const supabase = makeSupabase({ data: null, error: { code: '42501', message: 'permission denied' } });
    const result = await applyOwedDeliveryTruth(supabase, { messageSid: 'SM1', status: 'delivered', deliveredAt: 'x', source: 'carrier_push' });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('SM1');
    expect(warnSpy.mock.calls[0][0]).toContain('permission denied');
    expect(result.error).toBeTruthy();
  });

  // TS-9: retryOrAlert's re-arm does NOT change provider_message_id, so a stale staged
  // undelivered/failed callback could otherwise match a row that has since been re-armed to
  // 'owed'. Scoping the terminal-fail write to status='sent' closes this without weakening
  // delivered's broader prior-SID resolution.
  it('TS-9: an undelivered/failed patch is scoped to status=sent, not just current-SID', async () => {
    const supabase = makeSupabase({ data: [{ id: 'row-1' }], error: null });
    await applyOwedDeliveryTruth(supabase, { messageSid: 'SM1', status: 'undelivered', deliveredAt: 'x', source: 'carrier_push' });
    expect(supabase._builder.eq).toHaveBeenCalledWith('status', 'sent');
  });

  it('TS-9: a delivered patch does NOT add the status=sent restriction (prior-SID resolution stays broad)', async () => {
    const supabase = makeSupabase({ data: [{ id: 'row-1' }], error: null });
    await applyOwedDeliveryTruth(supabase, { messageSid: 'SM1', status: 'delivered', deliveredAt: 'x', source: 'carrier_push' });
    expect(supabase._builder.eq).not.toHaveBeenCalledWith('status', 'sent');
  });

  it('an invalid MessageSid short-circuits before any DB call', async () => {
    const supabase = makeSupabase({ data: [], error: null });
    const result = await applyOwedDeliveryTruth(supabase, { messageSid: '../etc/passwd', status: 'delivered', deliveredAt: 'x', source: 'carrier_push' });
    expect(supabase.from).not.toHaveBeenCalled();
    expect(result).toEqual({ matched: false, updated: false, error: null, tableAbsent: false, columnAbsent: false });
  });
});
