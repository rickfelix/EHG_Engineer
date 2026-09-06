#!/usr/bin/env node
// scripts/michael/todoist-brief.mjs — the Todoist feeder (GitHub Actions, 04:45-05:30 ET, no Google credential).
// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D (FR-7). Spec §5 todoist-brief.
//
// Fetches every active task through the injected client (createTodoistClient at the private main;
// TODOIST_API_TOKEN is the only secret), keeps tasks due today or overdue in ET, excludes the projects
// named EVA and For Processing (by name) and the EHG chairman project (by id, counted into
// counts.ehg_pointer for the brief's one-line EHG pointer), tags a role through roleTagFor over active
// michael_rules domain todoist, and grades deterministically from an `Est:` line (S under 30 minutes,
// M under 90, L otherwise); the rest keep effort_grade NULL (queued for the seat).
//
// Snapshot writes are guarded (DATABASE DB-D4/DB-D5): create-if-absent upsert with ignoreDuplicates, then
// an update of the feeder-owned columns only, filtered by chosen_action IS NULL AND moved_back_at IS NULL;
// base rows never carry chosen_action, mutations_applied or moved_back_at. Overnight mutations happen ONLY
// for active rules with auto_apply=true and auto_apply_verb in (label, reschedule): a label rule adds its
// label; the reschedule verb keeps MICHAEL_DAILY_CHECKIN_TASK_ID due today. Each mutation is deduped on
// (et_date, task_id, action) inside mutations_applied and redacted to content_sha256 like todoist-act.mjs
// (michael_todoist_snapshot is never aged out); a recurring check-in is re-anchored through its own due string so
// the recurrence survives. Every other date change waits for the conversation. Snapshot patches carry only the
// feeder's non-null values, so a re-fire never nulls what the seat graded; floating due datetimes are ET wall time.
// DRY-RUN BY DEFAULT; --apply writes rows and applies mutations. No task text reaches a row or a log line.
//
// Usage: node scripts/michael/todoist-brief.mjs [--apply] [--et-date YYYY-MM-DD] [--json]
import 'dotenv/config';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { createMichaelClient, parseArgs, readRows, writeRows, refusal, emit, sha256Hex } from '../../lib/michael/db.mjs';
import { runFeeder, exitCodeFor, gracefulExit } from '../../lib/michael/feeder.mjs';
import { resolveConstant } from '../../lib/michael/constants.mjs';
import { roleTagFor } from '../../lib/michael/rules-match.mjs';
import { etDateStr } from '../../lib/time/chairman-et-wall-clock.js';

export const FEEDER = 'todoist-brief';
export const EXCLUDED_PROJECT_NAMES = Object.freeze(['EVA', 'For Processing']);
export const MUTATION_VERBS = Object.freeze(['label', 'reschedule']);
export const TODOIST_MAX_PAGES = 20;
/** The columns this feeder owns on michael_todoist_snapshot; never chosen_action, mutations_applied, moved_back_at, proposed_*. */
export const SNAPSHOT_KEYS = Object.freeze(['et_date', 'task_id', 'effort_grade', 'est_minutes', 'role_tag', 'rule_key']);
export const SNAPSHOT_UPDATE_KEYS = Object.freeze(['effort_grade', 'est_minutes', 'role_tag', 'rule_key']);

/**
 * Pure: minutes from an `Est:` line ("Est: 45m", "Est: 1h30", "Est: 1h30m", "Est: 1hr 30", "Est: 2 hours",
 * "Est: 20 min", "Est: 90"); null when absent or unparseable. Unit tokens are terminated by a lookahead, not a
 * word boundary, so a digit may follow the hour unit directly (adversarial review of PR 8375).
 */
export function parseEstMinutes(text) {
  const m = /(^|\n)\s*est\s*:\s*([^\n]+)/i.exec(String(text || ''));
  if (!m) return null;
  const s = m[2].toLowerCase().trim();
  const h = /(\d+(?:\.\d+)?)\s*(?:hours|hour|hrs|hr|h)(?![a-z])/.exec(s);
  const rest = h ? s.slice(h.index + h[0].length) : s;
  const mm = /(\d+)\s*(?:minutes|minute|mins|min|m)(?![a-z])/.exec(rest);
  let minutes = 0;
  if (h) minutes += Math.round(Number(h[1]) * 60);
  if (mm) minutes += Number(mm[1]);
  else if (h) { const tail = /^\s*(\d{1,2})\s*$/.exec(rest); if (tail) minutes += Number(tail[1]); }
  else { const bare = /^(\d+)$/.exec(s); if (!bare) return null; minutes = Number(bare[1]); }
  return minutes > 0 ? minutes : null;
}

/** Pure: S under 30 minutes, M under 90, L otherwise. */
export function gradeFor(minutes) {
  if (minutes === null || minutes === undefined) return null;
  return minutes < 30 ? 'S' : minutes < 90 ? 'M' : 'L';
}

/** Pure: the ET calendar date of a Todoist due (date or datetime), or null. */
export function dueDateOf(task, etDateStr) {
  const due = task && task.due ? task.due : null;
  if (!due) return null;
  const raw = due.datetime || due.date;
  if (!raw) return null;
  const s = String(raw);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // A floating datetime (no Z / offset) is the chairman's own wall clock — ET — so its date part IS the ET date.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(s)) return s.slice(0, 10);
  const t = Date.parse(s);
  return Number.isFinite(t) ? etDateStr(new Date(t)) : null;
}

/** Pure: is the task due today or overdue on the ET calendar? */
export function isDueOrOverdue(task, etDate, etDateStr) {
  const d = dueDateOf(task, etDateStr);
  return d !== null && d <= etDate;
}

/** Pure: ids of the projects named EVA / For Processing (trimmed, case-insensitive) and every sub-project under them. */
export function excludedProjectIds(projects) {
  const names = new Set(EXCLUDED_PROJECT_NAMES.map((n) => n.toLowerCase()));
  const ids = new Set(projects.filter((p) => p && names.has(String(p.name || '').trim().toLowerCase())).map((p) => String(p.id)));
  for (let grew = true; grew;) {
    grew = false;
    for (const p of projects) if (p && p.parentId && ids.has(String(p.parentId)) && !ids.has(String(p.id))) { ids.add(String(p.id)); grew = true; }
  }
  return ids;
}

/** Pure: the base snapshot row (uniform key set). */
export function snapshotRow({ etDate, task, roleTag, ruleKey }) {
  const minutes = parseEstMinutes(`${task.content || ''}\n${task.description || ''}`);
  return { et_date: etDate, task_id: String(task.id), effort_grade: gradeFor(minutes), est_minutes: minutes, role_tag: roleTag, rule_key: ruleKey };
}

/** Pure: the redacted mutation record (SEC-M3: sha256 + length, never task text). */
export function mutationRecord({ action, task, ruleKey, at, detail = {} }) {
  return { action, at, rule_key: ruleKey, content_sha256: sha256Hex(String(task.content || '')), content_len: String(task.content || '').length, by: 'todoist-brief', ...detail };
}

async function defaultTodoist() {
  const { createTodoistClient } = await import('../../lib/integrations/todoist/todoist-sync.js');
  return createTodoistClient();
}

async function fetchAll(client, method, args = {}) {
  const out = [];
  let cursor = null;
  for (let page = 0; page < TODOIST_MAX_PAGES; page += 1) {
    const res = await client[method](cursor ? { ...args, cursor } : args);
    const batch = Array.isArray(res) ? res : (res && Array.isArray(res.results) ? res.results : []);
    out.push(...batch);
    cursor = res && !Array.isArray(res) && res.nextCursor ? res.nextCursor : null;
    if (!cursor) return { items: out, complete: true };
  }
  return { items: out, complete: false };
}

/** The feeder. deps: { sb, argv, now, todoist (client), env, etDateStr }. Never throws. */
export async function runTodoistBrief({ sb, argv = [], now = new Date(), todoist, env = process.env } = {}) {
  const a = parseArgs(argv);
  const apply = a.apply === true;
  if (a.date !== undefined) return refusal('FLAG_UNSUPPORTED', '--date is not supported on feeders; use --et-date YYYY-MM-DD');
  const etDateOverride = a['et-date'] !== undefined ? String(a['et-date']) : undefined;
  if (etDateOverride !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(etDateOverride)) return refusal('ET_DATE_INVALID', '--et-date must be YYYY-MM-DD');
  const ehg = resolveConstant('MICHAEL_EHG_CHAIRMAN_PROJECT_ID', env);
  if (!ehg.ok) return refusal(ehg.refusal, ehg.message, { variable: ehg.variable });
  const checkin = resolveConstant('MICHAEL_DAILY_CHECKIN_TASK_ID', env);

  return runFeeder({
    feeder: FEEDER,
    etDateOverride,
    dryRun: !apply,
    run: async ({ etDate }) => {
      const counts = { dry_run: !apply, tasks_seen: 0, due_or_overdue: 0, excluded_by_name: 0, ehg_pointer: 0, graded: 0, ungraded: 0, role_tagged: 0, rows_written: 0, rows_added_for_mutation: 0, updates: 0, updates_unmatched: 0, mutations_applied: 0, mutations_deduped: 0, mutation_failed: 0, mutation_unrecorded: 0, mutation_skipped_chosen: 0, label_rules_inert: 0, reschedule_skipped: null };
      let client;
      try { client = todoist || await defaultTodoist(); } catch (e) { return { status: 'failed', counts: { ...counts, error_code: (e && e.code) || 'TODOIST_CLIENT', phase: 'client' } }; }

      // 1. projects and tasks (all pages)
      let projects, tasks;
      try {
        projects = await fetchAll(client, 'getProjects');
        tasks = await fetchAll(client, 'getTasks');
      } catch (e) { return { status: 'failed', counts: { ...counts, error_code: (e && e.code) || 'TODOIST_UNAVAILABLE', phase: 'fetch' } }; }
      if (!projects.complete || !tasks.complete) return { status: 'failed', counts: { ...counts, error_code: 'TODOIST_PAGES_EXCEEDED', phase: 'fetch' } };
      const excludedIds = excludedProjectIds(projects.items);
      const projectName = new Map(projects.items.map((p) => [String(p.id), String(p.name || '')]));
      counts.tasks_seen = tasks.items.length;

      // 2. filter: due today or overdue (ET), not EVA / For Processing, EHG project counted only
      const kept = [];
      for (const t of tasks.items) {
        if (!t || !t.id || !isDueOrOverdue(t, etDate, etDateStr)) continue;
        counts.due_or_overdue += 1;
        const pid = String(t.projectId || '');
        if (excludedIds.has(pid)) { counts.excluded_by_name += 1; continue; }
        if (pid === String(ehg.value)) { counts.ehg_pointer += 1; continue; }
        kept.push(t);
      }

      // 3. rules (domain todoist): role tags and the auto_apply mutation rules
      const rules = await readRows(sb, 'michael_rules', (q) => q.eq('domain', 'todoist').eq('status', 'active').order('created_at', { ascending: true }), { select: 'rule_key,rule_json,auto_apply,auto_apply_verb' });
      if (rules.error) return { status: 'failed', counts: { ...counts, error_code: 'READ_FAILED', phase: 'rules' } };
      const rows = kept.map((t) => {
        const tag = roleTagFor(rules.rows, { project_name: projectName.get(String(t.projectId || '')) || '', labels: Array.isArray(t.labels) ? t.labels : [], content: String(t.content || '') });
        return snapshotRow({ etDate, task: t, roleTag: tag ? tag.role_tag : null, ruleKey: tag ? tag.rule_key : null });
      });
      counts.graded = rows.filter((r) => r.effort_grade).length; counts.ungraded = rows.length - counts.graded; counts.role_tagged = rows.filter((r) => r.role_tag).length;

      // 4. plan the overnight mutations: auto_apply label / reschedule rules only (applied after the snapshot writes)
      const mutationRules = rules.rows.filter((r) => r.auto_apply === true && MUTATION_VERBS.includes(r.auto_apply_verb));
      const planned = [];
      const byId = new Map(kept.map((t) => [String(t.id), t]));
      const taskFacts = (t) => ({ project_name: projectName.get(String(t.projectId || '')) || '', labels: Array.isArray(t.labels) ? t.labels : [], content: String(t.content || '') });
      for (const rule of mutationRules) {
        const rj = rule.rule_json && typeof rule.rule_json === 'object' ? rule.rule_json : {};
        if (rule.auto_apply_verb === 'label') {
          // a label rule matches through roleTagFor, which needs role_tag on the rule: without it (or a label) the rule is inert
          if (!rj.label || !rj.role_tag) { counts.label_rules_inert += 1; continue; }
          for (const t of kept) {
            const tag = roleTagFor([rule], taskFacts(t));
            if (tag && !(Array.isArray(t.labels) && t.labels.includes(String(rj.label)))) planned.push({ task: t, action: `label:${rj.label}`, rule, apply: async () => client.updateTask(String(t.id), { labels: [...new Set([...(t.labels || []), String(rj.label)])] }), detail: { label: String(rj.label) } });
          }
        }
        if (rule.auto_apply_verb === 'reschedule') {
          if (!checkin.ok) { counts.reschedule_skipped = 'checkin_unconfigured'; continue; }
          const t = byId.get(String(checkin.value)) || tasks.items.find((x) => x && String(x.id) === String(checkin.value));
          if (!t) { counts.reschedule_skipped = 'checkin_not_found'; continue; }
          if (dueDateOf(t, etDateStr) === etDate) continue;
          // A recurring check-in must keep its recurrence: re-anchor through its own due string (Todoist re-computes the
          // next occurrence from now — today for a daily rule); a fixed dueDate would silently drop the recurrence.
          const recurring = t.due && t.due.isRecurring === true;
          const dueString = recurring && t.due.string ? String(t.due.string) : null;
          if (recurring && (!dueString || !/\bevery\b/i.test(dueString))) { counts.reschedule_skipped = 'recurring_without_every'; continue; }
          const body = recurring ? { dueString } : { dueDate: etDate };
          planned.push({ task: t, action: `reschedule:${etDate}`, rule, apply: async () => client.updateTask(String(t.id), body), detail: recurring ? { due_date: etDate, due_string: dueString } : { due_date: etDate } });
        }
      }
      counts.mutations_planned = planned.length;
      // a mutation target with no snapshot row (the check-in task outside `kept`) gets a base row so its record has a home
      for (const t of new Map(planned.map((p) => [String(p.task.id), p.task])).values()) {
        if (rows.some((r) => r.task_id === String(t.id))) continue;
        const tag = roleTagFor(rules.rows, taskFacts(t));
        rows.push(snapshotRow({ etDate, task: t, roleTag: tag ? tag.role_tag : null, ruleKey: tag ? tag.rule_key : null }));
        counts.rows_added_for_mutation += 1;
      }

      // 5. guarded snapshot writes: create-if-absent, then patch ONLY the non-null feeder values so a degraded
      // re-fire never nulls a grade or tag the seat wrote meanwhile; 0 matched rows = the seat/chairman already acted
      if (apply && rows.length) {
        const ins = await writeRows(sb, 'michael_todoist_snapshot', (t) => t.upsert(rows, { onConflict: 'et_date,task_id', ignoreDuplicates: true }));
        if (!ins.ok) return { status: 'failed', counts: { ...counts, error_code: ins.refusal, phase: 'snapshot' } };
        for (const row of rows) {
          const patch = Object.fromEntries(SNAPSHOT_UPDATE_KEYS.filter((k) => row[k] !== null && row[k] !== undefined).map((k) => [k, row[k]]));
          if (!Object.keys(patch).length) continue;
          const u = await writeRows(sb, 'michael_todoist_snapshot', (t) => t.update(patch).eq('et_date', etDate).eq('task_id', row.task_id).is('chosen_action', null).is('moved_back_at', null).select('task_id'));
          if (!u.ok) return { status: 'failed', counts: { ...counts, error_code: u.refusal, phase: 'snapshot' } };
          if (Array.isArray(u.data) && u.data.length === 1) counts.updates += 1; else counts.updates_unmatched += 1;
        }
        counts.rows_written = rows.length;
      }
      if (apply && planned.length) {
        const ids = [...new Set(planned.map((p) => String(p.task.id)))];
        const existing = await readRows(sb, 'michael_todoist_snapshot', (q) => q.eq('et_date', etDate).in('task_id', ids), { select: 'task_id,mutations_applied,chosen_action,moved_back_at' });
        if (existing.error) return { status: 'failed', counts: { ...counts, error_code: 'READ_FAILED', phase: 'mutations' } };
        const state = new Map(existing.rows.map((r) => [String(r.task_id), r]));
        for (const p of planned) {
          const row = state.get(String(p.task.id)) || { mutations_applied: [] };
          if (row.chosen_action || row.moved_back_at) { counts.mutation_skipped_chosen += 1; continue; }
          const applied = Array.isArray(row.mutations_applied) ? row.mutations_applied : [];
          if (applied.some((m) => m && m.action === p.action)) { counts.mutations_deduped += 1; continue; }
          try { await p.apply(); } catch { counts.mutation_failed += 1; continue; }
          const next = [...applied, mutationRecord({ action: p.action, task: p.task, ruleKey: p.rule.rule_key, at: now.toISOString(), detail: p.detail })];
          const w = await writeRows(sb, 'michael_todoist_snapshot', (t) => t.update({ mutations_applied: next }).eq('et_date', etDate).eq('task_id', String(p.task.id)).is('chosen_action', null).is('moved_back_at', null).select('task_id'));
          if (!w.ok) return { status: 'failed', counts: { ...counts, error_code: w.refusal, phase: 'mutations' } };
          if (!Array.isArray(w.data) || w.data.length !== 1) { counts.mutation_unrecorded += 1; continue; }
          row.mutations_applied = next; state.set(String(p.task.id), row);
          counts.mutations_applied += 1;
        }
      }
      const degraded = counts.mutation_failed > 0 || counts.mutation_unrecorded > 0;
      return { status: degraded ? 'degraded' : 'ok', counts, preview: apply ? undefined : { rows, mutations: planned.map((p) => ({ task_id: String(p.task.id), action: p.action, rule_key: p.rule.rule_key })) } };
    },
  }, { sb, env, now });
}

async function main() {
  const argv = process.argv.slice(2);
  const r = await runTodoistBrief({ sb: createMichaelClient(), argv });
  emit(r, { json: argv.includes('--json') });
  await gracefulExit(exitCodeFor(r));
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(`[michael:todoist-brief] fatal ${e && e.code ? e.code : ''}`); process.exitCode = 2; });
}
