/**
 * SD-LEO-FEAT-TWO-WAY-CHAIRMAN-001 FR-4/FR-5 — end-to-end send/receive against a fake
 * MessagingProvider (proves the seam is swappable, per success criteria) and an
 * in-memory fake Supabase client (no live DB, no live Twilio account required).
 */
import { describe, it, expect, vi } from 'vitest';
import { sendChairmanSmsQuestion, handleInboundSmsReply } from '../../../lib/chairman/sms-bridge.js';
import { isMessagingProvider } from '../../../lib/messaging/messaging-provider.js';

/** Minimal in-memory multi-table fake supporting the exact query shapes sms-bridge.js uses. */
function makeFakeSupabase(seed = {}) {
  const tables = {
    chairman_notifications: [...(seed.chairman_notifications || [])],
    chairman_decisions: [...(seed.chairman_decisions || [])],
    sms_inbound_log: [...(seed.sms_inbound_log || [])],
  };
  let seq = 0;

  function applyFilters(rows, filters) {
    return rows.filter((row) =>
      filters.every(([col, op, val]) => {
        if (op === 'eq') return row[col] === val;
        if (op === 'gte') return row[col] >= val;
        if (op === 'not_is_null') return row[col] !== null && row[col] !== undefined;
        return true;
      })
    );
  }

  function from(table) {
    const ctx = { filters: [], order: null, limitN: null, mode: null, countMode: false };
    const api = {
      select(_cols, opts) {
        ctx.mode = 'select';
        if (opts?.count === 'exact' && opts?.head) ctx.countMode = true;
        return api;
      },
      insert(row) {
        ctx.mode = 'insert';
        ctx.row = { id: `row-${++seq}`, created_at: new Date().toISOString(), ...row };
        return api;
      },
      update(vals) {
        ctx.mode = 'update';
        ctx.vals = vals;
        return api;
      },
      eq(col, val) { ctx.filters.push([col, 'eq', val]); return api; },
      gte(col, val) { ctx.filters.push([col, 'gte', val]); return api; },
      not(col, _op, _val) { ctx.filters.push([col, 'not_is_null', null]); return api; },
      order(col, { ascending } = {}) { ctx.order = { col, ascending: !!ascending }; return api; },
      limit(n) { ctx.limitN = n; return api; },
      async maybeSingle() {
        const rows = applyFilters(tables[table], ctx.filters);
        return { data: rows[0] || null, error: null };
      },
      then(resolve) {
        if (ctx.mode === 'insert') {
          tables[table].push(ctx.row);
          resolve({ data: [{ id: ctx.row.id }], error: null });
          return;
        }
        if (ctx.mode === 'update') {
          const rows = applyFilters(tables[table], ctx.filters);
          rows.forEach((r) => Object.assign(r, ctx.vals));
          resolve({ data: null, error: null });
          return;
        }
        // select
        let rows = applyFilters(tables[table], ctx.filters);
        if (ctx.order) {
          rows = [...rows].sort((a, b) => {
            const cmp = a[ctx.order.col] < b[ctx.order.col] ? -1 : a[ctx.order.col] > b[ctx.order.col] ? 1 : 0;
            return ctx.order.ascending ? cmp : -cmp;
          });
        }
        if (ctx.limitN != null) rows = rows.slice(0, ctx.limitN);
        if (ctx.countMode) {
          resolve({ count: rows.length, data: null, error: null });
        } else {
          resolve({ data: rows, error: null });
        }
      },
    };
    return api;
  }

  return { from, _tables: tables };
}

function makeFakeProvider({ sendResult } = {}) {
  return {
    send: vi.fn(async () => sendResult || { provider_message_id: 'FAKE-SID-1', status: 'queued' }),
    verifyInboundSignature: () => true,
    normalizeInboundWebhook: (body) => body,
    parseStatusCallback: (body) => body,
  };
}

describe('MessagingProvider seam is swappable', () => {
  it('a fake provider satisfies the contract just like the real Twilio one', () => {
    expect(isMessagingProvider(makeFakeProvider()).valid).toBe(true);
  });
});

describe('sendChairmanSmsQuestion', () => {
  it('never sends a HIGH-consequence question', async () => {
    const sb = makeFakeSupabase();
    const provider = makeFakeProvider();
    const result = await sendChairmanSmsQuestion(sb, {
      decisionId: 'dec-1', chairmanUserId: 'u1', chairmanEmail: 'chairman@example.com',
      chairmanPhone: '+15551234567', title: 'Approve a $10,000 spend for governance change?',
    }, provider, { quietWindow: () => false });
    expect(result.sent).toBe(false);
    expect(result.reason).toBe('high_consequence');
    expect(provider.send).not.toHaveBeenCalled();
    expect(sb._tables.chairman_notifications.length).toBe(0);
  });

  it('sends a LOW-consequence question, persists the notification + token', async () => {
    const sb = makeFakeSupabase({ chairman_decisions: [{ id: 'dec-2', status: 'pending', brief_data: {} }] });
    const provider = makeFakeProvider();
    const result = await sendChairmanSmsQuestion(sb, {
      decisionId: 'dec-2', chairmanUserId: 'u1', chairmanEmail: 'chairman@example.com',
      chairmanPhone: '+15551234567', title: 'Which time works better for the call, 2pm or 4pm?',
    }, provider, { quietWindow: () => false });
    expect(result.sent).toBe(true);
    expect(result.consequence).toBe('low');
    expect(provider.send).toHaveBeenCalledTimes(1);
    expect(sb._tables.chairman_notifications.length).toBe(1);
    expect(sb._tables.chairman_notifications[0].channel).toBe('sms');
    const decision = sb._tables.chairman_decisions.find((d) => d.id === 'dec-2');
    expect(decision.sms_reply_token).toBeTruthy();
    expect(decision.sms_reply_token_expires_at).toBeTruthy();
  });
});

describe('handleInboundSmsReply — send/receive round trip against a fake provider', () => {
  it('a correct reply resolves the matching decision exactly once; a replay is rejected', async () => {
    const sb = makeFakeSupabase({ chairman_decisions: [{ id: 'dec-3', status: 'pending', brief_data: {} }] });
    const provider = makeFakeProvider();

    const sendResult = await sendChairmanSmsQuestion(sb, {
      decisionId: 'dec-3', chairmanUserId: 'u1', chairmanEmail: 'chairman@example.com',
      chairmanPhone: '+15551234567', title: 'FYI: quick venture status check-in?',
    }, provider, { quietWindow: () => false });
    expect(sendResult.sent).toBe(true);

    const first = await handleInboundSmsReply(sb, {
      from: '+15551234567', to: '+15559999999', body: 'looks good, proceed',
      messageSid: 'SM-reply-1', signatureValid: true,
    });
    expect(first.resolved).toBe(true);
    expect(first.outcome).toBe('answered');
    expect(first.decisionId).toBe('dec-3');

    const decision = sb._tables.chairman_decisions.find((d) => d.id === 'dec-3');
    expect(decision.brief_data.sms_reply.text).toBe('looks good, proceed');
    expect(decision.sms_reply_used_at).toBeTruthy();
    // status is left as 'pending' — the agent's next tick consumes brief_data.sms_reply
    // and resolves it; this module only delivers the reply (see sms-bridge.js docstring).
    expect(decision.status).toBe('pending');

    const replay = await handleInboundSmsReply(sb, {
      from: '+15551234567', to: '+15559999999', body: 'looks good, proceed',
      messageSid: 'SM-reply-1-retry', signatureValid: true,
    });
    expect(replay.resolved).toBe(false);
    expect(replay.outcome).toBe('no_match');

    // Every attempt (including the rejected replay) is audit-logged.
    expect(sb._tables.sms_inbound_log.length).toBe(2);
    expect(sb._tables.sms_inbound_log[0].outcome).toBe('answered');
    expect(sb._tables.sms_inbound_log[1].outcome).toBe('no_match');
  });

  it('an invalid signature is rejected before any decision correlation and logged', async () => {
    const sb = makeFakeSupabase({ chairman_decisions: [{ id: 'dec-4', status: 'pending', brief_data: {} }] });
    const result = await handleInboundSmsReply(sb, {
      from: '+15551234567', to: '+15559999999', body: 'anything',
      messageSid: 'SM-spoof-1', signatureValid: false,
    });
    expect(result.resolved).toBe(false);
    expect(result.outcome).toBe('invalid_signature');
    expect(sb._tables.sms_inbound_log[0].outcome).toBe('invalid_signature');
    const decision = sb._tables.chairman_decisions.find((d) => d.id === 'dec-4');
    expect(decision.sms_reply_used_at).toBeFalsy();
  });

  it('no pending SMS question for that number logs no_match', async () => {
    const sb = makeFakeSupabase();
    const result = await handleInboundSmsReply(sb, {
      from: '+15550000000', to: '+15559999999', body: 'yes',
      messageSid: 'SM-orphan-1', signatureValid: true,
    });
    expect(result.resolved).toBe(false);
    expect(result.outcome).toBe('no_match');
  });

  it('an expired token is rejected and logged, decision remains pending', async () => {
    const sb = makeFakeSupabase({
      chairman_decisions: [{
        id: 'dec-5', status: 'pending', brief_data: {},
        sms_reply_token: 'tok-expired', sms_reply_token_expires_at: new Date(Date.now() - 60_000).toISOString(),
      }],
      chairman_notifications: [{
        id: 'n-1', channel: 'sms', recipient_phone: '+15552223333', decision_id: 'dec-5',
        created_at: new Date(Date.now() - 120_000).toISOString(),
      }],
    });
    const result = await handleInboundSmsReply(sb, {
      from: '+15552223333', to: '+15559999999', body: 'yes',
      messageSid: 'SM-late-1', signatureValid: true,
    });
    expect(result.resolved).toBe(false);
    expect(result.outcome).toBe('expired');
    const decision = sb._tables.chairman_decisions.find((d) => d.id === 'dec-5');
    expect(decision.status).toBe('pending');
    expect(decision.sms_reply_used_at).toBeFalsy();
  });
});
