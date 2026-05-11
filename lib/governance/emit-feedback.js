/**
 * Structured feedback row emitter — single canonical write path.
 *
 * @canonical-writer-for: feedback
 *
 * SD-LEO-INFRA-FAIL-CLOSED-VENTURE-001-B / PA-5 (database-agent C-DB-3 + security-agent C-SEC-3B).
 *
 * Two callers:
 *   - scripts/log-harness-bug.js (CLI wrapper)
 *   - lib/eva/lifecycle-sd-bridge.js::filterLayersByCapability (PA-5 warning emission)
 *
 * Why a shared lib (not duplication or a new emitter):
 *   The capability-suppression warning emission must use the SAME dedup-hash
 *   pattern (sha256 of date::symptom::source_location) as log-harness-bug.js
 *   so reaped backlog items stay deduped across both surfaces. Per
 *   database-agent C-DB-3.
 *
 * @module lib/governance/emit-feedback
 */

import crypto from 'node:crypto';
import { writeAuditEvent } from '../security/audit-events-emitter.js';

/**
 * SD-LEO-INFRA-WIRE-FEEDBACK-TABLE-001 FR-2.
 *
 * Best-effort enrichment: when caller did NOT set metadata.deferred_from_sd_key,
 * look up the current session's claimed SD via v_active_sessions and copy its
 * sd_key into the metadata bag. Forward-only — never backfills historical rows.
 *
 * Resolution rules (per LEAD validation + risk-agent 81ac5e04):
 *   - Caller-supplied metadata.deferred_from_sd_key ALWAYS wins.
 *   - Use v_active_sessions filtered by env CLAUDE_SESSION_ID + computed_status='active'.
 *   - Exactly 1 row with non-null sd_key → fill.
 *   - 0 rows OR >1 rows OR null sd_key → leave UNSET (with single console.warn for >1).
 *   - DB error → leave UNSET (single console.warn).
 *   - Env opt-out: AUTO_FILL_DEFERRED_FROM_SD_KEY=0 → no-op.
 *
 * MUST NOT throw — emitFeedback callers expect this to be best-effort.
 *
 * @param {Object} supabase
 * @returns {Promise<string|null>} The auto-filled sd_key, or null if not set
 * @private
 */
async function _autoFillDeferredFromSdKey(supabase) {
  if (process.env.AUTO_FILL_DEFERRED_FROM_SD_KEY === '0') return null;
  const sessionId = process.env.CLAUDE_SESSION_ID;
  if (!sessionId) return null;
  try {
    const { data, error } = await supabase
      .from('v_active_sessions')
      .select('sd_key')
      .eq('session_id', sessionId)
      .eq('computed_status', 'active')
      .not('sd_key', 'is', null);
    if (error) {
      console.warn(`[emit-feedback] auto-fill skipped: ${error.message}`);
      return null;
    }
    if (!data || data.length === 0) return null;
    if (data.length > 1) {
      console.warn(`[emit-feedback] auto-fill skipped: ${data.length} active claims for current session`);
      return null;
    }
    const sdKey = data[0]?.sd_key;
    return typeof sdKey === 'string' && sdKey.length > 0 ? sdKey : null;
  } catch (err) {
    console.warn(`[emit-feedback] auto-fill skipped: ${err?.message || err}`);
    return null;
  }
}

/**
 * SD-FDBK-INFRA-MIGRATE-EMIT-FEEDBACK-001 / TR-4: priority enum allowlist mirrors
 * the feedback.priority CHECK constraint. App-level validation gives clear fail-loud
 * diagnostics ('INVALID_PRIORITY:<value>') instead of opaque PostgrestError 22023.
 */
export const ALLOWED_PRIORITIES = Object.freeze(new Set(['critical', 'high', 'medium', 'low']));

/**
 * SD-FDBK-INFRA-MIGRATE-EMIT-FEEDBACK-001 / TR-2 (dedup_hash composition guard):
 * source_id, priority, priority_reasoning are pass-through only and MUST NOT join
 * the dedup_hash composition. Hash stays sha256(today::description::dedup_key).
 *
 * @private
 */
function _validatePriority(priority) {
  if (priority === undefined || priority === null) return;
  if (!ALLOWED_PRIORITIES.has(priority)) {
    throw new Error(`emitFeedback: INVALID_PRIORITY:${priority} (allowed: ${[...ALLOWED_PRIORITIES].join(',')})`);
  }
}

/**
 * Build the row object for INSERT. Extracted so emitFeedback (singleton) and
 * emitFeedbackBatch (bulk) share identical column-shaping logic — preventing
 * divergence between singleton and batch INSERT shapes.
 *
 * @private
 */
function _buildRowObject(args, enrichedMetadata, dedupHash) {
  const { type, category, severity, source_application, source_type, sd_id,
    title, description, source_id, priority, priority_reasoning } = args;
  const cappedTitle = title.length > 120 ? `${title.slice(0, 117)}...` : title;
  const row = {
    type,
    category,
    status: 'new',
    severity,
    source_application,
    source_type,
    title: cappedTitle,
    description,
    sd_id, // canonical column name per database-agent C-DB-2 (NOT related_sd_id)
    metadata: {
      ...enrichedMetadata,
      dedup_hash: dedupHash,
      emitted_at: new Date().toISOString(),
    },
  };
  // SD-FDBK-INFRA-MIGRATE-EMIT-FEEDBACK-001 FR-1: optional pass-through columns.
  // Only set when caller provided them — preserves additive backward-compat.
  if (source_id !== undefined && source_id !== null) row.source_id = source_id;
  if (priority !== undefined && priority !== null) row.priority = priority;
  if (priority_reasoning !== undefined && priority_reasoning !== null) row.priority_reasoning = priority_reasoning;
  return row;
}

/**
 * Insert a structured feedback row — idempotent via SHA-256 dedup_hash.
 *
 * STRUCTURED COLUMNS ONLY — never interpolate user-supplied SD title or
 * venture name into the title/description fields. Pass them in metadata.
 * Per security-agent C-SEC-3B (log-injection defense).
 *
 * @param {Object} args
 * @param {Object} args.supabase - Supabase client
 * @param {string} args.title - Short title (will be capped at 120 chars)
 * @param {string} args.description - Full description
 * @param {string} [args.type='enhancement'] - feedback.type enum value
 * @param {string} [args.category='harness_backlog'] - feedback.category
 * @param {string} [args.severity='medium'] - 'critical' | 'high' | 'medium' | 'low'
 * @param {string} [args.source_application='EHG_Engineer']
 * @param {string} [args.source_type='manual_feedback']
 * @param {string|null} [args.sd_id] - feedback.sd_id (UUID, NOT related_sd_id per C-DB-2)
 * @param {string|null} [args.source_id] - SD-FDBK-INFRA-MIGRATE-EMIT-FEEDBACK-001 FR-1: source-tracking id (UAT scenario id, retro id, etc). Pass-through only — does NOT join dedup_hash.
 * @param {string|null} [args.priority] - SD-FDBK-INFRA-MIGRATE-EMIT-FEEDBACK-001 FR-1: 'critical' | 'high' | 'medium' | 'low'. Validated app-level (TR-4). Pass-through only.
 * @param {string|null} [args.priority_reasoning] - SD-FDBK-INFRA-MIGRATE-EMIT-FEEDBACK-001 FR-1: human-readable rationale for priority. Pass-through only.
 * @param {Object} [args.metadata={}] - Caller-supplied structured metadata
 * @param {string|null} [args.dedup_key] - Dedup component (file path, layer name, etc.)
 * @returns {Promise<{ id: string|null, deduped: boolean }>} insert id, or deduped=true if existing row found
 */
export async function emitFeedback({
  supabase,
  title,
  description,
  type = 'enhancement',
  category = 'harness_backlog',
  severity = 'medium',
  source_application = 'EHG_Engineer',
  source_type = 'manual_feedback',
  sd_id = null,
  source_id = null,
  priority = null,
  priority_reasoning = null,
  metadata = {},
  dedup_key = null,
} = {}) {
  if (!supabase) throw new Error('emitFeedback: supabase client is required');
  if (!title) throw new Error('emitFeedback: title is required');
  if (!description) throw new Error('emitFeedback: description is required');
  _validatePriority(priority);

  // SD-LEO-INFRA-WIRE-FEEDBACK-TABLE-001 FR-2: best-effort auto-fill
  // metadata.deferred_from_sd_key from active claim when caller did not set it.
  // Caller-supplied value ALWAYS wins; lookup is fail-soft.
  const enrichedMetadata = { ...metadata };
  if (!enrichedMetadata.deferred_from_sd_key) {
    const autoSdKey = await _autoFillDeferredFromSdKey(supabase);
    if (autoSdKey) enrichedMetadata.deferred_from_sd_key = autoSdKey;
  }

  const today = new Date().toISOString().slice(0, 10);
  // SD-FDBK-INFRA-MIGRATE-EMIT-FEEDBACK-001 TR-2: dedup_hash composition is a
  // SECURITY-CRITICAL CONTRACT — source_id, priority, priority_reasoning are
  // pass-through and MUST NOT join the hash. Test TS-2 pins this invariant.
  const dedupHash = crypto
    .createHash('sha256')
    .update(`${today}::${description}::${dedup_key || ''}`)
    .digest('hex');

  // Dedup check: same content + same date + same dedup_key → no insert
  const { data: existing } = await supabase
    .from('feedback')
    .select('id')
    .eq('category', category)
    .eq('metadata->>dedup_hash', dedupHash)
    .maybeSingle();

  if (existing) {
    return { id: existing.id, deduped: true };
  }

  const row = _buildRowObject(
    { type, category, severity, source_application, source_type, sd_id,
      title, description, source_id, priority, priority_reasoning },
    enrichedMetadata,
    dedupHash,
  );

  const { data, error } = await supabase
    .from('feedback')
    .insert(row)
    .select('id')
    .single();

  if (error) {
    throw new Error(`emitFeedback: INSERT failed: ${error.message}`);
  }

  await _maybePa5DualWrite({
    supabase, metadata, dedup_key, severity, sd_id, description, feedbackId: data.id,
  });

  return { id: data.id, deduped: false };
}

/**
 * SD-LEO-INFRA-DEDICATED-SECURITY-AUDIT-001 PA-5 dual-write: when feature flag
 * enabled and this is a capability-suppression event, ALSO write to
 * security_audit_events. Failures here do NOT block the feedback write
 * (already returned id); they're logged via stderr for the integrity auditor.
 *
 * Extracted from emitFeedback (SD-FDBK-INFRA-MIGRATE-EMIT-FEEDBACK-001 FR-2)
 * so emitFeedbackBatch can reuse identical PA-5 semantics per-item.
 *
 * @private
 */
async function _maybePa5DualWrite({ supabase, metadata, dedup_key, severity, sd_id, description, feedbackId }) {
  const dualWriteEnabled = process.env.SECURITY_AUDIT_DUAL_WRITE_PA5 === 'true';
  const isCapSuppression = metadata?.event_type === 'capability_suppression' || dedup_key?.startsWith('capability-suppression');
  if (!dualWriteEnabled || !isCapSuppression) return;
  try {
    await writeAuditEvent({
      supabase,
      event_type: 'capability_suppression',
      severity: severity === 'critical' ? 'critical' : 'warning',
      source_agent: 'lib/governance/emit-feedback',
      source_module_path: 'lib/governance/emit-feedback.js',
      sd_id,
      event_payload: {
        feedback_id: feedbackId,
        dedup_key,
        suppressed_layers: metadata?.suppressed_layers || [],
        suppression_reason: metadata?.suppression_reason || description?.slice(0, 200) || 'unspecified',
      },
      pat_pattern_id: metadata?.pat_pattern_id || null,
    });
  } catch (auditErr) {
    console.error(`[emit-feedback] PA-5 dual-write to security_audit_events failed (non-blocking): ${auditErr.message}`);
  }
}

/**
 * SD-FDBK-INFRA-MIGRATE-EMIT-FEEDBACK-001 FR-2: bulk INSERT variant.
 *
 * Per-item dedup pre-check + single .insert(records) DB call (TR-3 perf).
 * PA-5 dual-write fires per qualifying item AFTER the batch returns; failure
 * of one PA-5 dual-write does NOT abort remaining items (matches singleton).
 *
 * Items array may be empty (returns clean shape without an INSERT call).
 * Each item validated by emitFeedback contract: title + description required;
 * priority validated against allowlist when present.
 *
 * @param {Object} args
 * @param {Object} args.supabase - Supabase client
 * @param {Array<Object>} args.items - Per-item args (same shape as emitFeedback args, minus supabase)
 * @param {Object} [args.shared={}] - Defaults applied to each item; per-item field wins on conflict
 * @returns {Promise<{ inserted: Array<string>, skipped: number, deduped: Array<string> }>}
 *   inserted = newly created row ids; skipped = invalid/excluded items count;
 *   deduped = existing row ids matched by dedup_hash
 */
export async function emitFeedbackBatch({ supabase, items = [], shared = {} } = {}) {
  if (!supabase) throw new Error('emitFeedbackBatch: supabase client is required');
  if (!Array.isArray(items)) throw new Error('emitFeedbackBatch: items must be an array');
  if (items.length === 0) return { inserted: [], skipped: 0, deduped: [] };

  // Resolve auto-fill once (per batch, not per item) — cheap + matches singleton semantics.
  const sharedAutoSdKey = (!shared?.metadata?.deferred_from_sd_key && items.some(i => !i?.metadata?.deferred_from_sd_key))
    ? await _autoFillDeferredFromSdKey(supabase)
    : null;

  const today = new Date().toISOString().slice(0, 10);
  const toInsert = [];
  const dualWriteContexts = []; // captured per-item for PA-5 loop after batch
  const deduped = [];
  let skipped = 0;

  for (let idx = 0; idx < items.length; idx++) {
    const raw = items[idx] ?? {};
    // shared fields merge under per-item (per-item wins on conflict per TR-3 spec)
    const item = { ...shared, ...raw, metadata: { ...(shared.metadata || {}), ...(raw.metadata || {}) } };

    if (!item.title || !item.description) {
      throw new Error(`emitFeedbackBatch: BATCH_ITEM_INVALID:${idx} (title and description required)`);
    }
    _validatePriority(item.priority);

    const enrichedMetadata = { ...item.metadata };
    if (!enrichedMetadata.deferred_from_sd_key && sharedAutoSdKey) {
      enrichedMetadata.deferred_from_sd_key = sharedAutoSdKey;
    }

    const dedupHash = crypto
      .createHash('sha256')
      .update(`${today}::${item.description}::${item.dedup_key || ''}`)
      .digest('hex');

    const category = item.category ?? 'harness_backlog';
    const { data: existing } = await supabase
      .from('feedback')
      .select('id')
      .eq('category', category)
      .eq('metadata->>dedup_hash', dedupHash)
      .maybeSingle();
    if (existing) {
      deduped.push(existing.id);
      continue;
    }

    const args = {
      type: item.type ?? 'enhancement',
      category,
      severity: item.severity ?? 'medium',
      source_application: item.source_application ?? 'EHG_Engineer',
      source_type: item.source_type ?? 'manual_feedback',
      sd_id: item.sd_id ?? null,
      title: item.title,
      description: item.description,
      source_id: item.source_id ?? null,
      priority: item.priority ?? null,
      priority_reasoning: item.priority_reasoning ?? null,
    };
    toInsert.push(_buildRowObject(args, enrichedMetadata, dedupHash));
    dualWriteContexts.push({
      metadata: item.metadata, dedup_key: item.dedup_key, severity: args.severity,
      sd_id: args.sd_id, description: item.description,
    });
  }

  if (toInsert.length === 0) {
    return { inserted: [], skipped, deduped };
  }

  const { data, error } = await supabase
    .from('feedback')
    .insert(toInsert)
    .select('id');
  if (error) throw new Error(`emitFeedbackBatch: INSERT failed: ${error.message}`);

  const insertedIds = (data || []).map(r => r.id);

  // PA-5 dual-write per qualifying item; per-item failure logged but does NOT abort
  for (let i = 0; i < dualWriteContexts.length; i++) {
    const ctx = dualWriteContexts[i];
    await _maybePa5DualWrite({ supabase, ...ctx, feedbackId: insertedIds[i] });
  }

  return { inserted: insertedIds, skipped, deduped };
}
