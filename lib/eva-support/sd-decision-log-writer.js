/**
 * Minimal Phase 3 audit-row writer for eva_support_decision_log.
 *
 * SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-C — used by:
 *   - lib/eva-support/sd-reader.js (CP-2)        — writes kind=reader_disabled when flag OFF
 *   - lib/eva-support/sd-recommendation-emitter.js (CP-5, pending) — writes kind=sd_recommendation
 *
 * Why a thin wrapper instead of reusing lib/eva-support/decision-log-store.js insertEntry:
 *   The Phase 2 insertEntry is bound to REQUIRED_FIELDS (envelope schema for chairman-
 *   conversational rows: task_id, sequence, flow, model, tokens_in/out, eva_reply_summary,
 *   operator_input_summary). Phase 3 audit rows aren't chairman-conversational — they are
 *   system events. Forcing them through the chairman envelope would either contort the
 *   envelope schema or require expanding REQUIRED_FIELDS (breaking the Phase 2 contract).
 *   This writer satisfies all NOT NULL constraints (incl. the schema_version='1.0' pin)
 *   with sensible SYSTEM defaults and lets the caller specify decision_kind + metadata.
 *
 * Constraints satisfied (per CP-0 schema introspection):
 *   - schema_version = '1.0' (pinned by CHECK)
 *   - task_id = 'SYSTEM:eva-support-sd-reader' or caller-provided (text, PK part 1)
 *   - sequence > 0 (defaults to monotonic per-task; caller can override)
 *   - flow = 'system_audit' (no CHECK on flow values)
 *   - eva_reply_summary, operator_input_summary ≤ 500 chars (CHECK)
 *   - model = 'n/a', tokens_in = 0, tokens_out = 0
 *   - decision_kind = caller-provided (CHECK enum-validated)
 *   - metadata = caller-provided jsonb (defaults to {})
 *
 * Idempotency: writes use ON CONFLICT-equivalent (PostgREST 23505); duplicate
 * (task_id, sequence) returns inserted:false without raising.
 *
 * @module lib/eva-support/sd-decision-log-writer
 */

import { createSupabaseServiceClient } from '../supabase-client.js';

const TABLE = 'eva_support_decision_log';
const SCHEMA_VERSION = '1.0';
const SYSTEM_TASK_PREFIX = 'SYSTEM:';

/**
 * Write a Phase 3 audit row.
 *
 * @param {Object} args
 * @param {string} args.decision_kind - one of: sd_recommendation, reader_disabled, reader_error, render_crashed, skipped_duplicate
 * @param {Object} [args.metadata={}] - JSONB payload specific to the decision_kind
 * @param {string} args.eva_invocation_id - unique id for this EVA invocation (becomes task_id suffix)
 * @param {number} [args.sequence=1] - sequence within a task; defaults to 1 (audit rows are typically single-row per invocation)
 * @param {string} [args.summary='auto-generated audit row'] - short description for eva_reply_summary
 * @param {string} [args.task_id] - explicit task_id override (rarely needed; default: SYSTEM:eva-support-sd-reader:${eva_invocation_id})
 * @param {Object} [args.client] - Supabase client (defaults to service-role client)
 * @returns {Promise<{ inserted: boolean, row: Object | null, error: Error | null }>}
 */
export async function writeAuditRow({
  decision_kind,
  metadata = {},
  eva_invocation_id,
  sequence = 1,
  summary = 'auto-generated audit row',
  task_id,
  client,
} = {}) {
  if (!decision_kind) {
    throw new Error('sd-decision-log-writer.writeAuditRow: decision_kind is required');
  }
  if (!eva_invocation_id && !task_id) {
    throw new Error('sd-decision-log-writer.writeAuditRow: eva_invocation_id or explicit task_id required');
  }

  const supabase = client ?? createSupabaseServiceClient();
  const effectiveTaskId = task_id ?? `${SYSTEM_TASK_PREFIX}eva-support-sd-reader:${eva_invocation_id}`;
  const truncatedSummary = String(summary).slice(0, 499);
  const operatorSummary = String(`system invocation ${eva_invocation_id ?? '<unknown>'}`).slice(0, 499);

  const row = {
    schema_version: SCHEMA_VERSION,
    task_id: effectiveTaskId,
    sequence,
    timestamp: new Date().toISOString(),
    flow: 'system_audit',
    eva_reply_summary: truncatedSummary,
    operator_input_summary: operatorSummary,
    override_reason: null,
    model: 'n/a',
    tokens_in: 0,
    tokens_out: 0,
    decision_kind,
    metadata,
    // references and created_at use DB defaults
  };

  const { data, error } = await supabase
    .from(TABLE)
    .insert(row)
    .select('task_id,sequence,decision_kind,metadata,timestamp')
    .maybeSingle();

  if (error) {
    // PK conflict (23505) → idempotent return; caller retries with new task_id if true uniqueness desired.
    if (error.code === '23505') {
      return { inserted: false, row: null, error };
    }
    return { inserted: false, row: null, error };
  }

  return { inserted: true, row: data, error: null };
}

/**
 * Update metadata on an existing audit row identified by (task_id, sequence).
 *
 * Used by the recommendation emitter to mark a row's outcome (e.g., when a
 * render crash occurs after the row was already written with outcome='approved',
 * the catch handler updates outcome to 'render_crashed' + error_message). The
 * PRD FR-5 acceptance criterion mandates that the audit row reflect the actual
 * final outcome.
 *
 * Merge semantics: the caller-supplied metadata object is MERGED with the
 * existing row's metadata (top-level keys overwritten; nested objects NOT
 * deep-merged — caller responsible for providing the full nested value).
 *
 * @param {Object} args
 * @param {string} args.task_id
 * @param {number} args.sequence
 * @param {Object} args.metadataPatch - partial metadata to merge
 * @param {Object} [args.client]
 * @returns {Promise<{ updated: boolean, row: Object | null, error: Error | null }>}
 */
export async function updateAuditRowMetadata({ task_id, sequence, metadataPatch, client } = {}) {
  if (!task_id || sequence == null) {
    throw new Error('updateAuditRowMetadata: task_id + sequence required');
  }
  if (!metadataPatch || typeof metadataPatch !== 'object') {
    throw new Error('updateAuditRowMetadata: metadataPatch object required');
  }
  const supabase = client ?? createSupabaseServiceClient();

  // Read current metadata (since PostgREST does not expose jsonb || through JS client).
  const { data: existing, error: readErr } = await supabase
    .from(TABLE)
    .select('metadata')
    .eq('task_id', task_id)
    .eq('sequence', sequence)
    .maybeSingle();

  if (readErr || !existing) {
    return { updated: false, row: null, error: readErr ?? new Error('audit row not found for update') };
  }

  const merged = { ...(existing.metadata ?? {}), ...metadataPatch };

  const { data: updated, error: writeErr } = await supabase
    .from(TABLE)
    .update({ metadata: merged })
    .eq('task_id', task_id)
    .eq('sequence', sequence)
    .select('task_id,sequence,decision_kind,metadata')
    .maybeSingle();

  if (writeErr) return { updated: false, row: null, error: writeErr };
  return { updated: true, row: updated, error: null };
}

export const __testHooks = Object.freeze({ TABLE, SCHEMA_VERSION, SYSTEM_TASK_PREFIX });
