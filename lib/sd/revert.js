/**
 * Atomic SD Revert Helper
 *
 * SD: SD-FDBK-INFRA-ATOMIC-REVERT-HELPER-001
 * Pattern: PAT-GHOST-COMPLETION-PARTIAL-REVERT-001
 *
 * Performs a SINGLE supabase update writing status + current_phase + progress + metadata
 * atomically. Eliminates the partial-revert class where metadata.reverted_at is set but
 * the status/current_phase/progress column updates are forgotten in a separate write.
 *
 * Idempotent: if metadata.reverted_at is already set, the second call returns the
 * existing payload unchanged with was_idempotent=true. Fail-loud: throws on
 * PostgrestError with bracket-tokenized [SD_REVERT_FAILED] message.
 *
 * @module lib/sd/revert
 */

import { createSupabaseServiceClient } from '../supabase-client.js';

const ERROR_PREFIX = '[SD_REVERT_FAILED]';

/**
 * Revert an SD to draft/LEAD state, writing all column groups atomically.
 *
 * @param {string} sdId - strategic_directives_v2.id (varchar(50) — may be uuid or sd_key form)
 * @param {string} reason - Human-readable reason recorded in metadata.reverted_reason
 * @param {object} [options]
 * @param {boolean} [options.dry_run=false] - Return planned payload without writing
 * @param {object}  [options.preserve_metadata={}] - Extra fields merged into metadata after defaults
 * @param {object}  [options.supabase] - Pre-built client (test injection); defaults to createSupabaseServiceClient()
 * @returns {Promise<{updated: boolean, payload: object, was_idempotent: boolean}>}
 *
 * @throws {Error} [SD_REVERT_FAILED] when supabase returns an error or the SD is not found
 */
export async function revertSD(sdId, reason, options = {}) {
  if (!sdId || typeof sdId !== 'string') {
    throw new Error(`${ERROR_PREFIX} sdId is required (got ${typeof sdId})`);
  }
  if (!reason || typeof reason !== 'string' || reason.length === 0) {
    throw new Error(`${ERROR_PREFIX} reason is required (non-empty string)`);
  }

  const { dry_run = false, preserve_metadata = {}, supabase: injectedClient } = options;
  const supabase = injectedClient || createSupabaseServiceClient();

  // Read existing metadata for idempotency check and metadata preservation
  const { data: existing, error: fetchError } = await supabase
    .from('strategic_directives_v2')
    .select('id, metadata, status, current_phase, progress')
    .eq('id', sdId)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`${ERROR_PREFIX} fetch failed: ${fetchError.message}`);
  }
  if (!existing) {
    throw new Error(`${ERROR_PREFIX} SD not found: ${sdId}`);
  }

  const existingMetadata = existing.metadata || {};
  const alreadyReverted = Boolean(existingMetadata.reverted_at);

  if (alreadyReverted) {
    return {
      updated: false,
      payload: {
        status: existing.status,
        current_phase: existing.current_phase,
        progress: existing.progress,
        metadata: existingMetadata,
      },
      was_idempotent: true,
    };
  }

  const revertedAt = new Date().toISOString();
  const payload = {
    status: 'draft',
    current_phase: 'LEAD',
    progress: 0,
    metadata: {
      ...existingMetadata,
      ...preserve_metadata,
      reverted_at: revertedAt,
      reverted_reason: reason,
    },
  };

  if (dry_run) {
    return { updated: false, payload, was_idempotent: false };
  }

  // Single atomic update: status, current_phase, progress, metadata in ONE call.
  // The static-pin test asserts this exact pattern. Do not split into multiple
  // .update() calls — that re-introduces the partial-revert class.
  const { error: updateError } = await supabase
    .from('strategic_directives_v2')
    .update(payload)
    .eq('id', sdId);

  if (updateError) {
    throw new Error(`${ERROR_PREFIX} update failed: ${updateError.message}`);
  }

  return { updated: true, payload, was_idempotent: false };
}
