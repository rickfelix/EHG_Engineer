#!/usr/bin/env node
// scripts/michael/tasks-classifier.mjs — the Google Tasks bridge (host Task Scheduler, 03:45-04:30 ET).
// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D (FR-6). Spec §5 tasks-classifier (v1 by chairman decision).
//
// Reads current-tasks.json from the configured Drive folder (drive.readonly, parents-checked), refuses a
// stale file (> 36 h) or an unconsumed cleanup-pending.json, routes each item by keyword rules (domain
// tasks, four buckets) into a Todoist project with labels captured + from-google-tasks, dedupes against
// Todoist tasks created in the last 7 days carrying those labels, and stages what no rule routes for the
// seat's grading. v1 cannot write cleanup-pending.json back (no drive.file scope): the consumed set is
// STAGED to michael_staged_items kind tasks_cleanup instead (the Apps Script consumer is out of scope).
//
// Staged payloads are BOUNDED (RISK cond 3 / SECURITY F-7): michael_staged_items never ages out until
// dispositioned, so a task_route row carries { dedupe_key, dedupe_sha256, title (200 chars), source_file_id,
// reason } and a tasks_cleanup row { dedupe_key, dedupe_sha256, item_ids, count } — never a file body or an
// address. Open rows of each kind are read first so a re-fire stages no duplicate (DB-D6).
// DRY-RUN BY DEFAULT; --apply creates tasks and stages. assertHostVenue runs FIRST regardless of auth.
// The Todoist client is lazy-created inside run() (TODOIST_API_TOKEN) unless injected.
//
// rule_json vocabulary (domain tasks): { buckets: { ehg: [...], exelon: [...], home: [...], errand: [...] },
//   projects: { ehg: '<todoist project id>', ... } }  — a bucket without a project id is unrouted.
//
// Usage: node scripts/michael/tasks-classifier.mjs [--apply] [--et-date YYYY-MM-DD] [--json]
import 'dotenv/config';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { createMichaelClient, parseArgs, readRows, writeRows, refusal, emit, canonicalJson, sha256Hex } from '../../lib/michael/db.mjs';
import { runFeeder, exitCodeFor, gracefulExit } from '../../lib/michael/feeder.mjs';
import { assertHostVenue } from '../../lib/integrations/google/chairman-oauth.js';
import { listDriveFiles, readDriveFileText } from '../../lib/michael/google-clients.mjs';
import { resolveConstants } from '../../lib/michael/constants.mjs';
import { matchKeywordBuckets } from '../../lib/michael/rules-match.mjs';

export const FEEDER = 'tasks-classifier';
export const TASKS_FILE = 'current-tasks.json';
export const CLEANUP_FILE = 'cleanup-pending.json';
export const STALE_HOURS = 36;
export const DEDUPE_DAYS = 7;
export const TASK_LABELS = Object.freeze(['captured', 'from-google-tasks']);
export const TITLE_MAX = 200;
export const ROUTE_KEYS = Object.freeze(['dedupe_key', 'dedupe_sha256', 'title', 'source_file_id', 'reason']);
export const CLEANUP_KEYS = Object.freeze(['dedupe_key', 'dedupe_sha256', 'item_ids', 'count']);

/** Pure: normalise task text for dedupe (case, whitespace, punctuation). */
export function normalizeContent(s) {
  return String(s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

/** Pure: the items of current-tasks.json — a bare array or { items: [...] }; each needs an id and a title. */
export function parseItems(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { return null; }
  const list = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.items) ? parsed.items : null);
  if (!list) return null;
  return list.filter((x) => x && (x.id !== undefined) && typeof (x.title ?? x.content) === 'string')
    .map((x) => ({ id: String(x.id), title: String(x.title ?? x.content).trim() })).filter((x) => x.title.length > 0);
}

/** Pure: hours between a Drive modifiedTime and now (Infinity when unparseable). */
export function ageHours(modifiedTime, now) {
  const t = Date.parse(modifiedTime || '');
  return Number.isFinite(t) ? (now.getTime() - t) / 3600000 : Infinity;
}

/** Pure: route one item through the active tasks rules; returns { bucket, project_id, rule_key } or null. */
export function routeItem(rules, item, defaults = {}) {
  for (const rule of rules) {
    const hit = matchKeywordBuckets(rule, item.title);
    if (!hit) continue;
    const projects = rule.rule_json && rule.rule_json.projects && typeof rule.rule_json.projects === 'object' ? rule.rule_json.projects : {};
    const projectId = projects[hit.bucket] || defaults[hit.bucket] || null;
    if (!projectId) return null;
    return { bucket: hit.bucket, project_id: String(projectId), rule_key: rule.rule_key, keyword: hit.keyword };
  }
  return null;
}

/** Pure: the bounded task_route payload for one unrouted item. */
export function routePayload(etDate, item, sourceFileId, reason = 'no_rule') {
  return { dedupe_key: `${etDate}:${item.id}`, dedupe_sha256: sha256Hex(canonicalJson({ id: item.id, title: item.title })), title: item.title.slice(0, TITLE_MAX), source_file_id: sourceFileId, reason };
}

/** Pure: the bounded tasks_cleanup payload for a consumed set. */
export function cleanupPayload(etDate, fileId, modifiedTime, itemIds) {
  const ids = [...itemIds].map(String).sort();
  return { dedupe_key: `${etDate}:cleanup:${fileId}:${modifiedTime}`, dedupe_sha256: sha256Hex(canonicalJson(ids)), item_ids: ids, count: ids.length };
}

async function defaultTodoist() {
  const { createTodoistClient } = await import('../../lib/integrations/todoist/todoist-sync.js');
  return createTodoistClient();
}

/** Stage payloads of one kind, skipping dedupe_keys already open (read through the partial index). */
async function stage(sb, kind, payloads, { apply }) {
  if (!payloads.length) return { inserted: 0, skipped: 0, error: null };
  const open = await readRows(sb, 'michael_staged_items', (q) => q.eq('kind', kind).is('dispositioned_at', null), { select: 'payload' });
  if (open.error) return { inserted: 0, skipped: 0, error: open.error };
  const seen = new Set(open.rows.map((r) => r && r.payload && r.payload.dedupe_key).filter(Boolean));
  const fresh = payloads.filter((p) => !seen.has(p.dedupe_key));
  if (apply && fresh.length) {
    const w = await writeRows(sb, 'michael_staged_items', (t) => t.insert(fresh.map((payload) => ({ kind, payload }))));
    if (!w.ok) return { inserted: 0, skipped: payloads.length - fresh.length, error: w.error };
  }
  return { inserted: fresh.length, skipped: payloads.length - fresh.length, error: null };
}

/** The feeder. deps: { sb, argv, now, auth, drive (factory), todoist (client), env }. Never throws. */
export async function runTasksClassifier({ sb, argv = [], now = new Date(), auth, drive, todoist, env = process.env } = {}) {
  const a = parseArgs(argv);
  const apply = a.apply === true;
  if (a.date !== undefined) return refusal('FLAG_UNSUPPORTED', '--date is not supported on feeders; use --et-date YYYY-MM-DD');
  const etDateOverride = a['et-date'] !== undefined ? String(a['et-date']) : undefined;
  if (etDateOverride !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(etDateOverride)) return refusal('ET_DATE_INVALID', '--et-date must be YYYY-MM-DD');
  try { assertHostVenue(env); } catch (e) { return refusal(e.code || 'HOST_VENUE_REQUIRED', e.message); }
  const consts = resolveConstants(['MICHAEL_TASKS_DRIVE_FOLDER_ID', 'MICHAEL_EHG_CHAIRMAN_PROJECT_ID'], env);
  if (!consts.ok) return refusal(consts.refusal, consts.message, { variable: consts.variable });
  const folderId = consts.values.MICHAEL_TASKS_DRIVE_FOLDER_ID;
  const defaults = { ehg: consts.values.MICHAEL_EHG_CHAIRMAN_PROJECT_ID };
  const gdeps = { auth, driveFactory: drive, sb, env };

  return runFeeder({
    feeder: FEEDER,
    etDateOverride,
    dryRun: !apply,
    run: async ({ etDate }) => {
      const counts = { dry_run: !apply, items: 0, routed: 0, unrouted: 0, created: 0, duplicates: 0, create_failed: 0, staged_task_route: 0, staged_cleanup: 0, stage_dupes_skipped: 0, buckets: {} };

      // 1. the folder: current-tasks.json (fresh) and no unconsumed cleanup-pending.json
      const files = await listDriveFiles({ folderId }, gdeps);
      if (!files.ok) return { status: 'failed', counts: { ...counts, error_code: files.error.split(':')[0], phase: 'drive' } };
      const tasksFile = files.files.find((f) => f.name === TASKS_FILE);
      if (!tasksFile) return { status: 'skipped', counts: { ...counts, reason: 'file_missing' } };
      counts.file_modified = tasksFile.modifiedTime || null;
      counts.file_age_hours = Math.round(ageHours(tasksFile.modifiedTime, now) * 10) / 10;
      if (ageHours(tasksFile.modifiedTime, now) > STALE_HOURS) return { status: 'skipped', counts: { ...counts, reason: 'stale' } };
      const cleanup = files.files.find((f) => f.name === CLEANUP_FILE);
      if (cleanup) {
        const lastOk = await readRows(sb, 'michael_feeder_runs', (q) => q.eq('feeder', FEEDER).eq('status', 'ok').order('started_at', { ascending: false }), { select: 'counts' });
        if (lastOk.error) return { status: 'failed', counts: { ...counts, error_code: 'READ_FAILED', phase: 'marker' } };
        const marker = lastOk.rows[0] && lastOk.rows[0].counts ? lastOk.rows[0].counts.cleanup_marker : null;
        if (!marker || String(cleanup.modifiedTime || '') > String(marker)) return { status: 'skipped', counts: { ...counts, reason: 'cleanup_pending', cleanup_modified: cleanup.modifiedTime || null } };
      }

      // 2. items
      const text = await readDriveFileText({ fileId: tasksFile.id, folderId }, gdeps);
      if (!text.ok) return { status: 'failed', counts: { ...counts, error_code: text.error.split(':')[0], phase: 'read' } };
      const items = parseItems(text.text);
      if (!items) return { status: 'failed', counts: { ...counts, error_code: 'FILE_UNPARSEABLE', phase: 'parse' } };
      counts.items = items.length;

      // 3. rules (domain tasks) and routing
      const rules = await readRows(sb, 'michael_rules', (q) => q.eq('domain', 'tasks').eq('status', 'active').order('created_at', { ascending: true }), { select: 'rule_key,rule_json' });
      if (rules.error) return { status: 'failed', counts: { ...counts, error_code: 'READ_FAILED', phase: 'rules' } };
      const routed = [], unrouted = [];
      for (const item of items) {
        const r = routeItem(rules.rows, item, defaults);
        if (r) { routed.push({ item, route: r }); counts.buckets[r.bucket] = (counts.buckets[r.bucket] || 0) + 1; } else unrouted.push(item);
      }
      counts.routed = routed.length; counts.unrouted = unrouted.length;

      // 4. dedupe against Todoist (7 days, both labels); without it nothing is created (never duplicate)
      let existing = null;
      if (routed.length) {
        try {
          const client = todoist || await defaultTodoist();
          const res = await client.getTasks({ label: TASK_LABELS[0] });
          const tasks = Array.isArray(res) ? res : (res && Array.isArray(res.results) ? res.results : []);
          const floor = now.getTime() - DEDUPE_DAYS * 24 * 3600000;
          existing = new Set(tasks.filter((t) => Array.isArray(t.labels) && TASK_LABELS.every((l) => t.labels.includes(l)) && (!t.addedAt || Date.parse(t.addedAt) >= floor)).map((t) => normalizeContent(t.content)));
          counts.todoist_recent = existing.size;
        } catch (e) {
          counts.dedupe_error = (e && e.code) || 'TODOIST_UNAVAILABLE';
        }
      }

      // 5. create (apply only) — a failed dedupe read creates nothing
      const consumed = [];
      if (routed.length && existing) {
        const client = todoist || await defaultTodoist();
        for (const { item, route } of routed) {
          if (existing.has(normalizeContent(item.title))) { counts.duplicates += 1; consumed.push(item.id); continue; }
          if (!apply) { consumed.push(item.id); continue; }
          try {
            await client.addTask({ content: item.title, projectId: route.project_id, labels: [...TASK_LABELS] });
            counts.created += 1; consumed.push(item.id); existing.add(normalizeContent(item.title));
          } catch { counts.create_failed += 1; }
        }
      }

      // 6. stage: unrouted items and the consumed set (v1 cannot write cleanup-pending.json back)
      const routes = unrouted.map((item) => routePayload(etDate, item, tasksFile.id));
      const st = await stage(sb, 'task_route', routes, { apply });
      if (st.error) return { status: 'failed', counts: { ...counts, error_code: 'STAGE_FAILED', phase: 'stage' } };
      counts.staged_task_route = st.inserted; counts.stage_dupes_skipped += st.skipped;
      const cleanups = consumed.length ? [cleanupPayload(etDate, tasksFile.id, tasksFile.modifiedTime || '', consumed)] : [];
      const sc = await stage(sb, 'tasks_cleanup', cleanups, { apply });
      if (sc.error) return { status: 'failed', counts: { ...counts, error_code: 'STAGE_FAILED', phase: 'stage' } };
      counts.staged_cleanup = sc.inserted; counts.stage_dupes_skipped += sc.skipped;
      counts.cleanup_staged = consumed.length > 0; counts.cleanup_written_to_drive = false;
      counts.cleanup_marker = cleanup ? (cleanup.modifiedTime || null) : (counts.cleanup_marker ?? null);

      const degraded = counts.create_failed > 0 || (routed.length > 0 && !existing);
      return { status: degraded ? 'degraded' : 'ok', counts, preview: apply ? undefined : { task_route: routes, tasks_cleanup: cleanups, would_create: existing ? routed.filter(({ item }) => !existing.has(normalizeContent(item.title))).map(({ item, route }) => ({ id: item.id, bucket: route.bucket, project_id: route.project_id })) : [] } };
    },
  }, { sb, env, now });
}

async function main() {
  const argv = process.argv.slice(2);
  const r = await runTasksClassifier({ sb: createMichaelClient(), argv });
  emit(r, { json: argv.includes('--json') });
  await gracefulExit(exitCodeFor(r));
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(`[michael:tasks-classifier] fatal ${e && e.code ? e.code : ''}`); process.exitCode = 2; });
}
