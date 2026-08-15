/**
 * SD-LEO-INFRA-SMS-DECIDE-REPLY-MATCHABLE-001 — the shared decision-SMS staging helper
 * (stageDecisionSmsNotification, extracted from sendChairmanSmsQuestion) and the round-trip
 * proof that staging alone produces state handleInboundSmsReply can actually resolve.
 *
 * Fake supabase mirrors tests/unit/chairman/sms-decision-guardrails.test.js's shape (not
 * imported/modified — that file belongs to a different, already-shipped SD and must keep
 * passing unmodified per this SD's own FR-2), extended with insert/update error injection and a
 * faithful .select()-after-.update() readback (returns the matched rows, or [] when none match)
 * so the zero-rows-matched (TR-2) path is directly testable.
 */
import { describe, it, expect } from 'vitest';
import {
  sendChairmanSmsQuestion,
  stageDecisionSmsNotification,
  handleInboundSmsReply,
} from '../../../lib/chairman/sms-bridge.js';

function makeFakeSupabase(seed = {}, { forceInsertError = null, forceUpdateError = null } = {}) {
  const tables = {
    chairman_notifications: [...(seed.chairman_notifications || [])],
    chairman_decisions: [...(seed.chairman_decisions || [])],
    sms_inbound_log: [...(seed.sms_inbound_log || [])],
    sms_inbound_suspensions: [...(seed.sms_inbound_suspensions || [])],
    sms_decision_class_whitelist: [...(seed.sms_decision_class_whitelist || [])],
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
          if (forceUpdateError && forceUpdateError.table === table) {
            resolve({ data: null, error: { message: forceUpdateError.message || 'forced update error' } });
            return;
          }
          const rows = applyFilters(tables[table], ctx.filters);
          rows.forEach((r) => Object.assign(r, ctx.vals));
          resolve({ data: ctx.returnSelect ? rows.map((r) => ({ id: r.id })) : null, error: null });
          return;
        }
        let rows = applyFilters(tables[table], ctx.filters);
        if (ctx.order) {
          rows = [...rows].sort((a, b) => {
            const cmp = a[ctx.order.col] < b[ctx.order.col] ? -1 : a[ctx.order.col] > b[ctx.order.col] ? 1 : 0;
            return ctx.order.ascending ? cmp : -cmp;
          });
        }
        if (ctx.limitN != null) rows = rows.slice(0, ctx.limitN);
        if (ctx.countMode) resolve({ count: rows.length, data: null, error: null });
        else resolve({ data: rows, error: null });
      },
    };
    return api;
  }

  return { from, _tables: tables };
}

const future = () => new Date(Date.now() + 10 * 60_000).toISOString();

describe('stageDecisionSmsNotification (FR-1)', () => {
  it('TS-1: stages exactly one matchable chairman_notifications row + chairman_decisions patch', async () => {
    const sb = makeFakeSupabase({
      chairman_decisions: [{ id: 'dec-1', status: 'pending', brief_data: {} }],
    });
    await stageDecisionSmsNotification(sb, {
      decisionId: 'dec-1', chairmanUserId: 'u1', chairmanEmail: 'chairman@example.com', chairmanPhone: '+15551234567',
      options: ['A) ship', 'B) hold'], token: 'tok-1', expiresAt: future(),
    });
    expect(sb._tables.chairman_notifications).toHaveLength(1);
    const row = sb._tables.chairman_notifications[0];
    expect(row).toMatchObject({
      channel: 'sms', decision_id: 'dec-1', chairman_user_id: 'u1', recipient_email: 'chairman@example.com',
      recipient_phone: '+15551234567', status: 'queued',
    });
    const decision = sb._tables.chairman_decisions[0];
    expect(decision.sms_reply_token).toBe('tok-1');
    expect(decision.brief_data.sms_options).toEqual(['A) ship', 'B) hold']);
  });

  it('TS-2: an injected chairman_notifications insert error throws, and chairman_decisions is never touched', async () => {
    const sb = makeFakeSupabase(
      { chairman_decisions: [{ id: 'dec-1', status: 'pending', brief_data: {} }] },
      { forceInsertError: { table: 'chairman_notifications', message: 'insert boom' } },
    );
    await expect(stageDecisionSmsNotification(sb, {
      decisionId: 'dec-1', chairmanUserId: 'u1', chairmanEmail: 'c@example.com', chairmanPhone: '+1555',
      options: [], token: 'tok-1', expiresAt: future(),
    })).rejects.toThrow(/insert boom/);
    expect(sb._tables.chairman_decisions[0].sms_reply_token).toBeUndefined();
  });

  it('TR-2: a decisionId that matches zero chairman_decisions rows throws decision_not_found (the notification row is already staged by then)', async () => {
    const sb = makeFakeSupabase({ chairman_decisions: [] }); // no row for 'dec-missing'
    await expect(stageDecisionSmsNotification(sb, {
      decisionId: 'dec-missing', chairmanUserId: 'u1', chairmanEmail: 'c@example.com', chairmanPhone: '+1555',
      options: [], token: 'tok-1', expiresAt: future(),
    })).rejects.toThrow(/decision_not_found/);
    // The notification insert still landed — this is the "loud, distinguishable failure" FR-4 relies on.
    expect(sb._tables.chairman_notifications).toHaveLength(1);
  });

  it('an injected chairman_decisions update error throws', async () => {
    const sb = makeFakeSupabase(
      { chairman_decisions: [{ id: 'dec-1', status: 'pending', brief_data: {} }] },
      { forceUpdateError: { table: 'chairman_decisions', message: 'update boom' } },
    );
    await expect(stageDecisionSmsNotification(sb, {
      decisionId: 'dec-1', chairmanUserId: 'u1', chairmanEmail: 'c@example.com', chairmanPhone: '+1555',
      options: [], token: 'tok-1', expiresAt: future(),
    })).rejects.toThrow(/update boom/);
  });
});

describe('TS-3: staging alone produces state the matcher can resolve — no hand-seeded matcher columns', () => {
  it("a bare pending chairman_decisions row + sendChairmanSmsQuestion's own staging resolves a 'B' reply", async () => {
    const sb = makeFakeSupabase({
      sms_decision_class_whitelist: [{ decision_class: 'schedule', active: true }],
      chairman_decisions: [{ id: 'dec-1', status: 'pending', brief_data: {} }],
    });
    const provider = { send: async () => ({ provider_message_id: 'SID-1', status: 'queued' }) };
    // Bare-letter labels — matches the real production convention (Adam's CLI passes
    // --option A --option B as literal single-letter labels; matchSmsOption does an exact
    // case-insensitive label match, so a reply body of 'B' must match a label of exactly 'B').
    const sent = await sendChairmanSmsQuestion(sb, {
      decisionId: 'dec-1', chairmanUserId: 'u1', chairmanEmail: 'c@example.com', chairmanPhone: '+15551234567',
      title: 'Ship now or hold?', decisionType: 'schedule', options: ['A', 'B'],
    }, provider, { quietWindow: () => false });
    expect(sent.sent).toBe(true);

    const reply = await handleInboundSmsReply(sb, {
      from: '+15551234567', to: '+15559999999', body: 'B', messageSid: 'SM-in-1', signatureValid: true,
    });
    expect(reply.outcome).toBe('answered');
    expect(reply.resolved).toBe(true);
    expect(reply.decisionId).toBe('dec-1');
    const decision = sb._tables.chairman_decisions[0];
    expect(decision.brief_data.sms_reply.option).toBe('B');
  });
});

describe('TS-4: sendChairmanSmsQuestion regression pin — both branches keep their exact pre-refactor field values', () => {
  // A FACTORY, not a shared literal — makeFakeSupabase's `[...(seed.chairman_decisions || [])]`
  // only shallow-copies the array; the row OBJECTS inside would still be shared (and mutated) by
  // reference across all three tests below if this were one const object reused by each `it()`.
  const seedWhitelisted = () => ({
    sms_decision_class_whitelist: [{ decision_class: 'schedule', active: true }],
    chairman_decisions: [{ id: 'dec-1', status: 'pending', brief_data: {} }],
  });

  it('obligation-enqueue branch (durable table live): status=queued, provider_message_id=null, sent_at=null, error_message=null', async () => {
    const sb = makeFakeSupabase(seedWhitelisted());
    sb._tables.sms_outbound_obligations = []; // presence of the table makes smsOutboundObligationsLive() true
    const origFrom = sb.from;
    sb.from = (table) => {
      if (table === 'sms_outbound_obligations') {
        return { select: () => ({ limit: async () => ({ error: null }) }), upsert: () => ({ select: async () => ({ data: [{ id: 'ob-1' }], error: null }) }) };
      }
      return origFrom(table);
    };
    const provider = { send: async () => ({ provider_message_id: 'UNUSED', status: 'queued' }) };
    const result = await sendChairmanSmsQuestion(sb, {
      decisionId: 'dec-1', chairmanUserId: 'u1', chairmanEmail: 'c@example.com', chairmanPhone: '+1555',
      title: 'Ship now or hold?', decisionType: 'schedule',
    }, provider, { quietWindow: () => false });
    expect(result.enqueued).toBe(true);
    const row = sb._tables.chairman_notifications[0];
    expect(row.status).toBe('queued');
    expect(row.provider_message_id).toBeNull();
    expect(row.sent_at).toBeNull();
    expect(row.error_message).toBeNull();
    expect(sb._tables.chairman_decisions[0].sms_reply_token).toBeTruthy();
  });

  it('fallback branch, provider success: status/provider_message_id/sent_at from the real send result, chairman_decisions IS updated', async () => {
    const sb = makeFakeSupabase(seedWhitelisted()); // no sms_outbound_obligations table -> fallback path
    const provider = { send: async () => ({ provider_message_id: 'SID-OK', status: 'sent' }) };
    const result = await sendChairmanSmsQuestion(sb, {
      decisionId: 'dec-1', chairmanUserId: 'u1', chairmanEmail: 'c@example.com', chairmanPhone: '+1555',
      title: 'Ship now or hold?', decisionType: 'schedule',
    }, provider, { quietWindow: () => false });
    expect(result.sent).toBe(true);
    const row = sb._tables.chairman_notifications[0];
    expect(row.status).toBe('sent');
    expect(row.provider_message_id).toBe('SID-OK');
    expect(row.sent_at).not.toBeNull();
    expect(row.error_message).toBeNull();
    expect(sb._tables.chairman_decisions[0].sms_reply_token).toBeTruthy();
  });

  it('fallback branch, provider failure: status=failed, error_message set, sent_at=null, chairman_decisions NOT updated', async () => {
    const sb = makeFakeSupabase(seedWhitelisted());
    const provider = { send: async () => ({ status: 'failed', reason: 'carrier_rejected' }) };
    const result = await sendChairmanSmsQuestion(sb, {
      decisionId: 'dec-1', chairmanUserId: 'u1', chairmanEmail: 'c@example.com', chairmanPhone: '+1555',
      title: 'Ship now or hold?', decisionType: 'schedule',
    }, provider, { quietWindow: () => false });
    expect(result.sent).toBe(false);
    expect(result.reason).toBe('carrier_rejected');
    const row = sb._tables.chairman_notifications[0];
    expect(row.status).toBe('failed');
    expect(row.error_message).toBe('carrier_rejected');
    expect(row.sent_at).toBeNull();
    // The chairman_decisions row must NOT receive a reply token for a send that never went out.
    expect(sb._tables.chairman_decisions[0].sms_reply_token).toBeUndefined();
  });
});
