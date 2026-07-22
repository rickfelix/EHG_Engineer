/**
 * SD-LEO-FEAT-HIGH-CONSEQUENCE-STAGE-001-B — guardrail suite for the three net-new SMS
 * decision-channel guardrails wired into lib/chairman/sms-bridge.js:
 *   FR-4  a SEPARATE unmatched-reply (no_match/ambiguous) auto-suspend counter that degrades a
 *         from_phone to notify-only + console alert, WITHOUT touching the invalid_signature trip.
 *   FR-5  multiple-choice-only reply enforcement: an outbound question may present enumerated
 *         options and an inbound reply must select one; free text that matches no option is
 *         no_match (relayed-not-executed) and the raw text stays INERT under brief_data.sms_reply.
 *   FR-6  a fail-soft channel='sms' audit stamp that no-ops when the STAGED column is absent.
 * Plus AC-6: the fail-closed HIGH-consequence backstop is NOT loosened.
 *
 * Stubbed in-memory supabase (no live DB / Twilio), extended from tests/unit/chairman/
 * sms-bridge.test.js's fake with `.in`/`.gt` filters and a `channelColumnPresent` switch that
 * models a STAGED/unapplied column (an UPDATE setting `channel` errors + mutates nothing, mirroring
 * PostgREST's column-missing behavior).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  handleInboundSmsReply,
  composeMessage,
  matchSmsOption,
  normalizeSmsOptions,
  stampSmsChannel,
  AUTO_SUSPEND_INVALID_SIGNATURE_THRESHOLD,
  AUTO_SUSPEND_UNMATCHED_THRESHOLD,
} from '../../../lib/chairman/sms-bridge.js';
import { classifyConsequence } from '../../../lib/chairman/consequence-classifier.js';

function makeFakeSupabase(seed = {}, { channelColumnPresent = true } = {}) {
  const tables = {
    chairman_notifications: [...(seed.chairman_notifications || [])],
    chairman_decisions: [...(seed.chairman_decisions || [])],
    sms_inbound_log: [...(seed.sms_inbound_log || [])],
    sms_inbound_suspensions: [...(seed.sms_inbound_suspensions || [])],
    sms_relay_staging: [...(seed.sms_relay_staging || [])],
    sms_decision_class_whitelist: [...(seed.sms_decision_class_whitelist || [])],
    sms_approved_spend_ledger: [...(seed.sms_approved_spend_ledger || [])],
  };
  let seq = 0;

  function applyFilters(rows, filters) {
    return rows.filter((row) =>
      filters.every(([col, op, val]) => {
        if (op === 'eq') return row[col] === val;
        if (op === 'gte') return (row[col] ?? null) !== null && row[col] >= val;
        if (op === 'gt') return (row[col] ?? null) !== null && row[col] > val;
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
      gt(col, val) { ctx.filters.push([col, 'gt', val]); return api; },
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
          tables[table].push(ctx.row);
          resolve({ data: [{ id: ctx.row.id }], error: null });
          return;
        }
        if (ctx.mode === 'update') {
          // Model a STAGED/absent column: an UPDATE that sets `channel` while the column does not
          // exist errors and mutates nothing (mirrors PostgREST's column-missing error).
          if (!channelColumnPresent && ctx.vals && Object.prototype.hasOwnProperty.call(ctx.vals, 'channel')) {
            resolve({ data: null, error: { message: 'column "channel" of relation "chairman_decisions" does not exist' } });
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

// ---------------------------------------------------------------------------------------
// FR-4: unmatched (no_match/ambiguous) auto-suspend counter — separate from invalid_signature.
// ---------------------------------------------------------------------------------------
describe('FR-4 unmatched-reply auto-suspend counter', () => {
  it('N unmatched (no_match) inbound replies from one number trip a PERSISTENT notify-only suspend + console alert', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sb = makeFakeSupabase(); // no notifications => every valid inbound resolves as no_match
    const from = '+15551110000';
    let last;
    for (let i = 0; i < AUTO_SUSPEND_UNMATCHED_THRESHOLD; i++) {
      last = await handleInboundSmsReply(sb, { from, to: '+15559999999', body: `free text ${i}`, messageSid: `SM-nm-${i}`, signatureValid: true });
      expect(last.outcome).toBe('no_match');
    }
    // A persistent suspension row now exists (degrade-closed to notify-only).
    expect(sb._tables.sms_inbound_suspensions.some((s) => s.from_phone === from && !s.cleared_at)).toBe(true);
    // Console alert was emitted (Solomon guardrail (e): degrade closed AND surface).
    expect(warnSpy.mock.calls.some((c) => String(c[0]).includes('AUTO-SUSPEND(unmatched)'))).toBe(true);
    // The NEXT inbound — even valid — is now fail-closed rejected as 'suspended'.
    const after = await handleInboundSmsReply(sb, { from, to: '+15559999999', body: 'now valid', messageSid: 'SM-nm-post', signatureValid: true });
    expect(after.outcome).toBe('suspended');
    warnSpy.mockRestore();
  });

  it('an ambiguous outcome also feeds the unmatched counter', async () => {
    const now = Date.now();
    // 2 simultaneously-eligible candidates => ambiguous. Threshold-1 pre-seeded no_match rows means
    // this single ambiguous crosses AUTO_SUSPEND_UNMATCHED_THRESHOLD.
    const seedLog = [];
    for (let i = 0; i < AUTO_SUSPEND_UNMATCHED_THRESHOLD - 1; i++) {
      seedLog.push({ id: `pre-${i}`, from_phone: '+15551119999', outcome: 'no_match', created_at: new Date(now - 1000).toISOString() });
    }
    const sb = makeFakeSupabase({
      sms_inbound_log: seedLog,
      chairman_decisions: [
        { id: 'dec-amb-a', status: 'pending', brief_data: {}, sms_reply_token_expires_at: future() },
        { id: 'dec-amb-b', status: 'pending', brief_data: {}, sms_reply_token_expires_at: future() },
      ],
      chairman_notifications: [
        { id: 'na', channel: 'sms', recipient_phone: '+15551119999', decision_id: 'dec-amb-a', created_at: new Date(now - 120_000).toISOString() },
        { id: 'nb', channel: 'sms', recipient_phone: '+15551119999', decision_id: 'dec-amb-b', created_at: new Date(now - 60_000).toISOString() },
      ],
    });
    const res = await handleInboundSmsReply(sb, { from: '+15551119999', to: '+15559999999', body: 'yes', messageSid: 'SM-amb', signatureValid: true });
    expect(res.outcome).toBe('ambiguous');
    expect(sb._tables.sms_inbound_suspensions.some((s) => s.from_phone === '+15551119999' && !s.cleared_at)).toBe(true);
  });

  it('the invalid_signature path is unchanged: its threshold is 5, distinct from the unmatched threshold, and unmatched counting ignores invalid_signature', async () => {
    expect(AUTO_SUSPEND_INVALID_SIGNATURE_THRESHOLD).toBe(5);
    expect(AUTO_SUSPEND_UNMATCHED_THRESHOLD).not.toBe(AUTO_SUSPEND_INVALID_SIGNATURE_THRESHOLD);
    const sb = makeFakeSupabase();
    const from = '+15552220000';
    // Below the invalid_signature threshold: no suspension. These are invalid_signature outcomes,
    // which the unmatched counter never counts — so the new counter cannot cross-trip here either,
    // even though the count exceeds the (smaller) unmatched threshold.
    for (let i = 0; i < AUTO_SUSPEND_INVALID_SIGNATURE_THRESHOLD - 1; i++) {
      const r = await handleInboundSmsReply(sb, { from, to: '+15559999999', body: 'spoof', messageSid: `SM-sig-${i}`, signatureValid: false });
      expect(r.outcome).toBe('invalid_signature');
    }
    expect(sb._tables.sms_inbound_suspensions.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------
// FR-5: multiple-choice-only reply enforcement (free-text-untrusted preserved).
// ---------------------------------------------------------------------------------------
describe('FR-5 multiple-choice-only reply enforcement', () => {
  it('composeMessage renders enumerated options as a multiple-choice prompt; legacy free-text form is unchanged', () => {
    const msg = composeMessage('Approve stage-gate promotion for Venture X?', ['Approve', 'Reject']);
    expect(msg).toContain('1=Approve');
    expect(msg).toContain('2=Reject');
    expect(composeMessage('Which time works, 2pm or 4pm?')).toContain('Reply to answer.');
  });

  it('matchSmsOption resolves ONLY by 1-based index or exact case-insensitive label; free text does not match', () => {
    const opts = ['Approve', 'Reject'];
    expect(matchSmsOption('1', opts)).toMatchObject({ matched: true, label: 'Approve' });
    expect(matchSmsOption('2', opts)).toMatchObject({ matched: true, label: 'Reject' });
    expect(matchSmsOption('approve', opts)).toMatchObject({ matched: true, label: 'Approve' });
    expect(matchSmsOption('  ReJeCt ', opts)).toMatchObject({ matched: true, label: 'Reject' });
    expect(matchSmsOption('3', opts).matched).toBe(false);            // index out of range
    expect(matchSmsOption('maybe later', opts).matched).toBe(false);  // free text
    expect(matchSmsOption('', opts).matched).toBe(false);
    expect(normalizeSmsOptions(['  Approve ', '', 3, 'Reject'])).toEqual(['Approve', 'Reject']);
  });

  it('a decision presenting options: a non-option free-text reply is no_match, never executed, and leaves sms_reply INERT/unwritten', async () => {
    const phone = '+15553330000';
    const sb = makeFakeSupabase({
      chairman_decisions: [{ id: 'dec-opt', status: 'pending', brief_data: { sms_options: ['Approve', 'Reject'] }, sms_reply_token_expires_at: future() }],
      chairman_notifications: [{ id: 'n-opt', channel: 'sms', recipient_phone: phone, decision_id: 'dec-opt', created_at: new Date().toISOString() }],
    });
    const res = await handleInboundSmsReply(sb, { from: phone, to: '+15559999999', body: 'let me think about it', messageSid: 'SM-opt-1', signatureValid: true });
    expect(res.resolved).toBe(false);
    expect(res.outcome).toBe('no_match');
    const dec = sb._tables.chairman_decisions.find((d) => d.id === 'dec-opt');
    expect(dec.sms_reply_used_at).toBeFalsy();       // decision NOT claimed
    expect(dec.brief_data.sms_reply).toBeUndefined(); // raw free text NOT delivered as an answer
    expect(sb._tables.sms_inbound_log[0].outcome).toBe('no_match');
  });

  it('a decision presenting options: a matching reply resolves as answered, records the validated option, keeps raw text inert', async () => {
    const phone = '+15554440000';
    const sb = makeFakeSupabase({
      chairman_decisions: [{ id: 'dec-opt2', status: 'pending', brief_data: { sms_options: ['Approve', 'Reject'] }, sms_reply_token_expires_at: future() }],
      chairman_notifications: [{ id: 'n-opt2', channel: 'sms', recipient_phone: phone, decision_id: 'dec-opt2', created_at: new Date().toISOString() }],
    });
    const res = await handleInboundSmsReply(sb, { from: phone, to: '+15559999999', body: '1', messageSid: 'SM-opt-2', signatureValid: true });
    expect(res.resolved).toBe(true);
    expect(res.outcome).toBe('answered');
    const dec = sb._tables.chairman_decisions.find((d) => d.id === 'dec-opt2');
    expect(dec.brief_data.sms_reply.text).toBe('1');          // raw inert text preserved
    expect(dec.brief_data.sms_reply.option).toBe('Approve');  // validated option additively recorded
    expect(dec.brief_data.sms_options).toEqual(['Approve', 'Reject']); // options metadata preserved
    expect(dec.status).toBe('pending'); // delivery only — the agent's next tick resolves it
  });

  it('a decision WITHOUT options keeps the pre-existing free-text delivery (backward-compatible)', async () => {
    const phone = '+15555550000';
    const sb = makeFakeSupabase({
      chairman_decisions: [{ id: 'dec-legacy', status: 'pending', brief_data: {}, sms_reply_token_expires_at: future() }],
      chairman_notifications: [{ id: 'n-legacy', channel: 'sms', recipient_phone: phone, decision_id: 'dec-legacy', created_at: new Date().toISOString() }],
    });
    const res = await handleInboundSmsReply(sb, { from: phone, to: '+15559999999', body: 'looks good, proceed', messageSid: 'SM-legacy-1', signatureValid: true });
    expect(res.outcome).toBe('answered');
    const dec = sb._tables.chairman_decisions.find((d) => d.id === 'dec-legacy');
    expect(dec.brief_data.sms_reply.text).toBe('looks good, proceed');
    expect(dec.brief_data.sms_reply.option).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------
// FR-6: fail-soft channel='sms' audit stamp.
// ---------------------------------------------------------------------------------------
describe('FR-6 fail-soft channel=sms audit stamp', () => {
  it('stampSmsChannel writes channel=sms when the column exists', async () => {
    const sb = makeFakeSupabase({ chairman_decisions: [{ id: 'dec-ch', status: 'pending', brief_data: {} }] }, { channelColumnPresent: true });
    const ok = await stampSmsChannel(sb, 'dec-ch');
    expect(ok).toBe(true);
    expect(sb._tables.chairman_decisions.find((d) => d.id === 'dec-ch').channel).toBe('sms');
  });

  it('stampSmsChannel is fail-soft (no throw, no-op) when the channel column is absent pre-apply', async () => {
    const sb = makeFakeSupabase({ chairman_decisions: [{ id: 'dec-ch2', status: 'pending', brief_data: {} }] }, { channelColumnPresent: false });
    const ok = await stampSmsChannel(sb, 'dec-ch2');
    expect(ok).toBe(false); // reported not-written — but did NOT throw
    expect(sb._tables.chairman_decisions.find((d) => d.id === 'dec-ch2').channel).toBeUndefined();
  });

  it('the SMS answer path still resolves normally when the channel column is absent (fail-soft integration)', async () => {
    const phone = '+15556660000';
    const sb = makeFakeSupabase({
      chairman_decisions: [{ id: 'dec-fs', status: 'pending', brief_data: {}, sms_reply_token_expires_at: future() }],
      chairman_notifications: [{ id: 'n-fs', channel: 'sms', recipient_phone: phone, decision_id: 'dec-fs', created_at: new Date().toISOString() }],
    }, { channelColumnPresent: false });
    const res = await handleInboundSmsReply(sb, { from: phone, to: '+15559999999', body: 'yes', messageSid: 'SM-fs-1', signatureValid: true });
    expect(res.outcome).toBe('answered');        // decision path NOT blocked by the missing column
    const dec = sb._tables.chairman_decisions.find((d) => d.id === 'dec-fs');
    expect(dec.brief_data.sms_reply.text).toBe('yes'); // reply still delivered
    expect(dec.channel).toBeUndefined();               // channel left unstamped (fail-soft)
  });

  it('when the channel column exists, an SMS-answered decision row is stamped channel=sms', async () => {
    const phone = '+15557770000';
    const sb = makeFakeSupabase({
      chairman_decisions: [{ id: 'dec-ch3', status: 'pending', brief_data: {}, sms_reply_token_expires_at: future() }],
      chairman_notifications: [{ id: 'n-ch3', channel: 'sms', recipient_phone: phone, decision_id: 'dec-ch3', created_at: new Date().toISOString() }],
    }, { channelColumnPresent: true });
    const res = await handleInboundSmsReply(sb, { from: phone, to: '+15559999999', body: 'yes', messageSid: 'SM-ch3-1', signatureValid: true });
    expect(res.outcome).toBe('answered');
    expect(sb._tables.chairman_decisions.find((d) => d.id === 'dec-ch3').channel).toBe('sms');
  });
});

// ---------------------------------------------------------------------------------------
// AC-6 / risk: the fail-closed HIGH-consequence backstop is NOT loosened by registration.
// ---------------------------------------------------------------------------------------
describe('AC-6 HIGH-consequence backstop is not loosened', () => {
  it('a stage-gate approval whose text trips HIGH_PATTERNS (governance) classifies HIGH (console-only)', () => {
    expect(classifyConsequence({ decisionType: 'blocking stage-gate approval', title: 'Approve governance stage-gate promotion?' })).toBe('high');
  });

  it('unrecognized/unmatched stage-gate text still fails closed to HIGH (default)', () => {
    expect(classifyConsequence({ decisionType: 'blocking stage-gate approval', title: 'xyzzy' })).toBe('high');
  });

  it('a stage-gate approval with bounded medium text is not forced to HIGH (registration is reconcilable per TR-2)', () => {
    expect(classifyConsequence({ decisionType: 'blocking stage-gate approval', title: 'Approve promotion to the next stage?' })).toBe('medium');
  });
});
