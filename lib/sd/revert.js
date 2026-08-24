/**
 * Atomic SD Revert Helper
 *
 * SD: SD-FDBK-INFRA-ATOMIC-REVERT-HELPER-001
 * Pattern: PAT-GHOST-COMPLETION-PARTIAL-REVERT-001
 *
 * Performs a SINGLE supabase update writing status + current_phase + progress_percentage +
 * metadata atomically. Eliminates the partial-revert class where metadata.reverted_at is set
 * but the status/current_phase/progress_percentage column updates are forgotten in a separate write.
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
    .select('id, metadata, status, current_phase, progress_percentage')
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
        progress_percentage: existing.progress_percentage,
        metadata: existingMetadata,
      },
      was_idempotent: true,
    };
  }

  // KNOWN LIMITATION (adversarial review, SD-LEO-INFRA-PROGRESS-COLUMN-DEAD-TWIN-001): the
  // auto_calculate_progress() BEFORE-UPDATE trigger (database/migrations/
  // 20251211_fix_progress_trigger_rls_access.sql:315-329) recalculates progress_percentage via
  // calculate_sd_progress() whenever an UPDATE's NEW value IS NOT DISTINCT FROM OLD -- which is
  // PRE-EXISTING behavior, not introduced by this repoint: the prior `progress: 0` write never
  // touched progress_percentage at all, so NEW trivially equaled OLD on every single call, and
  // this trigger already fired unconditionally before this file was repointed. Explicitly
  // writing progress_percentage: 0 here NARROWS that to only the case where the SD's progress_
  // percentage was already 0 pre-revert -- for this function's actual target population (ghost-
  // completed SDs, PAT-GHOST-COMPLETION-PARTIAL-REVERT-001), enforce_progress_on_completion()
  // required progress_percentage=100 to reach 'completed' in the first place, so OLD is 100, not
  // 0, in the common case. The "atomic reset to 0" guarantee below is therefore reliable for the
  // primary use case but not unconditional for an already-0%-progress SD.
  const revertedAt = new Date().toISOString();
  const payload = {
    status: 'draft',
    current_phase: 'LEAD',
    progress_percentage: 0,
    lifecycle_write_token: 'sd-revert.js',
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

  // Single atomic update: status, current_phase, progress_percentage, metadata in ONE call.
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
