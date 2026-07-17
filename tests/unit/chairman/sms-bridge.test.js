/**
 * SD-LEO-FEAT-TWO-WAY-CHAIRMAN-001 FR-4/FR-5 — end-to-end send/receive against a fake
 * MessagingProvider (proves the seam is swappable, per success criteria) and an
 * in-memory fake Supabase client (no live DB, no live Twilio account required).
 */
import { describe, it, expect, vi } from 'vitest';
import { sendChairmanSmsQuestion, handleInboundSmsReply, drainSmsRelayStaging, AUTO_SUSPEND_INVALID_SIGNATURE_THRESHOLD } from '../../../lib/chairman/sms-bridge.js';
import { isMessagingProvider } from '../../../lib/messaging/messaging-provider.js';

/** Minimal in-memory multi-table fake supporting the exact query shapes sms-bridge.js uses. */
function makeFakeSupabase(seed = {}) {
  const tables = {
    chairman_notifications: [...(seed.chairman_notifications || [])],
    chairman_decisions: [...(seed.chairman_decisions || [])],
    sms_inbound_log: [...(seed.sms_inbound_log || [])],
    sms_inbound_suspensions: [...(seed.sms_inbound_suspensions || [])],
    sms_relay_staging: [...(seed.sms_relay_staging || [])],
  };
  let seq = 0;

  function applyFilters(rows, filters) {
    return rows.filter((row) =>
      filters.every(([col, op, val]) => {
        if (op === 'eq') return row[col] === val;
        if (op === 'gte') return row[col] >= val;
        if (op === 'not_is_null') return row[col] !== null && row[col] !== undefined;
        if (op === 'in') return Array.isArray(val) && val.includes(row[col]);
        if (op === 'is') return (row[col] ?? null) === val;
        return true;
      })
    );
  }

  function from(table) {
    const ctx = { filters: [], order: null, limitN: null, mode: null, countMode: false, returnSelect: false };
    const api = {
      select(_cols, opts) {
        if (ctx.mode === 'update' || ctx.mode === 'insert') {
          ctx.returnSelect = true;
          return api;
        }
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
      in(col, arr) { ctx.filters.push([col, 'in', arr]); return api; },
      is(col, val) { ctx.filters.push([col, 'is', val]); return api; },
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
          resolve({ data: ctx.returnSelect ? rows.map((r) => ({ id: r.id })) : null, error: null });
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

  // Adversarial review findings (deep-tier PR #6093) — regression coverage.
  it('correlates to the most-recent-PENDING question, not simply the most-recently-sent one', async () => {
    const now = Date.now();
    const sb = makeFakeSupabase({
      chairman_decisions: [
        {
          id: 'dec-early-open', status: 'pending', brief_data: {},
          sms_reply_token: 'tok-early', sms_reply_token_expires_at: new Date(now + 10 * 60_000).toISOString(),
        },
        {
          id: 'dec-later-answered', status: 'pending', brief_data: {},
          sms_reply_token: 'tok-later', sms_reply_token_expires_at: new Date(now + 10 * 60_000).toISOString(),
          sms_reply_used_at: new Date(now - 30_000).toISOString(),
        },
      ],
      chairman_notifications: [
        { id: 'n-early', channel: 'sms', recipient_phone: '+15557778888', decision_id: 'dec-early-open', created_at: new Date(now - 120_000).toISOString() },
        { id: 'n-later', channel: 'sms', recipient_phone: '+15557778888', decision_id: 'dec-later-answered', created_at: new Date(now - 60_000).toISOString() },
      ],
    });
    const result = await handleInboundSmsReply(sb, {
      from: '+15557778888', to: '+15559999999', body: 'proceed with the earlier one',
      messageSid: 'SM-correlate-1', signatureValid: true,
    });
    expect(result.resolved).toBe(true);
    expect(result.decisionId).toBe('dec-early-open');
    const early = sb._tables.chairman_decisions.find((d) => d.id === 'dec-early-open');
    expect(early.sms_reply_used_at).toBeTruthy();
    const later = sb._tables.chairman_decisions.find((d) => d.id === 'dec-later-answered');
    expect(later.brief_data.sms_reply).toBeUndefined(); // untouched
  });

  it('two concurrent replies for the same decision: only one wins the single-use claim, no clobber', async () => {
    const sb = makeFakeSupabase({
      chairman_decisions: [{
        id: 'dec-race', status: 'pending', brief_data: {},
        sms_reply_token: 'tok-race', sms_reply_token_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      }],
      chairman_notifications: [{
        id: 'n-race', channel: 'sms', recipient_phone: '+15551110000', decision_id: 'dec-race',
        created_at: new Date(Date.now() - 60_000).toISOString(),
      }],
    });
    const [first, second] = await Promise.all([
      handleInboundSmsReply(sb, { from: '+15551110000', to: '+15559999999', body: 'answer A', messageSid: 'SM-race-A', signatureValid: true }),
      handleInboundSmsReply(sb, { from: '+15551110000', to: '+15559999999', body: 'answer B', messageSid: 'SM-race-B', signatureValid: true }),
    ]);
    const outcomes = [first.outcome, second.outcome].sort();
    expect(outcomes).toEqual(['answered', 'no_match']);
    const decision = sb._tables.chairman_decisions.find((d) => d.id === 'dec-race');
    // Exactly one reply's text landed — not a merge/clobber of both.
    expect(['answer A', 'answer B']).toContain(decision.brief_data.sms_reply.text);
  });

  // SD-LEO-FEAT-SMS-INBOUND-RELAY-001 FR-3 additions.
  it('ambiguous: 2+ simultaneously-eligible pending candidates are rejected, not guessed', async () => {
    const now = Date.now();
    const sb = makeFakeSupabase({
      chairman_decisions: [
        { id: 'dec-amb-1', status: 'pending', brief_data: {}, sms_reply_token_expires_at: new Date(now + 10 * 60_000).toISOString() },
        { id: 'dec-amb-2', status: 'pending', brief_data: {}, sms_reply_token_expires_at: new Date(now + 10 * 60_000).toISOString() },
      ],
      chairman_notifications: [
        { id: 'n-amb-1', channel: 'sms', recipient_phone: '+15556667777', decision_id: 'dec-amb-1', created_at: new Date(now - 120_000).toISOString() },
        { id: 'n-amb-2', channel: 'sms', recipient_phone: '+15556667777', decision_id: 'dec-amb-2', created_at: new Date(now - 60_000).toISOString() },
      ],
    });
    const result = await handleInboundSmsReply(sb, {
      from: '+15556667777', to: '+15559999999', body: 'yes',
      messageSid: 'SM-ambiguous-1', signatureValid: true,
    });
    expect(result.resolved).toBe(false);
    expect(result.outcome).toBe('ambiguous');
    expect(sb._tables.chairman_decisions.find((d) => d.id === 'dec-amb-1').sms_reply_used_at).toBeFalsy();
    expect(sb._tables.chairman_decisions.find((d) => d.id === 'dec-amb-2').sms_reply_used_at).toBeFalsy();
    expect(sb._tables.sms_inbound_log[0].outcome).toBe('ambiguous');
  });

  it('a persistently-suspended number is fail-closed rejected even with a valid signature', async () => {
    const sb = makeFakeSupabase({
      chairman_decisions: [{ id: 'dec-susp', status: 'pending', brief_data: {}, sms_reply_token_expires_at: new Date(Date.now() + 10 * 60_000).toISOString() }],
      chairman_notifications: [{ id: 'n-susp', channel: 'sms', recipient_phone: '+15550001111', decision_id: 'dec-susp', created_at: new Date().toISOString() }],
      sms_inbound_suspensions: [{ from_phone: '+15550001111', suspended_at: new Date().toISOString(), reason: 'flood', cleared_at: null }],
    });
    const result = await handleInboundSmsReply(sb, {
      from: '+15550001111', to: '+15559999999', body: 'yes',
      messageSid: 'SM-suspended-1', signatureValid: true,
    });
    expect(result.resolved).toBe(false);
    expect(result.outcome).toBe('suspended');
    expect(sb._tables.sms_inbound_log[0].outcome).toBe('suspended');
    const decision = sb._tables.chairman_decisions.find((d) => d.id === 'dec-susp');
    expect(decision.sms_reply_used_at).toBeFalsy();
  });

  it('a cleared suspension no longer blocks the number', async () => {
    const sb = makeFakeSupabase({
      sms_inbound_suspensions: [{ from_phone: '+15550002222', suspended_at: new Date(Date.now() - 3_600_000).toISOString(), reason: 'flood', cleared_at: new Date().toISOString() }],
    });
    const result = await handleInboundSmsReply(sb, {
      from: '+15550002222', to: '+15559999999', body: 'yes',
      messageSid: 'SM-cleared-1', signatureValid: true,
    });
    expect(result.outcome).not.toBe('suspended');
  });

  it('flood of invalid-signature attempts trips a PERSISTENT auto-suspend past the threshold', async () => {
    const sb = makeFakeSupabase();
    let last;
    for (let i = 0; i < AUTO_SUSPEND_INVALID_SIGNATURE_THRESHOLD; i++) {
      last = await handleInboundSmsReply(sb, {
        from: '+15559990000', to: '+15559999999', body: 'spoof',
        messageSid: `SM-flood-${i}`, signatureValid: false,
      });
    }
    expect(last.outcome).toBe('invalid_signature');
    expect(sb._tables.sms_inbound_suspensions.some((s) => s.from_phone === '+15559990000' && !s.cleared_at)).toBe(true);

    // The NEXT attempt — even with a valid signature — is now fail-closed rejected,
    // and this rejection is NOT gated by the 60-minute rolling rate-limit window
    // (which sms_inbound_log's own count would otherwise re-evaluate every request).
    const after = await handleInboundSmsReply(sb, {
      from: '+15559990000', to: '+15559999999', body: 'yes now valid',
      messageSid: 'SM-flood-post', signatureValid: true,
    });
    expect(after.outcome).toBe('suspended');
  });
});

describe('drainSmsRelayStaging', () => {
  it('processes undrained rows through handleInboundSmsReply and stamps drained_at on all of them', async () => {
    const sb = makeFakeSupabase({
      chairman_decisions: [{ id: 'dec-drain', status: 'pending', brief_data: {}, sms_reply_token_expires_at: new Date(Date.now() + 10 * 60_000).toISOString() }],
      chairman_notifications: [{ id: 'n-drain', channel: 'sms', recipient_phone: '+15551239999', decision_id: 'dec-drain', created_at: new Date().toISOString() }],
      sms_relay_staging: [
        { id: 'stg-1', provider_message_id: 'SM-stg-1', from_phone: '+15551239999', to_phone: '+15559999999', body_raw: 'approved', signature_valid: true, received_at: new Date(Date.now() - 1000).toISOString(), drained_at: null },
        { id: 'stg-2', provider_message_id: 'SM-stg-2', from_phone: '+15550000001', to_phone: '+15559999999', body_raw: 'no candidate for this one', signature_valid: true, received_at: new Date().toISOString(), drained_at: null },
      ],
    });

    const result = await drainSmsRelayStaging(sb);

    expect(result.drained).toBe(2);
    expect(result.results.find((r) => r.id === 'stg-1').outcome).toBe('answered');
    expect(result.results.find((r) => r.id === 'stg-2').outcome).toBe('no_match');
    expect(sb._tables.sms_relay_staging.every((r) => r.drained_at)).toBe(true);
    const decision = sb._tables.chairman_decisions.find((d) => d.id === 'dec-drain');
    expect(decision.brief_data.sms_reply.text).toBe('approved');
  });

  it('a row already drained is not reprocessed', async () => {
    const sb = makeFakeSupabase({
      sms_relay_staging: [
        { id: 'stg-old', provider_message_id: 'SM-old', from_phone: '+15551110000', to_phone: '+15559999999', body_raw: 'x', signature_valid: true, received_at: new Date(Date.now() - 60_000).toISOString(), drained_at: new Date().toISOString() },
      ],
    });
    const result = await drainSmsRelayStaging(sb);
    expect(result.drained).toBe(0);
  });
});
