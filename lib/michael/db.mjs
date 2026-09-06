// lib/michael/db.mjs — the one seam every Michael verb reads and writes michael_* through.
// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-B (FR-2, TR-1).
//
// WHY: the migration is chairman-applied (Tier 3), so every script must be INERT until it lands:
// a missing relation is "no source", never a failure. The three signatures of a missing relation
// (42P01 from Postgres, PGRST205 from PostgREST, COUNT_UNMEASURABLE thrown by the canonical client
// factory lib/supabase-client-schema-drift.cjs) are read the same way here as in
// scripts/michael-quiet-tick.mjs. Reads return { rows: [], tables_absent: true }; writes return a
// named refusal instead of throwing, so a verb exits 2 with a reason the seat can read.
//
// Every read is BOUNDED (limit(N < 1000) or count:'exact') — count-truncation-diff-lint blocks on
// new unbounded selects, and a silently truncated ledger would compute a wrong streak.
import { createHash } from 'node:crypto';
import { createSupabaseServiceClient } from '../supabase-client.js';
import { etDateStr } from '../time/chairman-et-wall-clock.js';

export const READ_LIMIT = 500;
export const TABLES_ABSENT = 'TABLES_ABSENT';

const MISSING_RELATION = new Set(['42P01', 'PGRST205', 'COUNT_UNMEASURABLE']);

/** Pure: does an error (returned or thrown) mean "the relation does not exist" — the migration is unapplied? */
export function isMissingRelation(err) {
  if (!err) return false;
  if (MISSING_RELATION.has(err.code)) return true;
  return /count unmeasurable|relation .* does not exist|schema drift detected|could not find the table/i.test(String(err.message || ''));
}

/** Service-role client (the only role that can read michael_*; RLS revokes anon/authenticated). */
export function createMichaelClient() {
  return createSupabaseServiceClient();
}

/** Today's ET calendar date (the et_date natural key of the daily tables). */
export function todayEt(now = new Date()) {
  return etDateStr(now);
}

/**
 * Bounded read (limit 500 = READ_LIMIT). `build` receives the base query and returns the filtered
 * query. Returns { rows, tables_absent, error? }; never throws.
 */
export async function readRows(sb, table, build = (q) => q, { select = '*' } = {}) {
  try {
    // Literal bound on purpose: count-truncation-diff-lint reads the literal, and 500 rows covers
    // every daily table for well over a year of ET days; a wider read is a paginated read, not a cap.
    const q = build(sb.from(table).select(select).limit(500));
    const { data, error } = await q;
    if (error) {
      if (isMissingRelation(error)) return { rows: [], tables_absent: true };
      return { rows: [], tables_absent: false, error: `${table}: ${error.message || error.code || 'query failed'}` };
    }
    return { rows: Array.isArray(data) ? data : [], tables_absent: false };
  } catch (e) {
    if (isMissingRelation(e)) return { rows: [], tables_absent: true };
    return { rows: [], tables_absent: false, error: `${table}: ${e && e.message ? e.message : String(e)}` };
  }
}

/**
 * Write through a query builder: `op` receives sb.from(table) and returns the mutation query
 * (insert/update/upsert/delete, with .select() if rows are wanted back). Returns
 * { ok, data, tables_absent, refusal?, error? }; never throws.
 */
export async function writeRows(sb, table, op) {
  try {
    const { data, error } = await op(sb.from(table));
    if (error) {
      if (isMissingRelation(error)) return { ok: false, data: null, tables_absent: true, refusal: TABLES_ABSENT, error: `${table}: relation absent (migration unapplied)` };
      return { ok: false, data: null, tables_absent: false, refusal: 'WRITE_FAILED', error: `${table}: ${error.message || error.code || 'write failed'}` };
    }
    return { ok: true, data: data ?? null, tables_absent: false };
  } catch (e) {
    if (isMissingRelation(e)) return { ok: false, data: null, tables_absent: true, refusal: TABLES_ABSENT, error: `${table}: relation absent (migration unapplied)` };
    return { ok: false, data: null, tables_absent: false, refusal: 'WRITE_FAILED', error: `${table}: ${e && e.message ? e.message : String(e)}` };
  }
}

/** Canonical JSON: sorted keys at every level, no whitespace — the subject of every hash the verbs bind. */
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
}

export function sha256Hex(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex');
}

/**
 * Minimal argv parser for the verbs: --flag, --key value, --key=value; repeated keys keep the last.
 * Positional args land in `_`.
 */
export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const eq = a.indexOf('=');
    if (eq !== -1) { out[a.slice(2, eq)] = a.slice(eq + 1); continue; }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) { out[key] = next; i++; } else { out[key] = true; }
  }
  return out;
}

/** The refusal envelope every verb prints (stdout, one JSON object) before exiting 2. */
export function refusal(code, message, extra = {}) {
  return { ok: false, refusal: code, message, ...extra };
}

/** Print a result object as JSON (the --json contract) or as a short line. */
export function emit(result, { json = false } = {}) {
  if (json) { console.log(JSON.stringify(result)); return; }
  if (result && result.ok === false) console.log(`REFUSED ${result.refusal}: ${result.message}`);
  else console.log(JSON.stringify(result));
}
