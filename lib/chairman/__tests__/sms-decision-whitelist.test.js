/**
 * SMS decision-class whitelist — fail-closed unit + outbound-gate integration tests.
 * SD-LEO-FEAT-SMS-CHAIRMAN-DECISION-001-A (FR-1).
 *
 * Two surfaces under test:
 *   1. isWhitelistedDecisionClass(supabase, class) — the pure fail-closed matcher.
 *   2. sendChairmanSmsQuestion — the outbound gate, proving the whitelist check runs AFTER
 *      the HIGH-consequence backstop and BEFORE any provider send, against a stubbed
 *      provider + supabase (no live Twilio, no live DB).
 * Plus a source grep-pin that the send module never mutates the whitelist (console-only
 * widening ratchet), mirroring the dependency-gate purity-pin style.
 */
import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isWhitelistedDecisionClass } from '../sms-decision-whitelist.js';
import { sendChairmanSmsQuestion } from '../sms-bridge.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------------------
// Fake supabase tuned to the exact query shapes the whitelist helper + send path issue.
// ---------------------------------------------------------------------------------------
function makeFakeSupabase(seed = {}) {
  const tables = {
    sms_decision_class_whitelist: [...(seed.sms_decision_class_whitelist || [])],
    chairman_notifications: [...(seed.chairman_notifications || [])],
    chairman_decisions: [...(seed.chairman_decisions || [])],
  };
  // A per-table forced error (to exercise the fail-closed error branch of the helper).
  const forceError = seed.forceError || {};
  let seq = 0;

  function applyFilters(rows, filters) {
    return rows.filter((row) =>
      filters.every(([col, op, val]) => {
        if (op === 'eq') return row[col] === val;
        if (op === 'gte') return row[col] >= val;
        return true;
      })
    );
  }

  function from(table) {
    const ctx = { filters: [], limitN: null, mode: null, countMode: false };
    const api = {
      select(_cols, opts) {
        if (ctx.mode === 'update' || ctx.mode === 'insert') return api;
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
      limit() { return api; },
      then(resolve) {
        if (forceError[table]) {
          resolve({ data: null, count: null, error: { message: `forced error on ${table}` } });
          return;
        }
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
        const rows = applyFilters(tables[table], ctx.filters);
        if (ctx.countMode) resolve({ count: rows.length, data: null, error: null });
        else resolve({ data: rows, error: null });
      },
    };
    return api;
  }

  return { from, _tables: tables };
}

function makeFakeProvider() {
  return {
    send: vi.fn(async () => ({ provider_message_id: 'FAKE-SID-1', status: 'queued' })),
    verifyInboundSignature: () => true,
    normalizeInboundWebhook: (b) => b,
    parseStatusCallback: (b) => b,
  };
}

// ---------------------------------------------------------------------------------------
// 1. Helper fail-closed matrix
// ---------------------------------------------------------------------------------------
describe('isWhitelistedDecisionClass — fail-closed matrix', () => {
  it('query error -> false', async () => {
    const sb = makeFakeSupabase({
      sms_decision_class_whitelist: [{ decision_class: 'schedule', active: true }],
      forceError: { sms_decision_class_whitelist: true },
    });
    expect(await isWhitelistedDecisionClass(sb, 'schedule')).toBe(false);
  });

  it('null data -> false', async () => {
    // A client that resolves data:null with no error (e.g. non-existent column select shape).
    const sb = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: null, error: null }) }) }) }) }) };
    expect(await isWhitelistedDecisionClass(sb, 'schedule')).toBe(false);
  });

  it('empty result array -> false', async () => {
    const sb = makeFakeSupabase({ sms_decision_class_whitelist: [] });
    expect(await isWhitelistedDecisionClass(sb, 'schedule')).toBe(false);
  });

  it('absent (undefined) class -> false', async () => {
    const sb = makeFakeSupabase({ sms_decision_class_whitelist: [{ decision_class: 'schedule', active: true }] });
    expect(await isWhitelistedDecisionClass(sb, undefined)).toBe(false);
  });

  it('blank / whitespace-only class -> false', async () => {
    const sb = makeFakeSupabase({ sms_decision_class_whitelist: [{ decision_class: 'schedule', active: true }] });
    expect(await isWhitelistedDecisionClass(sb, '   ')).toBe(false);
  });

  it('non-string class -> false', async () => {
    const sb = makeFakeSupabase({ sms_decision_class_whitelist: [{ decision_class: 'schedule', active: true }] });
    expect(await isWhitelistedDecisionClass(sb, { class: 'schedule' })).toBe(false);
    expect(await isWhitelistedDecisionClass(sb, 42)).toBe(false);
  });

  it('exact ACTIVE match -> true (case-normalized)', async () => {
    const sb = makeFakeSupabase({ sms_decision_class_whitelist: [{ decision_class: 'schedule', active: true }] });
    expect(await isWhitelistedDecisionClass(sb, 'schedule')).toBe(true);
    // input is normalized (trim + lowercase) before the exact compare
    expect(await isWhitelistedDecisionClass(sb, '  SCHEDULE  ')).toBe(true);
  });

  it('a non-active (active=false) matching row -> false', async () => {
    const sb = makeFakeSupabase({ sms_decision_class_whitelist: [{ decision_class: 'schedule', active: false }] });
    expect(await isWhitelistedDecisionClass(sb, 'schedule')).toBe(false);
  });

  it('substring / near-match is NOT a match (sched vs schedule) -> false', async () => {
    const sb = makeFakeSupabase({ sms_decision_class_whitelist: [{ decision_class: 'schedule', active: true }] });
    expect(await isWhitelistedDecisionClass(sb, 'sched')).toBe(false);
    expect(await isWhitelistedDecisionClass(sb, 'schedule_change_urgent')).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------
// 2. Outbound gate via sendChairmanSmsQuestion
// ---------------------------------------------------------------------------------------
describe('sendChairmanSmsQuestion — whitelist gate ordering', () => {
  const baseOpts = {
    decisionId: 'dec-wl', chairmanUserId: 'u1', chairmanEmail: 'chairman@example.com',
    chairmanPhone: '+15551234567',
  };

  it('(a) non-whitelisted LOW class -> not_whitelisted, provider.send NOT called', async () => {
    const sb = makeFakeSupabase({
      sms_decision_class_whitelist: [], // empty list = nothing eligible
      chairman_decisions: [{ id: 'dec-wl', status: 'pending', brief_data: {} }],
    });
    const provider = makeFakeProvider();
    const result = await sendChairmanSmsQuestion(sb, {
      ...baseOpts, title: 'Which time works better, 2pm or 4pm?', decisionType: 'schedule',
    }, provider, { quietWindow: () => false });

    expect(result.sent).toBe(false);
    expect(result.reason).toBe('not_whitelisted');
    expect(result.consequence).toBe('low');
    expect(provider.send).not.toHaveBeenCalled();
    expect(sb._tables.chairman_notifications.length).toBe(0);
  });

  it('(b) HIGH class -> high_consequence regardless of whitelist (backstop wins, runs first)', async () => {
    const sb = makeFakeSupabase({
      // even if the class were whitelisted, HIGH must still hold the send
      sms_decision_class_whitelist: [{ decision_class: 'governance', active: true }],
      chairman_decisions: [{ id: 'dec-wl', status: 'pending', brief_data: {} }],
    });
    const provider = makeFakeProvider();
    const result = await sendChairmanSmsQuestion(sb, {
      ...baseOpts, title: 'Approve a governance change to kill the venture?', decisionType: 'governance',
    }, provider, { quietWindow: () => false });

    expect(result.sent).toBe(false);
    expect(result.reason).toBe('high_consequence');
    expect(result.consequence).toBe('high');
    expect(provider.send).not.toHaveBeenCalled();
  });

  it('(c) whitelisted LOW class -> proceeds to send', async () => {
    const sb = makeFakeSupabase({
      sms_decision_class_whitelist: [{ decision_class: 'schedule', active: true }],
      chairman_decisions: [{ id: 'dec-wl', status: 'pending', brief_data: {} }],
    });
    const provider = makeFakeProvider();
    const result = await sendChairmanSmsQuestion(sb, {
      ...baseOpts, title: 'Which time works better, 2pm or 4pm?', decisionType: 'schedule',
    }, provider, { quietWindow: () => false });

    expect(result.sent).toBe(true);
    expect(result.consequence).toBe('low');
    expect(provider.send).toHaveBeenCalledTimes(1);
    expect(sb._tables.chairman_notifications.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------
// 3. Console-only ratchet grep-pin: the send module must NEVER mutate the whitelist.
// ---------------------------------------------------------------------------------------
describe('console-only ratchet — sms-bridge.js never writes the whitelist', () => {
  it('contains no insert/update/delete against sms_decision_class_whitelist', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'sms-bridge.js'), 'utf8');
    // Any .from('sms_decision_class_whitelist') paired with a write verb, or a direct mutate.
    expect(src).not.toMatch(/sms_decision_class_whitelist['"]\s*\)[\s\S]{0,80}\.(insert|update|delete|upsert)\b/);
    expect(src).not.toMatch(/\.(insert|update|delete|upsert)\b[\s\S]{0,80}sms_decision_class_whitelist/);
  });
});
