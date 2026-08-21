/**
 * SD-LEO-INFRA-SMS-DELIVERY-TRUTH-001-B — sweep schedule (FR-1/TS-1), degradation
 * alarm (FR-2/TS-2), carrier-filter email-fallback escalation (FR-3/TS-3).
 * Pure cores tested directly; IO via a table-aware supabase mock (no live DB).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  SWEEP_PROCESS_KEY, EMAIL_ESCALATED_PREFIX,
  ensureSweepSchedule, witnessSweepFired,
  computeDegradationRatio, detectChannelDegradation,
  isCarrierFiltered, escalateCarrierFiltered,
} from '../../../lib/chairman/sms-channel-health.js';
import { main as sweepMain } from '../../../scripts/cron/sms-outbound-reconcile-sweep.mjs';

const NOW = Date.parse('2026-07-20T12:00:00Z');
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();

/** Table-aware supabase mock: per-table select rows + recorded upserts/updates. */
function makeMock({ obligations = [], selectError = null, registryError = null } = {}) {
  // QF-20260816-173: selectError may be a bare string (message-only, no .code — an
  // operational fault with no PostgREST error code) or a full {code, message} object
  // (e.g. {code: 'PGRST205', ...} for a genuine table-absent signature).
  const selectErrorObj = selectError == null ? null
    : (typeof selectError === 'string' ? { message: selectError } : selectError);
  const upserts = []; const updates = []; const inserts = [];
  // QF-20260816-245: exposes the LAST select-mode query built against sms_outbound_obligations
  // (not/order/limit args) so a test can assert the fix is actually wired, without needing this
  // shared mock to implement real WHERE-clause filtering for every table.
  let lastObligationsQuery = null;
  function chain(table) {
    const state = { op: 'select', payload: null, notFilters: [], orderCol: null, orderOpts: null, limitN: null };
    const c = {
      select: () => c,
      update: (p) => { state.op = 'update'; state.payload = p; return c; },
      upsert: (p) => { state.op = 'upsert'; state.payload = p; return finishThenable(); },
      insert: (p) => { inserts.push({ table, payload: p }); return Promise.resolve({ data: null, error: null }); },
      eq: () => c, in: () => c, is: () => c, gte: () => c,
      not: (col, op, val) => { state.notFilters.push([col, op, val]); return c; },
      order: (col, opts) => { state.orderCol = col; state.orderOpts = opts; return c; },
      limit: (n) => { state.limitN = n; return c; },
      // SD-LEO-INFRA-STAMP-ARMING-TIME-001: registerArmedMachinery now READS the existing row
      // before upserting, so armed_at is written once and then AGES instead of being reset on
      // every in-window tick. data:null models "no prior row" (first registration); registryError
      // still surfaces so the existing failure-path assertions keep exercising a real error.
      maybeSingle: async () => (registryError
        ? { data: null, error: { message: registryError } }
        : { data: null, error: null }),
      then: (res, rej) => finish().then(res, rej),
    };
    function finishThenable() { return { then: (res, rej) => finish().then(res, rej), select: () => finishThenable() }; }
    async function finish() {
      if (table === 'periodic_process_registry') {
        if (registryError) return { data: null, error: { message: registryError } };
        if (state.op === 'upsert') { upserts.push(state.payload); return { data: [], error: null }; }
        if (state.op === 'update') { updates.push({ table, payload: state.payload }); return { data: [{ process_key: SWEEP_PROCESS_KEY }], error: null }; }
        return { data: [], error: null };
      }
      if (table === 'sms_outbound_obligations') {
        if (state.op === 'select') {
          lastObligationsQuery = { notFilters: state.notFilters, orderCol: state.orderCol, orderOpts: state.orderOpts, limitN: state.limitN };
        }
        if (selectErrorObj && state.op === 'select') return { data: null, error: selectErrorObj };
        if (state.op === 'update') { updates.push({ table, payload: state.payload }); return { data: [], error: null }; }
        return { data: obligations, error: null };
      }
      if (state.op === 'update') { updates.push({ table, payload: state.payload }); return { data: [], error: null }; }
      return { data: [], error: null };
    }
    return c;
  }
  return { supabase: { from: chain }, upserts, updates, inserts, get lastObligationsQuery() { return lastObligationsQuery; } };
}

const quiet = { warn: vi.fn(), log: vi.fn(), error: vi.fn() };

describe('FR-1 / TS-1: durable sweep-runner schedule', () => {
  it('registers an on-by-default armed cadence with positive interval', async () => {
    const m = makeMock();
    const res = await ensureSweepSchedule(m.supabase, { logger: quiet });
    expect(res.ok).toBe(true);
    expect(res.processKey).toBe(SWEEP_PROCESS_KEY);
    expect(m.upserts).toHaveLength(1);
    expect(m.upserts[0].currently_expected_active).toBe(true);
    expect(m.upserts[0].expected_interval_seconds).toBeGreaterThan(0);
    expect(m.upserts[0].process_key).toBe(SWEEP_PROCESS_KEY);
  });

  it('witnesses the cadence as fired (last_fired_at stamped)', async () => {
    const m = makeMock();
    const res = await witnessSweepFired(m.supabase, { logger: quiet });
    expect(res.stamped).toBe(true);
    expect(m.updates.some((u) => u.table === 'periodic_process_registry' && u.payload.last_fired_at)).toBe(true);
  });

  it('fail-soft: absent registry emits a loud canary and never throws', async () => {
    const m = makeMock({ registryError: 'relation "periodic_process_registry" does not exist' });
    const warn = vi.fn();
    const res = await ensureSweepSchedule(m.supabase, { logger: { warn } });
    expect(res.ok).toBe(false);
    expect(warn.mock.calls.join(' ')).toMatch(/CANARY/);
    const res2 = await witnessSweepFired({ from: () => { throw new Error('42P01'); } }, { logger: { warn } });
    expect(res2.stamped).toBe(false);
  });
});

describe('FR-2 / TS-2: channel-state degradation alarm', () => {
  const HOUR = 3600000;
  it('pure ratio: windowed bad/total, empty window => 0', () => {
    const rows = [
      { status: 'delivered', created_at: iso(1 * HOUR) },
      { status: 'undelivered', created_at: iso(2 * HOUR) },
      { status: 'failed', created_at: iso(3 * HOUR) },
      { status: 'owed_escalate', created_at: iso(4 * HOUR) },
      { status: 'failed', created_at: iso(50 * HOUR) }, // outside window — excluded
    ];
    const r = computeDegradationRatio(rows, { windowMs: 6 * HOUR, now: NOW });
    expect(r.total).toBe(4);
    expect(r.bad).toBe(3);
    expect(r.ratio).toBeCloseTo(0.75);
    expect(computeDegradationRatio([], { now: NOW }).ratio).toBe(0);
  });

  it('TS-9 (SD-LEO-FIX-SMS-OUTBOUND-WORKER-001 FR-6/VAL-5): canceled (voided) rows are excluded from the denominator, not just the numerator', () => {
    const rows = [
      { status: 'delivered', created_at: iso(1 * HOUR) },
      { status: 'delivered', created_at: iso(1 * HOUR) },
      { status: 'delivered', created_at: iso(1 * HOUR) },
      { status: 'delivered', created_at: iso(1 * HOUR) },
      { status: 'delivered', created_at: iso(1 * HOUR) },
      { status: 'canceled', created_at: iso(1 * HOUR) },
      { status: 'canceled', created_at: iso(1 * HOUR) },
      { status: 'canceled', created_at: iso(1 * HOUR) },
    ];
    const r = computeDegradationRatio(rows, { windowMs: 6 * HOUR, now: NOW });
    expect(r.total).toBe(5); // NOT 8 — the 3 voided rows never attempted delivery
    expect(r.bad).toBe(0);
    expect(r.ratio).toBe(0);
  });

  it('TS-9 regression: with zero canceled rows in the window, behavior is unchanged', () => {
    const rows = [
      { status: 'delivered', created_at: iso(1 * HOUR) },
      { status: 'undelivered', created_at: iso(1 * HOUR) },
    ];
    const r = computeDegradationRatio(rows, { windowMs: 6 * HOUR, now: NOW });
    expect(r.total).toBe(2);
    expect(r.bad).toBe(1);
    expect(r.ratio).toBe(0.5);
  });

  it('raises a durable alarm naming the ratio when above threshold', async () => {
    const m = makeMock({ obligations: [
      { status: 'undelivered', created_at: iso(HOUR) }, { status: 'failed', created_at: iso(HOUR) },
      { status: 'failed', created_at: iso(HOUR) }, { status: 'delivered', created_at: iso(HOUR) },
    ] });
    const emit = vi.fn(async () => ({}));
    const res = await detectChannelDegradation(m.supabase, { now: NOW, emit, logger: quiet });
    expect(res.alarmed).toBe(true);
    expect(emit).toHaveBeenCalledOnce();
    const arg = emit.mock.calls[0][0];
    expect(arg.title).toMatch(/75%|3\/4/);
    expect(arg.metadata.ratio).toBeCloseTo(0.75);
    expect(arg.category).toBe('sms_channel_degradation');
  });

  it('below threshold or below min-sample: no alarm', async () => {
    const emit = vi.fn(async () => ({}));
    const below = makeMock({ obligations: [
      { status: 'delivered', created_at: iso(HOUR) }, { status: 'delivered', created_at: iso(HOUR) },
      { status: 'failed', created_at: iso(HOUR) }, { status: 'delivered', created_at: iso(HOUR) },
    ] });
    expect((await detectChannelDegradation(below.supabase, { now: NOW, emit, logger: quiet })).alarmed).toBe(false);
    const tiny = makeMock({ obligations: [{ status: 'failed', created_at: iso(HOUR) }] });
    expect((await detectChannelDegradation(tiny.supabase, { now: NOW, emit, logger: quiet })).alarmed).toBe(false);
    expect(emit).not.toHaveBeenCalled();
  });

  it('fail-soft: absent owed-state table (PGRST205) => no alarm, no throw, reason table_absent', async () => {
    const m = makeMock({ selectError: { code: 'PGRST205', message: 'relation "sms_outbound_obligations" does not exist' } });
    const res = await detectChannelDegradation(m.supabase, { now: NOW, emit: vi.fn(), logger: quiet });
    expect(res).toEqual({ alarmed: false, reason: 'table_absent' });
  });

  it('fail-soft: absent owed-state table (42P01, raw Postgres code) => reason table_absent', async () => {
    const m = makeMock({ selectError: { code: '42P01', message: 'relation "sms_outbound_obligations" does not exist' } });
    const res = await detectChannelDegradation(m.supabase, { now: NOW, emit: vi.fn(), logger: quiet });
    expect(res).toEqual({ alarmed: false, reason: 'table_absent' });
  });

  it('QF-20260816-173: an operational fault (42501, RLS-denied) is NOT table_absent — distinct reason, warning logged', async () => {
    const m = makeMock({ selectError: { code: '42501', message: 'permission denied for table sms_outbound_obligations' } });
    const warn = vi.fn();
    const res = await detectChannelDegradation(m.supabase, { now: NOW, emit: vi.fn(), logger: { warn } });
    expect(res).toEqual({ alarmed: false, reason: 'query_failed:42501' });
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toMatch(/CANARY/);
    expect(warn.mock.calls[0][0]).toMatch(/42501/);
  });

  it('QF-20260816-173: a thrown (non-table-absent) exception is NOT table_absent — distinct reason, warning logged', async () => {
    const warn = vi.fn();
    const throwingSupabase = { from: () => { throw new Error('ECONNRESET: network reset'); } };
    const res = await detectChannelDegradation(throwingSupabase, { now: NOW, emit: vi.fn(), logger: { warn } });
    expect(res).toEqual({ alarmed: false, reason: 'query_threw:ECONNRESET: network reset' });
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toMatch(/CANARY/);
  });
});

describe('FR-3 / TS-3: carrier-filter email-fallback escalation', () => {
  it('pure classifier: 30007/carrier-filter yes; others and already-escalated no', () => {
    expect(isCarrierFiltered({ last_error: 'Twilio error 30007' })).toBe(true);
    expect(isCarrierFiltered({ last_error: 'carrier-filter block' })).toBe(true);
    expect(isCarrierFiltered({ last_error: 'carrier_filtered by network' })).toBe(true);
    expect(isCarrierFiltered({ last_error: 'timeout talking to provider' })).toBe(false);
    expect(isCarrierFiltered({ last_error: `${EMAIL_ESCALATED_PREFIX}Twilio error 30007` })).toBe(false);
    expect(isCarrierFiltered({})).toBe(false);
  });

  it('escalates a 30007 row to email once and stamps the owed row (idempotent)', async () => {
    const row = { id: 'ob1', recipient_phone: '+15551234567', body: 'decision packet', last_error: 'Twilio 30007 blocked', status: 'undelivered' };
    const m = makeMock({ obligations: [row] });
    const sendEmail = vi.fn(async () => ({ success: true }));
    const res = await escalateCarrierFiltered(m.supabase, { sendEmail, logger: quiet });
    expect(res.escalated).toBe(1);
    expect(sendEmail).toHaveBeenCalledOnce();
    expect(sendEmail.mock.calls[0][0].text).toMatch(/decision packet/);
    const stamp = m.updates.find((u) => u.table === 'sms_outbound_obligations');
    expect(stamp.payload.last_error.startsWith(EMAIL_ESCALATED_PREFIX)).toBe(true);
    // second pass over the STAMPED row: classifier excludes it — no double escalation
    const m2 = makeMock({ obligations: [{ ...row, last_error: stamp.payload.last_error }] });
    const send2 = vi.fn();
    const res2 = await escalateCarrierFiltered(m2.supabase, { sendEmail: send2, logger: quiet });
    expect(res2.escalated).toBe(0);
    expect(send2).not.toHaveBeenCalled();
  });

  it('non-carrier-filter failures never trigger email escalation', async () => {
    const m = makeMock({ obligations: [{ id: 'ob2', last_error: 'provider timeout', status: 'failed' }] });
    const sendEmail = vi.fn();
    const res = await escalateCarrierFiltered(m.supabase, { sendEmail, logger: quiet });
    expect(res.escalated).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('QF-20260816-245: the scan query excludes already-escalated rows at the DB level and orders oldest-first — so batchLimit is never wasted on rows that can never be re-escalated', async () => {
    const m = makeMock({ obligations: [] });
    await escalateCarrierFiltered(m.supabase, { sendEmail: vi.fn(), logger: quiet, batchLimit: 25 });
    const q = m.lastObligationsQuery;
    expect(q.notFilters).toContainEqual(['last_error', 'ilike', `${EMAIL_ESCALATED_PREFIX.trim()}%`]);
    expect(q.orderCol).toBe('created_at');
    expect(q.orderOpts).toEqual({ ascending: true });
    expect(q.limitN).toBe(25);
  });

  it('QF-20260816-245: scanned counts every row the batch examined, not just the carrier-filtered subset — "scanned:0" must mean the batch was truly empty', async () => {
    // A mixed batch: one carrier-filtered (escalates), one legitimately-failed-for-another-reason
    // (never carrier-filtered). Before the fix, scanned only incremented for the FIRST row —
    // the second row's examination was invisible to the diagnostic counter.
    const m = makeMock({ obligations: [
      { id: 'ob-cf', last_error: 'Twilio 30007', status: 'undelivered', body: 'x' },
      { id: 'ob-other', last_error: 'provider timeout', status: 'failed' },
    ] });
    const res = await escalateCarrierFiltered(m.supabase, { sendEmail: vi.fn(async () => ({ success: true })), logger: quiet });
    expect(res.escalated).toBe(1);
    expect(res.scanned).toBe(2); // both rows examined, even though only one was carrier-filtered
  });

  it('fail-soft: absent owed-state table (PGRST205) => empty result, no warning', async () => {
    const m = makeMock({ selectError: { code: 'PGRST205', message: 'relation "sms_outbound_obligations" does not exist' } });
    const warn = vi.fn();
    const res = await escalateCarrierFiltered(m.supabase, { sendEmail: vi.fn(), logger: { warn } });
    expect(res).toEqual({ scanned: 0, escalated: 0, emailUnavailable: 0 });
    expect(warn).not.toHaveBeenCalled();
  });

  it('QF-20260816-173: an operational fault (42501, RLS-denied) still fails soft, but logs a CANARY warning naming the real fault', async () => {
    const m = makeMock({ selectError: { code: '42501', message: 'permission denied for table sms_outbound_obligations' } });
    const warn = vi.fn();
    const res = await escalateCarrierFiltered(m.supabase, { sendEmail: vi.fn(), logger: { warn } });
    expect(res).toEqual({ scanned: 0, escalated: 0, emailUnavailable: 0 });
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toMatch(/CANARY/);
    expect(warn.mock.calls[0][0]).toMatch(/42501/);
  });

  it('email-send failure: logged non-escalation, NO stamp (retryable next sweep)', async () => {
    const m = makeMock({ obligations: [{ id: 'ob3', last_error: 'Twilio 30007', status: 'undelivered', body: 'x' }] });
    const warn = vi.fn();
    const res = await escalateCarrierFiltered(m.supabase, { sendEmail: vi.fn(async () => { throw new Error('resend down'); }), logger: { warn } });
    expect(res.escalated).toBe(0);
    expect(res.emailUnavailable).toBe(1);
    expect(m.updates.filter((u) => u.table === 'sms_outbound_obligations')).toHaveLength(0);
    expect(warn.mock.calls.join(' ')).toMatch(/retry next sweep/);
  });
});

describe('sweep wiring: channel-health layer runs after reconcile, fail-soft', () => {
  it('invokes all four hooks via deps.channelHealth', async () => {
    const health = {
      ensureSweepSchedule: vi.fn(async () => ({ ok: true })),
      witnessSweepFired: vi.fn(async () => ({ stamped: true })),
      detectChannelDegradation: vi.fn(async () => ({ alarmed: false })),
      escalateCarrierFiltered: vi.fn(async () => ({ scanned: 0, escalated: 0, emailUnavailable: 0 })),
    };
    const res = await sweepMain(['node', 'x', '--once'], {
      supabase: makeMock().supabase,
      reconcile: vi.fn(async () => ({ ran: true, claimed: 0 })),
      channelHealth: health,
      logger: quiet,
    });
    expect(res.exitCode).toBe(0);
    for (const fn of Object.values(health)) expect(fn).toHaveBeenCalledOnce();
  });

  it('a throwing channel-health layer never fails the sweep', async () => {
    const warn = vi.fn();
    const res = await sweepMain(['node', 'x', '--once'], {
      supabase: makeMock().supabase,
      reconcile: vi.fn(async () => ({ ran: true })),
      channelHealth: { ensureSweepSchedule: vi.fn(async () => { throw new Error('boom'); }) },
      logger: { ...quiet, warn },
    });
    expect(res.exitCode).toBe(0);
    expect(warn.mock.calls.join(' ')).toMatch(/failed soft/);
  });

  it('SD-LEO-INFRA-FLEET-DEAD-MAN-001 FR-3: writes a system_events verdict row surfacing unconfigured distinctly', async () => {
    const mock = makeMock();
    const health = {
      ensureSweepSchedule: vi.fn(async () => ({ ok: true })),
      witnessSweepFired: vi.fn(async () => ({ stamped: true })),
      detectChannelDegradation: vi.fn(async () => ({ alarmed: false })),
      escalateCarrierFiltered: vi.fn(async () => ({ scanned: 0, escalated: 0, emailUnavailable: 0 })),
    };
    const res = await sweepMain(['node', 'x', '--once'], {
      supabase: mock.supabase,
      reconcile: vi.fn(async () => ({ ran: true, sent: 0, failed: 0, unconfigured: 3 })),
      channelHealth: health,
      logger: quiet,
    });
    expect(res.exitCode).toBe(0);
    const verdictRows = mock.inserts.filter((i) => i.table === 'system_events');
    expect(verdictRows).toHaveLength(1);
    expect(verdictRows[0].payload.event_type).toBe('sms_outbound_sweep_verdict');
    expect(verdictRows[0].payload.payload.unconfigured).toBe(3);
  });

  it('an unwritable system_events layer never fails the sweep (TS-11-style: audit write cannot suppress the sweep)', async () => {
    const supabase = { from: () => ({ insert: () => { throw new Error('table down'); } }) };
    const warn = vi.fn();
    const res = await sweepMain(['node', 'x', '--once'], {
      supabase,
      reconcile: vi.fn(async () => ({ ran: true, unconfigured: 0 })),
      channelHealth: {
        ensureSweepSchedule: vi.fn(async () => ({ ok: true })),
        witnessSweepFired: vi.fn(async () => ({ stamped: true })),
        detectChannelDegradation: vi.fn(async () => ({ alarmed: false })),
        escalateCarrierFiltered: vi.fn(async () => ({ scanned: 0, escalated: 0, emailUnavailable: 0 })),
      },
      logger: { ...quiet, warn },
    });
    expect(res.exitCode).toBe(0);
    expect(warn.mock.calls.join(' ')).toMatch(/verdict audit-write failed/);
  });
});
