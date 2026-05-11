/**
 * lib/eva-support/decision-log-store.js
 * SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-B / TR-2, FR-1, FR-4
 *
 * Writer + readers for eva_support_decision_log. Columns mirror
 * scripts/eva-support/decision-log-formatter.js REQUIRED_FIELDS verbatim;
 * the static regression-pin at tests/unit/eva-support/envelope-v1-schema-pin.test.js
 * enforces 1:1 column-to-field alignment.
 *
 * Read-after-write contract (FR-4): insertEntry SELECTs the inserted row by
 * (task_id, sequence) and asserts every envelope field landed. Inspired by
 * lib/db/writeback-verify.mjs (QF-20260509-650) but adapted for INSERT.
 *
 * Fail-soft posture (per unlock_gate_override constraint #1): callers may
 * configure { allowSoftFailures: true } to log instead of throw — but the
 * default is strict (throw) so DB-FIRST atomic dual-write contract holds.
 */

import { createClient } from '@supabase/supabase-js';
import { REQUIRED_FIELDS } from '../../scripts/eva-support/decision-log-formatter.js';

const TABLE = 'eva_support_decision_log';

function defaultClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('decision-log-store: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  }
  return createClient(url, key);
}

export class DecisionLogStoreError extends Error {
  constructor(message, { cause, code } = {}) {
    super(message);
    this.name = 'DecisionLogStoreError';
    if (cause) this.cause = cause;
    if (code) this.code = code;
  }
}

function isSchemaCacheMiss(error) {
  if (!error) return false;
  const code = error.code || '';
  const msg = error.message || '';
  return code === 'PGRST205' || code === '42P01' || /schema cache/i.test(msg) || /relation .* does not exist/i.test(msg);
}

function envelopeToRow(entry) {
  const row = {};
  for (const f of REQUIRED_FIELDS) {
    if (!(f in entry)) {
      throw new DecisionLogStoreError(`envelope missing required field "${f}"`, { code: 'ENVELOPE_INCOMPLETE' });
    }
    row[f] = entry[f];
  }
  return row;
}

/**
 * INSERT a decision-log envelope. Idempotent on (task_id, sequence).
 *
 * Returns { inserted, verified, row }:
 *   - inserted: true when a new row was created; false when (task_id, sequence) already existed
 *   - verified: true when read-after-write confirmed every REQUIRED_FIELDS column matches the envelope
 *   - row: the SELECTed row (may be null on fail-soft path)
 *
 * Throws DecisionLogStoreError on schema-cache miss (fail-loud per FR-4 / TEST-2)
 * or on a verified mismatch. Caller (slash command / sub-flow-base wrapper)
 * MUST NOT proceed with the Todoist comment write on throw.
 */
export async function insertEntry(entry, { client, allowSoftFailures = false } = {}) {
  if (!entry || typeof entry !== 'object') {
    throw new DecisionLogStoreError('entry must be an object', { code: 'BAD_INPUT' });
  }
  const c = client ?? defaultClient();
  const row = envelopeToRow(entry);

  // INSERT with ON CONFLICT-equivalent: PostgREST returns a 23505 (unique violation)
  // when (task_id, sequence) already exists. We treat that as inserted:false rather
  // than an error so callers can be idempotent.
  const { data: insertData, error: insertError } = await c
    .from(TABLE)
    .insert(row)
    .select(REQUIRED_FIELDS.join(','))
    .maybeSingle();

  if (insertError) {
    if (insertError.code === '23505') {
      // Unique violation — already exists. Read it back and return inserted:false.
      const { data: existing, error: readErr } = await c
        .from(TABLE)
        .select(REQUIRED_FIELDS.join(','))
        .eq('task_id', entry.task_id)
        .eq('sequence', entry.sequence)
        .maybeSingle();
      if (readErr) {
        throw new DecisionLogStoreError(`conflict on (task_id, sequence) but read-after-conflict failed: ${readErr.message}`, { cause: readErr, code: 'READ_AFTER_CONFLICT' });
      }
      return { inserted: false, verified: true, row: existing };
    }
    if (isSchemaCacheMiss(insertError)) {
      // Fail loud per FR-4 — the schema-cache miss class is the canonical migration-not-applied signal.
      throw new DecisionLogStoreError(`eva_support_decision_log not found in schema cache — migration probably not applied: ${insertError.message}`, { cause: insertError, code: 'SCHEMA_CACHE_MISS' });
    }
    if (allowSoftFailures) {
      // Fail-soft: caller chose to swallow non-fatal errors (used for Phase 1 backward compat during the gradual rollout).
      return { inserted: false, verified: false, row: null, error: insertError };
    }
    throw new DecisionLogStoreError(`insert failed: ${insertError.message}`, { cause: insertError, code: insertError.code || 'INSERT_FAILED' });
  }

  // Read-after-write verification: assert every REQUIRED_FIELDS column matches the envelope.
  const verified = verifyRowMatchesEntry(insertData, entry);
  if (!verified.ok) {
    if (allowSoftFailures) {
      return { inserted: true, verified: false, row: insertData, mismatch: verified.diffs };
    }
    throw new DecisionLogStoreError(`read-after-write mismatch: ${verified.diffs.map((d) => d.field).join(', ')}`, { code: 'WRITEBACK_MISMATCH' });
  }
  return { inserted: true, verified: true, row: insertData };
}

function verifyRowMatchesEntry(row, entry) {
  if (!row) return { ok: false, diffs: [{ field: '*', reason: 'row missing' }] };
  const diffs = [];
  for (const f of REQUIRED_FIELDS) {
    const r = row[f];
    const e = entry[f];
    if (f === 'references') {
      // Both should be arrays — compare via JSON.stringify (deep-equal for primitive-array contents).
      if (JSON.stringify(r ?? []) !== JSON.stringify(e ?? [])) diffs.push({ field: f, reason: 'array mismatch' });
      continue;
    }
    if (f === 'timestamp') {
      // Postgres normalizes timestamptz; compare via Date.getTime for parity.
      if (new Date(r).getTime() !== new Date(e).getTime()) diffs.push({ field: f, reason: 'timestamp mismatch' });
      continue;
    }
    if (r !== e && !(r == null && e == null)) {
      diffs.push({ field: f, reason: `expected ${JSON.stringify(e)}, got ${JSON.stringify(r)}` });
    }
  }
  return { ok: diffs.length === 0, diffs };
}

/**
 * Fetch recent decision-log entries across all tasks.
 * @param {object} opts
 * @param {Date|string} [opts.since] - oldest timestamp to include (default: 7 days ago)
 * @param {number} [opts.limit] - max rows (default 10)
 * @param {object} [opts.client] - supabase client (default: env-derived)
 */
export async function recentEntries({ since, limit = 10, client } = {}) {
  const c = client ?? defaultClient();
  const sinceIso = (since ? new Date(since) : new Date(Date.now() - 7 * 24 * 3600 * 1000)).toISOString();
  const { data, error } = await c
    .from(TABLE)
    .select(REQUIRED_FIELDS.join(','))
    .gte('timestamp', sinceIso)
    .order('timestamp', { ascending: false })
    .limit(limit);
  if (error) {
    if (isSchemaCacheMiss(error)) {
      // Fail-soft for readers — empty list when table not yet present.
      return [];
    }
    throw new DecisionLogStoreError(`recentEntries read failed: ${error.message}`, { cause: error, code: error.code || 'READ_FAILED' });
  }
  return data || [];
}

/**
 * Fetch all decision-log entries for a specific task_id, ordered by sequence ASC.
 */
export async function entriesForTask(taskId, { client } = {}) {
  if (!taskId) throw new DecisionLogStoreError('taskId required', { code: 'BAD_INPUT' });
  const c = client ?? defaultClient();
  const { data, error } = await c
    .from(TABLE)
    .select(REQUIRED_FIELDS.join(','))
    .eq('task_id', taskId)
    .order('sequence', { ascending: true });
  if (error) {
    if (isSchemaCacheMiss(error)) return [];
    throw new DecisionLogStoreError(`entriesForTask read failed: ${error.message}`, { cause: error, code: error.code || 'READ_FAILED' });
  }
  return data || [];
}

export default { insertEntry, recentEntries, entriesForTask, DecisionLogStoreError };
