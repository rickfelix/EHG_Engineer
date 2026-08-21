/**
 * SD-LEO-FEAT-TWO-WAY-CHAIRMAN-001 FR-4/FR-5 — end-to-end send/receive against a fake
 * MessagingProvider (proves the seam is swappable, per success criteria) and an
 * in-memory fake Supabase client (no live DB, no live Twilio account required).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendChairmanSmsQuestion, handleInboundSmsReply, drainSmsRelayStaging, resolveAllParkedChairmanSmsRows, AUTO_SUSPEND_INVALID_SIGNATURE_THRESHOLD } from '../../../lib/chairman/sms-bridge.js';
import { isMessagingProvider } from '../../../lib/messaging/messaging-provider.js';

/** Minimal in-memory multi-table fake supporting the exact query shapes sms-bridge.js uses. */
function makeFakeSupabase(seed = {}) {
  const tables = {
    chairman_notifications: [...(seed.chairman_notifications || [])],
    chairman_decisions: [...(seed.chairman_decisions || [])],
    sms_inbound_log: [...(seed.sms_inbound_log || [])],
    sms_inbound_suspensions: [...(seed.sms_inbound_suspensions || [])],
    sms_relay_staging: [...(seed.sms_relay_staging || [])],
    // SD-LEO-FEAT-SMS-CHAIRMAN-DECISION-001-A FR-1: send path now also reads the SMS
    // decision-class allow-list (isWhitelistedDecisionClass). Seed it so LOW/MEDIUM sends
    // that SHOULD go through have their class whitelisted; unseeded = console-only (default).
    sms_decision_class_whitelist: [...(seed.sms_decision_class_whitelist || [])],
  };
  let seq = 0;

  function applyFilters(rows, filters) {
    return rows.filter((row) =>
      filters.every(([col, op, val]) => {
        if (op === 'eq') return row[col] === val;
        if (op === 'gte') return row[col] >= val;
        if (op === 'gt') return row[col] > val;
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
      gt(col, val) { ctx.filters.push([col, 'gt', val]); return api; },
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
    const sb = makeFakeSupabase({
      chairman_decisions: [{ id: 'dec-2', status: 'pending', brief_data: {} }],
      sms_decision_class_whitelist: [{ decision_class: 'schedule', active: true }],
    });
    const provider = makeFakeProvider();
    const result = await sendChairmanSmsQuestion(sb, {
      decisionId: 'dec-2', chairmanUserId: 'u1', chairmanEmail: 'chairman@example.com',
      chairmanPhone: '+15551234567', title: 'Which time works better for the call, 2pm or 4pm?',
      decisionType: 'schedule',
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
    const sb = makeFakeSupabase({
      chairman_decisions: [{ id: 'dec-3', status: 'pending', brief_data: {} }],
      sms_decision_class_whitelist: [{ decision_class: 'status_checkin', active: true }],
    });
    const provider = makeFakeProvider();

    const sendResult = await sendChairmanSmsQuestion(sb, {
      decisionId: 'dec-3', chairmanUserId: 'u1', chairmanEmail: 'chairman@example.com',
      chairmanPhone: '+15551234567', title: 'FYI: quick venture status check-in?',
      decisionType: 'status_checkin',
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

    // FR-1 guard on the lost-race branch itself (testing-agent finding: this site converted
    // consideredDecisionId but had no assertion distinguishing it, so a regression back to
    // matchedDecisionId here would pass every existing check). The loser's log row must carry
    // considered_decision_id only; the winner's must carry matched_decision_id only.
    const winnerSid = first.outcome === 'answered' ? 'SM-race-A' : 'SM-race-B';
    const loserSid = winnerSid === 'SM-race-A' ? 'SM-race-B' : 'SM-race-A';
    const winnerRow = sb._tables.sms_inbound_log.find((r) => r.provider_message_id === winnerSid);
    const loserRow = sb._tables.sms_inbound_log.find((r) => r.provider_message_id === loserSid);
    expect(winnerRow.matched_decision_id).toBe('dec-race');
    expect(winnerRow.considered_decision_id).toBeFalsy();
    expect(loserRow.matched_decision_id).toBeFalsy();
    expect(loserRow.considered_decision_id).toBe('dec-race');
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

  // SD-LEO-INFRA-COMPLETE-SMS-RELAY-001 FR-1: exactly-once under concurrency. The fake's awaits
  // yield to the microtask queue, so two drains launched together genuinely interleave at each
  // await — the same TOCTOU window the 5-min cron and an Adam-tick manual drain hit in production.
  // The atomic claim (UPDATE ... WHERE drained_at IS NULL) must let each row be processed by
  // exactly one drainer. Observable proof: each processed row writes exactly one sms_inbound_log
  // entry, so N staged rows → N log entries total across BOTH drains (not 2N).
  it('two concurrent drains process each row exactly once (no double side-effects)', async () => {
    const staging = [];
    for (let i = 0; i < 5; i += 1) {
      staging.push({
        id: `stg-cc-${i}`, provider_message_id: `SM-cc-${i}`, from_phone: '+15550000009',
        to_phone: '+15559999999', body_raw: `no candidate ${i}`, signature_valid: true,
        received_at: new Date(Date.now() - (5 - i) * 1000).toISOString(), drained_at: null,
      });
    }
    const sb = makeFakeSupabase({ sms_relay_staging: staging });

    const [a, b] = await Promise.all([drainSmsRelayStaging(sb), drainSmsRelayStaging(sb)]);

    // Every row claimed and processed exactly once, split across the two racing drains.
    expect(a.drained + b.drained).toBe(5);
    // Exactly one side-effect (inbound log entry) per row — the double-count FR-1 prevents.
    expect(sb._tables.sms_inbound_log.length).toBe(5);
    // Every staging row ends up claimed.
    expect(sb._tables.sms_relay_staging.every((r) => r.drained_at)).toBe(true);
  });

  it('releases the claim (drained_at -> null) when handleInboundSmsReply throws, so the next tick retries', async () => {
    const sb = makeFakeSupabase({
      sms_relay_staging: [
        { id: 'stg-throw', provider_message_id: 'SM-throw', from_phone: '+15551112222', to_phone: '+15559999999', body_raw: 'x', signature_valid: true, received_at: new Date().toISOString(), drained_at: null },
      ],
    });
    // Force a throw on the FIRST post-claim read handleInboundSmsReply makes (sms_inbound_log
    // count / notifications lookup). Make chairman_notifications.select throw once.
    const realFrom = sb.from.bind(sb);
    let thrown = false;
    sb.from = (table) => {
      if (table === 'sms_inbound_log' && !thrown) {
        thrown = true;
        return { select: () => { throw new Error('transient DB error'); } };
      }
      return realFrom(table);
    };
    await expect(drainSmsRelayStaging(sb)).rejects.toThrow(/transient DB error/);
    // The claim was rolled back so the row is retryable, not lost.
    expect(sb._tables.sms_relay_staging.find((r) => r.id === 'stg-throw').drained_at).toBe(null);
  });
});

// QF-20260818-263: bulk disposition — a reply resolves EVERY currently-parked row, not just one,
// matching the measured live incident (two rows, 18a07a83+2902dab6, answered by a single reply).
describe('resolveAllParkedChairmanSmsRows', () => {
  it('stamps resolved_at on every parked+unresolved row, leaving others untouched', async () => {
    const sb = makeFakeSupabase({
      sms_relay_staging: [
        { id: 'parked-1', parked_at: '2026-08-18T12:00:00Z', resolved_at: null },
        { id: 'parked-2', parked_at: '2026-08-18T12:05:00Z', resolved_at: null },
        { id: 'already-resolved', parked_at: '2026-08-18T11:00:00Z', resolved_at: '2026-08-18T11:30:00Z' },
        { id: 'never-parked', parked_at: null, resolved_at: null },
      ],
    });
    const { resolvedCount, resolvedIds } = await resolveAllParkedChairmanSmsRows(sb);
    expect(resolvedCount).toBe(2);
    expect(resolvedIds.sort()).toEqual(['parked-1', 'parked-2']);
    expect(sb._tables.sms_relay_staging.find((r) => r.id === 'parked-1').resolved_at).not.toBeNull();
    expect(sb._tables.sms_relay_staging.find((r) => r.id === 'parked-2').resolved_at).not.toBeNull();
    expect(sb._tables.sms_relay_staging.find((r) => r.id === 'already-resolved').resolved_at).toBe('2026-08-18T11:30:00Z');
    expect(sb._tables.sms_relay_staging.find((r) => r.id === 'never-parked').resolved_at).toBeNull();
  });

  it('is a no-op when nothing is currently parked', async () => {
    const sb = makeFakeSupabase({ sms_relay_staging: [{ id: 'x', parked_at: null, resolved_at: null }] });
    const { resolvedCount, resolvedIds } = await resolveAllParkedChairmanSmsRows(sb);
    expect(resolvedCount).toBe(0);
    expect(resolvedIds).toEqual([]);
  });
});

// SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-001 FR-1/FR-3: matched_decision_id must record ONLY a
// genuine resolution. Before this SD, non-resolving outcomes also populated it via a "best-effort
// diagnostic label" (candidateIds[0]/decisionId), making it indistinguishable from a real match —
// measured live: 327/364 sms_inbound_log rows populated, only 1 ever genuinely resolved anything.
describe('sms_inbound_log matched_decision_id vs considered_decision_id (FR-1)', () => {
  it('a genuine resolution (answered) sets matched_decision_id and leaves considered_decision_id null', async () => {
    const sb = makeFakeSupabase({
      chairman_decisions: [{ id: 'dec-fr1-ok', status: 'pending', brief_data: {}, sms_reply_token_expires_at: new Date(Date.now() + 10 * 60_000).toISOString() }],
      chairman_notifications: [{ id: 'n-fr1-ok', channel: 'sms', recipient_phone: '+15550010001', decision_id: 'dec-fr1-ok', created_at: new Date().toISOString() }],
    });
    const result = await handleInboundSmsReply(sb, {
      from: '+15550010001', to: '+15559999999', body: 'yes proceed', messageSid: 'SM-fr1-ok', signatureValid: true,
    });
    expect(result.outcome).toBe('answered');
    const row = sb._tables.sms_inbound_log[0];
    expect(row.matched_decision_id).toBe('dec-fr1-ok');
    expect(row.considered_decision_id).toBeFalsy();
  });

  it('ambiguous (2+ eligible candidates) sets considered_decision_id and leaves matched_decision_id null', async () => {
    const now = Date.now();
    const sb = makeFakeSupabase({
      chairman_decisions: [
        { id: 'dec-fr1-amb-1', status: 'pending', brief_data: {}, sms_reply_token_expires_at: new Date(now + 10 * 60_000).toISOString() },
        { id: 'dec-fr1-amb-2', status: 'pending', brief_data: {}, sms_reply_token_expires_at: new Date(now + 10 * 60_000).toISOString() },
      ],
      chairman_notifications: [
        { id: 'n-fr1-amb-1', channel: 'sms', recipient_phone: '+15550010002', decision_id: 'dec-fr1-amb-1', created_at: new Date(now - 120_000).toISOString() },
        { id: 'n-fr1-amb-2', channel: 'sms', recipient_phone: '+15550010002', decision_id: 'dec-fr1-amb-2', created_at: new Date(now - 60_000).toISOString() },
      ],
    });
    const result = await handleInboundSmsReply(sb, {
      from: '+15550010002', to: '+15559999999', body: 'yes', messageSid: 'SM-fr1-amb', signatureValid: true,
    });
    expect(result.outcome).toBe('ambiguous');
    const row = sb._tables.sms_inbound_log[0];
    expect(row.matched_decision_id).toBeFalsy();
    expect(row.considered_decision_id).toBe('dec-fr1-amb-2'); // most-recently-sent-first candidate
  });

  it('expired (token TTL passed) sets considered_decision_id and leaves matched_decision_id null', async () => {
    const sb = makeFakeSupabase({
      chairman_decisions: [{
        id: 'dec-fr1-exp', status: 'pending', brief_data: {},
        sms_reply_token_expires_at: new Date(Date.now() - 60_000).toISOString(),
      }],
      chairman_notifications: [{ id: 'n-fr1-exp', channel: 'sms', recipient_phone: '+15550010003', decision_id: 'dec-fr1-exp', created_at: new Date(Date.now() - 120_000).toISOString() }],
    });
    const result = await handleInboundSmsReply(sb, {
      from: '+15550010003', to: '+15559999999', body: 'yes', messageSid: 'SM-fr1-exp', signatureValid: true,
    });
    expect(result.outcome).toBe('expired');
    const row = sb._tables.sms_inbound_log[0];
    expect(row.matched_decision_id).toBeFalsy();
    expect(row.considered_decision_id).toBe('dec-fr1-exp');
  });

  it('a match rejected on presented-options mismatch sets considered_decision_id, not matched_decision_id', async () => {
    const sb = makeFakeSupabase({
      chairman_decisions: [{
        id: 'dec-fr1-optmis', status: 'pending', brief_data: { sms_options: ['Approve', 'Reject'] },
        sms_reply_token_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      }],
      chairman_notifications: [{ id: 'n-fr1-optmis', channel: 'sms', recipient_phone: '+15550010004', decision_id: 'dec-fr1-optmis', created_at: new Date().toISOString() }],
    });
    const result = await handleInboundSmsReply(sb, {
      from: '+15550010004', to: '+15559999999', body: 'zzz not an option', messageSid: 'SM-fr1-optmis', signatureValid: true,
    });
    expect(result.outcome).toBe('no_match');
    const row = sb._tables.sms_inbound_log[0];
    expect(row.matched_decision_id).toBeFalsy();
    expect(row.considered_decision_id).toBe('dec-fr1-optmis');
  });

  // The 4 "no-op" branches: no candidate was ever hydrated, so there is nothing to redirect —
  // both columns must stay null, exactly as they did before this SD (regression guard, not new
  // behavior). Confirms the fix touches only the 6 branches that had a diagnostic candidate id.
  it('no-op branches (suspended, invalid_signature, rate_limited, no-candidate no_match) leave BOTH columns null', async () => {
    const sbSuspended = makeFakeSupabase({
      sms_inbound_suspensions: [{ from_phone: '+15550010005', suspended_at: new Date().toISOString(), reason: 'flood', cleared_at: null }],
    });
    await handleInboundSmsReply(sbSuspended, { from: '+15550010005', to: '+15559999999', body: 'x', messageSid: 'SM-fr1-noop-susp', signatureValid: true });
    expect(sbSuspended._tables.sms_inbound_log[0].matched_decision_id).toBeFalsy();
    expect(sbSuspended._tables.sms_inbound_log[0].considered_decision_id).toBeFalsy();

    const sbInvalidSig = makeFakeSupabase();
    await handleInboundSmsReply(sbInvalidSig, { from: '+15550010006', to: '+15559999999', body: 'x', messageSid: 'SM-fr1-noop-sig', signatureValid: false });
    expect(sbInvalidSig._tables.sms_inbound_log[0].matched_decision_id).toBeFalsy();
    expect(sbInvalidSig._tables.sms_inbound_log[0].considered_decision_id).toBeFalsy();

    const sbNoCandidate = makeFakeSupabase();
    await handleInboundSmsReply(sbNoCandidate, { from: '+15550010007', to: '+15559999999', body: 'x', messageSid: 'SM-fr1-noop-nocand', signatureValid: true });
    expect(sbNoCandidate._tables.sms_inbound_log[0].outcome).toBe('no_match');
    expect(sbNoCandidate._tables.sms_inbound_log[0].matched_decision_id).toBeFalsy();
    expect(sbNoCandidate._tables.sms_inbound_log[0].considered_decision_id).toBeFalsy();
  });

  // Negative test (FR-3, SD's own explicit acceptance criterion, run against the live-shaped
  // outcome mix rather than isolated single-outcome fixtures): a matched row and a
  // considered-only row must be state-distinguishable, not just differently-outcomed.
  it('negative test: a matched row and an unmatched row are distinguishable on matched_decision_id, not just outcome', async () => {
    const sb = makeFakeSupabase({
      chairman_decisions: [{ id: 'dec-fr3-neg', status: 'pending', brief_data: {}, sms_reply_token_expires_at: new Date(Date.now() + 10 * 60_000).toISOString() }],
      chairman_notifications: [{ id: 'n-fr3-neg', channel: 'sms', recipient_phone: '+15550010008', decision_id: 'dec-fr3-neg', created_at: new Date().toISOString() }],
    });
    await handleInboundSmsReply(sb, { from: '+15550010008', to: '+15559999999', body: 'yes', messageSid: 'SM-fr3-neg-match', signatureValid: true });
    await handleInboundSmsReply(sb, { from: '+15559990009', to: '+15559999999', body: 'random text', messageSid: 'SM-fr3-neg-nomatch', signatureValid: true });

    const matchedRows = sb._tables.sms_inbound_log.filter((r) => r.matched_decision_id);
    const unmatchedRows = sb._tables.sms_inbound_log.filter((r) => !r.matched_decision_id);
    expect(matchedRows.length).toBe(1);
    expect(matchedRows[0].outcome).toBe('answered');
    expect(unmatchedRows.length).toBe(1);
    expect(unmatchedRows[0].outcome).toBe('no_match');
    // The join a live consumer would run: only the genuinely-resolved row is a valid join target.
    const joinable = sb._tables.sms_inbound_log.filter((r) => r.matched_decision_id === 'dec-fr3-neg');
    expect(joinable.length).toBe(1);
  });

  // testing-agent per-site mutation sweep (V3): the undo path's two non-resolving branches
  // (no eligible window; lost the claim race) had no dedicated coverage at all, so a regression
  // back to matchedDecisionId on either site would pass every existing test unnoticed.
  it('undo with no open undo window: no_match, considered only (not a genuine resolution)', async () => {
    const sb = makeFakeSupabase({
      chairman_decisions: [{
        id: 'dec-undo-closed', status: 'pending', brief_data: {}, amount_usd: 500,
        // undo_deadline already in the past -- the window has closed, nothing to cancel.
        undo_deadline: new Date(Date.now() - 60_000).toISOString(),
        undone_at: null, consumed_at: null,
      }],
      chairman_notifications: [{
        id: 'n-undo-closed', channel: 'sms', recipient_phone: '+15550020001', decision_id: 'dec-undo-closed',
        created_at: new Date().toISOString(),
      }],
    });
    const result = await handleInboundSmsReply(sb, { from: '+15550020001', to: '+15559999999', body: 'undo', messageSid: 'SM-undo-closed', signatureValid: true });
    expect(result.resolved).toBe(false);
    expect(result.outcome).toBe('no_match');
    const row = sb._tables.sms_inbound_log.find((r) => r.provider_message_id === 'SM-undo-closed');
    expect(row.matched_decision_id).toBeFalsy();
    expect(row.considered_decision_id).toBe('dec-undo-closed');
    // The decision itself is untouched -- never claimed by an undo that had no window to use.
    const decision = sb._tables.chairman_decisions.find((d) => d.id === 'dec-undo-closed');
    expect(decision.undone_at).toBeFalsy();
  });

  it('two concurrent undo replies for the same window: only one wins, the loser is considered-only', async () => {
    const sb = makeFakeSupabase({
      chairman_decisions: [{
        id: 'dec-undo-race', status: 'pending', brief_data: {}, amount_usd: 500,
        undo_deadline: new Date(Date.now() + 10 * 60_000).toISOString(),
        undone_at: null, consumed_at: null,
      }],
      chairman_notifications: [{
        id: 'n-undo-race', channel: 'sms', recipient_phone: '+15550020002', decision_id: 'dec-undo-race',
        created_at: new Date().toISOString(),
      }],
    });
    const [first, second] = await Promise.all([
      handleInboundSmsReply(sb, { from: '+15550020002', to: '+15559999999', body: 'undo', messageSid: 'SM-undo-race-A', signatureValid: true }),
      handleInboundSmsReply(sb, { from: '+15550020002', to: '+15559999999', body: 'undo', messageSid: 'SM-undo-race-B', signatureValid: true }),
    ]);
    const outcomes = [first.outcome, second.outcome].sort();
    expect(outcomes).toEqual(['no_match', 'undone']);
    const winnerSid = first.outcome === 'undone' ? 'SM-undo-race-A' : 'SM-undo-race-B';
    const loserSid = winnerSid === 'SM-undo-race-A' ? 'SM-undo-race-B' : 'SM-undo-race-A';
    const winnerRow = sb._tables.sms_inbound_log.find((r) => r.provider_message_id === winnerSid);
    const loserRow = sb._tables.sms_inbound_log.find((r) => r.provider_message_id === loserSid);
    expect(winnerRow.matched_decision_id).toBe('dec-undo-race');
    expect(winnerRow.considered_decision_id).toBeFalsy();
    expect(loserRow.matched_decision_id).toBeFalsy();
    expect(loserRow.considered_decision_id).toBe('dec-undo-race');
    const decision = sb._tables.chairman_decisions.find((d) => d.id === 'dec-undo-race');
    expect(decision.undone_at).toBeTruthy();
  });

  // testing-agent B2: logInbound's insert was previously unbound -- a schema-drift or constraint
  // rejection would silently drop the entire audit row with no trace. Must be fail-soft (logged,
  // never thrown) so a schema-drift edge case degrades to a lost audit row, not claim thrash.
  it('a failed sms_inbound_log insert is fail-soft: logged via console.warn, never thrown', async () => {
    const sb = makeFakeSupabase();
    const realFrom = sb.from.bind(sb);
    sb.from = (table) => {
      const realApi = realFrom(table);
      // Only the insert() chain is faulted -- sms_inbound_log is also SELECTed (rate-limit
      // count check) in the same request, and that must keep behaving normally so the flow
      // reaches logInbound's insert at all.
      if (table === 'sms_inbound_log') {
        const originalInsert = realApi.insert;
        realApi.insert = (row) => {
          const result = originalInsert(row);
          result.then = (resolve) => resolve({ data: null, error: { message: 'column "considered_decision_id" does not exist' } });
          return result;
        };
      }
      return realApi;
    };
    // vi.spyOn(console, 'warn') here inherits Vitest's file-wide console-interception history
    // (unrelated earlier tests' warn calls are already present), so assert on the DELTA this
    // call produces, not the spy's absolute total.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const preCallCount = warnSpy.mock.calls.length;
    let threw = false;
    let result;
    try {
      result = await handleInboundSmsReply(sb, { from: '+15550010009', to: '+15559999999', body: 'x', messageSid: 'SM-fr-b2', signatureValid: true });
    } catch {
      threw = true;
    }
    const newCalls = warnSpy.mock.calls.slice(preCallCount);
    expect(threw).toBe(false);
    expect(result.outcome).toBe('no_match');
    expect(newCalls.length).toBe(1);
    expect(newCalls[0][0]).toMatch(/logInbound insert failed.*audit row lost/);
    warnSpy.mockRestore();
  });
});

// SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-001 FR-4/FR-6: PARK_OUTCOMES extension + CHAIRMAN_PHONE gate.
describe('drainSmsRelayStaging parking (FR-4/FR-6)', () => {
  const CHAIRMAN = '+15551234567';
  let originalChairmanPhone;
  beforeEach(() => { originalChairmanPhone = process.env.CHAIRMAN_PHONE; });
  afterEach(() => { process.env.CHAIRMAN_PHONE = originalChairmanPhone; });

  it('expired and ambiguous outcomes from the chairman number now get parked (previously did not)', async () => {
    process.env.CHAIRMAN_PHONE = CHAIRMAN;
    const sb = makeFakeSupabase({
      chairman_decisions: [{
        id: 'dec-park-exp', status: 'pending', brief_data: {},
        sms_reply_token_expires_at: new Date(Date.now() - 60_000).toISOString(),
      }],
      chairman_notifications: [{ id: 'n-park-exp', channel: 'sms', recipient_phone: CHAIRMAN, decision_id: 'dec-park-exp', created_at: new Date(Date.now() - 120_000).toISOString() }],
      sms_relay_staging: [{
        id: 'stg-park-exp', provider_message_id: 'SM-park-exp', from_phone: CHAIRMAN, to_phone: '+15559999999',
        body_raw: 'too late', signature_valid: true, received_at: new Date().toISOString(), drained_at: null,
      }],
    });
    await drainSmsRelayStaging(sb);
    const row = sb._tables.sms_relay_staging.find((r) => r.id === 'stg-park-exp');
    expect(row.drained_at).toBeTruthy();
    expect(row.parked_at).toBeTruthy();
  });

  it('suspended and invalid_signature outcomes remain excluded from parking', async () => {
    process.env.CHAIRMAN_PHONE = CHAIRMAN;
    const sb = makeFakeSupabase({
      sms_inbound_suspensions: [{ from_phone: CHAIRMAN, suspended_at: new Date().toISOString(), reason: 'flood', cleared_at: null }],
      sms_relay_staging: [{
        id: 'stg-park-susp', provider_message_id: 'SM-park-susp', from_phone: CHAIRMAN, to_phone: '+15559999999',
        body_raw: 'x', signature_valid: true, received_at: new Date().toISOString(), drained_at: null,
      }],
    });
    await drainSmsRelayStaging(sb);
    const row = sb._tables.sms_relay_staging.find((r) => r.id === 'stg-park-susp');
    expect(row.drained_at).toBeTruthy();
    expect(row.parked_at).toBeFalsy();
  });

  it('when CHAIRMAN_PHONE is unset, parking never fires for any otherwise-parkable outcome', async () => {
    delete process.env.CHAIRMAN_PHONE;
    const sb = makeFakeSupabase({
      sms_relay_staging: [{
        id: 'stg-park-nophone', provider_message_id: 'SM-park-nophone', from_phone: '+15559990000', to_phone: '+15559999999',
        body_raw: 'no candidate here', signature_valid: true, received_at: new Date().toISOString(), drained_at: null,
      }],
    });
    await drainSmsRelayStaging(sb);
    const row = sb._tables.sms_relay_staging.find((r) => r.id === 'stg-park-nophone');
    expect(row.drained_at).toBeTruthy();
    expect(row.parked_at).toBeFalsy();
  });
});
