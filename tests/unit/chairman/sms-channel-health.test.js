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
  const upserts = []; const updates = [];
  function chain(table) {
    const state = { op: 'select', payload: null };
    const c = {
      select: () => c,
      update: (p) => { state.op = 'update'; state.payload = p; return c; },
      upsert: (p) => { state.op = 'upsert'; state.payload = p; return finishThenable(); },
      eq: () => c, in: () => c, is: () => c, gte: () => c, order: () => c, limit: () => c,
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
        if (selectError && state.op === 'select') return { data: null, error: { message: selectError } };
        if (state.op === 'update') { updates.push({ table, payload: state.payload }); return { data: [], error: null }; }
        return { data: obligations, error: null };
      }
      if (state.op === 'update') { updates.push({ table, payload: state.payload }); return { data: [], error: null }; }
      return { data: [], error: null };
    }
    return c;
  }
  return { supabase: { from: chain }, upserts, updates };
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

  it('fail-soft: absent owed-state table => no alarm, no throw', async () => {
    const m = makeMock({ selectError: 'relation "sms_outbound_obligations" does not exist' });
    const res = await detectChannelDegradation(m.supabase, { now: NOW, emit: vi.fn(), logger: quiet });
    expect(res).toEqual({ alarmed: false, reason: 'table_absent' });
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
});
