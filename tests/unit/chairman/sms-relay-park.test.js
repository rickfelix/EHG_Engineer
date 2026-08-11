/**
 * SD-LEO-INFRA-CHAIRMAN-INBOUND-VISIBILITY-001 — TS-1 through TS-9. Nine verified-chairman-
 * number messages (a status question, a directive, a decision, a continuity complaint among
 * them) resolved no_match/rate_limited and terminal-drained invisibly on 2026-08-10 — every
 * consumer treated the channel as quiet. This suite proves the park/surface/resolve loop that
 * closes that gap, and that it does NOT touch the two pre-existing counters (invalid_signature
 * flood, unmatched flood) beyond the one deliberate FR-3 exemption.
 *
 * TS-10 (regression: pre-existing sms-bridge suites pass unmodified) is not duplicated here —
 * it is satisfied by running tests/unit/chairman/sms-bridge.test.js alongside this file.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  drainSmsRelayStaging,
  handleInboundSmsReply,
  resolveParkedChairmanSmsRow,
  PARK_OUTCOMES,
  AUTO_SUSPEND_UNMATCHED_THRESHOLD,
  AUTO_SUSPEND_INVALID_SIGNATURE_THRESHOLD,
} from '../../../lib/chairman/sms-bridge.js';
import { surfaceParkedChairmanSms } from '../../../scripts/adam-quiet-tick.mjs';

/** Same minimal in-memory multi-table fake as sms-bridge.test.js (local copy, repo convention). */
function makeFakeSupabase(seed = {}) {
  const tables = {
    chairman_decisions: [...(seed.chairman_decisions || [])],
    chairman_notifications: [...(seed.chairman_notifications || [])],
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

const CHAIR = '+16135550100';
const savedPhone = process.env.CHAIRMAN_PHONE;
afterEach(() => {
  if (savedPhone === undefined) delete process.env.CHAIRMAN_PHONE;
  else process.env.CHAIRMAN_PHONE = savedPhone;
});

describe('PARK_OUTCOMES contract', () => {
  it('parks exactly no_match and rate_limited — the two outcomes that terminal-drain without resolving anything', () => {
    expect(PARK_OUTCOMES).toEqual(['no_match', 'rate_limited']);
  });
});

describe('drainSmsRelayStaging — chairman parking (FR-1)', () => {
  it('TS-1: chairman no_match parks (parked_at set; drained_at remains set from the claim)', async () => {
    // Deliberately reformatted vs. the stored from_phone — proves phoneKey() normalization is
    // doing the match, not raw string equality (the reason phoneKey exists: provider format drift).
    process.env.CHAIRMAN_PHONE = '+1 613-555-0100';
    const sb = makeFakeSupabase({
      sms_relay_staging: [
        { id: 'stg-park-1', provider_message_id: 'SM-park-1', from_phone: CHAIR, to_phone: '+15559999999', body_raw: 'any update on this?', signature_valid: true, received_at: new Date().toISOString(), drained_at: null },
      ],
    });
    const result = await drainSmsRelayStaging(sb);
    expect(result.results.find((r) => r.id === 'stg-park-1').outcome).toBe('no_match');
    const row = sb._tables.sms_relay_staging.find((r) => r.id === 'stg-park-1');
    expect(row.parked_at).toBeTruthy();
    expect(row.drained_at).toBeTruthy();
  });

  it('TS-2: chairman rate_limited parks', async () => {
    process.env.CHAIRMAN_PHONE = CHAIR;
    const now = new Date().toISOString();
    const priorLog = Array.from({ length: 5 }, (_, i) => ({
      id: `log-rl-${i}`, from_phone: CHAIR, outcome: 'no_match', created_at: now,
    }));
    const sb = makeFakeSupabase({
      sms_inbound_log: priorLog,
      sms_relay_staging: [
        { id: 'stg-park-2', provider_message_id: 'SM-park-2', from_phone: CHAIR, to_phone: '+15559999999', body_raw: 'still there?', signature_valid: true, received_at: now, drained_at: null },
      ],
    });
    const result = await drainSmsRelayStaging(sb);
    expect(result.results.find((r) => r.id === 'stg-park-2').outcome).toBe('rate_limited');
    expect(sb._tables.sms_relay_staging.find((r) => r.id === 'stg-park-2').parked_at).toBeTruthy();
  });

  it('TS-3: non-chairman no_match still terminal-drains exactly as before this PRD (no parking)', async () => {
    process.env.CHAIRMAN_PHONE = CHAIR;
    const sb = makeFakeSupabase({
      sms_relay_staging: [
        { id: 'stg-nopark-1', provider_message_id: 'SM-nopark-1', from_phone: '+15550009999', to_phone: '+15559999999', body_raw: 'random text', signature_valid: true, received_at: new Date().toISOString(), drained_at: null },
      ],
    });
    const result = await drainSmsRelayStaging(sb);
    expect(result.results.find((r) => r.id === 'stg-nopark-1').outcome).toBe('no_match');
    const row = sb._tables.sms_relay_staging.find((r) => r.id === 'stg-nopark-1');
    expect(row.drained_at).toBeTruthy();
    expect(row.parked_at).toBeFalsy();
  });

  it('TS-4: an answered chairman row never parks (undone is symmetric — same PARK_OUTCOMES.includes() gate)', async () => {
    process.env.CHAIRMAN_PHONE = CHAIR;
    const sb = makeFakeSupabase({
      chairman_decisions: [{ id: 'dec-ans', status: 'pending', brief_data: {}, sms_reply_token_expires_at: new Date(Date.now() + 600_000).toISOString() }],
      chairman_notifications: [{ id: 'n-ans', channel: 'sms', recipient_phone: CHAIR, decision_id: 'dec-ans', created_at: new Date(Date.now() - 60_000).toISOString() }],
      sms_relay_staging: [
        { id: 'stg-answered', provider_message_id: 'SM-answered', from_phone: CHAIR, to_phone: '+15559999999', body_raw: 'approved, go ahead', signature_valid: true, received_at: new Date().toISOString(), drained_at: null },
      ],
    });
    const result = await drainSmsRelayStaging(sb);
    expect(result.results.find((r) => r.id === 'stg-answered').outcome).toBe('answered');
    const row = sb._tables.sms_relay_staging.find((r) => r.id === 'stg-answered');
    expect(row.drained_at).toBeTruthy();
    expect(row.parked_at).toBeFalsy();
  });
});

describe('surfaceParkedChairmanSms + resolveParkedChairmanSmsRow (FR-2 / FR-4c)', () => {
  it('TS-5: a parked row re-fires every tick until resolved (state-based, not one-shot)', async () => {
    const sb = makeFakeSupabase({
      sms_relay_staging: [
        { id: 'stg-persist', from_phone: CHAIR, body_raw: 'waiting on a reply', parked_at: new Date(Date.now() - 120_000).toISOString(), resolved_at: null },
      ],
    });
    const first = await surfaceParkedChairmanSms(sb);
    const second = await surfaceParkedChairmanSms(sb);
    expect(first.count).toBe(1);
    expect(second.count).toBe(1);
    expect(first.rows[0]).toMatchObject({ id: 'stg-persist', fromPhone: CHAIR, body: 'waiting on a reply' });
    expect(first.rows[0].ageMin).toBeGreaterThanOrEqual(0);
    expect(second.rows[0].id).toBe('stg-persist');
  });

  it('TS-6: resolving silences the interrupt exactly once', async () => {
    const sb = makeFakeSupabase({
      sms_relay_staging: [
        { id: 'stg-resolve', from_phone: CHAIR, body_raw: 'please advise', parked_at: new Date(Date.now() - 60_000).toISOString(), resolved_at: null },
      ],
    });
    const before = await surfaceParkedChairmanSms(sb);
    expect(before.count).toBe(1);

    const first = await resolveParkedChairmanSmsRow(sb, 'stg-resolve');
    expect(first.resolved).toBe(true);
    const row = sb._tables.sms_relay_staging.find((r) => r.id === 'stg-resolve');
    expect(row.resolved_at).toBeTruthy();

    const after = await surfaceParkedChairmanSms(sb);
    expect(after.count).toBe(0);

    // A second resolve call on the same (already-resolved) row is a no-op: no error, unchanged.
    const firstResolvedAt = row.resolved_at;
    const second = await resolveParkedChairmanSmsRow(sb, 'stg-resolve');
    expect(second.resolved).toBe(false);
    expect(row.resolved_at).toBe(firstResolvedAt);
  });
});

describe('checkAndApplyUnmatchedAutoSuspend — chairman exemption (FR-3)', () => {
  it('TS-7: the verified chairman number is exempt from the unmatched-flood counter', async () => {
    process.env.CHAIRMAN_PHONE = CHAIR;
    const sb = makeFakeSupabase();
    let last;
    for (let i = 0; i < AUTO_SUSPEND_UNMATCHED_THRESHOLD; i += 1) {
      last = await handleInboundSmsReply(sb, {
        from: CHAIR, to: '+15559999999', body: `status check ${i}`,
        messageSid: `SM-chair-unmatched-${i}`, signatureValid: true,
      });
    }
    // Threshold crossed by count, but the chairman is never counted/suspended.
    expect(last.outcome).toBe('no_match');
    expect(sb._tables.sms_inbound_suspensions.some((s) => s.from_phone === CHAIR)).toBe(false);

    // One more, to confirm the exemption holds indefinitely rather than "not yet".
    const after = await handleInboundSmsReply(sb, {
      from: CHAIR, to: '+15559999999', body: 'still checking in',
      messageSid: 'SM-chair-unmatched-extra', signatureValid: true,
    });
    expect(after.outcome).toBe('no_match');
  });

  it('TS-8: a non-chairman number crossing the same threshold is still suspended (guard preserved)', async () => {
    process.env.CHAIRMAN_PHONE = CHAIR;
    const OTHER = '+15125550999';
    const sb = makeFakeSupabase();
    for (let i = 0; i < AUTO_SUSPEND_UNMATCHED_THRESHOLD; i += 1) {
      await handleInboundSmsReply(sb, {
        from: OTHER, to: '+15559999999', body: `random ${i}`,
        messageSid: `SM-other-unmatched-${i}`, signatureValid: true,
      });
    }
    expect(sb._tables.sms_inbound_suspensions.some((s) => s.from_phone === OTHER)).toBe(true);

    const after = await handleInboundSmsReply(sb, {
      from: OTHER, to: '+15559999999', body: 'one more',
      messageSid: 'SM-other-unmatched-extra', signatureValid: true,
    });
    expect(after.outcome).toBe('suspended');
  });
});

describe('checkAndApplyAutoSuspend — invalid_signature counter unaffected by FR-3 (TS-9)', () => {
  it('TS-9: the invalid_signature flood counter still trips for the chairman number', async () => {
    process.env.CHAIRMAN_PHONE = CHAIR;
    const sb = makeFakeSupabase();
    let last;
    for (let i = 0; i < AUTO_SUSPEND_INVALID_SIGNATURE_THRESHOLD; i += 1) {
      last = await handleInboundSmsReply(sb, {
        from: CHAIR, to: '+15559999999', body: 'spoof attempt',
        messageSid: `SM-chair-badsig-${i}`, signatureValid: false,
      });
    }
    expect(last.outcome).toBe('invalid_signature');
    expect(sb._tables.sms_inbound_suspensions.some((s) => s.from_phone === CHAIR && !s.cleared_at)).toBe(true);

    const after = await handleInboundSmsReply(sb, {
      from: CHAIR, to: '+15559999999', body: 'now valid but too late',
      messageSid: 'SM-chair-badsig-post', signatureValid: true,
    });
    expect(after.outcome).toBe('suspended');
  });
});

describe('FR-4: chained drainSmsRelayStaging -> surfaceParkedChairmanSms on the same state', () => {
  it('a chairman no_match row drained now, surfaces on the very next tick — the two halves are wired, not just independently correct', async () => {
    process.env.CHAIRMAN_PHONE = CHAIR;
    const OTHER = '+15127770000';
    const sb = makeFakeSupabase({
      sms_relay_staging: [
        { id: 'stg-chain-chair', provider_message_id: 'SM-chain-chair', from_phone: CHAIR, to_phone: '+15559999999', body_raw: 'chained: any word yet?', signature_valid: true, received_at: new Date(Date.now() - 2000).toISOString(), drained_at: null },
        { id: 'stg-chain-other', provider_message_id: 'SM-chain-other', from_phone: OTHER, to_phone: '+15559999999', body_raw: 'chained: unrelated spam', signature_valid: true, received_at: new Date(Date.now() - 1000).toISOString(), drained_at: null },
      ],
    });

    const drainResult = await drainSmsRelayStaging(sb);
    expect(drainResult.results.find((r) => r.id === 'stg-chain-chair').outcome).toBe('no_match');
    expect(drainResult.results.find((r) => r.id === 'stg-chain-other').outcome).toBe('no_match');

    // AC: the non-chairman row still terminal-drains without parking, AND it was logged toward
    // the unmatched counter (TS-7/TS-8 test the threshold separately; this proves it registers).
    expect(sb._tables.sms_relay_staging.find((r) => r.id === 'stg-chain-other').parked_at).toBeFalsy();
    expect(sb._tables.sms_inbound_log.some((r) => r.from_phone === OTHER && r.outcome === 'no_match')).toBe(true);

    // The read half runs against the SAME fake instance the write half just mutated — proves
    // the actual row shape drainSmsRelayStaging persists is exactly what the query expects.
    const surfaced = await surfaceParkedChairmanSms(sb);
    expect(surfaced.rows.map((r) => r.id)).toEqual(['stg-chain-chair']);
    expect(surfaced.rows.map((r) => r.id)).not.toContain('stg-chain-other');
  });
});
