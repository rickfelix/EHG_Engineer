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
  metadata = {},
  dedup_key = null,
} = {}) {
  if (!supabase) throw new Error('emitFeedback: supabase client is required');
  if (!title) throw new Error('emitFeedback: title is required');
  if (!description) throw new Error('emitFeedback: description is required');

  // SD-LEO-INFRA-WIRE-FEEDBACK-TABLE-001 FR-2: best-effort auto-fill
  // metadata.deferred_from_sd_key from active claim when caller did not set it.
  // Caller-supplied value ALWAYS wins; lookup is fail-soft.
  const enrichedMetadata = { ...metadata };
  if (!enrichedMetadata.deferred_from_sd_key) {
    const autoSdKey = await _autoFillDeferredFromSdKey(supabase);
    if (autoSdKey) enrichedMetadata.deferred_from_sd_key = autoSdKey;
  }

  const today = new Date().toISOString().slice(0, 10);
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

  const cappedTitle = title.length > 120 ? `${title.slice(0, 117)}...` : title;

  const { data, error } = await supabase
    .from('feedback')
    .insert({
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
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`emitFeedback: INSERT failed: ${error.message}`);
  }

  // SD-LEO-INFRA-DEDICATED-SECURITY-AUDIT-001 PA-5 dual-write: when feature flag
  // enabled and this is a capability-suppression event, ALSO write to
  // security_audit_events. Failures here do NOT block the feedback write
  // (already returned id); they're logged via stderr for the integrity auditor.
  const dualWriteEnabled = process.env.SECURITY_AUDIT_DUAL_WRITE_PA5 === 'true';
  const isCapSuppression = metadata?.event_type === 'capability_suppression' || dedup_key?.startsWith('capability-suppression');
  if (dualWriteEnabled && isCapSuppression) {
    try {
      await writeAuditEvent({
        supabase,
        event_type: 'capability_suppression',
        severity: severity === 'critical' ? 'critical' : 'warning',
        source_agent: 'lib/governance/emit-feedback',
        source_module_path: 'lib/governance/emit-feedback.js',
        sd_id,
        event_payload: {
          feedback_id: data.id,
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

  return { id: data.id, deduped: false };
}
