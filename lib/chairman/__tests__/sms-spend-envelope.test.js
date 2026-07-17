/**
 * SMS spend-envelope red-team suite — the Solomon acceptance gates for the real-money
 * SMS spend control. SD-LEO-FEAT-SMS-CHAIRMAN-DECISION-001-B (FR-1/FR-2/FR-3).
 *
 * Stubbed supabase (no live DB, no live Twilio). The fake models the ATOMIC behavior of the
 * debit_sms_daily_spend RPC (a synchronous, non-yielding SUM-check-and-INSERT against an
 * in-memory ledger) so the cross-decision daily-cap TOCTOU is exercised faithfully. The
 * atomic single-row conditional UPDATEs (claim / undo) are modeled by apply-filters-then-mutate.
 *
 * Coverage:
 *   TS-1  cross-decision daily-cap TOCTOU (two concurrent consumes of different same-day
 *         $300 decisions) -> exactly one approved, the second over-cap -> console.
 *   TS-2  unknown amount_usd on a spend-class decision -> console, consumed_at NOT set.
 *   per-decision > $250 -> console.
 *   TS-3  undo within window -> undone; consumeSmsReply then returns undone.
 *   consume before deadline -> not-actionable; after deadline (no undo) -> actionable once,
 *         second consume -> already-consumed.
 *   direct-read proof: brief_data.sms_reply is inert text; actionability lives in columns.
 *   TS-5  the anti-direct-read AST ESLint rule flags a direct read outside the allowlist,
 *         does not flag the writer/seam/tests, and exists in the repo eslint config.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ESLint } from 'eslint';
import { consumeSmsReply, handleInboundSmsReply } from '../sms-bridge.js';
import { PER_DECISION_CAP_USD, DAILY_CAP_USD } from '../sms-spend-caps.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..', '..', '..');

// ---------------------------------------------------------------------------------------
// Fake supabase: multi-table + the atomic debit RPC. Modeled on tests/unit/chairman/
// sms-bridge.test.js's fake, extended with .gt and .rpc('debit_sms_daily_spend').
// ---------------------------------------------------------------------------------------
function makeFakeSupabase(seed = {}) {
  const tables = {
    chairman_notifications: [...(seed.chairman_notifications || [])],
    chairman_decisions: [...(seed.chairman_decisions || [])],
    sms_inbound_log: [...(seed.sms_inbound_log || [])],
    sms_inbound_suspensions: [...(seed.sms_inbound_suspensions || [])],
    sms_relay_staging: [...(seed.sms_relay_staging || [])],
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
      insert(row) {
        ctx.mode = 'insert';
        ctx.row = { id: `row-${++seq}`, created_at: new Date().toISOString(), ...row };
        return api;
      },
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

  // Atomic (non-yielding) simulation of the SECURITY DEFINER debit RPC.
  async function rpc(fnName, params) {
    if (fnName !== 'debit_sms_daily_spend') return { data: null, error: { message: `unknown rpc ${fnName}` } };
    const { p_decision_id, p_amount, p_per_decision_cap, p_daily_cap } = params;
    if (p_amount === null || p_amount === undefined || p_amount < 0) return { data: 0, error: null };
    if (p_amount > p_per_decision_cap) return { data: 0, error: null };
    const today = new Date().toISOString().slice(0, 10);
    const sum = tables.sms_approved_spend_ledger
      .filter((r) => r.day === today)
      .reduce((acc, r) => acc + Number(r.amount_usd), 0);
    if (sum + p_amount <= p_daily_cap) {
      tables.sms_approved_spend_ledger.push({
        id: `led-${++seq}`, decision_id: p_decision_id, amount_usd: p_amount,
        approved_at: new Date().toISOString(), day: today,
      });
      return { data: 1, error: null };
    }
    return { data: 0, error: null };
  }

  return { from, rpc, _tables: tables };
}

const iso = (ms) => new Date(ms).toISOString();
const spendDecision = (over = {}) => ({
  id: 'dec', status: 'pending', decision_type: 'spend_approval',
  brief_data: { sms_reply: { text: 'approve', answered_at: iso(Date.now()), from: '+15551234567' } },
  amount_usd: 100, undo_deadline: iso(Date.now() - 60_000), undone_at: null, consumed_at: null,
  ...over,
});

// ---------------------------------------------------------------------------------------
// TS-1: cross-decision daily-cap TOCTOU (atomic RPC).
// ---------------------------------------------------------------------------------------
describe('TS-1 cross-decision daily-cap TOCTOU', () => {
  it('two concurrent consumes of different same-day $300 decisions -> exactly one approved', async () => {
    const sb = makeFakeSupabase({
      chairman_decisions: [
        spendDecision({ id: 'dec-a', amount_usd: 300 }),
        spendDecision({ id: 'dec-b', amount_usd: 300 }),
      ],
    });
    // per-decision cap raised above $300 so ONLY the daily cap ($500) can reject the second.
    const caps = { perDecisionCap: 400, dailyCap: 500 };
    const [a, b] = await Promise.all([
      consumeSmsReply(sb, 'dec-a', caps),
      consumeSmsReply(sb, 'dec-b', caps),
    ]);
    const actionable = [a, b].filter((r) => r.actionable);
    const overCap = [a, b].filter((r) => !r.actionable && r.reason === 'over_cap');
    expect(actionable.length).toBe(1);
    expect(overCap.length).toBe(1);
    // Only one ledger row: the daily total never overshot $500.
    expect(sb._tables.sms_approved_spend_ledger.length).toBe(1);
    expect(sb._tables.sms_approved_spend_ledger[0].amount_usd).toBe(300);
    // The over-cap decision's claim was rolled back (consumed_at NULL) — not left consumed.
    const overId = a.actionable ? 'dec-b' : 'dec-a';
    expect(sb._tables.chairman_decisions.find((d) => d.id === overId).consumed_at).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------
// TS-2 + per-decision cap: fail-closed to console.
// ---------------------------------------------------------------------------------------
describe('TS-2 unknown amount + per-decision cap', () => {
  it('unknown amount_usd on a spend-class decision -> console, consumed_at NOT set', async () => {
    const sb = makeFakeSupabase({
      chairman_decisions: [spendDecision({ id: 'dec-unknown', amount_usd: null })],
    });
    const res = await consumeSmsReply(sb, 'dec-unknown');
    expect(res.actionable).toBe(false);
    expect(res.reason).toBe('unknown_amount');
    // Fail-closed BEFORE the claim: consumed_at must stay null, no ledger row.
    expect(sb._tables.chairman_decisions.find((d) => d.id === 'dec-unknown').consumed_at).toBeNull();
    expect(sb._tables.sms_approved_spend_ledger.length).toBe(0);
  });

  it('a per-decision amount > $250 -> console (over_cap), claim rolled back', async () => {
    const sb = makeFakeSupabase({
      chairman_decisions: [spendDecision({ id: 'dec-big', amount_usd: 300 })],
    });
    // default caps: $250 per-decision, $500 daily.
    const res = await consumeSmsReply(sb, 'dec-big');
    expect(res.actionable).toBe(false);
    expect(res.reason).toBe('over_cap');
    expect(sb._tables.sms_approved_spend_ledger.length).toBe(0);
    expect(sb._tables.chairman_decisions.find((d) => d.id === 'dec-big').consumed_at).toBeNull();
  });

  it('defaults are the chairman-tunable config values ($250 / $500)', () => {
    expect(PER_DECISION_CAP_USD).toBe(250);
    expect(DAILY_CAP_USD).toBe(500);
  });
});

// ---------------------------------------------------------------------------------------
// TS-3: undo window.
// ---------------------------------------------------------------------------------------
describe('TS-3 undo window (FR-3)', () => {
  it('an inbound UNDO within the window sets undone_at; consumeSmsReply then returns undone', async () => {
    const phone = '+15557778888';
    const sb = makeFakeSupabase({
      chairman_decisions: [spendDecision({
        id: 'dec-undo', amount_usd: 100,
        undo_deadline: iso(Date.now() + 10 * 60_000), // window OPEN
        sms_reply_used_at: iso(Date.now() - 1000),
      })],
      chairman_notifications: [{ id: 'n-undo', channel: 'sms', recipient_phone: phone, decision_id: 'dec-undo', created_at: iso(Date.now()) }],
    });

    const undo = await handleInboundSmsReply(sb, { from: phone, to: '+15559999999', body: '  UNDO ', messageSid: 'SM-undo-1', signatureValid: true });
    expect(undo.resolved).toBe(true);
    expect(undo.outcome).toBe('undone');
    expect(sb._tables.chairman_decisions.find((d) => d.id === 'dec-undo').undone_at).toBeTruthy();
    expect(sb._tables.sms_inbound_log[0].outcome).toBe('undone');

    const consumed = await consumeSmsReply(sb, 'dec-undo');
    expect(consumed.actionable).toBe(false);
    expect(consumed.reason).toBe('undone');
    // never debited
    expect(sb._tables.sms_approved_spend_ledger.length).toBe(0);
  });

  it('consume BEFORE the deadline is not-actionable (undo_window_open); consumed_at not set', async () => {
    const sb = makeFakeSupabase({
      chairman_decisions: [spendDecision({ id: 'dec-early', amount_usd: 100, undo_deadline: iso(Date.now() + 10 * 60_000) })],
    });
    const res = await consumeSmsReply(sb, 'dec-early');
    expect(res.actionable).toBe(false);
    expect(res.reason).toBe('undo_window_open');
    expect(sb._tables.chairman_decisions.find((d) => d.id === 'dec-early').consumed_at).toBeNull();
  });

  it('consume AFTER the deadline (no undo) is actionable exactly once; a second consume is already-consumed', async () => {
    const sb = makeFakeSupabase({
      chairman_decisions: [spendDecision({ id: 'dec-once', amount_usd: 100, undo_deadline: iso(Date.now() - 60_000) })],
    });
    const first = await consumeSmsReply(sb, 'dec-once');
    expect(first.actionable).toBe(true);
    expect(first.reply).toBe('approve');
    expect(sb._tables.sms_approved_spend_ledger.length).toBe(1);

    const second = await consumeSmsReply(sb, 'dec-once');
    expect(second.actionable).toBe(false);
    expect(second.reason).toBe('already_consumed_or_ineligible');
    // idempotent: no second debit
    expect(sb._tables.sms_approved_spend_ledger.length).toBe(1);
  });

  it('a bare UNDO with no open window is not recorded as an answer', async () => {
    const phone = '+15550001111';
    const sb = makeFakeSupabase({
      chairman_decisions: [spendDecision({ id: 'dec-closed', amount_usd: 100, undo_deadline: iso(Date.now() - 60_000), sms_reply_used_at: iso(Date.now() - 1000) })],
      chairman_notifications: [{ id: 'n-closed', channel: 'sms', recipient_phone: phone, decision_id: 'dec-closed', created_at: iso(Date.now()) }],
    });
    const res = await handleInboundSmsReply(sb, { from: phone, to: '+15559999999', body: 'undo', messageSid: 'SM-undo-late', signatureValid: true });
    expect(res.resolved).toBe(false);
    expect(res.outcome).toBe('no_match');
    // brief_data untouched: "undo" was never stored as the reply text.
    expect(sb._tables.chairman_decisions.find((d) => d.id === 'dec-closed').brief_data.sms_reply.text).toBe('approve');
  });
});

// ---------------------------------------------------------------------------------------
// Non-spend LOW/MEDIUM question: consumeSmsReply returns the reply once, no cap involved.
// ---------------------------------------------------------------------------------------
describe('non-spend question path', () => {
  it('a non-spend answered question is actionable once, no ledger debit', async () => {
    const sb = makeFakeSupabase({
      chairman_decisions: [{
        id: 'dec-q', status: 'pending', decision_type: 'schedule',
        brief_data: { sms_reply: { text: '2pm', answered_at: iso(Date.now()), from: '+1555' } },
        amount_usd: null, undo_deadline: null, undone_at: null, consumed_at: null,
      }],
    });
    const res = await consumeSmsReply(sb, 'dec-q');
    expect(res.actionable).toBe(true);
    expect(res.reply).toBe('2pm');
    expect(sb._tables.sms_approved_spend_ledger.length).toBe(0);
  });

  it('a decision with no delivered reply is not actionable', async () => {
    const sb = makeFakeSupabase({
      chairman_decisions: [{ id: 'dec-empty', status: 'pending', decision_type: 'schedule', brief_data: {}, amount_usd: null, undo_deadline: null, undone_at: null, consumed_at: null }],
    });
    const res = await consumeSmsReply(sb, 'dec-empty');
    expect(res.actionable).toBe(false);
    expect(res.reason).toBe('no_reply');
  });
});

// ---------------------------------------------------------------------------------------
// Direct-read proof: brief_data.sms_reply carries only INERT text; the actionable gating
// state lives in dedicated columns, so a caller that bypasses consumeSmsReply cannot execute.
// ---------------------------------------------------------------------------------------
describe('direct-read bypass yields inert text', () => {
  it('raw brief_data.sms_reply is present but consumeSmsReply is non-actionable (window open)', async () => {
    const decision = spendDecision({ id: 'dec-inert', amount_usd: 100, undo_deadline: iso(Date.now() + 10 * 60_000) });
    const sb = makeFakeSupabase({ chairman_decisions: [decision] });
    // A bypassing caller reads the raw text directly (this test file is allowlisted):
    const rawText = decision.brief_data.sms_reply.text;
    expect(rawText).toBe('approve'); // inert text is readable...
    // ...but it is NOT actionable — the gating columns (undo_deadline) hold it back.
    const res = await consumeSmsReply(sb, 'dec-inert');
    expect(res.actionable).toBe(false);
    expect(res.reason).toBe('undo_window_open');
  });
});

// ---------------------------------------------------------------------------------------
// TS-5: anti-direct-read AST ESLint rule.
// ---------------------------------------------------------------------------------------
describe('TS-5 anti-direct-read AST ESLint rule', () => {
  const RULE = {
    selector: "MemberExpression[property.name='sms_reply']",
    message: 'Direct brief_data.sms_reply reads are forbidden — use consumeSmsReply() (SD-LEO-FEAT-SMS-CHAIRMAN-DECISION-001-B FR-1/FR-2)',
  };
  const ALLOWLIST = ['lib/chairman/sms-bridge.js', '**/*.test.js', '**/*.test.mjs', '**/__tests__/**', 'tests/**'];

  async function lint(code, filePath) {
    const eslint = new ESLint({
      cwd: REPO_ROOT,
      overrideConfigFile: true,
      overrideConfig: [
        { rules: { 'no-restricted-syntax': ['error', RULE] } },
        { files: ALLOWLIST, rules: { 'no-restricted-syntax': 'off' } },
      ],
    });
    const [result] = await eslint.lintText(code, { filePath });
    return result.messages;
  }

  it('flags a direct .sms_reply member read OUTSIDE the allowlist', async () => {
    const msgs = await lint('const x = decision.brief_data.sms_reply;\n', path.join(REPO_ROOT, 'lib/example/illicit-reader.js'));
    const hit = msgs.find((m) => m.ruleId === 'no-restricted-syntax');
    expect(hit).toBeTruthy();
    expect(hit.message).toContain('consumeSmsReply');
  });

  it('does NOT flag the legit object-literal WRITE (Property, not MemberExpression)', async () => {
    const msgs = await lint('const merged = { sms_reply: { text: body } };\n', path.join(REPO_ROOT, 'lib/example/writer.js'));
    expect(msgs.some((m) => m.ruleId === 'no-restricted-syntax')).toBe(false);
  });

  it('does NOT flag a read inside the allowlisted seam (sms-bridge.js)', async () => {
    const msgs = await lint('const r = decision.brief_data.sms_reply;\n', path.join(REPO_ROOT, 'lib/chairman/sms-bridge.js'));
    expect(msgs.some((m) => m.ruleId === 'no-restricted-syntax')).toBe(false);
  });

  it('does NOT flag a read inside a test file', async () => {
    const msgs = await lint('const t = decision.brief_data.sms_reply.text;\n', path.join(REPO_ROOT, 'lib/chairman/__tests__/x.test.js'));
    expect(msgs.some((m) => m.ruleId === 'no-restricted-syntax')).toBe(false);
  });

  it('the rule is wired into the repo eslint config (structural, not advisory)', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'eslint.config.js'), 'utf8');
    expect(src).toContain("MemberExpression[property.name='sms_reply']");
    expect(src).toContain('consumeSmsReply');
    expect(src).toContain("'lib/chairman/sms-bridge.js'");
  });
});
