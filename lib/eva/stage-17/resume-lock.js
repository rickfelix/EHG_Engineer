/**
 * Stage 17 resume-endpoint idempotency lock.
 *
 * The `POST /api/stage17/:ventureId/archetypes/resume` endpoint must reject
 * concurrent or accidentally-double-fired calls so that two servers do not
 * race to regenerate the same screens. We store a per-venture lock_token on
 * the existing `s17_session_state` artifact's metadata — zero schema
 * migration, dedup-safe (the row already exists per-venture), 10-minute TTL
 * to recover from crashed jobs.
 *
 * SD-LEO-INFRA-STAGE-ARCHETYPE-GENERATION-001 ARM F
 *
 * @module lib/eva/stage-17/resume-lock
 */

import { randomUUID } from 'node:crypto';

export const RESUME_LOCK_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Attempt to claim the resume lock for `ventureId`.
 *
 * Returns `{acquired:true, token, expiresAt}` on success, or
 * `{acquired:false, reason:'LOCKED'|'DB_ERROR', existingExpiresAt?, error?}`
 * on failure. Expired locks are reclaimable — the helper checks the live
 * timestamp before refusing.
 *
 * @param {object} supabase Supabase client
 * @param {string} ventureId UUID
 * @param {object} [options]
 * @param {number} [options.ttlMs=RESUME_LOCK_TTL_MS] Lock validity window
 * @param {() => number} [options.now=Date.now] Injection seam for tests
 */
export async function acquireResumeLock(supabase, ventureId, options = {}) {
  const ttlMs = options.ttlMs ?? RESUME_LOCK_TTL_MS;
  const now = (options.now ?? Date.now)();

  const { data: existing, error: readErr } = await supabase
    .from('venture_artifacts')
    .select('id, metadata')
    .eq('venture_id', ventureId)
    .eq('artifact_type', 's17_session_state')
    .eq('is_current', true)
    .maybeSingle();
  if (readErr) return { acquired: false, reason: 'DB_ERROR', error: readErr.message };

  const existingLock = existing?.metadata?.resume_lock;
  if (existingLock?.expires_at) {
    const expiresAtMs = new Date(existingLock.expires_at).getTime();
    if (Number.isFinite(expiresAtMs) && expiresAtMs > now) {
      return { acquired: false, reason: 'LOCKED', existingExpiresAt: existingLock.expires_at };
    }
    // expired → fall through and overwrite
  }

  const token = randomUUID();
  const expiresAt = new Date(now + ttlMs).toISOString();
  const acquiredAt = new Date(now).toISOString();
  const newMetadata = {
    ...(existing?.metadata || {}),
    resume_lock: { token, expires_at: expiresAt, acquired_at: acquiredAt },
  };

  if (existing?.id) {
    const { error: updErr } = await supabase
      .from('venture_artifacts')
      .update({ metadata: newMetadata })
      .eq('id', existing.id);
    if (updErr) return { acquired: false, reason: 'DB_ERROR', error: updErr.message };
  } else {
    // Bootstrap a session_state row if none exists yet (first resume on a
    // venture whose generation never started).
    const { writeArtifact } = await import('../artifact-persistence-service.js');
    await writeArtifact(supabase, {
      ventureId,
      lifecycleStage: 17,
      artifactType: 's17_session_state',
      title: 'Generation Progress',
      content: JSON.stringify({ log: [], updatedAt: acquiredAt }),
      artifactData: { log: [] },
      qualityScore: null,
      validationStatus: null,
      source: 'stage17-resume-endpoint',
      metadata: { ...newMetadata, progressUpdate: true },
    });
  }

  return { acquired: true, token, expiresAt };
}

/**
 * Release the resume lock if `token` matches the stored token. Mismatched
 * tokens are no-ops (returns `{released:false, reason:'TOKEN_MISMATCH'}`)
 * — defensive against late `.finally()` callbacks running after the lock
 * has already expired and been re-acquired by another caller.
 */
export async function releaseResumeLock(supabase, ventureId, token) {
  if (!token) return { released: false, reason: 'NO_TOKEN' };

  const { data: existing, error: readErr } = await supabase
    .from('venture_artifacts')
    .select('id, metadata')
    .eq('venture_id', ventureId)
    .eq('artifact_type', 's17_session_state')
    .eq('is_current', true)
    .maybeSingle();
  if (readErr) return { released: false, reason: 'DB_ERROR', error: readErr.message };
  if (!existing?.metadata?.resume_lock) return { released: false, reason: 'NO_LOCK' };
  if (existing.metadata.resume_lock.token !== token) {
    return { released: false, reason: 'TOKEN_MISMATCH' };
  }

  const newMetadata = { ...existing.metadata };
  delete newMetadata.resume_lock;

  const { error: updErr } = await supabase
    .from('venture_artifacts')
    .update({ metadata: newMetadata })
    .eq('id', existing.id);
  if (updErr) return { released: false, reason: 'DB_ERROR', error: updErr.message };

  return { released: true };
}
