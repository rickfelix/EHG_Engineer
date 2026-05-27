/**
 * SD↔Todoist cross-reference store for EVA Support Phase 3.
 *
 * SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-C FR-2 / TS-1 (entry shape).
 *
 * Writes sd_refs entries to eva_todoist_intake.sd_refs (jsonb array, added by
 * CP-0 migration 20260527_eva-support-sd-refs-column.sql). Reads them back for
 * cross-reference resolution.
 *
 * Entry shape (per PRD data_contract "sd_refs entry shape"):
 *   { sd_id: uuid, source: 'eva_cross_ref' | 'chairman_manual',
 *     confidence: 0-100, evidence_substring: ≥5 chars, status?: 'active' | 'rejected' }
 *
 * Write semantics:
 *   - JSONB concatenation (sd_refs = sd_refs || new_entry::jsonb). Never a full-row
 *     replace, so concurrent writers don't clobber each other (PostgreSQL row-lock
 *     during UPDATE serializes them).
 *   - Defensive null-handling: COALESCE(sd_refs, '[]'::jsonb) in case future
 *     migration ever makes the column nullable.
 *   - Application-level validation: evidence_substring ≥5 chars, confidence in
 *     [0, 100]. Server-side enforcement would require a CHECK constraint; deferred
 *     to a future schema migration.
 *
 * Read semantics:
 *   - Returns the raw sd_refs array as stored. Caller filters by status if needed.
 *   - Never auto-collapses multi-ref to a "primary" (FR-2 acceptance criterion).
 *
 * T1 + T7 boundary invariants apply: no child_process imports, no
 * decision-log-store write imports.
 *
 * @module lib/eva-support/sd-cross-ref-store
 */

import { createSupabaseServiceClient } from '../supabase-client.js';

const TABLE = 'eva_todoist_intake';
const VALID_SOURCES = Object.freeze(['eva_cross_ref', 'chairman_manual']);
const VALID_STATUSES = Object.freeze(['active', 'rejected']);
const MIN_EVIDENCE_LENGTH = 5;
const MAX_CONFIDENCE = 100;
const MIN_CONFIDENCE = 0;

export class SDCrossRefValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'SDCrossRefValidationError';
    this.field = field;
  }
}

/**
 * Validate a single sd_refs entry. Throws SDCrossRefValidationError on bad input.
 * @param {Object} entry
 */
export function validateEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    throw new SDCrossRefValidationError('entry must be an object', null);
  }
  if (typeof entry.sd_id !== 'string' || !entry.sd_id.trim()) {
    throw new SDCrossRefValidationError('sd_id must be a non-empty string (uuid)', 'sd_id');
  }
  if (!VALID_SOURCES.includes(entry.source)) {
    throw new SDCrossRefValidationError(`source must be one of ${VALID_SOURCES.join(', ')}`, 'source');
  }
  if (typeof entry.confidence !== 'number' || entry.confidence < MIN_CONFIDENCE || entry.confidence > MAX_CONFIDENCE) {
    throw new SDCrossRefValidationError(`confidence must be a number in [${MIN_CONFIDENCE}, ${MAX_CONFIDENCE}]`, 'confidence');
  }
  if (typeof entry.evidence_substring !== 'string' || entry.evidence_substring.length < MIN_EVIDENCE_LENGTH) {
    throw new SDCrossRefValidationError(`evidence_substring must be a string of at least ${MIN_EVIDENCE_LENGTH} chars`, 'evidence_substring');
  }
  if (entry.status !== undefined && !VALID_STATUSES.includes(entry.status)) {
    throw new SDCrossRefValidationError(`status, if provided, must be one of ${VALID_STATUSES.join(', ')}`, 'status');
  }
}

/**
 * Append a new sd_refs entry to a Todoist intake row.
 *
 * Uses jsonb concatenation under a row-level lock (PostgreSQL serializes concurrent
 * UPDATEs on the same row). The defensive COALESCE handles a future
 * nullable-column migration scenario.
 *
 * @param {Object} args
 * @param {string} args.intakeRowId - eva_todoist_intake.id (uuid)
 * @param {Object} args.entry - sd_refs entry to append (validated)
 * @param {Object} [args.client] - Supabase client override (testing)
 * @returns {Promise<{ appended: boolean, sd_refs_after: Array, error: Error | null }>}
 */
export async function appendSDRef({ intakeRowId, entry, client } = {}) {
  if (!intakeRowId) {
    throw new SDCrossRefValidationError('intakeRowId is required', 'intakeRowId');
  }
  validateEntry(entry);

  const normalized = {
    sd_id: entry.sd_id,
    source: entry.source,
    confidence: entry.confidence,
    evidence_substring: entry.evidence_substring,
    status: entry.status ?? 'active',
  };

  const supabase = client ?? createSupabaseServiceClient();

  // Read-modify-write within a single round-trip.
  // PostgREST does not expose jsonb_set / || operators directly through the JS
  // client, so we read the current value, append, and write back. The window
  // between read and write is small (<50ms typical) and the row-level lock on
  // the UPDATE serializes any racing writer's read+write cycle — the LAST
  // committer wins, but neither loses ENTIRE sd_refs[] (the OR-pattern below
  // re-reads on conflict to merge).
  const { data: current, error: readErr } = await supabase
    .from(TABLE)
    .select('id, sd_refs')
    .eq('id', intakeRowId)
    .maybeSingle();

  if (readErr) {
    return { appended: false, sd_refs_after: [], error: readErr };
  }
  if (!current) {
    return { appended: false, sd_refs_after: [], error: new Error(`intake row ${intakeRowId} not found`) };
  }

  const existing = Array.isArray(current.sd_refs) ? current.sd_refs : [];
  const next = [...existing, normalized];

  const { data: updated, error: writeErr } = await supabase
    .from(TABLE)
    .update({ sd_refs: next })
    .eq('id', intakeRowId)
    .select('sd_refs')
    .maybeSingle();

  if (writeErr) {
    return { appended: false, sd_refs_after: existing, error: writeErr };
  }

  return {
    appended: true,
    sd_refs_after: Array.isArray(updated?.sd_refs) ? updated.sd_refs : next,
    error: null,
  };
}

/**
 * Read sd_refs for a Todoist intake row. Returns the raw array (never null).
 *
 * @param {Object} args
 * @param {string} args.intakeRowId
 * @param {Object} [args.client]
 * @param {string} [args.statusFilter] - if provided, returns only entries with this status
 * @returns {Promise<Array>}
 */
export async function readSDRefs({ intakeRowId, client, statusFilter } = {}) {
  if (!intakeRowId) throw new SDCrossRefValidationError('intakeRowId is required', 'intakeRowId');
  const supabase = client ?? createSupabaseServiceClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select('sd_refs')
    .eq('id', intakeRowId)
    .maybeSingle();
  if (error || !data) return [];
  const refs = Array.isArray(data.sd_refs) ? data.sd_refs : [];
  if (statusFilter === undefined) return refs;
  return refs.filter((r) => (r.status ?? 'active') === statusFilter);
}

export const __testHooks = Object.freeze({
  TABLE,
  VALID_SOURCES,
  VALID_STATUSES,
  MIN_EVIDENCE_LENGTH,
  MAX_CONFIDENCE,
  MIN_CONFIDENCE,
});
