#!/usr/bin/env node
// scripts/michael/todoist-act.mjs — reschedule | complete | add | comment on Todoist, recorded in
// michael_todoist_snapshot (spec §7). SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B (FR-5).
//
// Client: lib/integrations/todoist/todoist-sync.js createTodoistClient() (TODOIST_API_TOKEN — a
// service token for a personal tool, not an Anthropic API key). A reschedule whose new date differs
// from the row's proposed_date stamps moved_back_at — the revoke signal autonomy-read reads first.
// Every verb appends to mutations_applied and sets chosen_action.
//
// Usage (absolute path from the repo root):
//   node scripts/michael/todoist-act.mjs reschedule --task <id> --date YYYY-MM-DD [--rule-key <key>]
//   node scripts/michael/todoist-act.mjs complete   --task <id>
//   node scripts/michael/todoist-act.mjs add        --content "..." [--project <id>] [--due YYYY-MM-DD]
//   node scripts/michael/todoist-act.mjs comment    --task <id> --text "..."
//   common: [--et-date YYYY-MM-DD] [--dry-run] [--json]
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { createMichaelClient, parseArgs, readRows, writeRows, refusal, emit, todayEt, sha256Hex } from '../../lib/michael/db.mjs';

export const VERBS = Object.freeze(['reschedule', 'complete', 'add', 'comment']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Pure: the mutation record stored in mutations_applied. SEC-M3: chairman prose (task content,
 * comment text) is NEVER stored verbatim — only its sha256 and length — because
 * michael_todoist_snapshot is not aged out by retention.
 */
export function redactCall(call) {
  const [first, second] = call.args;
  if (call.method === 'updateTask') return { task_id: first, due_date: second && second.dueDate ? second.dueDate : null };
  if (call.method === 'closeTask') return { task_id: first };
  if (call.method === 'addTask') return { project_id: first.projectId ?? null, due_date: first.dueDate ?? null, content_sha256: sha256Hex(first.content), content_len: first.content.length };
  return { task_id: first.taskId, content_sha256: sha256Hex(first.content), content_len: first.content.length };
}

/** Pure: does this reschedule reverse the proposal? (proposed_date present and different) */
export function reversesProposal(priorRow, newDate) {
  if (!priorRow || !priorRow.proposed_date) return false;
  return String(priorRow.proposed_date).slice(0, 10) !== newDate;
}

async function defaultLoadClient() {
  const { createTodoistClient } = await import('../../lib/integrations/todoist/todoist-sync.js');
  return createTodoistClient();
}

/** The verb. deps: { sb, argv, now, loadClient }. Never throws. */
export async function runTodoistAct({ sb, argv = [], now = new Date(), loadClient = defaultLoadClient } = {}) {
  const a = parseArgs(argv);
  const verb = a._[0];
  if (!VERBS.includes(verb)) return refusal('INVALID_VERB', `first argument must be one of ${VERBS.join('|')}`);
  const etDate = typeof a['et-date'] === 'string' ? a['et-date'] : todayEt(now);
  if (!DATE_RE.test(etDate)) return refusal('DATE_INVALID', '--et-date must be YYYY-MM-DD');
  let call;
  if (verb === 'reschedule') {
    if (!a.task || typeof a.date !== 'string') return refusal('MISSING_ARGS', 'reschedule needs --task <id> --date YYYY-MM-DD');
    if (!DATE_RE.test(a.date)) return refusal('DATE_INVALID', '--date must be YYYY-MM-DD');
    call = { method: 'updateTask', args: [String(a.task), { dueDate: a.date }] };
  } else if (verb === 'complete') {
    if (!a.task) return refusal('MISSING_ARGS', 'complete needs --task <id>');
    call = { method: 'closeTask', args: [String(a.task)] };
  } else if (verb === 'add') {
    if (typeof a.content !== 'string') return refusal('MISSING_ARGS', 'add needs --content "..."');
    if (typeof a.due === 'string' && !DATE_RE.test(a.due)) return refusal('DATE_INVALID', '--due must be YYYY-MM-DD');
    call = { method: 'addTask', args: [{ content: a.content, ...(typeof a.project === 'string' ? { projectId: a.project } : {}), ...(typeof a.due === 'string' ? { dueDate: a.due } : {}) }] };
  } else {
    if (!a.task || typeof a.text !== 'string') return refusal('MISSING_ARGS', 'comment needs --task <id> --text "..."');
    call = { method: 'addComment', args: [{ taskId: String(a.task), content: a.text }] };
  }
  if (a['dry-run']) return { ok: true, dry_run: true, verb, would_call: call, et_date: etDate };

  // SEC-L1 / TESTING F1: pre-flight the recording table BEFORE touching the external account, so an
  // unapplied migration never yields a mutation that cannot be recorded.
  const preflight = verb === 'add'
    ? await readRows(sb, 'michael_todoist_snapshot', (q) => q.eq('task_id', '__preflight__'), { select: 'id' })
    : await readRows(sb, 'michael_todoist_snapshot', (q) => q.eq('et_date', etDate).eq('task_id', String(a.task)), { select: 'id,proposed_date,mutations_applied,rule_key' });
  if (preflight.tables_absent) return refusal('TABLES_ABSENT', 'michael_todoist_snapshot is not applied yet — refusing BEFORE the Todoist call so nothing mutates unrecorded');
  if (preflight.error) return refusal('READ_FAILED', preflight.error);

  let api;
  try {
    api = await loadClient();
  } catch (e) { return refusal('TODOIST_CLIENT_UNAVAILABLE', e && e.message ? e.message : String(e)); }
  let result;
  try {
    result = await api[call.method](...call.args);
  } catch (e) { return refusal('TODOIST_CALL_FAILED', `${call.method}: ${e && e.message ? e.message : String(e)}`); }

  const taskId = verb === 'add' ? String(result && result.id ? result.id : '') : String(a.task);
  if (!taskId) return { ok: true, verb, api: result, recorded: false, note: 'addTask returned no id; nothing recorded' };
  const existing = verb === 'add'
    ? await readRows(sb, 'michael_todoist_snapshot', (q) => q.eq('et_date', etDate).eq('task_id', taskId), { select: 'id,proposed_date,mutations_applied,rule_key' })
    : preflight;
  if (existing.tables_absent) return refusal('TABLES_ABSENT', 'michael_todoist_snapshot is not applied yet — the Todoist change was applied but not recorded', { api_applied: true });
  const prior = existing.rows[0] || null;
  const mutation = { verb, at: now.toISOString(), args: redactCall(call), by: process.env.CLAUDE_SESSION_ID || 'cli' };
  const movedBack = verb === 'reschedule' && reversesProposal(prior, a.date);
  const row = {
    et_date: etDate,
    task_id: taskId,
    chosen_action: verb,
    rule_key: typeof a['rule-key'] === 'string' ? a['rule-key'] : prior?.rule_key ?? null,
    mutations_applied: [...(prior && Array.isArray(prior.mutations_applied) ? prior.mutations_applied : []), mutation],
    ...(movedBack ? { moved_back_at: now.toISOString() } : {}),
  };
  const w = await writeRows(sb, 'michael_todoist_snapshot', (t) => t.upsert(row, { onConflict: 'et_date,task_id' }).select('id').single());
  if (!w.ok) return refusal(w.refusal, w.error, { api_applied: true });
  return { ok: true, id: w.data ? w.data.id : null, verb, task_id: taskId, moved_back_at: movedBack ? row.moved_back_at : null };
}

async function main() {
  const argv = process.argv.slice(2);
  const r = await runTodoistAct({ sb: createMichaelClient(), argv });
  emit(r, { json: argv.includes('--json') });
  process.exitCode = r.ok ? 0 : 2;
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(`[MICHAEL-TODOIST-ACT] ${e && e.message ? e.message : e}`); process.exitCode = 1; });
}
