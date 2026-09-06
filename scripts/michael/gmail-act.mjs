#!/usr/bin/env node
// scripts/michael/gmail-act.mjs — label / archive / unarchive one Gmail thread and record it in
// michael_gmail_triage_items (spec §7). SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B (FR-5).
//
// THE API LEG IS CHILD C'S: this script resolves lib/michael/gmail-client.mjs lazily. Its contract
// is `modifyThread({ threadId, addLabelIds, removeLabelIds }) -> { ok, modified }` built on the
// chairman OAuth module of spec §4. While the module is absent the verb exits 2 with
// GMAIL_CLIENT_ABSENT and writes NOTHING (Explore db87ff67: no Gmail API client exists today).
// The DB leg is this child's: action_intent, action_taken_at, and on --unarchive reopened_at — the
// revoke signal autonomy-read reads first.
//
// Usage: node scripts/michael/gmail-act.mjs --thread <id> [--label <labelId>] [--archive | --unarchive]
//          [--date YYYY-MM-DD] [--rule-key <key>] [--dry-run] [--json]
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { createMichaelClient, parseArgs, readRows, writeRows, refusal, emit, todayEt } from '../../lib/michael/db.mjs';

export const GMAIL_CLIENT_ABSENT = 'GMAIL_CLIENT_ABSENT';
export const GMAIL_CLIENT_MODULE = '../../lib/michael/gmail-client.mjs';

/** Pure: what the API call will be. */
export function planModify({ label = null, archive = false, unarchive = false }) {
  const addLabelIds = [];
  const removeLabelIds = [];
  if (label) addLabelIds.push(label);
  if (archive) removeLabelIds.push('INBOX');
  if (unarchive) addLabelIds.push('INBOX');
  return { addLabelIds, removeLabelIds };
}

async function defaultLoadClient() {
  try {
    const mod = await import(GMAIL_CLIENT_MODULE);
    if (mod && typeof mod.modifyThread === 'function') return mod;
    return null;
  } catch (e) {
    if (e && (e.code === 'ERR_MODULE_NOT_FOUND' || /Cannot find module|Failed to load/i.test(String(e.message)))) return null;
    throw e;
  }
}

/** The verb. deps: { sb, argv, now, loadClient }. Never throws. */
export async function runGmailAct({ sb, argv = [], now = new Date(), loadClient = defaultLoadClient } = {}) {
  const a = parseArgs(argv);
  if (!a.thread) return refusal('MISSING_ARGS', '--thread <id> is required');
  const archive = a.archive === true, unarchive = a.unarchive === true;
  if (archive && unarchive) return refusal('CONFLICTING_ARGS', '--archive and --unarchive are exclusive');
  const label = typeof a.label === 'string' ? a.label : null;
  if (!label && !archive && !unarchive) return refusal('MISSING_ARGS', 'pass --label <id>, --archive or --unarchive');
  const etDate = typeof a.date === 'string' ? a.date : todayEt(now);
  const intent = unarchive ? 'unarchive' : archive ? 'archive' : 'label';
  const plan = planModify({ label, archive, unarchive });
  const threadId = String(a.thread);

  const client = await loadClient();
  if (!client) return refusal(GMAIL_CLIENT_ABSENT, `lib/michael/gmail-client.mjs (child C: chairman OAuth) is not landed; no Gmail call and no row written`, { would_call: { threadId, ...plan } });
  if (a['dry-run']) return { ok: true, dry_run: true, would_call: { threadId, ...plan }, would_write: { et_date: etDate, thread_id: threadId, action_intent: intent } };

  // SEC-L1 / TESTING F1: pre-flight the recording table BEFORE the Gmail call, so an unapplied
  // migration never yields a mailbox change that cannot be recorded.
  const existing = await readRows(sb, 'michael_gmail_triage_items', (q) => q.eq('et_date', etDate).eq('thread_id', threadId), { select: 'id,rule_key,action_intent' });
  if (existing.tables_absent) return refusal('TABLES_ABSENT', 'michael_gmail_triage_items is not applied yet — refusing BEFORE the Gmail call so nothing changes unrecorded');
  if (existing.error) return refusal('READ_FAILED', existing.error);

  let api;
  try {
    api = await client.modifyThread({ threadId, ...plan });
  } catch (e) { return refusal('GMAIL_MODIFY_FAILED', e && e.message ? e.message : String(e)); }
  if (!api || api.ok === false) return refusal('GMAIL_MODIFY_FAILED', (api && api.error) || 'modifyThread did not succeed');

  const prior = existing.rows[0] || null;
  const row = {
    et_date: etDate,
    thread_id: threadId,
    action_intent: intent,
    action_taken_at: now.toISOString(),
    rule_key: typeof a['rule-key'] === 'string' ? a['rule-key'] : prior?.rule_key ?? null,
    ...(unarchive ? { reopened_at: now.toISOString() } : {}),
  };
  const w = await writeRows(sb, 'michael_gmail_triage_items', (t) => t.upsert(row, { onConflict: 'et_date,thread_id' }).select('id').single());
  if (!w.ok) return refusal(w.refusal, w.error, { api_applied: true });
  return { ok: true, id: w.data ? w.data.id : null, thread_id: threadId, action_intent: intent, reopened_at: unarchive ? row.reopened_at : null, modified: api.modified ?? null };
}

async function main() {
  const argv = process.argv.slice(2);
  const r = await runGmailAct({ sb: createMichaelClient(), argv });
  emit(r, { json: argv.includes('--json') });
  process.exitCode = r.ok ? 0 : 2;
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(`[MICHAEL-GMAIL-ACT] ${e && e.message ? e.message : e}`); process.exitCode = 1; });
}
