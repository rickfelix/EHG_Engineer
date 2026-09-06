// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D / FR-4 + FR-5, TS-5, TS-6, TS-7, TS-11, TS-15, TS-17 — gmail-triage.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { stubClient } from '../../lib/michael/db.test.js';
import { runGmailTriage, inboxQueries, intentFor, itemRow, firstMatch, ruleUsable, labelChangeFor, budgetFor, ITEM_KEYS, ITEM_UPDATE_KEYS, LABEL_KEYS } from './gmail-triage.mjs';

// 05:00 ET on 2026-09-06 (EDT) -> 09:00Z (inside 04:30-05:30); 02:00 ET -> 06:00Z.
const NOW = new Date('2026-09-06T09:00:00.000Z');
const TWO_AM = new Date('2026-09-06T06:00:00.000Z');
const env = { GITHUB_ACTIONS: 'false', CI: '' };
const MISSING = { data: null, error: { code: '42P01', message: 'relation does not exist' } };

const RULES = [
  { rule_key: 'gmail/exelon-digest', rule_json: { match: { from: 'alerts@exelon.com' }, class: 'newsletter', action: { verb: 'archive' } }, auto_apply: true, auto_apply_verb: 'archive' },
  { rule_key: 'gmail/receipts', rule_json: { match: { subject: 'receipt' }, class: 'receipt', action: { verb: 'label', label_id: 'L_receipts' } }, auto_apply: true, auto_apply_verb: 'label' },
  { rule_key: 'gmail/vercel', rule_json: { match: { from: 'vercel.com' }, class: 'fleet' }, auto_apply: false, auto_apply_verb: null },
  { rule_key: 'gmail/descriptive', rule_json: { match: { subject: 'newsletter' }, class: 'newsletter', action: { verb: 'archive' } }, auto_apply: false, auto_apply_verb: null },
];
const THREADS = {
  t1: { from: 'Exelon Alerts <alerts@exelon.com>', subject: 'Outage digest', lastMessageId: 'm1' },
  t2: { from: 'Shop <shop@x.com>', subject: 'Your receipt', lastMessageId: 'm2' },
  t3: { from: 'Vercel <noreply@vercel.com>', subject: 'Deploy failed', lastMessageId: 'm3' },
  t4: { from: 'Friend <f@example.org>', subject: 'Lunch?', lastMessageId: 'm4' },
  t5: { from: 'News <n@example.org>', subject: 'Weekly newsletter', lastMessageId: 'm5' },
};

/** Gmail factory: labels.list, threads.list (per query), threads.get (metadata). Records calls. */
function gmailFactory({ labels = [{ id: 'L_receipts', name: 'Receipts', type: 'user' }, { id: 'L_keep', name: 'Keep Me', type: 'user' }], fresh = ['t1', 't2', 't3', 't4', 't5'], sweep = ['t4'], threads = THREADS, reject = {} } = {}, calls = []) {
  const meta = (id) => ({ id, messages: [{ id: threads[id].lastMessageId, labelIds: ['INBOX'], payload: { headers: [{ name: 'From', value: threads[id].from }, { name: 'Subject', value: threads[id].subject }] } }] });
  return async (auth) => {
    calls.push(['factory', auth]);
    return { users: {
      labels: { list: async (args) => { calls.push(['labels.list', args]); if (reject.labels) throw reject.labels; return { data: { labels } }; } },
      threads: {
        list: async (args) => { calls.push(['threads.list', args]); if (reject.list) throw reject.list; const ids = args.q.startsWith('in:inbox newer') ? fresh : sweep; return { data: { threads: ids.map((id) => ({ id })) } }; },
        get: async (args) => { calls.push(['threads.get', args]); if (reject.get && reject.get.has(args.id)) throw new Error('boom'); return { data: meta(args.id) }; },
        modify: async (args) => { calls.push(['threads.modify', args]); if (reject.modify && reject.modify.has(args.id)) throw Object.assign(new Error('modify refused'), { code: 403 }); return { data: { id: args.id, messages: [{}] } }; },
      },
    } };
  };
}
/** DB stub scripted per table; records every call. */
function db({ runs = [], labels = [], rules = RULES, absent = false, archived = [], pending = null, stamped = [], recheck = null, stampAnswer = null } = {}) {
  const calls = [];
  const sb = stubClient((table, ops) => {
    calls.push({ table, kind: ops[0].op, ops });
    if (absent) return MISSING;
    if (ops[0].op === 'update' && 'action_taken_at' in ops[0].args[0]) { const th = ops.find((o) => o.op === 'eq' && o.args[0] === 'thread_id'); return { data: stampAnswer ? stampAnswer(th.args[1]) : [{ thread_id: th.args[1] }], error: null }; }
    if (ops[0].op !== 'select') return { data: null, error: null };
    if (table === 'michael_feeder_runs') return { data: runs, error: null };
    if (table === 'michael_gmail_labels') return { data: labels, error: null };
    if (table === 'michael_rules') return { data: rules, error: null };
    if (table === 'michael_gmail_triage_items') {
      // the prior-archived read is keyed by .in('thread_id', batch); the pending read by .is('action_taken_at', null)
      if (ops.some((o) => o.op === 'in')) return { data: archived, error: null };
      // the ledger read (two .not filters, no .is): today's stamped feeder intents
      if (ops.filter((o) => o.op === 'not').length === 2) return { data: stamped.map((id) => ({ thread_id: id })), error: null };
      // the per-thread recheck right before a modify: eq thread_id with the intent/stamp/borderline select
      const th = ops.find((o) => o.op === 'eq' && o.args[0] === 'thread_id');
      if (th && ops.some((o) => o.op === 'select' && /action_intent,action_taken_at/.test(String(o.args[0])))) {
        const id = th.args[1];
        if (recheck) return { data: [recheck(id)].filter(Boolean), error: null };
        const p = (pending || []).find((x) => x.thread_id === id);
        const up = calls.find((c) => c.table === 'michael_gmail_triage_items' && c.kind === 'upsert');
        const w = up ? up.ops[0].args[0].find((r) => r.thread_id === id) : null;
        const src = p || w;
        return { data: src ? [{ action_intent: src.action_intent, action_taken_at: null, borderline: Boolean(src.borderline) }] : [], error: null };
      }
      // pending intents: what --apply wrote this run unless the test seeds an explicit ledger state
      if (pending) return { data: pending, error: null };
      const up = calls.find((c) => c.table === 'michael_gmail_triage_items' && c.kind === 'upsert');
      return { data: up ? up.ops[0].args[0].filter((r) => r.action_intent && !r.borderline).map((r) => ({ thread_id: r.thread_id, action_intent: r.action_intent })) : [], error: null };
    }
    return { data: [], error: null };
  });
  return { sb, calls };
}

describe('pure helpers', () => {
  it('inboxQueries excludes keep_in_inbox label names from the fresh query only', () => {
    expect(inboxQueries([])).toEqual(['in:inbox newer_than:1d', 'in:inbox older_than:1d']);
    expect(inboxQueries(['Keep Me', 'Family'])).toEqual(['in:inbox newer_than:1d -label:"Keep Me" -label:"Family"', 'in:inbox older_than:1d']);
  });
  it('intentFor yields an intent only for auto_apply=true with verb label or archive (SECURITY F-2)', () => {
    expect(intentFor(RULES[0], { action: { verb: 'archive' } })).toBe('archive');
    expect(intentFor(RULES[1], { action: { verb: 'label', label_id: 'L_receipts' } })).toBe('label:L_receipts');
    expect(intentFor(RULES[3], { action: { verb: 'archive' } })).toBe(null);
    expect(intentFor({ auto_apply: true, auto_apply_verb: 'reschedule' }, {})).toBe(null);
    expect(intentFor({ auto_apply: true, auto_apply_verb: 'label' }, { action: { verb: 'label' } })).toBe(null);
  });
  it('itemRow has the uniform owned key set; firstMatch takes the first rule in order and skips a missing class', () => {
    const meta = { threadId: 't1', ...THREADS.t1 };
    const hit = firstMatch(RULES, meta);
    expect(hit.rule.rule_key).toBe('gmail/exelon-digest');
    const row = itemRow({ etDate: '2026-09-06', meta, rule: hit.rule, match: hit.match });
    expect(row).toEqual({ et_date: '2026-09-06', thread_id: 't1', class: 'newsletter', rule_key: 'gmail/exelon-digest', action_intent: 'archive', last_message_id: 'm1', borderline: false });
    expect(Object.keys(row)).toEqual([...ITEM_KEYS]);
    expect(itemRow({ etDate: '2026-09-06', meta: { threadId: 't4', lastMessageId: null }, rule: null, match: null })).toEqual({ et_date: '2026-09-06', thread_id: 't4', class: null, rule_key: null, action_intent: null, last_message_id: null, borderline: false });
    // TS-6: a thread archived earlier that is back with a newer last message is borderline, class kept, no intent
    expect(itemRow({ etDate: '2026-09-06', meta, rule: hit.rule, match: hit.match, prior: { thread_id: 't1', last_message_id: 'm0', class: 'newsletter' } })).toMatchObject({ borderline: true, class: 'newsletter', action_intent: null, rule_key: 'gmail/exelon-digest' });
    expect(itemRow({ etDate: '2026-09-06', meta, rule: hit.rule, match: hit.match, prior: { thread_id: 't1', last_message_id: 'm1', class: 'newsletter' } })).toMatchObject({ borderline: false, action_intent: 'archive' });
    expect(labelChangeFor('archive')).toEqual({ removeLabelIds: ['INBOX'], addLabelIds: [] });
    expect(labelChangeFor('label:L_receipts')).toEqual({ addLabelIds: ['L_receipts'], removeLabelIds: [] });
    expect(labelChangeFor('delete')).toBe(null);
    expect(budgetFor(60, [{ counts: { threads_modified: 25 } }, { counts: { threads_modified: 10 } }, { counts: {} }])).toEqual({ used: 35, budget: 25 });
    expect(budgetFor(60, [{ counts: { threads_modified: 70 } }])).toEqual({ used: 70, budget: 0 });
    // the ledger count wins over finished-run counts: a killed run leaves no count but its stamps are on the rows
    expect(budgetFor(60, [], 30)).toEqual({ used: 30, budget: 30 });
    expect(budgetFor(60, [{ counts: { threads_modified: 40 } }], 30)).toEqual({ used: 40, budget: 20 });
    // an unusable matching rule is skipped and LATER rules are still tried (spec skips the rule, not the thread)
    expect(firstMatch(RULES, meta, new Set(['newsletter']))).toEqual({ rule: null, match: null, skipped: 1 });
    const both = { threadId: 'b', from: 'alerts@exelon.com', subject: 'Your receipt', lastMessageId: 'm' };
    expect(firstMatch(RULES, both, { missingClasses: new Set(['newsletter']), gmailIds: new Set(['L_receipts']) })).toMatchObject({ rule: { rule_key: 'gmail/receipts' }, skipped: 1 });
    expect(firstMatch(RULES, { threadId: 'x', from: 'nobody', subject: 'nothing' })).toBe(null);
    // a label-verb rule whose label id is absent from Gmail or forbidden is unusable
    expect(ruleUsable(RULES[1], { action: { label_id: 'L_receipts' } }, { gmailIds: new Set(['L_receipts']) })).toBe(true);
    expect(ruleUsable(RULES[1], { action: { label_id: 'L_receipts' } }, { gmailIds: new Set(['L_other']) })).toBe(false);
    expect(ruleUsable(RULES[1], { action: { label_id: 'TRASH' } }, { gmailIds: new Set(['TRASH']) })).toBe(false);
    expect(ruleUsable(RULES[1], { action: {} }, {})).toBe(false);
    expect(ruleUsable(RULES[0], { action: { verb: 'archive' } }, { gmailIds: new Set() })).toBe(true);
  });
});

describe('runGmailTriage', () => {
  it('refuses GITHUB_ACTIONS=true before any call, --modify without --apply, --date, a bad --et-date, and an invalid ceiling', async () => {
    const calls = [];
    const { sb, calls: dbCalls } = db();
    expect(await runGmailTriage({ sb, argv: ['--apply'], now: NOW, auth: 'AUTH', gmail: gmailFactory({}, calls), env: { ...env, GITHUB_ACTIONS: 'true' } })).toMatchObject({ ok: false, refusal: 'HOST_VENUE_REQUIRED' });
    expect(await runGmailTriage({ sb, argv: ['--modify'], now: NOW, auth: 'AUTH', gmail: gmailFactory({}, calls), env })).toMatchObject({ ok: false, refusal: 'MODIFY_REQUIRES_APPLY' });
    expect(await runGmailTriage({ sb, argv: ['--apply'], now: NOW, auth: 'AUTH', gmail: gmailFactory({}, calls), env: { ...env, MICHAEL_GMAIL_MODIFY_CEILING: '1e308' } })).toMatchObject({ ok: false, refusal: 'CONSTANT_INVALID' });
    expect(await runGmailTriage({ sb, argv: ['--date', '2026-09-06'], now: NOW, auth: 'AUTH', env })).toMatchObject({ ok: false, refusal: 'FLAG_UNSUPPORTED' });
    expect(await runGmailTriage({ sb, argv: ['--et-date', 'x'], now: NOW, auth: 'AUTH', env })).toMatchObject({ ok: false, refusal: 'ET_DATE_INVALID' });
    expect(calls).toEqual([]); expect(dbCalls).toEqual([]);
  });
  it('is inert outside 04:30-05:30 ET and while the tables are absent, with no Gmail call', async () => {
    const calls = [];
    expect(await runGmailTriage({ sb: db().sb, argv: ['--apply'], now: TWO_AM, auth: 'AUTH', gmail: gmailFactory({}, calls), env })).toMatchObject({ action: 'inert', reason: 'outside_et_window' });
    expect(await runGmailTriage({ sb: db({ absent: true }).sb, argv: ['--apply'], now: NOW, auth: 'AUTH', gmail: gmailFactory({}, calls), env })).toMatchObject({ action: 'inert', reason: 'tables_absent' });
    expect(calls).toEqual([]);
  });
  it('dry run: metadata-only reads, rules-first matching, auto_apply gate, fleet class, unmatched queued; writes nothing', async () => {
    const calls = [];
    const { sb, calls: dbCalls } = db({ labels: [{ label_id: 'L_keep', name: 'Keep Me', class: null, keep_in_inbox: true }] });
    const r = await runGmailTriage({ sb, argv: [], now: NOW, auth: 'AUTH', gmail: gmailFactory({}, calls), env });
    expect(r).toMatchObject({ ok: true, action: 'dry_run', status: 'ok', et_date: '2026-09-06' });
    expect(calls.filter((c) => c[0] === 'threads.list').map((c) => c[1])).toEqual([
      { userId: 'me', q: 'in:inbox newer_than:1d -label:"Keep Me"', maxResults: 200 },
      { userId: 'me', q: 'in:inbox older_than:1d', maxResults: 200 },
    ]);
    for (const g of calls.filter((c) => c[0] === 'threads.get')) expect(g[1]).toMatchObject({ format: 'metadata', metadataHeaders: ['From', 'Subject', 'List-Id', 'Date'] });
    expect(calls.filter((c) => c[0] === 'threads.get')).toHaveLength(5);
    expect(r.counts).toMatchObject({ dry_run: true, labels_seen: 2, missing_labels: [], threads_seen: 5, matched: 4, unmatched: 1, fleet: 1, intents: 2, meta_failed: 0, truncated_query: [] });
    const byId = Object.fromEntries(r.preview.map((x) => [x.thread_id, x]));
    expect(byId.t1).toMatchObject({ class: 'newsletter', rule_key: 'gmail/exelon-digest', action_intent: 'archive', last_message_id: 'm1' });
    expect(byId.t2).toMatchObject({ class: 'receipt', action_intent: 'label:L_receipts' });
    expect(byId.t3).toMatchObject({ class: 'fleet', rule_key: 'gmail/vercel', action_intent: null });
    expect(byId.t4).toMatchObject({ class: null, rule_key: null, action_intent: null });
    expect(byId.t5).toMatchObject({ class: 'newsletter', rule_key: 'gmail/descriptive', action_intent: null });
    expect(dbCalls.filter((c) => c.kind !== 'select')).toEqual([]);
    const text = JSON.stringify({ counts: r.counts, preview: r.preview });
    // no header value (sender, subject) reaches counts or rows; class names come from rule_json, not from mail
    for (const pii of ['@', 'Outage digest', 'Your receipt', 'Deploy failed', 'Lunch?', 'Weekly newsletter', 'alerts', 'vercel.com']) expect(text).not.toContain(pii);
  });
  it('--apply: label reconcile writes only the three owned columns; items use ignoreDuplicates then guarded updates of the owned keys (TS-17)', async () => {
    const { sb, calls: dbCalls } = db({ labels: [] });
    const r = await runGmailTriage({ sb, argv: ['--apply'], now: NOW, auth: 'AUTH', gmail: gmailFactory(), env });
    expect(r).toMatchObject({ ok: true, action: 'run', status: 'ok', attempt: 1, counts: { rows_written: 5, updates: 5 } });
    const labelUp = dbCalls.find((c) => c.table === 'michael_gmail_labels' && c.kind === 'upsert');
    expect(labelUp.ops[0].args[1]).toEqual({ onConflict: 'label_id' });
    for (const row of labelUp.ops[0].args[0]) expect(Object.keys(row)).toEqual([...LABEL_KEYS]);
    const itemUp = dbCalls.find((c) => c.table === 'michael_gmail_triage_items' && c.kind === 'upsert');
    expect(itemUp.ops[0].args[1]).toEqual({ onConflict: 'et_date,thread_id', ignoreDuplicates: true });
    for (const row of itemUp.ops[0].args[0]) expect(Object.keys(row)).toEqual([...ITEM_KEYS]);
    const updates = dbCalls.filter((c) => c.table === 'michael_gmail_triage_items' && c.kind === 'update');
    expect(updates).toHaveLength(5);
    for (const u of updates) {
      expect(Object.keys(u.ops[0].args[0])).toEqual([...ITEM_UPDATE_KEYS]);
      expect(u.ops.map((o) => o.op)).toEqual(['update', 'eq', 'eq', 'is', 'is', 'or']);
      expect(u.ops[3].args).toEqual(['action_taken_at', null]);
      expect(u.ops[4].args).toEqual(['verified_by', null]);
      // only rows the feeder queued (class null) or rule-stamped (rule_key set) are ever rewritten
      expect(u.ops[5].args).toEqual(['class.is.null,rule_key.not.is.null']);
    }
    expect(dbCalls.filter((c) => c.table === 'michael_feeder_runs').map((c) => c.kind)).toEqual(['select', 'insert', 'update']);
    expect(r.counts).toMatchObject({ modify: false, threads_modified: 0 });
  });
  it('--apply without --modify never calls threads.modify (the registrar\'s shadow mode)', async () => {
    const calls = [];
    await runGmailTriage({ sb: db().sb, argv: ['--apply'], now: NOW, auth: 'AUTH', gmail: gmailFactory({}, calls), env });
    expect(calls.filter((c) => c[0] === 'threads.modify')).toEqual([]);
  });
  it('TS-7: a configured class whose label is missing from Gmail degrades, is listed, and its rule is skipped while others proceed', async () => {
    const { sb } = db({ labels: [{ label_id: 'L_news', name: 'Newsletters', class: 'newsletter', keep_in_inbox: false }, { label_id: 'L_receipts', name: 'Receipts', class: 'receipt', keep_in_inbox: false }] });
    const r = await runGmailTriage({ sb, argv: [], now: NOW, auth: 'AUTH', gmail: gmailFactory(), env });
    expect(r).toMatchObject({ action: 'dry_run', status: 'degraded', counts: { missing_labels: ['L_news'], skipped_class: 2, matched: 2, unmatched: 3 } });
    const byId = Object.fromEntries(r.preview.map((x) => [x.thread_id, x]));
    expect(byId.t1).toMatchObject({ class: null, rule_key: null, action_intent: null });
    expect(byId.t2).toMatchObject({ class: 'receipt', action_intent: 'label:L_receipts' });
  });
  it('keep_in_inbox threads are skipped by labelIds even when the sweep query returns them; an intent to a label absent from Gmail is never staged', async () => {
    const threads = { ...THREADS, k1: { from: 'alerts@exelon.com', subject: 'digest', lastMessageId: 'mk' } };
    const labelsOf = { k1: ['INBOX', 'L_keep'] };
    const factory = ({ calls = [] } = {}) => async (auth) => { calls.push(['factory', auth]); return { users: { labels: { list: async () => ({ data: { labels: [{ id: 'L_keep', name: 'Keep Me', type: 'user' }] } }) }, threads: { list: async (args) => ({ data: { threads: (args.q.startsWith('in:inbox newer') ? ['t2'] : ['k1']).map((id) => ({ id })) } }), get: async (args) => ({ data: { id: args.id, messages: [{ id: threads[args.id].lastMessageId, labelIds: labelsOf[args.id] || ['INBOX'], payload: { headers: [{ name: 'From', value: threads[args.id].from }, { name: 'Subject', value: threads[args.id].subject }] } }] } }) } } }; };
    const { sb } = db({ labels: [{ label_id: 'L_keep', name: 'Keep Me', class: null, keep_in_inbox: true }] });
    const r = await runGmailTriage({ sb, argv: [], now: NOW, auth: 'AUTH', gmail: factory(), env });
    expect(r.counts).toMatchObject({ keep_in_inbox_skipped: 1, threads_seen: 2, skipped_class: 1, unmatched: 1, intents: 0 });
    expect(r.preview.map((x) => x.thread_id)).toEqual(['t2']);
    // L_receipts is not in Gmail this morning, so the receipts rule is unusable and t2 is queued instead of carrying label:L_receipts
    expect(r.preview[0]).toMatchObject({ class: null, action_intent: null });
  });
  it('labels.list failing is failed; a thread metadata failure is counted and degrades; a full page marks truncated_query', async () => {
    const err = Object.assign(new Error('rate limited'), { code: 429 });
    expect(await runGmailTriage({ sb: db().sb, argv: [], now: NOW, auth: 'AUTH', gmail: gmailFactory({ reject: { labels: err } }), env })).toMatchObject({ action: 'dry_run', status: 'failed', counts: { error_code: '429', phase: 'labels' } });
    const r = await runGmailTriage({ sb: db().sb, argv: [], now: NOW, auth: 'AUTH', gmail: gmailFactory({ reject: { get: new Set(['t4']) } }), env });
    expect(r).toMatchObject({ status: 'degraded', counts: { meta_failed: 1, threads_seen: 5 } });
    expect(r.preview.map((x) => x.thread_id)).not.toContain('t4');
    const big = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`b${i}`, { from: 'x@y', subject: 's', lastMessageId: `m${i}` }]));
    const t = await runGmailTriage({ sb: db().sb, argv: [], now: NOW, auth: 'AUTH', gmail: gmailFactory({ fresh: Object.keys(big), sweep: [], threads: big }), env });
    expect(t).toMatchObject({ status: 'degraded', counts: { truncated_query: ['fresh'], threads_seen: 200 } });
  });
  it('TS-5: 80 intents with ceiling 60 yield exactly 60 modify calls in creation order, degraded with ceiling_hit, 20 intents left', async () => {
    const threads = Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`a${i}`, { from: 'alerts@exelon.com', subject: `digest ${i}`, lastMessageId: `m${i}` }]));
    const calls = [];
    const { sb, calls: dbCalls } = db();
    const r = await runGmailTriage({ sb, argv: ['--apply', '--modify'], now: NOW, auth: 'AUTH', gmail: gmailFactory({ fresh: Object.keys(threads), sweep: [], threads }, calls), env });
    const mods = calls.filter((c) => c[0] === 'threads.modify');
    expect(mods).toHaveLength(60);
    expect(mods[0][1]).toEqual({ userId: 'me', id: 'a0', requestBody: { addLabelIds: [], removeLabelIds: ['INBOX'] } });
    expect(new Set(mods.map((m) => m[1].id)).size).toBe(60);
    expect(r).toMatchObject({ action: 'run', status: 'degraded', counts: { ceiling: 60, budget_before: 60, threads_modified: 60, ceiling_hit: true, intents_left: 20, modify_failed: 0 } });
    const stamps = dbCalls.filter((c) => c.table === 'michael_gmail_triage_items' && c.kind === 'update' && 'action_taken_at' in c.ops[0].args[0]);
    expect(stamps).toHaveLength(60);
    for (const s of stamps) { expect(Object.keys(s.ops[0].args[0])).toEqual(['action_taken_at']); expect(s.ops.map((o) => o.op)).toEqual(['update', 'eq', 'eq', 'is', 'select']); }
    expect(dbCalls.filter((c) => c.table === 'michael_feeder_runs' && c.kind === 'update')[0].ops[0].args[0]).toMatchObject({ status: 'degraded', counts: { ceiling_hit: true, threads_modified: 60 } });
  });
  it('TS-5 re-run: after an interrupted run only the intents without action_taken_at are acted on', async () => {
    const threads = Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`a${i}`, { from: 'alerts@exelon.com', subject: `digest ${i}`, lastMessageId: `m${i}` }]));
    // the killed run stamped a0..a29; the ledger now holds 50 pending intents
    const pending = Array.from({ length: 50 }, (_, i) => ({ thread_id: `a${i + 30}`, action_intent: 'archive' }));
    const calls = [];
    const runs = [{ attempt: 1, status: 'skipped', counts: { phase: 'started' }, started_at: '2026-09-06T08:30:00.000Z', finished_at: null }];
    const stamped = Array.from({ length: 30 }, (_, i) => `a${i}`);
    const r = await runGmailTriage({ sb: db({ runs, pending, stamped }).sb, argv: ['--apply', '--modify'], now: NOW, auth: 'AUTH', gmail: gmailFactory({ fresh: Object.keys(threads), sweep: [], threads }, calls), env });
    const ids = calls.filter((c) => c[0] === 'threads.modify').map((c) => c[1].id);
    // the killed run's 30 stamps count against the date: only 30 more, never the full 60 again
    expect(ids).toHaveLength(30);
    expect(ids.some((id) => Number(id.slice(1)) < 30)).toBe(false);
    expect(r).toMatchObject({ attempt: 2, status: 'degraded', counts: { date_modified_before: 30, budget_before: 30, threads_modified: 30, ceiling_hit: true, intents_left: 20 } });
  });
  it('the ceiling bounds the ET date: prior runs\' threads_modified shrink the budget and exhaust it (five fires, exactly 60 for the date)', async () => {
    const threads = Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`a${i}`, { from: 'alerts@exelon.com', subject: `digest ${i}`, lastMessageId: `m${i}` }]));
    const gmail = (calls) => gmailFactory({ fresh: Object.keys(threads).slice(0, 200), sweep: Object.keys(threads).slice(200), threads }, calls);
    let total = 0; const runs = [];
    for (let fire = 1; fire <= 5; fire += 1) {
      const calls = [];
      // fires at 04:30, 04:45, 05:00, 05:15, 05:30 ET (the window is inclusive of 05:30)
      const now = new Date(Date.parse('2026-09-06T08:30:00.000Z') + (fire - 1) * 15 * 60 * 1000);
      const r = await runGmailTriage({ sb: db({ runs: [...runs] }).sb, argv: ['--apply', '--modify'], now, auth: 'AUTH', gmail: gmail(calls), env });
      total += calls.filter((c) => c[0] === 'threads.modify').length;
      if (fire === 1) { expect(r).toMatchObject({ action: 'run', counts: { threads_modified: 60, ceiling_hit: true } }); runs.unshift({ attempt: fire, status: 'degraded', counts: r.counts, started_at: now.toISOString(), finished_at: now.toISOString() }); }
      else expect(r).toMatchObject({ action: 'inert', reason: 'ceiling_hit' });
    }
    expect(total).toBe(60);
    // and a prior run that used 45 without tripping the flag leaves a 15 budget
    const calls = [];
    const partial = [{ attempt: 1, status: 'degraded', counts: { threads_modified: 45 }, started_at: '2026-09-06T08:30:00.000Z', finished_at: '2026-09-06T08:31:00.000Z' }];
    const r = await runGmailTriage({ sb: db({ runs: partial }).sb, argv: ['--apply', '--modify'], now: NOW, auth: 'AUTH', gmail: gmail(calls), env });
    expect(calls.filter((c) => c[0] === 'threads.modify')).toHaveLength(15);
    expect(r).toMatchObject({ counts: { budget_before: 15, date_modified_before: 45, threads_modified: 15, ceiling_hit: true } });
  });
  it('exact exhaustion sets ceiling_hit; a row stamped or re-intended between the pending read and the call is skipped; a zero-row stamp still spends the budget', async () => {
    const threads = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`a${i}`, { from: 'alerts@exelon.com', subject: `d ${i}`, lastMessageId: `m${i}` }]));
    const exact = await runGmailTriage({ sb: db().sb, argv: ['--apply', '--modify'], now: NOW, auth: 'AUTH', gmail: gmailFactory({ fresh: Object.keys(threads), sweep: [], threads }), env });
    expect(exact).toMatchObject({ status: 'degraded', counts: { threads_modified: 60, ceiling_hit: true, intents_left: 0 } });
    const calls = [];
    const recheck = (id) => (id === 't1' ? { action_intent: 'unarchive', action_taken_at: '2026-09-06T09:00:30.000Z', borderline: false } : { action_intent: id === 't2' ? 'label:L_receipts' : 'archive', action_taken_at: null, borderline: false });
    const r = await runGmailTriage({ sb: db({ recheck }).sb, argv: ['--apply', '--modify'], now: NOW, auth: 'AUTH', gmail: gmailFactory({}, calls), env });
    expect(calls.filter((c) => c[0] === 'threads.modify').map((c) => c[1].id)).toEqual(['t2']);
    expect(r.counts).toMatchObject({ skipped_changed: 1, threads_modified: 1 });
    const zero = await runGmailTriage({ sb: db({ stampAnswer: () => [] }).sb, argv: ['--apply', '--modify'], now: NOW, auth: 'AUTH', gmail: gmailFactory(), env });
    expect(zero).toMatchObject({ status: 'degraded', counts: { threads_modified: 0, modified_unrecorded: 2 } });
  });
  it('TS-6: a previously archived thread back with a newer last message is written borderline and not modified', async () => {
    const calls = [];
    const { sb, calls: dbCalls } = db({ archived: [{ thread_id: 't1', last_message_id: 'm0', class: 'newsletter', et_date: '2026-09-05' }] });
    const r = await runGmailTriage({ sb, argv: ['--apply', '--modify'], now: NOW, auth: 'AUTH', gmail: gmailFactory({}, calls), env });
    const up = dbCalls.find((c) => c.table === 'michael_gmail_triage_items' && c.kind === 'upsert');
    const t1 = up.ops[0].args[0].find((x) => x.thread_id === 't1');
    expect(t1).toMatchObject({ borderline: true, class: 'newsletter', action_intent: null, last_message_id: 'm1' });
    expect(calls.filter((c) => c[0] === 'threads.modify').map((c) => c[1].id)).toEqual(['t2']);
    expect(r.counts).toMatchObject({ borderline: 1, threads_modified: 1 });
    const priorRead = dbCalls.find((c) => c.table === 'michael_gmail_triage_items' && c.kind === 'select' && c.ops.some((o) => o.op === 'in'));
    expect(priorRead.ops.find((o) => o.op === 'in').args[0]).toBe('thread_id');
    expect(priorRead.ops.some((o) => o.op === 'not')).toBe(true);
  });
  it('a modify rejecting for one thread leaves it unstamped, counts modify_failed, and continues; all failing is failed', async () => {
    const calls = [];
    const { sb, calls: dbCalls } = db();
    const r = await runGmailTriage({ sb, argv: ['--apply', '--modify'], now: NOW, auth: 'AUTH', gmail: gmailFactory({ reject: { modify: new Set(['t1']) } }, calls), env });
    expect(calls.filter((c) => c[0] === 'threads.modify').map((c) => c[1].id)).toEqual(['t1', 't2']);
    expect(r).toMatchObject({ status: 'degraded', counts: { modify_failed: 1, threads_modified: 1 } });
    const stamps = dbCalls.filter((c) => c.table === 'michael_gmail_triage_items' && c.kind === 'update' && 'action_taken_at' in c.ops[0].args[0]);
    expect(stamps.map((s) => s.ops[2].args[1])).toEqual(['t2']);
    const all = await runGmailTriage({ sb: db().sb, argv: ['--apply', '--modify'], now: NOW, auth: 'AUTH', gmail: gmailFactory({ reject: { modify: new Set(['t1', 't2']) } }), env });
    expect(all).toMatchObject({ status: 'failed', counts: { error_code: 'ALL_MODIFIES_FAILED', modify_failed: 2 } });
  });
  it('no credential is read directly and googleapis is not imported (source assertions)', () => {
    const codeOnly = (text) => text.split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join('\n');
    const src = codeOnly(readFileSync(new URL('./gmail-triage.mjs', import.meta.url), 'utf8'));
    expect(src).not.toMatch(/threads\.modify\(|readHostKey|getStoredTokens|MICHAEL_ENCRYPTION_KEY|from 'googleapis'/);
  });
});
