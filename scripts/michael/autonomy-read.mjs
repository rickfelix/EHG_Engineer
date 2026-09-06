#!/usr/bin/env node
// scripts/michael/autonomy-read.mjs — earned autonomy as a READ, never a counter (spec §7, Solomon Q4).
// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B (FR-4).
//
// For each active rule the approval streak is the trailing run of chosen='approve' dispositions
// that name that rule_key in michael_feedback_ledger, walked in et_date order (an override, skip or
// auto entry for the rule resets it; days with no entry for the rule are ignored). At the threshold
// (--threshold, else the active brief/autonomy_threshold rule's rule_json.value, else 7) a flip is
// PROPOSED — only for label, archive and reschedule (complete and delete never auto-apply).
// REVOCATIONS COME FIRST: a reopened_at on a thread the rule archived, a moved_back_at on a task it
// rescheduled, or three consecutive overrides revokes/blocks the rule; a rule in revocations[] is
// never in proposals[]. This script only reads; applying a flip is rule-encode's job behind the
// Opus gate, and --stage writes a rule_edit proposal into michael_staged_items for each revocation.
//
// Usage: node scripts/michael/autonomy-read.mjs [--json] [--rule <key>] [--threshold <n>] [--stage]
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { createMichaelClient, parseArgs, readRows, writeRows, refusal, emit } from '../../lib/michael/db.mjs';
import { AUTO_APPLY_VERBS } from '../../lib/michael/rules.mjs';

export const DEFAULT_THRESHOLD = 7;
export const REVOKE_SIGNALS = Object.freeze({ REOPENED: 'reopened_at', MOVED_BACK: 'moved_back_at', THREE_OVERRIDES: 'three_overrides' });

/**
 * Pure: walk ledger rows (any order; sorted here by et_date, then array order) and compute per
 * rule_key { streak, last_three, total_approves, total_overrides, override_run }.
 */
export function computeStreaks(ledgerRows) {
  const rows = [...(ledgerRows || [])].sort((a, b) => String(a.et_date).localeCompare(String(b.et_date)));
  const out = new Map();
  for (const row of rows) {
    for (const d of Array.isArray(row.dispositions) ? row.dispositions : []) {
      if (!d || !d.rule_key) continue;
      const s = out.get(d.rule_key) || { streak: 0, last_three: [], total_approves: 0, total_overrides: 0, override_run: 0 };
      if (d.chosen === 'approve') { s.streak += 1; s.total_approves += 1; s.override_run = 0; }
      else { s.streak = 0; if (d.chosen === 'override') { s.total_overrides += 1; s.override_run += 1; } else s.override_run = 0; }
      s.last_three = [...s.last_three, d.chosen].slice(-3);
      out.set(d.rule_key, s);
    }
  }
  return out;
}

/** Pure: threshold precedence — explicit arg, then the brief/autonomy_threshold rule, then 7. */
export function resolveThreshold({ argThreshold = null, rules = [] } = {}) {
  const n = Number(argThreshold);
  if (argThreshold !== null && argThreshold !== undefined && Number.isInteger(n) && n > 0) return { threshold: n, source: 'arg' };
  const r = rules.find((x) => x.status === 'active' && x.domain === 'brief' && x.rule_key === 'autonomy_threshold');
  const v = r && r.rule_json ? Number(r.rule_json.value) : NaN;
  if (Number.isInteger(v) && v > 0) return { threshold: v, source: 'michael_rules' };
  return { threshold: DEFAULT_THRESHOLD, source: 'default' };
}

/** Pure: the verb a rule would auto-apply (its own column, else rule_json.verb). */
export function ruleVerb(rule) {
  return rule.auto_apply_verb || (rule.rule_json && rule.rule_json.verb) || null;
}

/** Pure: revocation signals for one rule. */
export function revocationsFor(rule, { triage = [], snapshot = [], streak = null } = {}) {
  const out = [];
  const key = rule.rule_key;
  const reopened = triage.find((t) => t.rule_key === key && t.reopened_at && (t.action_intent || 'archive') === 'archive'
    && (!t.action_taken_at || String(t.reopened_at) > String(t.action_taken_at)));
  if (reopened) out.push({ rule_key: key, action: 'revoke', signal: REVOKE_SIGNALS.REOPENED, thread_id: reopened.thread_id, et_date: reopened.et_date });
  const moved = snapshot.find((s) => s.rule_key === key && s.moved_back_at);
  if (moved) out.push({ rule_key: key, action: 'revoke', signal: REVOKE_SIGNALS.MOVED_BACK, task_id: moved.task_id, et_date: moved.et_date });
  if (streak && streak.last_three.length === 3 && streak.last_three.every((c) => c === 'override')) {
    out.push({ rule_key: key, action: 'revoke', signal: REVOKE_SIGNALS.THREE_OVERRIDES });
  }
  return out;
}

/** Pure: the whole computation from rows. */
export function evaluateAutonomy({ rules = [], ledger = [], triage = [], snapshot = [], argThreshold = null, ruleFilter = null } = {}) {
  const streaks = computeStreaks(ledger);
  const { threshold, source } = resolveThreshold({ argThreshold, rules });
  const active = rules.filter((r) => r.status === 'active' && (!ruleFilter || r.rule_key === ruleFilter));
  const revocations = [];
  const proposals = [];
  for (const rule of active) {
    const s = streaks.get(rule.rule_key) || null;
    const rev = revocationsFor(rule, { triage, snapshot, streak: s });
    if (rev.length) { revocations.push(...rev); continue; }
    if (rule.auto_apply) continue;
    const verb = ruleVerb(rule);
    if (!AUTO_APPLY_VERBS.includes(verb)) continue;
    if (s && s.streak >= threshold) proposals.push({ rule_key: rule.rule_key, action: 'flip_auto_apply', verb, streak: s.streak, threshold });
  }
  const streakOut = Object.fromEntries([...streaks.entries()].map(([k, v]) => [k, { streak: v.streak, last_three: v.last_three, override_run: v.override_run }]));
  return { threshold, threshold_source: source, proposals, revocations, streaks: streakOut };
}

/** The verb. deps: { sb, argv, now }. Never throws. */
export async function runAutonomyRead({ sb, argv = [], now = new Date() } = {}) {
  const a = parseArgs(argv);
  const ruleFilter = typeof a.rule === 'string' ? a.rule : null;
  const rulesR = await readRows(sb, 'michael_rules', (q) => q.eq('status', 'active'));
  if (rulesR.tables_absent) return { ok: true, tables_absent: true, threshold: DEFAULT_THRESHOLD, proposals: [], revocations: [], streaks: {} };
  const ledgerR = await readRows(sb, 'michael_feedback_ledger', (q) => q.order('et_date', { ascending: false }), { select: 'et_date,dispositions' });
  // SEC-M4: revocation reads are scoped to the active rule keys and ordered newest-first, so the
  // bounded read is deterministic — a rule that should be revoked cannot fall outside the window.
  const activeKeys = rulesR.rows.map((r) => r.rule_key);
  const triageR = activeKeys.length
    ? await readRows(sb, 'michael_gmail_triage_items', (q) => q.in('rule_key', activeKeys).not('reopened_at', 'is', null).order('reopened_at', { ascending: false }), { select: 'et_date,thread_id,rule_key,action_intent,action_taken_at,reopened_at' })
    : { rows: [], tables_absent: false };
  const snapR = activeKeys.length
    ? await readRows(sb, 'michael_todoist_snapshot', (q) => q.in('rule_key', activeKeys).not('moved_back_at', 'is', null).order('moved_back_at', { ascending: false }), { select: 'et_date,task_id,rule_key,moved_back_at' })
    : { rows: [], tables_absent: false };
  const errors = [rulesR, ledgerR, triageR, snapR].map((r) => r.error).filter(Boolean);
  const result = evaluateAutonomy({ rules: rulesR.rows, ledger: ledgerR.rows, triage: triageR.rows, snapshot: snapR.rows, argThreshold: a.threshold ?? null, ruleFilter });
  let staged = [];
  if (a.stage && result.revocations.length) {
    const open = await readRows(sb, 'michael_staged_items', (q) => q.eq('kind', 'rule_edit').is('dispositioned_at', null), { select: 'id,payload' });
    for (const rev of result.revocations) {
      const dup = open.rows.find((r) => r.payload && r.payload.rule_key === rev.rule_key && r.payload.signal === rev.signal);
      if (dup) { staged.push({ rule_key: rev.rule_key, signal: rev.signal, id: dup.id, existing: true }); continue; }
      const w = await writeRows(sb, 'michael_staged_items', (t) => t.insert({ kind: 'rule_edit', payload: { rule_key: rev.rule_key, signal: rev.signal, proposal: 'revoke auto_apply and edit the rule', evidence: rev, staged_by: process.env.CLAUDE_SESSION_ID || 'cli' }, staged_at: now.toISOString() }).select('id').single());
      if (!w.ok) return refusal(w.refusal, w.error);
      staged.push({ rule_key: rev.rule_key, signal: rev.signal, id: w.data ? w.data.id : null, existing: false });
    }
  }
  return { ok: errors.length === 0, tables_absent: false, ...result, staged, errors };
}

async function main() {
  const argv = process.argv.slice(2);
  const r = await runAutonomyRead({ sb: createMichaelClient(), argv });
  emit(r, { json: argv.includes('--json') });
  process.exitCode = r.ok ? 0 : 2;
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(`[MICHAEL-AUTONOMY-READ] ${e && e.message ? e.message : e}`); process.exitCode = 1; });
}
