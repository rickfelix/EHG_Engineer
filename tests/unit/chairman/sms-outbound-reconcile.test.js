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
// SD-LEO-INFRA-SMS-DELIVERY-TRUTH-001-A: minimal .or('col.eq.val,col2.cs.{val}') parser — just
// enough to model applyOwedDeliveryTruth's provider_message_id-or-prior-history lookup, not a
// general PostgREST filter-string parser.
function parseOrFilter(str) {
  return str.split(',').map((clause) => {
    const firstDot = clause.indexOf('.');
    const secondDot = clause.indexOf('.', firstDot + 1);
    return { col: clause.slice(0, firstDot), op: clause.slice(firstDot + 1, secondDot), val: clause.slice(secondDot + 1) };
  });
}
function matchesOrClause(row, clause) {
  if (clause.op === 'eq') return row[clause.col] === clause.val;
  if (clause.op === 'cs') {
    const inner = clause.val.replace(/^\{/, '').replace(/\}$/, '');
    return Array.isArray(row[clause.col]) && row[clause.col].includes(inner);
  }
  return false;
}

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
        // .not(col, 'in', '(a,b)') — PostgREST literal-list format, as used by
        // applyOwedDeliveryTruth's terminal-status exclusion guard.
        if (op === 'not.in') return !val.replace(/^\(/, '').replace(/\)$/, '').split(',').includes(row[col]);
        return true;
      })
    );
  }

  function from(table) {
    const ctx = { filters: [], orFilters: null, order: null, limitN: null, mode: 'select', returnSelect: false, row: null, vals: null, upsertOpts: null };
    const isMissing = missing.has(table);
    const api = {
      select(_cols) { if (ctx.mode === 'update' || ctx.mode === 'insert' || ctx.mode === 'upsert') { ctx.returnSelect = true; return api; } ctx.mode = 'select'; return api; },
      insert(row) { ctx.mode = 'insert'; ctx.row = { id: `row-${++seq}`, created_at: new Date().toISOString(), ...row }; return api; },
      upsert(row, opts) { ctx.mode = 'upsert'; ctx.row = { id: `row-${++seq}`, created_at: new Date().toISOString(), attempts: 0, ...row }; ctx.upsertOpts = opts || {}; return api; },
      update(vals) { ctx.mode = 'update'; ctx.vals = vals; return api; },
      eq(col, val) { ctx.filters.push([col, 'eq', val]); return api; },
      in(col, arr) { ctx.filters.push([col, 'in', arr]); return api; },
      is(col, val) { ctx.filters.push([col, 'is', val]); return api; },
      not(col, op, val) { ctx.filters.push([col, `not.${op}`, val]); return api; },
      or(filterStr) { ctx.orFilters = parseOrFilter(filterStr); return api; },
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
          let rows = applyFilters(tables[table], ctx.filters);
          if (ctx.orFilters) rows = rows.filter((r) => ctx.orFilters.some((c) => matchesOrClause(r, c)));
          rows.forEach((r) => Object.assign(r, ctx.vals));
          resolve({ data: ctx.returnSelect ? rows.map((r) => ({ ...r })) : null, error: null });
          return;
        }
        let rows = applyFilters(tables[table], ctx.filters);
        if (ctx.orFilters) rows = rows.filter((r) => ctx.orFilters.some((c) => matchesOrClause(r, c)));
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
  status: 'owed', provider_message_id: null, prior_provider_message_ids: [], attempts: 0, not_before: null,
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
describe('sent-no-callback delivery-timeout (MEDIUM-2 / FR-2 provider-check)', () => {
  it('a sent row older than the timeout, PROVIDER-CONFIRMS undelivered, is reconciled (re-armed under cap)', async () => {
    const sb = makeFakeSupabase({ sms_outbound_obligations: [owedRow({ status: 'sent', attempts: 0, provider_message_id: 'SM-old', sent_at: ago(20 * MIN), delivered_at: null })] });
    const checkMessageStatus = vi.fn(async () => ({ status: 'undelivered' }));
    const provider = { ...okProvider(), checkMessageStatus };
    const summary = await reconcileOutboundSms(sb, { provider, sentDeliveryTimeoutMs: 15 * MIN });
    expect(checkMessageStatus).toHaveBeenCalledWith('SM-old'); // FR-2: never blind — always queries the provider first
    expect(summary.sentTimedOut).toBe(1);
    // re-armed to owed, then re-sent by the send pass in the same run (bounded retry)
    expect(provider.send).toHaveBeenCalledTimes(1);
    expect(sb._tables.sms_outbound_obligations[0].status).toBe('sent');
    expect(sb._tables.sms_outbound_obligations[0].delivered_at).toBeNull(); // still never DELIVERED (201 != delivered)
  });

  it('a sent row WITHIN the timeout is left alone (still awaiting a legitimate callback, provider never queried)', async () => {
    const sb = makeFakeSupabase({ sms_outbound_obligations: [owedRow({ status: 'sent', attempts: 0, provider_message_id: 'SM-fresh', sent_at: ago(5 * MIN), delivered_at: null })] });
    const checkMessageStatus = vi.fn(async () => ({ status: 'undelivered' }));
    const provider = { ...okProvider(), checkMessageStatus };
    const summary = await reconcileOutboundSms(sb, { provider, sentDeliveryTimeoutMs: 15 * MIN });
    expect(summary.sentTimedOut).toBe(0);
    expect(checkMessageStatus).not.toHaveBeenCalled();
    expect(provider.send).not.toHaveBeenCalled();
    expect(sb._tables.sms_outbound_obligations[0].status).toBe('sent');
  });

  it('a sent row AT the cap, PROVIDER-CONFIRMS undelivered, alerts + goes terminal failed (not re-sent)', async () => {
    const sb = makeFakeSupabase({ sms_outbound_obligations: [owedRow({ status: 'sent', attempts: 3, provider_message_id: 'SM-cap', sent_at: ago(30 * MIN), delivered_at: null })] });
    const checkMessageStatus = vi.fn(async () => ({ status: 'undelivered' }));
    const provider = { ...okProvider(), checkMessageStatus };
    const alert = vi.fn();
    const summary = await reconcileOutboundSms(sb, { provider, maxAttempts: 3, sentDeliveryTimeoutMs: 15 * MIN, alert });
    expect(alert).toHaveBeenCalledTimes(1);
    expect(provider.send).not.toHaveBeenCalled();
    expect(summary.alerted).toBe(1);
    expect(sb._tables.sms_outbound_obligations[0].status).toBe('failed');
  });

  it('FR-2: provider CONFIRMS delivered — stamps delivered_at directly, never re-owed/re-sent', async () => {
    const sb = makeFakeSupabase({ sms_outbound_obligations: [owedRow({ status: 'sent', attempts: 0, provider_message_id: 'SM-late-deliver', sent_at: ago(20 * MIN), delivered_at: null })] });
    const checkMessageStatus = vi.fn(async () => ({ status: 'delivered' }));
    const provider = { ...okProvider(), checkMessageStatus };
    const summary = await reconcileOutboundSms(sb, { provider, sentDeliveryTimeoutMs: 15 * MIN });
    expect(summary.confirmedDelivered).toBe(1);
    expect(provider.send).not.toHaveBeenCalled(); // the callback was just lost/late — never a duplicate send
    const row = sb._tables.sms_outbound_obligations[0];
    expect(row.status).toBe('delivered');
    expect(row.delivered_at).toBeTruthy();
  });

  it('Solomon Pin #3: the provider-check ITSELF failing (no callback AND a failed check) escalates to owed_escalate, never silently closed', async () => {
    const sb = makeFakeSupabase({ sms_outbound_obligations: [owedRow({ status: 'sent', attempts: 0, provider_message_id: 'SM-check-fails', sent_at: ago(20 * MIN), delivered_at: null })] });
    const checkMessageStatus = vi.fn(async () => { throw new Error('twilio_status_check_http_500'); });
    const provider = { ...okProvider(), checkMessageStatus };
    const alert = vi.fn();
    const summary = await reconcileOutboundSms(sb, { provider, sentDeliveryTimeoutMs: 15 * MIN, alert });
    expect(summary.escalated).toBe(1);
    expect(alert).toHaveBeenCalledTimes(1); // never SILENTLY closed
    expect(provider.send).not.toHaveBeenCalled();
    const row = sb._tables.sms_outbound_obligations[0];
    expect(row.status).toBe('owed_escalate');
    expect(row.last_error).toMatch(/provider_check_failed/);
  });

  it('Solomon Pin #3: an ambiguous (non-terminal) provider-check answer despite our own timeout also escalates', async () => {
    const sb = makeFakeSupabase({ sms_outbound_obligations: [owedRow({ status: 'sent', attempts: 0, provider_message_id: 'SM-ambiguous', sent_at: ago(20 * MIN), delivered_at: null })] });
    const checkMessageStatus = vi.fn(async () => ({ status: 'queued' })); // Twilio itself says non-terminal
    const provider = { ...okProvider(), checkMessageStatus };
    const summary = await reconcileOutboundSms(sb, { provider, sentDeliveryTimeoutMs: 15 * MIN });
    expect(summary.escalated).toBe(1);
    expect(sb._tables.sms_outbound_obligations[0].status).toBe('owed_escalate');
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
// Solomon Pin #2 — duplicate-send history preservation across a resend
// =======================================================================================
describe('resend preserves provider_message_id history (Solomon Pin #2)', () => {
  it('a resend PRESERVES the prior SID in prior_provider_message_ids instead of overwriting it', async () => {
    // Row already carries a prior SID (from a first send) and is back to 'owed' (re-armed).
    const sb = makeFakeSupabase({ sms_outbound_obligations: [owedRow({ status: 'owed', attempts: 1, provider_message_id: 'SM-FIRST', prior_provider_message_ids: [] })] });
    const provider = { send: vi.fn(async () => ({ provider_message_id: 'SM-SECOND', status: 'queued' })) };
    await reconcileOutboundSms(sb, { provider });
    const row = sb._tables.sms_outbound_obligations[0];
    expect(row.provider_message_id).toBe('SM-SECOND');
    expect(row.prior_provider_message_ids).toContain('SM-FIRST'); // the old SID is NOT lost
  });

  it('a late callback for the ORIGINAL (pre-resend) SID still resolves against the row (Pin #2 acceptance) instead of silently no-op-ing', async () => {
    const sb = makeFakeSupabase({ sms_outbound_obligations: [
      owedRow({ id: 'ob-history', status: 'sent', provider_message_id: 'SM-SECOND', prior_provider_message_ids: ['SM-FIRST'] }),
    ] });
    const res = makeRes();
    process.env.TWILIO_STATUS_CALLBACK_URL = 'https://engineer.example.com/api/webhooks/twilio-status';
    // A callback arrives for SM-FIRST (the ORIGINAL send) — pre-fix this matches ZERO rows and
    // silently no-ops, even though the row it belongs to still exists and needs delivery-truth.
    await handleTwilioStatusCallback(
      { method: 'POST', headers: { 'x-twilio-signature': 'sig' }, body: { MessageStatus: 'delivered' }, protocol: 'https', get: () => 'host', originalUrl: '/x' },
      res,
      { supabase: sb, provider: { verifyInboundSignature: () => true, parseStatusCallback: () => ({ messageSid: 'SM-FIRST', status: 'delivered' }) } },
    );
    const row = sb._tables.sms_outbound_obligations.find((r) => r.id === 'ob-history');
    expect(row.status).toBe('delivered'); // resolved, NOT a silent no-op
    expect(row.delivered_at).toBeTruthy();
  });

  it("adversarial-review finding: a stale/superseded SID's late 'undelivered' callback must NOT flip a row whose CURRENT (newer) attempt is still unresolved", async () => {
    const sb = makeFakeSupabase({ sms_outbound_obligations: [
      owedRow({ id: 'ob-superseded', status: 'sent', provider_message_id: 'SM-SECOND', prior_provider_message_ids: ['SM-FIRST'] }),
    ] });
    process.env.TWILIO_STATUS_CALLBACK_URL = 'https://engineer.example.com/api/webhooks/twilio-status';
    // A late callback arrives for SM-FIRST (the SUPERSEDED attempt) reporting undelivered. This
    // tells us nothing about SM-SECOND (the current, still-unresolved attempt) — it must NOT
    // terminate the row.
    await handleTwilioStatusCallback(
      { method: 'POST', headers: { 'x-twilio-signature': 'sig' }, body: { MessageStatus: 'undelivered' }, protocol: 'https', get: () => 'host', originalUrl: '/x' },
      makeRes(),
      { supabase: sb, provider: { verifyInboundSignature: () => true, parseStatusCallback: () => ({ messageSid: 'SM-FIRST', status: 'undelivered' }) } },
    );
    const row = sb._tables.sms_outbound_obligations.find((r) => r.id === 'ob-superseded');
    expect(row.status).toBe('sent'); // untouched — still tracking the current attempt
  });

  it("a 'delivered' callback for the current SID still applies normally (unaffected by the prior-SID scoping change)", async () => {
    const sb = makeFakeSupabase({ sms_outbound_obligations: [
      owedRow({ id: 'ob-current', status: 'sent', provider_message_id: 'SM-SECOND', prior_provider_message_ids: ['SM-FIRST'] }),
    ] });
    process.env.TWILIO_STATUS_CALLBACK_URL = 'https://engineer.example.com/api/webhooks/twilio-status';
    await handleTwilioStatusCallback(
      { method: 'POST', headers: { 'x-twilio-signature': 'sig' }, body: { MessageStatus: 'delivered' }, protocol: 'https', get: () => 'host', originalUrl: '/x' },
      makeRes(),
      { supabase: sb, provider: { verifyInboundSignature: () => true, parseStatusCallback: () => ({ messageSid: 'SM-SECOND', status: 'delivered' }) } },
    );
    const row = sb._tables.sms_outbound_obligations.find((r) => r.id === 'ob-current');
    expect(row.status).toBe('delivered');
    expect(row.delivered_at).toBeTruthy();
  });

  it("adversarial-review finding (SECURITY, EXEC-TO-PLAN): a callback for a PRIOR sid that lands mid-resend wins — the in-flight resend's own completion never clobbers it back to 'sent'", async () => {
    // The row is 'sending' (mid-resend, claimed) and already carries a prior SID from the send
    // this resend is superseding. A late callback for that prior SID arrives WHILE the resend is
    // still in flight (before its own completion write runs) and correctly stamps 'delivered'.
    const sb = makeFakeSupabase({ sms_outbound_obligations: [
      owedRow({ id: 'ob-race', status: 'sending', provider_message_id: 'SM-FIRST', prior_provider_message_ids: [], claimed_at: new Date().toISOString(), claimed_by: 'worker-race' }),
    ] });
    process.env.TWILIO_STATUS_CALLBACK_URL = 'https://engineer.example.com/api/webhooks/twilio-status';
    await handleTwilioStatusCallback(
      { method: 'POST', headers: { 'x-twilio-signature': 'sig' }, body: { MessageStatus: 'delivered' }, protocol: 'https', get: () => 'host', originalUrl: '/x' },
      makeRes(),
      { supabase: sb, provider: { verifyInboundSignature: () => true, parseStatusCallback: () => ({ messageSid: 'SM-FIRST', status: 'delivered' }) } },
    );
    expect(sb._tables.sms_outbound_obligations[0].status).toBe('delivered'); // callback landed first

    // The resend's own claim-holder (an in-progress reconcileOutboundSms Pass 2 iteration) now
    // tries to write its completion — pre-fix this unconditionally overwrote status back to
    // 'sent'. Simulate it directly against the SAME row state, mirroring the exact update shape
    // Pass 2 issues (status guard included).
    await sb.from('sms_outbound_obligations')
      .update({ status: 'sent', provider_message_id: 'SM-SECOND', prior_provider_message_ids: ['SM-FIRST'], sent_at: new Date().toISOString(), attempts: 2 })
      .eq('id', 'ob-race')
      .eq('status', 'sending'); // guard: only applies while still 'sending' — no longer true

    const row = sb._tables.sms_outbound_obligations[0];
    expect(row.status).toBe('delivered'); // NOT clobbered back to 'sent'
    expect(row.provider_message_id).toBe('SM-FIRST'); // the resend's completion never applied
  });

  it('kill-mid-retry/restart acceptance: two full reconcile passes against the same persisted state never duplicate a send beyond the claim/retry contract', async () => {
    const sb = makeFakeSupabase({ sms_outbound_obligations: [owedRow({ status: 'owed' })] });
    const provider = { send: vi.fn(async () => ({ provider_message_id: `SM-${sb._tables.sms_outbound_obligations[0].attempts}`, status: 'queued' })) };
    // First "process" — send #1, then a crash is simulated by nothing further happening.
    await reconcileOutboundSms(sb, { provider });
    expect(provider.send).toHaveBeenCalledTimes(1);
    // "Restart": a fresh reconcile pass against the SAME (already 'sent', undelivered) state.
    // Since the row is 'sent' (not 'owed') and still within the sent-delivery timeout, the
    // fresh pass must NOT re-send it — the claim+status contract alone prevents the duplicate.
    await reconcileOutboundSms(sb, { provider });
    expect(provider.send).toHaveBeenCalledTimes(1); // still exactly one send after "restart"
  });
});

// =======================================================================================
// Solomon Pin #1 — sleep-window enforcement AT RELEASE time (not just at enqueue)
// =======================================================================================
describe('sleep-window at retry-release (Solomon Pin #1)', () => {
  it('a retry re-armed INSIDE the 10PM-6AM ET window is held with not_before set to the next 6AM ET release, not fired immediately', async () => {
    // 2026-01-15 is not a DST edge; 11:58 PM ET = 04:58 UTC the next day.
    const insideWindow = new Date('2026-01-16T04:58:00.000Z'); // 11:58 PM ET on 2026-01-15
    const sb = makeFakeSupabase({ sms_outbound_obligations: [owedRow({ status: 'undelivered', attempts: 1 })] });
    const provider = okProvider();
    await reconcileOutboundSms(sb, { provider, maxAttempts: 3, now: insideWindow.getTime() });
    const row = sb._tables.sms_outbound_obligations[0];
    // Re-armed to 'owed' with a future not_before means Pass 2's claimable filter excludes it —
    // it must NOT have been sent in this same pass despite being under the retry cap.
    expect(provider.send).not.toHaveBeenCalled();
    expect(row.status).toBe('owed');
    expect(row.not_before).toBeTruthy();
    expect(new Date(row.not_before).getTime()).toBeGreaterThan(insideWindow.getTime());
  });

  it('a retry re-armed OUTSIDE the 10PM-6AM ET window is released immediately (not_before cleared) and resent in the same pass', async () => {
    const outsideWindow = new Date('2026-01-15T15:00:00.000Z'); // ~10 AM ET
    const sb = makeFakeSupabase({ sms_outbound_obligations: [owedRow({ status: 'undelivered', attempts: 1 })] });
    const provider = okProvider();
    await reconcileOutboundSms(sb, { provider, maxAttempts: 3, now: outsideWindow.getTime() });
    expect(provider.send).toHaveBeenCalledTimes(1); // re-armed then resent in the same pass
    const row = sb._tables.sms_outbound_obligations[0];
    expect(row.status).toBe('sent');
  });
});

// =======================================================================================
// FR-5 — owed-state sole-send-authority audit (durable, re-checked — not a one-time PR note)
// =======================================================================================
describe('owed-state sole-send-authority: no bypass call sites (FR-5 audit)', () => {
  it('the ONLY direct provider.send()/twilioProvider.send() call sites are the two sanctioned ones', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const url = await import('url');
    const dir = path.dirname(url.fileURLToPath(import.meta.url));
    const repoRoot = path.join(dir, '..', '..', '..');
    const CALL_RE = /\b(?:provider|twilioProvider)\.send\s*\(/;
    // Sanctioned: worker.js's atomic-claim-gated Pass 2 send, and sms-bridge.js's documented
    // STAGED-table-absent pre-apply fallback (dead code once FR-0's migration is applied).
    const SANCTIONED = new Set([
      path.join('lib', 'chairman', 'sms-outbound-worker.js'),
      path.join('lib', 'chairman', 'sms-bridge.js'),
    ]);

    function walk(dirPath, out) {
      for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        const full = path.join(dirPath, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else if (/\.(js|mjs|cjs)$/.test(entry.name)) out.push(full);
      }
    }

    // Strip comment-only lines (block-comment '*' continuations and '//' lines) so a PROSE
    // mention of "provider.send(" in a docstring doesn't false-positive as a real call site.
    function codeLines(src) {
      return src.split('\n').filter((line) => !/^\s*(\*|\/\/)/.test(line));
    }

    const offenders = [];
    for (const dirName of ['lib', 'scripts', 'api']) {
      const abs = path.join(repoRoot, dirName);
      if (!fs.existsSync(abs)) continue;
      const files = [];
      walk(abs, files);
      for (const file of files) {
        if (/[\\/](tests?|one-off)[\\/]/.test(file) || file.endsWith('.test.js')) continue;
        const rel = path.relative(repoRoot, file);
        if (SANCTIONED.has(rel)) continue;
        const src = codeLines(fs.readFileSync(file, 'utf8')).join('\n');
        if (CALL_RE.test(src)) offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
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
