#!/usr/bin/env node
// scripts/michael/gmail-triage.mjs — the Gmail feeder: label reconcile, rules-first matching (FR-4) and
// record-then-act with the per-date modify ceiling and borderline resurfacing (FR-5).
// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D. Spec §5 gmail-triage. Host Task Scheduler, 04:30-05:30 ET.
//
// Reads: labels.list, threads.list, threads.get(format=metadata, four headers, never a body). Rows go to
// michael_gmail_triage_items by (et_date, thread_id): a matched thread carries class, rule_key and an
// action_intent ONLY when its rule has auto_apply=true and auto_apply_verb in (label, archive)
// (SECURITY F-2); an unmatched thread is class NULL (queued for the seat); fleet-class threads are class
// 'fleet' and left for the seat and child G.
//
// Three modes: dry-run (default, nothing written), --apply (rows and intents recorded, nothing modified),
// --apply --modify (intents executed through modifyThread, TRASH/SPAM already refused there). The
// registrar registers --apply WITHOUT --modify; promotion is an explicit chairman re-register.
// CEILING (SECURITY F-1 / RISK S1): MICHAEL_GMAIL_MODIFY_CEILING bounds the ET DATE, not the run — the
// budget is the ceiling minus counts.threads_modified summed over every prior run of the date; when it
// is exhausted the run writes counts.ceiling_hit=true and every later fire that day is inert (feeder.mjs
// reads ceiling_hit) until a human clears it. Record-then-act: an intent is a row before it is an API
// call, action_taken_at is stamped after the call, and a re-run acts only on intents without it. A
// thread archived earlier that reappears with a newer last_message_id is written borderline=true with
// its class kept and no automatic action.
//
// Writes are guarded (DATABASE DB-D4/DB-D5): create-if-absent upsert with ignoreDuplicates, then an
// update of the feeder-owned columns only, filtered by action_taken_at IS NULL so a chairman decision
// is never overwritten. The label reconcile writes only label_id, name and last_seen_in_gmail_at.
// DRY-RUN BY DEFAULT (--apply writes rows). assertHostVenue runs FIRST regardless of injected auth.
// Logs and counts carry ids and numbers only; no subject, sender or body reaches a row or a log line.
//
// Usage: node scripts/michael/gmail-triage.mjs [--apply [--modify]] [--et-date YYYY-MM-DD] [--json]
import 'dotenv/config';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { createMichaelClient, parseArgs, readRows, writeRows, refusal, emit } from '../../lib/michael/db.mjs';
import { runFeeder, exitCodeFor, gracefulExit } from '../../lib/michael/feeder.mjs';
import { assertHostVenue } from '../../lib/integrations/google/chairman-oauth.js';
import { listThreads, getThreadMeta, listLabels, modifyThread, THREADS_MAX_RESULTS } from '../../lib/michael/gmail-client.mjs';
import { matchGmailRule } from '../../lib/michael/rules-match.mjs';
import { resolveConstant } from '../../lib/michael/constants.mjs';

export const FEEDER = 'gmail-triage';
export const FLEET_CLASS = 'fleet';
export const INTENT_VERBS = Object.freeze(['label', 'archive']);
/** The columns this feeder owns on michael_gmail_triage_items; never action_taken_at, verified_by, needs_you, summary. */
export const ITEM_KEYS = Object.freeze(['et_date', 'thread_id', 'class', 'rule_key', 'action_intent', 'last_message_id', 'borderline']);
export const ITEM_UPDATE_KEYS = Object.freeze(['class', 'rule_key', 'action_intent', 'last_message_id', 'borderline']);
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

/** Pure: the label change one intent means. 'archive' removes INBOX; 'label:<id>' adds that label. */
export function labelChangeFor(intent) {
  if (intent === 'archive') return { removeLabelIds: ['INBOX'], addLabelIds: [] };
  const m = /^label:(.+)$/.exec(String(intent || ''));
  return m ? { addLabelIds: [m[1]], removeLabelIds: [] } : null;
}

/** Pure: the modify budget left for the ET date — the ceiling minus threads_modified over every prior run. */
export function budgetFor(ceiling, priorRuns = []) {
  const used = priorRuns.reduce((n, r) => n + (r && r.counts && Number.isFinite(Number(r.counts.threads_modified)) ? Number(r.counts.threads_modified) : 0), 0);
  return { used, budget: Math.max(ceiling - used, 0) };
}

/**
 * Pure: the item row for one thread given the first matching rule (or none). Uniform key set. `prior` is
 * an earlier row for the thread that was archived (action_intent archive, action_taken_at set): when the
 * thread is back with a newer last_message_id it is borderline — class kept, no automatic action (FR-5).
 */
export function itemRow({ etDate, meta, rule, match, prior = null }) {
  const resurfaced = Boolean(prior && prior.last_message_id && meta.lastMessageId && prior.last_message_id !== meta.lastMessageId);
  return {
    et_date: etDate,
    thread_id: String(meta.threadId),
    class: resurfaced ? (prior.class ?? (match ? (match.class || rule.rule_key || null) : null)) : (match ? (match.class || rule.rule_key || null) : null),
    rule_key: match ? rule.rule_key : null,
    action_intent: resurfaced ? null : (match ? intentFor(rule, match) : null),
    last_message_id: meta.lastMessageId || null,
    borderline: resurfaced,
  };
}

/** Pure: first active gmail rule (row order) that matches, skipping rules whose class is missing from Gmail. */
export function firstMatch(rules, thread, missingClasses = new Set()) {
  for (const rule of rules) {
    const m = matchGmailRule(rule, thread);
    if (!m) continue;
    if (m.class && missingClasses.has(m.class)) return { skipped: true, rule, match: m };
    return { rule, match: m };
  }
  return null;
}

/** The feeder. deps: { sb, argv, now, auth, gmail (factory), env }. Never throws. */
export async function runGmailTriage({ sb, argv = [], now = new Date(), auth, gmail, env = process.env } = {}) {
  const a = parseArgs(argv);
  const apply = a.apply === true;
  const modify = a.modify === true;
  if (a.date !== undefined) return refusal('FLAG_UNSUPPORTED', '--date is not supported on feeders; use --et-date YYYY-MM-DD');
  if (modify && !apply) return refusal('MODIFY_REQUIRES_APPLY', '--modify executes recorded intents; pass --apply --modify so action_taken_at can be stamped (record-then-act)');
  const etDateOverride = a['et-date'] !== undefined ? String(a['et-date']) : undefined;
  if (etDateOverride !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(etDateOverride)) return refusal('ET_DATE_INVALID', '--et-date must be YYYY-MM-DD');
  try { assertHostVenue(env); } catch (e) { return refusal(e.code || 'HOST_VENUE_REQUIRED', e.message); }
  const ceilingRes = resolveConstant('MICHAEL_GMAIL_MODIFY_CEILING', env);
  if (!ceilingRes.ok) return refusal(ceilingRes.refusal, ceilingRes.message, { variable: ceilingRes.variable });
  const ceiling = ceilingRes.value;
  const deps = { auth, gmailFactory: gmail, sb, env };

  return runFeeder({
    feeder: FEEDER,
    etDateOverride,
    dryRun: !apply,
    run: async ({ etDate, priorRuns = [] }) => {
      const { used, budget } = budgetFor(ceiling, priorRuns);
      const counts = { dry_run: !apply, modify: modify, ceiling, budget_before: budget, threads_modified: 0, modify_failed: 0, ceiling_hit: false, borderline: 0, labels_seen: 0, missing_labels: [], threads_seen: 0, matched: 0, unmatched: 0, fleet: 0, intents: 0, skipped_class: 0, meta_failed: 0, truncated_query: [] };
      counts.date_modified_before = used;

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
      const keepNames = configured.rows.filter((r) => r.keep_in_inbox === true && gmailIds.has(r.label_id)).map((r) => labels.labels.find((l) => l.id === r.label_id)?.name || r.name);
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

      // 4. metadata + rules-first matching; earlier archived rows for this batch feed the borderline rule (narrowed guard read, DB-D13)
      const metas = [];
      for (const threadId of ids) {
        const m = await getThreadMeta({ threadId }, deps);
        if (!m.ok) { counts.meta_failed += 1; continue; }
        metas.push(m.meta);
      }
      const archived = new Map();
      if (metas.length) {
        const prior = await readRows(sb, 'michael_gmail_triage_items', (q) => q.in('thread_id', metas.map((m) => String(m.threadId))).eq('action_intent', 'archive').not('action_taken_at', 'is', null).order('et_date', { ascending: false }), { select: 'thread_id,last_message_id,class,et_date' });
        if (prior.error) return { status: 'failed', counts: { ...counts, error_code: 'READ_FAILED', phase: 'prior' } };
        for (const p of prior.rows) if (!archived.has(p.thread_id)) archived.set(p.thread_id, p);
      }
      const rows = [];
      for (const meta of metas) {
        const hit = firstMatch(rules.rows, meta, missingClasses);
        const priorRow = archived.get(String(meta.threadId)) || null;
        if (hit && hit.skipped) { counts.skipped_class += 1; rows.push(itemRow({ etDate, meta, rule: null, match: null, prior: priorRow })); counts.unmatched += 1; continue; }
        const row = itemRow({ etDate, meta, rule: hit ? hit.rule : null, match: hit ? hit.match : null, prior: priorRow });
        if (row.class === FLEET_CLASS) counts.fleet += 1;
        if (hit) counts.matched += 1; else counts.unmatched += 1;
        if (row.action_intent) counts.intents += 1;
        if (row.borderline) counts.borderline += 1;
        rows.push(row);
      }

      // 5. guarded writes: create-if-absent, then owned columns only where no action has been taken
      if (apply && rows.length) {
        const ins = await writeRows(sb, 'michael_gmail_triage_items', (t) => t.upsert(rows, { onConflict: 'et_date,thread_id', ignoreDuplicates: true }));
        if (!ins.ok) return { status: 'failed', counts: { ...counts, error_code: ins.refusal, phase: 'items' } };
        let updates = 0;
        for (const row of rows) {
          const patch = Object.fromEntries(ITEM_UPDATE_KEYS.map((k) => [k, row[k]]));
          const u = await writeRows(sb, 'michael_gmail_triage_items', (t) => t.update(patch).eq('et_date', etDate).eq('thread_id', row.thread_id).is('action_taken_at', null));
          if (!u.ok) return { status: 'failed', counts: { ...counts, error_code: u.refusal, phase: 'items', updates } };
          updates += 1;
        }
        counts.rows_written = rows.length;
        counts.updates = updates;
      }

      // 6. act (--modify only): every recorded intent of the date without action_taken_at, in creation order,
      // within the date budget; stamp action_taken_at after each successful call (record-then-act).
      let attempted = 0;
      if (apply && modify) {
        const pending = await readRows(sb, 'michael_gmail_triage_items', (q) => q.eq('et_date', etDate).not('action_intent', 'is', null).is('action_taken_at', null).eq('borderline', false).order('created_at', { ascending: true }), { select: 'thread_id,action_intent' });
        if (pending.error) return { status: 'failed', counts: { ...counts, error_code: 'READ_FAILED', phase: 'pending' } };
        counts.pending_intents = pending.rows.length;
        for (const item of pending.rows) {
          if (counts.threads_modified >= budget) { counts.ceiling_hit = true; break; }
          const change = labelChangeFor(item.action_intent);
          if (!change) { counts.modify_failed += 1; continue; }
          attempted += 1;
          const m = await modifyThread({ threadId: item.thread_id, ...change }, deps);
          if (!m.ok) { counts.modify_failed += 1; continue; }
          const stamp = await writeRows(sb, 'michael_gmail_triage_items', (t) => t.update({ action_taken_at: new Date().toISOString() }).eq('et_date', etDate).eq('thread_id', item.thread_id).is('action_taken_at', null));
          if (!stamp.ok) return { status: 'failed', counts: { ...counts, error_code: stamp.refusal, phase: 'stamp' } };
          counts.threads_modified += 1;
        }
        if (!counts.ceiling_hit && budget === 0 && pending.rows.length) counts.ceiling_hit = true;
        counts.intents_left = Math.max(pending.rows.length - counts.threads_modified - counts.modify_failed, 0);
      }
      if (attempted > 0 && counts.threads_modified === 0) return { status: 'failed', counts: { ...counts, error_code: 'ALL_MODIFIES_FAILED', phase: 'modify' } };
      const degraded = counts.missing_labels.length > 0 || counts.truncated_query.length > 0 || counts.meta_failed > 0 || counts.ceiling_hit || counts.modify_failed > 0;
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
