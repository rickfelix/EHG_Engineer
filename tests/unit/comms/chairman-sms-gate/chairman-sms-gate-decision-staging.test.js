/**
 * SD-LEO-INFRA-SMS-DECIDE-REPLY-MATCHABLE-001 FR-3 — the Adam-outbound gate's decision-staging
 * guard: stage BEFORE dispatch, fail closed (never throw) on staging failure, resolve chairman
 * identity once and reuse it for both staging and dispatch.
 *
 * wellFormedDecision/DAYTIME/makeSender/silentConsole are duplicated locally (small, self-
 * contained) rather than imported from chairman-sms-gate.test.js — that file belongs to a
 * different SD and its local helpers are not exported; duplicating ~10 lines avoids any risk to
 * its own passing suite.
 */
import { describe, it, expect, vi } from 'vitest';
import { sendChairmanSMS } from '../../../../lib/comms/adam-outbound/chairman-sms-gate/index.js';
import { handleInboundSmsReply } from '../../../../lib/chairman/sms-bridge.js';

function wellFormedDecision(overrides = {}) {
  return {
    type: 'decision',
    body: 'Approve the deploy? Reply A or B. Reply DETAILS for the rationale.',
    options: [{ label: 'A' }, { label: 'B' }],
    decisionCount: 1,
    replyInstruction: 'Reply A or B (or DETAILS)',
    replyId: 'dec-c-1',
    noReplyConsequence: 'no reply by 5pm ET -> I hold (reversible)',
    ...overrides,
  };
}

const DAYTIME = { nowHourET: 14, rateCap: 10, sentInWindow: 0 };
const makeSender = () => ({ send: vi.fn(async () => ({ sid: 'SM-test' })) });
const silentConsole = { warn: vi.fn(), error: vi.fn(), log: vi.fn() };

/** Minimal fake supabase covering exactly what stageDecisionSmsNotification + handleInboundSmsReply need. */
function makeFakeSupabase(seed = {}, { forceInsertError = null } = {}) {
  const tables = {
    chairman_notifications: [...(seed.chairman_notifications || [])],
    chairman_decisions: [...(seed.chairman_decisions || [])],
    sms_inbound_log: [...(seed.sms_inbound_log || [])],
    sms_inbound_suspensions: [...(seed.sms_inbound_suspensions || [])],
  };
  let seq = 0;
  function applyFilters(rows, filters) {
    return rows.filter((row) =>
      filters.every(([col, op, val]) => {
        if (op === 'eq') return row[col] === val;
        if (op === 'gte') return (row[col] ?? null) !== null && row[col] >= val;
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
        if (ctx.mode === 'update' || ctx.mode === 'insert') { ctx.returnSelect = true; return api; }
        ctx.mode = 'select';
        if (opts?.count === 'exact' && opts?.head) ctx.countMode = true;
        return api;
      },
      insert(row) { ctx.mode = 'insert'; ctx.row = { id: `row-${++seq}`, created_at: new Date().toISOString(), ...row }; return api; },
      update(vals) { ctx.mode = 'update'; ctx.vals = vals; return api; },
      eq(col, val) { ctx.filters.push([col, 'eq', val]); return api; },
      gte(col, val) { ctx.filters.push([col, 'gte', val]); return api; },
      not(col) { ctx.filters.push([col, 'not_is_null', null]); return api; },
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
          if (forceInsertError && forceInsertError.table === table) {
            resolve({ data: null, error: { message: forceInsertError.message || 'forced insert error' } });
            return;
          }
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
        let rows = applyFilters(tables[table], ctx.filters);
        if (ctx.order) rows = [...rows].sort((a, b) => (a[ctx.order.col] < b[ctx.order.col] ? -1 : a[ctx.order.col] > b[ctx.order.col] ? 1 : -0));
        if (ctx.limitN != null) rows = rows.slice(0, ctx.limitN);
        if (ctx.countMode) resolve({ count: rows.length, data: null, error: null });
        else resolve({ data: rows, error: null });
      },
    };
    return api;
  }
  return { from, _tables: tables };
}

describe('chairman-sms-gate sendChairmanSMS() — FR-3 decision staging guard', () => {
  it('TS-1: decision send with decisionId stages exactly one matchable row + token via env-var identity resolution', async () => {
    const prevUser = process.env.CHAIRMAN_USER_ID, prevEmail = process.env.CHAIRMAN_EMAIL, prevPhone = process.env.CHAIRMAN_PHONE;
    process.env.CHAIRMAN_USER_ID = 'u-env';
    process.env.CHAIRMAN_EMAIL = 'chairman@env.example';
    process.env.CHAIRMAN_PHONE = '+15550001111';
    try {
      const sb = makeFakeSupabase({ chairman_decisions: [{ id: 'dec-env-1', status: 'pending', brief_data: {} }] });
      const sender = makeSender();
      const res = await sendChairmanSMS(
        wellFormedDecision({ decisionId: 'dec-env-1' }),
        DAYTIME,
        { sender, console: silentConsole, supabase: sb },
      );
      expect(res.sent).toBe(true);
      expect(sender.send).toHaveBeenCalledTimes(1);
      expect(sb._tables.chairman_notifications).toHaveLength(1);
      const row = sb._tables.chairman_notifications[0];
      expect(row).toMatchObject({
        channel: 'sms', decision_id: 'dec-env-1', chairman_user_id: 'u-env',
        recipient_email: 'chairman@env.example', recipient_phone: '+15550001111', status: 'queued',
      });
      expect(sb._tables.chairman_decisions[0].sms_reply_token).toBeTruthy();
      // The dispatched message carries the SAME resolved phone staging used (TR-5).
      expect(sender.send.mock.calls[0][0].recipientPhone).toBe('+15550001111');
    } finally {
      process.env.CHAIRMAN_USER_ID = prevUser; process.env.CHAIRMAN_EMAIL = prevEmail; process.env.CHAIRMAN_PHONE = prevPhone;
    }
  });

  it('TS-2: a staging error blocks the send and returns notification_stage_failed WITHOUT throwing', async () => {
    const sb = makeFakeSupabase(
      { chairman_decisions: [{ id: 'dec-2', status: 'pending', brief_data: {} }] },
      { forceInsertError: { table: 'chairman_notifications', message: 'staging boom' } },
    );
    const sender = makeSender();
    const res = await sendChairmanSMS(
      wellFormedDecision({ decisionId: 'dec-2' }),
      DAYTIME,
      { sender, console: silentConsole, supabase: sb },
    );
    expect(res.sent).toBe(false);
    expect(res.reason).toBe('notification_stage_failed');
    expect(sender.send).not.toHaveBeenCalled();
    expect(silentConsole.error).toHaveBeenCalled();
  });

  it('TS-3: the round trip starts from sendChairmanSMS itself — a bare letter reply resolves against what the guard staged', async () => {
    const sb = makeFakeSupabase({ chairman_decisions: [{ id: 'dec-3', status: 'pending', brief_data: {} }] });
    const sender = { send: vi.fn(async (message) => ({ sid: 'SM-3', recipientPhoneUsed: message.recipientPhone })) };
    const res = await sendChairmanSMS(
      wellFormedDecision({ decisionId: 'dec-3', recipientPhone: '+15559998888' }),
      DAYTIME,
      { sender, console: silentConsole, supabase: sb },
    );
    expect(res.sent).toBe(true);

    const reply = await handleInboundSmsReply(sb, {
      from: '+15559998888', to: '+15550000000', body: 'B', messageSid: 'SM-in-3', signatureValid: true,
    });
    expect(reply.outcome).toBe('answered');
    expect(reply.resolved).toBe(true);
    expect(reply.decisionId).toBe('dec-3');
  });

  it('TS-6: a type=status message never stages and never constructs a supabase client', async () => {
    const sender = makeSender();
    const supabaseSpy = vi.fn();
    const res = await sendChairmanSMS(
      { type: 'status', body: 'heartbeat: all clear', kind: 'heartbeat' },
      DAYTIME,
      { sender, console: silentConsole, get supabase() { supabaseSpy(); return undefined; } },
    );
    expect(res.sent).toBe(true);
    expect(supabaseSpy).not.toHaveBeenCalled();
  });

  it('TS-7: the gate always stages with status=queued (async-obligation shape), never a synchronous post-send shape', async () => {
    const sb = makeFakeSupabase({ chairman_decisions: [{ id: 'dec-7', status: 'pending', brief_data: {} }] });
    const sender = makeSender();
    await sendChairmanSMS(wellFormedDecision({ decisionId: 'dec-7' }), DAYTIME, { sender, console: silentConsole, supabase: sb });
    const row = sb._tables.chairman_notifications[0];
    expect(row.status).toBe('queued');
    expect(row.provider_message_id).toBeNull();
    expect(row.sent_at).toBeNull();
  });

  it('TS-8: a message the classifier does NOT resolve to decision never stages, regardless of decisionId', async () => {
    const sb = makeFakeSupabase({ chairman_decisions: [{ id: 'dec-8', status: 'pending', brief_data: {} }] });
    const sender = makeSender();
    // type='status' with a decisionId still present -- effectiveType(message) reads message.type,
    // so this is NOT classified as 'decision' and must not stage regardless of decisionId.
    const res = await sendChairmanSMS(
      { type: 'status', body: 'informational only', kind: 'status_update', decisionId: 'dec-8' },
      DAYTIME,
      { sender, console: silentConsole, supabase: sb },
    );
    expect(res.sent).toBe(true);
    expect(sb._tables.chairman_notifications).toHaveLength(0);
  });

  it('TS-9: type=decision with a falsy decisionId skips staging without error (defensive — FR-4 makes this unreachable via the CLI)', async () => {
    const sb = makeFakeSupabase({});
    const sender = makeSender();
    const res = await sendChairmanSMS(
      wellFormedDecision({ decisionId: null }),
      DAYTIME,
      { sender, console: silentConsole, supabase: sb },
    );
    expect(res.sent).toBe(true);
    expect(sb._tables.chairman_notifications).toHaveLength(0);
    expect(sender.send).toHaveBeenCalledTimes(1);
  });
});
