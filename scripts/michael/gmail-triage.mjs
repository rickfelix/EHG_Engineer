#!/usr/bin/env node
// scripts/michael/gmail-triage.mjs — the Gmail feeder, part 1: label reconcile and rules-first matching.
// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D (FR-4). Spec §5 gmail-triage. Host Task Scheduler, 04:30-05:30 ET.
//
// READ-ONLY against Gmail in this PR: labels.list, threads.list, threads.get(format=metadata, four headers,
// never a body). Rows go to michael_gmail_triage_items by (et_date, thread_id): a matched thread carries
// class, rule_key and an action_intent ONLY when its rule has auto_apply=true and auto_apply_verb in
// (label, archive) (SECURITY F-2); an unmatched thread is class NULL (queued for the seat); fleet-class
// threads are class 'fleet' and left for the seat and child G. NO threads.modify call exists in this
// module: --modify is refused MODIFY_NOT_LANDED until PR 4b lands the ceiling.
//
// Writes are guarded (DATABASE DB-D4/DB-D5): create-if-absent upsert with ignoreDuplicates, then an
// update of the feeder-owned columns only, filtered by action_taken_at IS NULL so a chairman decision
// is never overwritten. The label reconcile writes only label_id, name and last_seen_in_gmail_at.
// DRY-RUN BY DEFAULT (--apply writes rows). assertHostVenue runs FIRST regardless of injected auth.
// Logs and counts carry ids and numbers only; no subject, sender or body reaches a row or a log line.
//
// Usage: node scripts/michael/gmail-triage.mjs [--apply] [--et-date YYYY-MM-DD] [--json]
import 'dotenv/config';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { createMichaelClient, parseArgs, readRows, writeRows, refusal, emit } from '../../lib/michael/db.mjs';
import { runFeeder, exitCodeFor, gracefulExit } from '../../lib/michael/feeder.mjs';
import { assertHostVenue } from '../../lib/integrations/google/chairman-oauth.js';
import { listThreads, getThreadMeta, listLabels, THREADS_MAX_RESULTS, FORBIDDEN_LABELS } from '../../lib/michael/gmail-client.mjs';
import { matchGmailRule } from '../../lib/michael/rules-match.mjs';

export const FEEDER = 'gmail-triage';
export const FLEET_CLASS = 'fleet';
export const INTENT_VERBS = Object.freeze(['label', 'archive']);
/** The columns this feeder owns on michael_gmail_triage_items; never action_taken_at, verified_by, needs_you, summary. */
export const ITEM_KEYS = Object.freeze(['et_date', 'thread_id', 'class', 'rule_key', 'action_intent', 'last_message_id']);
export const ITEM_UPDATE_KEYS = Object.freeze(['class', 'rule_key', 'action_intent', 'last_message_id']);
export const LABEL_KEYS = Object.freeze(['label_id', 'name', 'last_seen_in_gmail_at']);

/** Pure: the two inbox queries; keep_in_inbox label names are excluded from the fresh query. */
export function inboxQueries(keepInInboxNames = []) {
  const excl = keepInInboxNames.filter(Boolean).map((n) => ` -label:"${String(n).replace(/"/g, '')}"`).join('');
  return [`in:inbox newer_than:1d${excl}`, 'in:inbox older_than:1d'];
}

/**
 * Pure: the action intent a matched rule yields, or null. Only an active rule with auto_apply=true and
 * auto_apply_verb in (label, archive) yields one; 'archive' or 'label:<label_id>' (a label verb without a
 * label id yields null so nothing is guessed).
 */
export function intentFor(rule, match) {
  if (!rule || rule.auto_apply !== true || !INTENT_VERBS.includes(rule.auto_apply_verb)) return null;
  if (rule.auto_apply_verb === 'archive') return 'archive';
  const labelId = match && match.action && match.action.label_id ? String(match.action.label_id) : null;
  return labelId ? `label:${labelId}` : null;
}

/** Pure: the item row for one thread given the first matching rule (or none). Uniform key set. */
export function itemRow({ etDate, meta, rule, match }) {
  return {
    et_date: etDate,
    thread_id: String(meta.threadId),
    class: match ? (match.class || null) : null,
    rule_key: match ? rule.rule_key : null,
    action_intent: match ? intentFor(rule, match) : null,
    last_message_id: meta.lastMessageId || null,
  };
}

/**
 * Pure: is a rule usable this morning? Unusable when its class is a configured class whose label is
 * missing from Gmail, or when its label-verb intent names a label that is not in Gmail or is forbidden
 * (adversarial review of PR 8372): such an intent would be a 400 at modify time instead of a degrade here.
 */
export function ruleUsable(rule, match, { missingClasses = new Set(), gmailIds = null } = {}) {
  if (match && match.class && missingClasses.has(match.class)) return false;
  if (rule && rule.auto_apply === true && rule.auto_apply_verb === 'label') {
    const labelId = match && match.action && match.action.label_id ? String(match.action.label_id) : null;
    if (!labelId) return false;
    if (FORBIDDEN_LABELS.includes(labelId.toUpperCase())) return false;
    if (gmailIds && !gmailIds.has(labelId)) return false;
  }
  return true;
}

/**
 * Pure: first USABLE active gmail rule (row order) that matches; an unusable matching rule is skipped and
 * later rules are still tried. Returns { rule, match, skipped } (skipped = unusable rules passed over) or null.
 */
export function firstMatch(rules, thread, usability = {}) {
  let skipped = 0;
  for (const rule of rules) {
    const m = matchGmailRule(rule, thread);
    if (!m) continue;
    if (!ruleUsable(rule, m, usability instanceof Set ? { missingClasses: usability } : usability)) { skipped += 1; continue; }
    return { rule, match: m, skipped };
  }
  return skipped ? { rule: null, match: null, skipped } : null;
}

/** The feeder. deps: { sb, argv, now, auth, gmail (factory), env }. Never throws. */
export async function runGmailTriage({ sb, argv = [], now = new Date(), auth, gmail, env = process.env } = {}) {
  const a = parseArgs(argv);
  const apply = a.apply === true;
  if (a.date !== undefined) return refusal('FLAG_UNSUPPORTED', '--date is not supported on feeders; use --et-date YYYY-MM-DD');
  if (a.modify === true) return refusal('MODIFY_NOT_LANDED', '--modify (executing intents against Gmail) lands in PR 4b with the per-date ceiling; this build records intents only');
  const etDateOverride = a['et-date'] !== undefined ? String(a['et-date']) : undefined;
  if (etDateOverride !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(etDateOverride)) return refusal('ET_DATE_INVALID', '--et-date must be YYYY-MM-DD');
  try { assertHostVenue(env); } catch (e) { return refusal(e.code || 'HOST_VENUE_REQUIRED', e.message); }
  const deps = { auth, gmailFactory: gmail, sb, env };

  return runFeeder({
    feeder: FEEDER,
    etDateOverride,
    dryRun: !apply,
    run: async ({ etDate }) => {
      const counts = { dry_run: !apply, labels_seen: 0, missing_labels: [], threads_seen: 0, matched: 0, unmatched: 0, fleet: 0, intents: 0, skipped_class: 0, meta_failed: 0, truncated_query: [] };

      // 1. labels: reconcile the registry (three owned columns) and find configured classes missing from Gmail
      const labels = await listLabels(deps);
      if (!labels.ok) return { status: 'failed', counts: { ...counts, error_code: labels.error.split(':')[0], phase: 'labels' } };
      counts.labels_seen = labels.labels.length;
      const configured = await readRows(sb, 'michael_gmail_labels', (q) => q, { select: 'label_id,name,class,keep_in_inbox' });
      if (configured.error) return { status: 'failed', counts: { ...counts, error_code: 'READ_FAILED', phase: 'labels' } };
      const gmailIds = new Set(labels.labels.map((l) => l.id));
      const missing = configured.rows.filter((r) => r.class && !gmailIds.has(r.label_id));
      counts.missing_labels = missing.map((r) => r.label_id);
      const missingClasses = new Set(missing.map((r) => r.class));
      const keepIds = new Set(configured.rows.filter((r) => r.keep_in_inbox === true && gmailIds.has(r.label_id)).map((r) => r.label_id));
      const keepNames = [...keepIds].map((id) => labels.labels.find((l) => l.id === id)?.name).filter(Boolean);
      counts.keep_in_inbox_skipped = 0;
      const seenAt = now.toISOString();
      const labelRows = labels.labels.map((l) => ({ label_id: l.id, name: l.name, last_seen_in_gmail_at: seenAt }));
      if (apply && labelRows.length) {
        const w = await writeRows(sb, 'michael_gmail_labels', (t) => t.upsert(labelRows, { onConflict: 'label_id' }));
        if (!w.ok) return { status: 'failed', counts: { ...counts, error_code: w.refusal, phase: 'labels' } };
      }

      // 2. rules (active, domain gmail, row order)
      const rules = await readRows(sb, 'michael_rules', (q) => q.eq('domain', 'gmail').eq('status', 'active').order('created_at', { ascending: true }), { select: 'rule_key,rule_json,auto_apply,auto_apply_verb' });
      if (rules.error) return { status: 'failed', counts: { ...counts, error_code: 'READ_FAILED', phase: 'rules' } };

      // 3. threads: fresh inbox minus keep_in_inbox labels, plus the older-than-a-day sweep
      const ids = new Set();
      for (const q of inboxQueries(keepNames)) {
        const r = await listThreads({ q, maxResults: THREADS_MAX_RESULTS }, deps);
        if (!r.ok) return { status: 'failed', counts: { ...counts, error_code: r.error.split(':')[0], phase: 'threads' } };
        if (r.truncated) counts.truncated_query.push(q.startsWith('in:inbox newer') ? 'fresh' : 'sweep');
        for (const t of r.threads) ids.add(t.id);
      }
      counts.threads_seen = ids.size;

      // 4. metadata + rules-first matching
      const rows = [];
      const usability = { missingClasses, gmailIds };
      for (const threadId of ids) {
        const m = await getThreadMeta({ threadId }, deps);
        if (!m.ok) { counts.meta_failed += 1; continue; }
        // keep_in_inbox is a data rule, not a query-text rule: a thread carrying such a label is never triaged
        if ((m.meta.labelIds || []).some((l) => keepIds.has(l))) { counts.keep_in_inbox_skipped += 1; continue; }
        const hit = firstMatch(rules.rows, m.meta, usability);
        if (hit && hit.skipped) counts.skipped_class += hit.skipped;
        const row = itemRow({ etDate, meta: m.meta, rule: hit && hit.rule ? hit.rule : null, match: hit && hit.match ? hit.match : null });
        if (row.class === FLEET_CLASS) counts.fleet += 1;
        if (hit && hit.rule) counts.matched += 1; else counts.unmatched += 1;
        if (row.action_intent) counts.intents += 1;
        rows.push(row);
      }

      // 5. guarded writes: create-if-absent, then owned columns only where no action has been taken
      if (apply && rows.length) {
        const ins = await writeRows(sb, 'michael_gmail_triage_items', (t) => t.upsert(rows, { onConflict: 'et_date,thread_id', ignoreDuplicates: true }));
        if (!ins.ok) return { status: 'failed', counts: { ...counts, error_code: ins.refusal, phase: 'items' } };
        let updates = 0;
        for (const row of rows) {
          const patch = Object.fromEntries(ITEM_UPDATE_KEYS.map((k) => [k, row[k]]));
          // A retry (degraded runs re-arm every 15 min) must never reset a class the seat wrote: verified_by is
          // the seat's stamp (classify-apply allow-list), so the guard is action_taken_at IS NULL AND verified_by IS NULL.
          const u = await writeRows(sb, 'michael_gmail_triage_items', (t) => t.update(patch).eq('et_date', etDate).eq('thread_id', row.thread_id).is('action_taken_at', null).is('verified_by', null));
          if (!u.ok) return { status: 'failed', counts: { ...counts, error_code: u.refusal, phase: 'items', updates } };
          updates += 1;
        }
        counts.rows_written = rows.length;
        counts.updates = updates;
      }
      const degraded = counts.missing_labels.length > 0 || counts.truncated_query.length > 0 || counts.meta_failed > 0;
      return { status: degraded ? 'degraded' : 'ok', counts, preview: apply ? undefined : rows };
    },
  }, { sb, env, now });
}

async function main() {
  const argv = process.argv.slice(2);
  const r = await runGmailTriage({ sb: createMichaelClient(), argv });
  emit(r, { json: argv.includes('--json') });
  await gracefulExit(exitCodeFor(r));
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(`[michael:gmail-triage] fatal ${e && e.code ? e.code : ''}`); process.exitCode = 2; });
}
