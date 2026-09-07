// lib/michael/brief-model.mjs — the michael_brief_runs.data_json contract as pure functions.
// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-E (FR-1). Spec §6: schema 2, the two-zone shape.
//
// buildBriefData/validateBriefData/templateLede are pure (no I/O): brief-assemble.mjs (GHA) and
// brief-finalize.mjs (seat) both write through this one contract, so a corrupted or partial
// data_json is a refusal at this boundary, never a half-rendered brief downstream.
//
// v1 renders only enrichment.signals — oracle/watchLater/body/yesterday are present and null until
// v1.1 (spec §2, §6). frontPage.claudeCode is this pipeline's own health summary for today (feeder
// counts), not a v1.1-deferred field — it has real data from day one.
//
// dayClass here is brief-model's OWN simplified classification for the template lede only — it is
// NOT calendar-read.mjs's day-classification pipeline (Recovery/Interpersonal/Shallow/Deep with the
// coded-event override and the Tuesday-office rule, spec §5), which is out of this child's scope and
// lands in that feeder's own counts. A local heuristic is enough for a template sentence; the seat's
// brief-finalize.mjs is what replaces the lede with something better once enrichment lands.

export const SCHEMA_VERSION = 2;
export const ENRICHMENT_V1_NULL_KEYS = Object.freeze(['oracle', 'watchLater', 'body', 'yesterday']);
export const TOP_LEVEL_KEYS = Object.freeze(['schema', 'date', 'lede', 'headsUp', 'frontPage', 'enrichment', 'logs']);
export const FRONT_PAGE_KEYS = Object.freeze(['today', 'gmail', 'todoist', 'ehg', 'claudeCode']);
export const ENRICHMENT_KEYS = Object.freeze(['oracle', 'watchLater', 'body', 'yesterday', 'signals']);

/** Pure: brief-model's own simplified day class for the template lede (see file header). */
export function computeDayClass(calendarRows = []) {
  const rows = Array.isArray(calendarRows) ? calendarRows : [];
  if (rows.length === 0) return 'Recovery';
  if (rows.some((r) => r && r.coded_marker)) return 'Deep';
  if (rows.length >= 3) return 'Interpersonal';
  return 'Shallow';
}

/** Pure: the deterministic template lede — day class + counts, no model, no prose beyond this sentence. */
export function templateLede({ dayClass = 'Shallow', counts = {} } = {}) {
  const events = Number.isFinite(counts.eventCount) ? counts.eventCount : 0;
  const unclassified = Number.isFinite(counts.unclassifiedCount) ? counts.unclassifiedCount : 0;
  const todoistDue = Number.isFinite(counts.todoistDue) ? counts.todoistDue : 0;
  return `${dayClass} day. ${events} calendar event${events === 1 ? '' : 's'}, ${unclassified} unclassified gmail thread${unclassified === 1 ? '' : 's'}, ${todoistDue} todoist item${todoistDue === 1 ? '' : 's'} due.`;
}

/** Pure: today's front-page calendar summary from raw michael_calendar_day rows. */
function buildTodayBlock(calendarRows = []) {
  const rows = Array.isArray(calendarRows) ? calendarRows : [];
  return {
    event_count: rows.length,
    coded_count: rows.filter((r) => r && r.coded_marker).length,
    optional_open: rows.filter((r) => r && r.optional === true).length,
    overlap_count: new Set(rows.filter((r) => r && r.overlap_group).map((r) => r.overlap_group)).size,
  };
}

/** Pure: gmail block from raw michael_gmail_triage_items rows. Never carries thread bodies (spec §2). */
function buildGmailBlock(triageRows = []) {
  const rows = Array.isArray(triageRows) ? triageRows : [];
  const handled = rows.filter((r) => r && r.action_taken_at).length;
  const needsYou = rows.filter((r) => r && r.needs_you === true).map((r) => ({ thread_id: r.thread_id, reason: r.needs_you_reason || null }));
  const unclassifiedCount = rows.filter((r) => r && (r.class === null || r.class === undefined)).length;
  const call = unclassifiedCount > 0 ? `${unclassifiedCount} thread(s) unclassified — seat review needed` : 'inbox triaged';
  return { handled, needsYou, unclassifiedCount, call };
}

/** Pure: todoist block from raw michael_todoist_snapshot rows. */
function buildTodoistBlock(snapshotRows = []) {
  const rows = Array.isArray(snapshotRows) ? snapshotRows : [];
  const window = rows.filter((r) => r && r.effort_grade).map((r) => ({ task_id: r.task_id, effort_grade: r.effort_grade }));
  const calls = rows.filter((r) => r && !r.effort_grade).map((r) => r.task_id);
  const state = rows.length === 0 ? 'empty' : 'ok';
  const note = calls.length > 0 ? `${calls.length} item(s) ungraded — seat review needed` : 'all items graded';
  return { state, window, note, calls };
}

/** Pure: the EHG pointer block — count comes from todoist-brief's own counts.ehg_pointer for the date. */
function buildEhgBlock(feederRuns = []) {
  const runs = Array.isArray(feederRuns) ? feederRuns : [];
  const tb = runs.find((r) => r && r.feeder === 'todoist-brief');
  const handedCount = tb && tb.counts && Number.isFinite(tb.counts.ehg_pointer) ? tb.counts.ehg_pointer : 0;
  return { shown: handedCount > 0, pointer: 'EHG chairman project (Todoist)', handedCount };
}

/** Pure: this pipeline's own health summary for today — which required feeders landed, degraded, or are missing. */
function buildClaudeCodeBlock(feederRuns = [], required = ['tasks-classifier', 'calendar-read', 'gmail-triage', 'todoist-brief']) {
  const runs = Array.isArray(feederRuns) ? feederRuns : [];
  const byFeeder = new Map(runs.filter((r) => r && r.feeder).map((r) => [r.feeder, r.status]));
  const ok = required.filter((f) => byFeeder.get(f) === 'ok' || byFeeder.get(f) === 'imported');
  const degraded = required.filter((f) => byFeeder.get(f) === 'degraded');
  const missing = required.filter((f) => !byFeeder.has(f));
  return { feeders_ok: ok.length, feeders_degraded: degraded.length, feeders_missing: missing };
}

/** Pure: { <feeder>: run_id } from the latest attempt per feeder in feederRuns. */
function buildLogs(feederRuns = []) {
  const runs = Array.isArray(feederRuns) ? feederRuns : [];
  const best = new Map();
  for (const r of runs) {
    if (!r || !r.feeder || !r.id) continue;
    const cur = best.get(r.feeder);
    if (!cur || Number(r.attempt || 0) > Number(cur.attempt || 0)) best.set(r.feeder, r);
  }
  return Object.fromEntries([...best.entries()].map(([feeder, r]) => [feeder, r.id]));
}

/**
 * Pure: build the spec §6 schema-2 data_json from seeded rows. { etDate, calendarRows, triageRows,
 * snapshotRows, feederRuns, rules, now } — rules and now are accepted for forward-compatibility with
 * a future non-template lede; unused in v1.
 */
export function buildBriefData({ etDate, calendarRows = [], triageRows = [], snapshotRows = [], feederRuns = [] } = {}) {
  const today = buildTodayBlock(calendarRows);
  const gmail = buildGmailBlock(triageRows);
  const todoist = buildTodoistBlock(snapshotRows);
  const ehg = buildEhgBlock(feederRuns);
  const claudeCode = buildClaudeCodeBlock(feederRuns);
  const dayClass = computeDayClass(calendarRows);
  const lede = templateLede({ dayClass, counts: { eventCount: today.event_count, unclassifiedCount: gmail.unclassifiedCount, todoistDue: todoist.window.length + todoist.calls.length } });
  const headsUp = gmail.unclassifiedCount > 0 || todoist.calls.length > 0
    ? [gmail.unclassifiedCount > 0 ? `${gmail.unclassifiedCount} gmail thread(s) need classification` : null, todoist.calls.length > 0 ? `${todoist.calls.length} todoist item(s) ungraded` : null].filter(Boolean)
    : [];

  return {
    schema: SCHEMA_VERSION,
    date: etDate,
    lede,
    headsUp,
    frontPage: { today, gmail, todoist, ehg, claudeCode },
    enrichment: { oracle: null, watchLater: null, body: null, yesterday: null, signals: [] },
    logs: buildLogs(feederRuns),
  };
}

/**
 * Pure: refuses (never throws) a missing frontPage key, schema !== 2, or any unknown top-level key.
 * Returns { valid: true } or { valid: false, refusal, message }.
 */
export function validateBriefData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, refusal: 'SHAPE_INVALID', message: 'data_json must be an object' };
  }
  const unknown = Object.keys(data).filter((k) => !TOP_LEVEL_KEYS.includes(k));
  if (unknown.length) return { valid: false, refusal: 'UNKNOWN_TOP_LEVEL_KEY', message: `unknown top-level key(s): ${unknown.join(', ')}` };
  if (data.schema !== SCHEMA_VERSION) return { valid: false, refusal: 'SCHEMA_MISMATCH', message: `schema must be ${SCHEMA_VERSION}, got ${JSON.stringify(data.schema)}` };
  if (!data.frontPage || typeof data.frontPage !== 'object') return { valid: false, refusal: 'FRONTPAGE_MISSING', message: 'frontPage is required' };
  const missingFp = FRONT_PAGE_KEYS.filter((k) => !(k in data.frontPage));
  if (missingFp.length) return { valid: false, refusal: 'FRONTPAGE_KEY_MISSING', message: `frontPage missing key(s): ${missingFp.join(', ')}` };
  if (data.enrichment && typeof data.enrichment === 'object') {
    const missingEnrich = ENRICHMENT_KEYS.filter((k) => !(k in data.enrichment));
    if (missingEnrich.length) return { valid: false, refusal: 'ENRICHMENT_KEY_MISSING', message: `enrichment missing key(s): ${missingEnrich.join(', ')}` };
  }
  return { valid: true };
}
