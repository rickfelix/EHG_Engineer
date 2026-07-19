/**
 * SD-LEO-INFRA-SMS-CHANNEL-HARDENING-001-B — durable outbound SMS owed-state, delivery-truth
 * callback, and claim-serialized reconcile worker. TS-1..TS-10.
 *
 * Everything runs against an in-memory fake Supabase (modeling sms_outbound_obligations +
 * chairman_notifications) and stubbed messaging providers — no live DB, no live Twilio.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { enqueueChairmanSms, smsOutboundObligationsLive } from '../../../lib/chairman/sms-bridge.js';
import { reconcileOutboundSms, maskPhone } from '../../../lib/chairman/sms-outbound-worker.js';
import { handleTwilioStatusCallback } from '../../../api/webhooks/twilio-sms.js';

const MIN = 60 * 1000;
const ago = (ms) => new Date(Date.now() - ms).toISOString();

// ---------------------------------------------------------------------------------------
// In-memory fake Supabase supporting the exact query shapes the owed-state code issues:
//   - select().limit() (liveness probe)                       - upsert(row,{onConflict,ignoreDuplicates}).select()
//   - select(...).eq().order().limit() / .in().limit()        - update(...).eq().eq().is().select()  (atomic claim)
//   - update(...).eq('provider_message_id',...)               (missingTables => real missing-table {data:null,error})
// ---------------------------------------------------------------------------------------
function makeFakeSupabase(seed = {}) {
  const tables = {
    sms_outbound_obligations: [...(seed.sms_outbound_obligations || [])],
    chairman_notifications: [...(seed.chairman_notifications || [])],
  };
  const missing = new Set(seed.missingTables || []);
  let seq = 0;

  function applyFilters(rows, filters) {
    return rows.filter((row) =>
      filters.every(([col, op, val]) => {
        if (op === 'eq') return row[col] === val;
        if (op === 'in') return Array.isArray(val) && val.includes(row[col]);
        if (op === 'is') return (row[col] ?? null) === val;
        return true;
      })
    );
  }

  function from(table) {
    const ctx = { filters: [], order: null, limitN: null, mode: 'select', returnSelect: false, row: null, vals: null, upsertOpts: null };
    const isMissing = missing.has(table);
    const api = {
      select(_cols) { if (ctx.mode === 'update' || ctx.mode === 'insert' || ctx.mode === 'upsert') { ctx.returnSelect = true; return api; } ctx.mode = 'select'; return api; },
      insert(row) { ctx.mode = 'insert'; ctx.row = { id: `row-${++seq}`, created_at: new Date().toISOString(), ...row }; return api; },
      upsert(row, opts) { ctx.mode = 'upsert'; ctx.row = { id: `row-${++seq}`, created_at: new Date().toISOString(), attempts: 0, ...row }; ctx.upsertOpts = opts || {}; return api; },
      update(vals) { ctx.mode = 'update'; ctx.vals = vals; return api; },
      eq(col, val) { ctx.filters.push([col, 'eq', val]); return api; },
      in(col, arr) { ctx.filters.push([col, 'in', arr]); return api; },
      is(col, val) { ctx.filters.push([col, 'is', val]); return api; },
      order(col, { ascending } = {}) { ctx.order = { col, ascending: !!ascending }; return api; },
      limit(n) { ctx.limitN = n; return api; },
      then(resolve) {
        if (isMissing) { resolve({ data: null, error: { message: `relation "${table}" does not exist`, code: '42P01' } }); return; }
        if (ctx.mode === 'insert') { tables[table].push(ctx.row); resolve({ data: ctx.returnSelect ? [{ id: ctx.row.id }] : null, error: null }); return; }
        if (ctx.mode === 'upsert') {
          const key = ctx.upsertOpts?.onConflict;
          const val = key ? ctx.row[key] : null;
          if (key && val != null && tables[table].some((r) => r[key] === val)) { resolve({ data: [], error: null }); return; } // ignoreDuplicates conflict
          tables[table].push(ctx.row);
          resolve({ data: ctx.returnSelect ? [{ id: ctx.row.id }] : null, error: null });
          return;
        }
        if (ctx.mode === 'update') {
          const rows = applyFilters(tables[table], ctx.filters);
          rows.forEach((r) => Object.assign(r, ctx.vals));
          resolve({ data: ctx.returnSelect ? rows.map((r) => ({ ...r })) : null, error: null });
          return;
        }
        let rows = applyFilters(tables[table], ctx.filters);
        if (ctx.order) rows = [...rows].sort((a, b) => { const cmp = a[ctx.order.col] < b[ctx.order.col] ? -1 : a[ctx.order.col] > b[ctx.order.col] ? 1 : 0; return ctx.order.ascending ? cmp : -cmp; });
        if (ctx.limitN != null) rows = rows.slice(0, ctx.limitN);
        resolve({ data: rows, error: null });
      },
    };
    return api;
  }
  return { from, _tables: tables };
}

const owedRow = (over = {}) => ({
  id: over.id || 'ob-1', recipient_phone: '+15551234567', kind: 'morning_review',
  decision_id: null, body: 'Good morning review. Reply to answer.', dedupe_key: null,
  status: 'owed', provider_message_id: null, attempts: 0, not_before: null,
  claimed_at: null, claimed_by: null, created_at: new Date().toISOString(),
  sent_at: null, delivered_at: null, last_error: null, ...over,
});

const okProvider = () => ({ send: vi.fn(async () => ({ provider_message_id: 'SM-SENT-1', status: 'queued' })) });

function makeRes() {
  const res = { statusCode: null, body: null };
  res.status = vi.fn((c) => { res.statusCode = c; return res; });
  res.json = vi.fn((b) => { res.body = b; return res; });
  return res;
}

// =======================================================================================
// FR-1 enqueue + fail-soft
// =======================================================================================
describe('enqueueChairmanSms (FR-1)', () => {
  it('TS-9: idempotent enqueue on dedupe_key creates exactly one owed row', async () => {
    const sb = makeFakeSupabase();
    const args = { recipientPhone: '+15551234567', kind: 'morning_review', body: 'AM review', dedupeKey: 'morning_review:2026-07-18' };
    const first = await enqueueChairmanSms(sb, args);
    const second = await enqueueChairmanSms(sb, args);
    expect(first.enqueued).toBe(true);
    expect(second.enqueued).toBe(false);
    expect(second.deduped).toBe(true);
    expect(sb._tables.sms_outbound_obligations.length).toBe(1);
    expect(sb._tables.sms_outbound_obligations[0].status).toBe('owed');
  });

  it('TS-10: fail-soft — enqueue against an absent (STAGED) table is a no-op, never throws', async () => {
    const sb = makeFakeSupabase({ missingTables: ['sms_outbound_obligations'] });
    expect(await smsOutboundObligationsLive(sb)).toBe(false);
    const r = await enqueueChairmanSms(sb, { recipientPhone: '+1', kind: 'morning_review', body: 'x', dedupeKey: 'k' });
    expect(r.enqueued).toBe(false);
    expect(r.reason).toBe('table_absent_or_error');
  });

  it('SD-LEO-INFRA-CHAIRMAN-DAILY-REVIEW-DOC-001-D FR-4: threads mediaUrl into the inserted row as media_url', async () => {
    const sb = makeFakeSupabase();
    await enqueueChairmanSms(sb, { recipientPhone: '+15551234567', kind: 'morning_review', body: 'x', dedupeKey: 'k-media', mediaUrl: 'https://signed.example/gantt.png' });
    expect(sb._tables.sms_outbound_obligations[0].media_url).toBe('https://signed.example/gantt.png');
  });

  it('SD-LEO-INFRA-CHAIRMAN-DAILY-REVIEW-DOC-001-D FR-4: omitting mediaUrl produces the same row shape as before this change (media_url null)', async () => {
    const sb = makeFakeSupabase();
    await enqueueChairmanSms(sb, { recipientPhone: '+15551234567', kind: 'morning_review', body: 'x', dedupeKey: 'k-nomedia' });
    expect(sb._tables.sms_outbound_obligations[0].media_url).toBeNull();
  });
});

// =======================================================================================
// FR-3 claim-serialized, idempotent worker
// =======================================================================================
describe('reconcileOutboundSms (FR-3)', () => {
  it('TS-1: F1 regression — a 201/queued send is marked sent, NEVER delivered', async () => {
    const sb = makeFakeSupabase({ sms_outbound_obligations: [owedRow()] });
    const provider = okProvider();
    const summary = await reconcileOutboundSms(sb, { provider, now: Date.now() });
    expect(provider.send).toHaveBeenCalledTimes(1);
    expect(summary.sent).toBe(1);
    const row = sb._tables.sms_outbound_obligations[0];
    expect(['owed', 'sending', 'sent']).toContain(row.status);
    expect(row.status).toBe('sent');
    expect(row.delivered_at).toBeNull(); // the 201 alone is NEVER delivery
    expect(row.provider_message_id).toBe('SM-SENT-1');
  });

  it('TS-5: two concurrent workers on one owed row => exactly ONE send', async () => {
    const sb = makeFakeSupabase({ sms_outbound_obligations: [owedRow()] });
    const provider = okProvider(); // shared provider — asserts a single send across both workers
    const [a, b] = await Promise.all([
      reconcileOutboundSms(sb, { provider, workerId: 'W-A' }),
      reconcileOutboundSms(sb, { provider, workerId: 'W-B' }),
    ]);
    expect(provider.send).toHaveBeenCalledTimes(1);
    expect(a.sent + b.sent).toBe(1); // exactly one worker sent; the loser claimed nothing
    expect(sb._tables.sms_outbound_obligations[0].status).toBe('sent');
  });

  it('TS-6: idempotent no-op on an already-delivered obligation (no send, no attempts bump)', async () => {
    const sb = makeFakeSupabase({ sms_outbound_obligations: [owedRow({ status: 'delivered', attempts: 1, delivered_at: new Date().toISOString(), provider_message_id: 'SM-D' })] });
    const provider = okProvider();
    const summary = await reconcileOutboundSms(sb, { provider });
    expect(provider.send).not.toHaveBeenCalled();
    expect(summary.sent).toBe(0);
    const row = sb._tables.sms_outbound_obligations[0];
    expect(row.status).toBe('delivered');
    expect(row.attempts).toBe(1);
  });

  it('TS-7: session-death survival — a fresh worker sends an owed row left by a dead session', async () => {
    const sb = makeFakeSupabase({ sms_outbound_obligations: [owedRow({ id: 'ob-orphan' })] });
    const provider = okProvider();
    const summary = await reconcileOutboundSms(sb, { provider });
    expect(provider.send).toHaveBeenCalledTimes(1);
    expect(summary.sent).toBe(1);
    expect(sb._tables.sms_outbound_obligations[0].status).toBe('sent');
  });

  it('TS-8: sleep-window — a row whose not_before is in the future is NOT claimed', async () => {
    const future = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
    const sb = makeFakeSupabase({ sms_outbound_obligations: [owedRow({ not_before: future })] });
    const provider = okProvider();
    const summary = await reconcileOutboundSms(sb, { provider });
    expect(provider.send).not.toHaveBeenCalled();
    expect(summary.claimed).toBe(0);
    expect(sb._tables.sms_outbound_obligations[0].status).toBe('owed');
  });

  it('bounded retry: an undelivered row under the cap is re-armed to owed then re-sent', async () => {
    const sb = makeFakeSupabase({ sms_outbound_obligations: [owedRow({ status: 'undelivered', attempts: 1 })] });
    const provider = okProvider();
    const summary = await reconcileOutboundSms(sb, { provider, maxAttempts: 3 });
    expect(summary.retried).toBe(1);
    expect(provider.send).toHaveBeenCalledTimes(1); // re-armed to owed, then sent in the same pass
    expect(sb._tables.sms_outbound_obligations[0].status).toBe('sent');
  });

  it('bounded retry: an undelivered row AT the cap alerts and is not re-sent', async () => {
    const sb = makeFakeSupabase({ sms_outbound_obligations: [owedRow({ status: 'undelivered', attempts: 3 })] });
    const provider = okProvider();
    const alert = vi.fn();
    const summary = await reconcileOutboundSms(sb, { provider, maxAttempts: 3, alert });
    expect(alert).toHaveBeenCalledTimes(1);
    expect(provider.send).not.toHaveBeenCalled();
    expect(summary.alerted).toBe(1);
    expect(sb._tables.sms_outbound_obligations[0].status).toBe('failed');
  });

  it('TS-10: fail-soft — the worker is inert when the owed table is absent (STAGED)', async () => {
    const sb = makeFakeSupabase({ missingTables: ['sms_outbound_obligations'] });
    const provider = okProvider();
    const summary = await reconcileOutboundSms(sb, { provider });
    expect(summary.ran).toBe(false);
    expect(summary.reason).toBe('table_absent');
    expect(provider.send).not.toHaveBeenCalled();
  });
});

// =======================================================================================
// SECURITY MEDIUM-2 — sent-no-callback delivery-timeout reconcile
// =======================================================================================
describe('sent-no-callback delivery-timeout (MEDIUM-2)', () => {
  it('a sent row older than the timeout with delivered_at NULL is reconciled (re-armed under cap)', async () => {
    const sb = makeFakeSupabase({ sms_outbound_obligations: [owedRow({ status: 'sent', attempts: 0, provider_message_id: 'SM-old', sent_at: ago(20 * MIN), delivered_at: null })] });
    const provider = okProvider();
    const summary = await reconcileOutboundSms(sb, { provider, sentDeliveryTimeoutMs: 15 * MIN });
    expect(summary.sentTimedOut).toBe(1);
    // re-armed to owed, then re-sent by the send pass in the same run (bounded retry)
    expect(provider.send).toHaveBeenCalledTimes(1);
    expect(sb._tables.sms_outbound_obligations[0].status).toBe('sent');
    expect(sb._tables.sms_outbound_obligations[0].delivered_at).toBeNull(); // still never DELIVERED (201 != delivered)
  });

  it('a sent row WITHIN the timeout is left alone (still awaiting a legitimate callback)', async () => {
    const sb = makeFakeSupabase({ sms_outbound_obligations: [owedRow({ status: 'sent', attempts: 0, provider_message_id: 'SM-fresh', sent_at: ago(5 * MIN), delivered_at: null })] });
    const provider = okProvider();
    const summary = await reconcileOutboundSms(sb, { provider, sentDeliveryTimeoutMs: 15 * MIN });
    expect(summary.sentTimedOut).toBe(0);
    expect(provider.send).not.toHaveBeenCalled();
    expect(sb._tables.sms_outbound_obligations[0].status).toBe('sent');
  });

  it('a sent row AT the cap alerts + goes terminal failed (not re-sent)', async () => {
    const sb = makeFakeSupabase({ sms_outbound_obligations: [owedRow({ status: 'sent', attempts: 3, provider_message_id: 'SM-cap', sent_at: ago(30 * MIN), delivered_at: null })] });
    const provider = okProvider();
    const alert = vi.fn();
    const summary = await reconcileOutboundSms(sb, { provider, maxAttempts: 3, sentDeliveryTimeoutMs: 15 * MIN, alert });
    expect(alert).toHaveBeenCalledTimes(1);
    expect(provider.send).not.toHaveBeenCalled();
    expect(summary.alerted).toBe(1);
    expect(sb._tables.sms_outbound_obligations[0].status).toBe('failed');
  });
});

// =======================================================================================
// SECURITY MEDIUM-1 — sending-crash reaper (with no-double-send guard)
// =======================================================================================
describe('sending-crash reaper (MEDIUM-1)', () => {
  it('a stuck sending row past the claim-timeout with NO provider_message_id is reaped and re-sent', async () => {
    const sb = makeFakeSupabase({ sms_outbound_obligations: [owedRow({ status: 'sending', attempts: 0, claimed_at: ago(10 * MIN), claimed_by: 'dead-worker', provider_message_id: null, sent_at: null })] });
    const provider = okProvider();
    const summary = await reconcileOutboundSms(sb, { provider, claimTimeoutMs: 5 * MIN });
    expect(summary.reaped).toBe(1);
    expect(provider.send).toHaveBeenCalledTimes(1); // never sent before -> safe to re-send
    expect(sb._tables.sms_outbound_obligations[0].status).toBe('sent');
  });

  it('a stuck sending row that ALREADY had a provider_message_id is NOT re-sent (routed to sent-timeout)', async () => {
    // claimed 6 min ago: past the 5-min claim-timeout (reaped) but its estimated sent_at is within
    // the 15-min sent-timeout, so it is flipped to 'sent' and left for a later callback — never re-sent.
    const sb = makeFakeSupabase({ sms_outbound_obligations: [owedRow({ status: 'sending', attempts: 1, claimed_at: ago(6 * MIN), claimed_by: 'dead-worker', provider_message_id: 'SM-was-sent', sent_at: null })] });
    const provider = okProvider();
    const summary = await reconcileOutboundSms(sb, { provider, claimTimeoutMs: 5 * MIN, sentDeliveryTimeoutMs: 15 * MIN });
    expect(summary.reaped).toBe(1);
    expect(provider.send).not.toHaveBeenCalled(); // NO double-send
    const row = sb._tables.sms_outbound_obligations[0];
    expect(row.status).toBe('sent');
    expect(row.provider_message_id).toBe('SM-was-sent'); // SID preserved
  });

  it('a sending row still WITHIN the claim-timeout (live worker) is left alone', async () => {
    const sb = makeFakeSupabase({ sms_outbound_obligations: [owedRow({ status: 'sending', attempts: 0, claimed_at: ago(1 * MIN), claimed_by: 'live-worker', provider_message_id: null, sent_at: null })] });
    const provider = okProvider();
    const summary = await reconcileOutboundSms(sb, { provider, claimTimeoutMs: 5 * MIN });
    expect(summary.reaped).toBe(0);
    expect(provider.send).not.toHaveBeenCalled();
    expect(sb._tables.sms_outbound_obligations[0].status).toBe('sending');
  });
});

// =======================================================================================
// SECURITY LOW — phone masking
// =======================================================================================
describe('phone masking (LOW)', () => {
  it('maskPhone reveals only the last 4 digits', () => {
    expect(maskPhone('+15551234567')).toBe('***4567');
    expect(maskPhone('')).toBe('<no-phone>');
    expect(maskPhone(null)).toBe('<no-phone>');
  });

  it('the default alert never logs the full phone number', async () => {
    const sb = makeFakeSupabase({ sms_outbound_obligations: [owedRow({ status: 'undelivered', attempts: 3, recipient_phone: '+15551234567', last_error: 'carrier reject' })] });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await reconcileOutboundSms(sb, { provider: okProvider(), maxAttempts: 3 }); // default alert path
    const logged = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    spy.mockRestore();
    expect(logged).toContain('***4567');
    expect(logged).not.toContain('+15551234567');
  });
});

// =======================================================================================
// FR-2 delivery-truth status callback
// =======================================================================================
describe('handleTwilioStatusCallback delivery-truth (FR-2)', () => {
  const OLD = process.env.TWILIO_STATUS_CALLBACK_URL;
  beforeEach(() => { process.env.TWILIO_STATUS_CALLBACK_URL = 'https://engineer.example.com/api/webhooks/twilio-status'; });
  afterEach(() => { process.env.TWILIO_STATUS_CALLBACK_URL = OLD; });

  const validProvider = (status) => ({
    verifyInboundSignature: () => true,
    parseStatusCallback: () => ({ messageSid: 'SM-SENT-1', status }),
  });
  const req = (body = {}) => ({ method: 'POST', headers: { 'x-twilio-signature': 'sig' }, body, protocol: 'https', get: () => 'host', originalUrl: '/x' });

  it('TS-2: signature-valid MessageStatus=delivered marks the matched owed row delivered', async () => {
    const sb = makeFakeSupabase({ sms_outbound_obligations: [owedRow({ status: 'sent', provider_message_id: 'SM-SENT-1' }), owedRow({ id: 'ob-other', status: 'sent', provider_message_id: 'SM-OTHER' })] });
    const res = makeRes();
    await handleTwilioStatusCallback(req({ MessageStatus: 'delivered' }), res, { supabase: sb, provider: validProvider('delivered') });
    expect(res.statusCode).toBe(200);
    const matched = sb._tables.sms_outbound_obligations.find((r) => r.provider_message_id === 'SM-SENT-1');
    const other = sb._tables.sms_outbound_obligations.find((r) => r.id === 'ob-other');
    expect(matched.status).toBe('delivered');
    expect(matched.delivered_at).toBeTruthy();
    expect(other.status).toBe('sent'); // no other row affected
    expect(other.delivered_at).toBeNull();
  });

  it('TS-3: signature-valid MessageStatus=undelivered flips the row onto the reconcile path (not success)', async () => {
    const sb = makeFakeSupabase({ sms_outbound_obligations: [owedRow({ status: 'sent', provider_message_id: 'SM-SENT-1' })] });
    const res = makeRes();
    await handleTwilioStatusCallback(req({ MessageStatus: 'undelivered' }), res, { supabase: sb, provider: validProvider('undelivered') });
    expect(res.statusCode).toBe(200);
    const row = sb._tables.sms_outbound_obligations[0];
    expect(row.status).toBe('undelivered');
    expect(row.delivered_at).toBeNull();
  });

  it('TS-4: a forged/invalid X-Twilio-Signature callback is rejected 401 with NO database write', async () => {
    const sb = makeFakeSupabase({ sms_outbound_obligations: [owedRow({ status: 'sent', provider_message_id: 'SM-SENT-1' })] });
    const fromSpy = vi.spyOn(sb, 'from');
    const forged = { verifyInboundSignature: () => false, parseStatusCallback: () => ({ messageSid: 'SM-SENT-1', status: 'delivered' }) };
    const res = makeRes();
    await handleTwilioStatusCallback(req({ MessageStatus: 'delivered' }), res, { supabase: sb, provider: forged });
    expect(res.statusCode).toBe(401);
    expect(fromSpy).not.toHaveBeenCalled(); // rejected BEFORE any DB access
    const row = sb._tables.sms_outbound_obligations[0];
    expect(row.status).toBe('sent'); // untouched — not marked delivered
    expect(row.delivered_at).toBeNull();
  });

  it('a transient MessageStatus=sent callback never sets delivered_at (reinforces TS-1)', async () => {
    const sb = makeFakeSupabase({ sms_outbound_obligations: [owedRow({ status: 'sent', provider_message_id: 'SM-SENT-1' })] });
    const res = makeRes();
    await handleTwilioStatusCallback(req({ MessageStatus: 'sent' }), res, { supabase: sb, provider: validProvider('sent') });
    const row = sb._tables.sms_outbound_obligations[0];
    expect(row.delivered_at).toBeNull();
    expect(row.status).toBe('sent');
  });
});

// =======================================================================================
// Durability pin — the worker holds NO session-local timer.
// =======================================================================================
describe('no session-local timers (FR-3 durability)', () => {
  it('sms-outbound-worker.js contains no setTimeout/setInterval', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const url = await import('url');
    const dir = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.join(dir, '..', '..', '..', 'lib', 'chairman', 'sms-outbound-worker.js'), 'utf8');
    // Match actual CALLS (with the invocation paren), not the prose in the module docstring
    // that explains why there are none.
    expect(src).not.toMatch(/\bset(?:Timeout|Interval)\s*\(/);
  });
});
