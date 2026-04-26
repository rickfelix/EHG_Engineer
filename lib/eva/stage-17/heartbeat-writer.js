/**
 * Stage 17 generation heartbeat writer.
 *
 * Periodically writes an `s17_heartbeat` venture_artifact so that the
 * frontend (ARM D, PR4) can detect when the generation worker has
 * frozen — distinct from clean cancellation or completion. Heartbeats
 * are a *positive* liveness signal, complementing the *negative* signal
 * provided by the LLM stream-progress watchdog (ARM A).
 *
 * SD-LEO-INFRA-STAGE-ARCHETYPE-GENERATION-001 ARM E
 *
 * @module lib/eva/stage-17/heartbeat-writer
 */

import { writeArtifact } from '../artifact-persistence-service.js';

export const DEFAULT_HEARTBEAT_INTERVAL_MS = 30000; // 30s — six per ARM-D 3-min window
export const DEFAULT_HEARTBEAT_TTL_DAYS = 7;

/**
 * Start a heartbeat writer for an in-flight Stage 17 generation run.
 *
 * `writeArtifact` dedupes by (venture_id, artifact_type) when no
 * `metadata.screenId` is present, so each tick UPDATEs the same row
 * — table growth is bounded to ~1 row per active venture. The
 * `metadata.ttlExpiresAt` field carries the prune-after timestamp for
 * the maintenance job in PR3 (TR-2).
 *
 * Caller responsibility:
 *   - call `update(partial)` whenever observable phase changes (per
 *     screen, per variant) so each heartbeat carries fresh context
 *   - call `stop()` exactly once on success / cancel / error
 *
 * @param {object} supabase Supabase client
 * @param {string} ventureId UUID of the active venture
 * @param {object} [options]
 * @param {number} [options.intervalMs=30000] Heartbeat cadence
 * @param {number} [options.ttlDays=7]        Heartbeat row TTL (consumed by PR3 maintenance job)
 * @param {object} [options.initialState={}]  Seed state (merged into first write)
 * @param {(err:Error)=>void} [options.onError] Hook for write failures (default: console.warn)
 * @returns {{update: (partial:object)=>void, stop: ()=>Promise<void>}}
 */
export function startHeartbeatWriter(supabase, ventureId, options = {}) {
  const intervalMs = options.intervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
  const ttlDays = options.ttlDays ?? DEFAULT_HEARTBEAT_TTL_DAYS;
  const onError = options.onError || ((err) => {
    console.warn('[heartbeat-writer] write failed:', err?.message);
  });

  let state = {
    phase: 'starting',
    lastUpdate: new Date().toISOString(),
    ...(options.initialState || {}),
  };
  let stopped = false;
  let inFlight = null;

  const writeOnce = async () => {
    if (stopped) return;
    const ttlExpiresAt = new Date(Date.now() + ttlDays * 86400 * 1000).toISOString();
    const payload = { ...state, ttlExpiresAt };
    try {
      await writeArtifact(supabase, {
        ventureId,
        lifecycleStage: 17,
        artifactType: 's17_heartbeat',
        title: 'Generation Heartbeat',
        content: JSON.stringify(payload),
        artifactData: payload,
        qualityScore: null,
        validationStatus: null,
        source: 'stage-17-archetype-generator',
        metadata: { ttlExpiresAt, ttlDays, intervalMs },
      });
    } catch (err) {
      onError(err);
    }
  };

  // Fire immediately so the absence of any heartbeat row is itself a signal.
  inFlight = writeOnce();
  const timer = setInterval(() => { inFlight = writeOnce(); }, intervalMs);

  return {
    update(partial) {
      if (stopped) return;
      state = { ...state, ...partial, lastUpdate: new Date().toISOString() };
    },
    async stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      // Best-effort: let the in-flight write settle so we don't leak a
      // promise rejection into the caller's exit path.
      try { await inFlight; } catch { /* swallowed; onError already fired */ }
    },
  };
}
