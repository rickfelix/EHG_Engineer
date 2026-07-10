/**
 * Shared EVA utilities (SD-ARCH-HOTSPOT-STAGE-WORKER-001 / FR-1).
 *
 * formatDuration relocated VERBATIM from lib/eva/stage-execution-worker.js.
 * Sibling copies in lib/eva/rpc/get-s20-sd-progress.js and lib/quality/* are
 * deliberately NOT deduped here — they format differently and consolidating
 * them is out of this refactor's scope (behavior preservation first).
 */

/**
 * Format milliseconds into human-readable duration (e.g., "2m 30s").
 * @param {number} ms
 * @returns {string}
 */
export function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSec = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSec}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMin = minutes % 60;
  return `${hours}h ${remainingMin}m`;
}
