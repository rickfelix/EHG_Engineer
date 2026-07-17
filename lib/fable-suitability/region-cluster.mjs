/**
 * region-cluster.mjs — derive a coarse, stable region_key from a file path.
 * SD-LEO-INFRA-FABLE-SUITABILITY-MAP-001-B (FR-4).
 *
 * A "region" is a coarse structural boundary (a top-level module/dir), NOT an individual file —
 * scoring at file granularity would be noisy and would explode the ledger. deriveRegion collapses
 * a path to its top one-or-two path segments and hands the result to child A's normalizeRegionKey
 * so the key is single-sourced and provably CHECK-safe (a drifting key forks the section-11 ledger
 * JOIN). Pure: no DB, no model.
 */
import { normalizeRegionKey } from './map-writer.mjs';

// How many leading path segments define a region. lib/foo/bar/baz.js -> "lib/foo".
const REGION_DEPTH = 2;

/**
 * Map a repo-relative (or absolute) path to a canonical region_key.
 * @param {string} filePath  e.g. "lib/fable-suitability/score-impact.mjs" or a Windows abs path
 * @param {object} [opts]    { repo?: string } — repo is prepended so the same dir in two repos
 *                           yields distinct regions (matches the child-A (region_key, repo) key).
 * @returns {string} a normalized region_key that passes child A's CHECK/normalizeRegionKey.
 */
export function deriveRegion(filePath, { repo = '' } = {}) {
  if (typeof filePath !== 'string' || filePath.trim() === '') {
    throw new Error('deriveRegion: filePath must be a non-empty string');
  }
  // Normalize separators, strip a leading drive/abs prefix, split into segments.
  const segments = filePath
    .replace(/\\/g, '/')
    .replace(/^[a-zA-Z]:\//, '')
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean);

  // Drop the filename if the last segment looks like a file (has an extension).
  const dirSegments = /\.[a-z0-9]+$/i.test(segments[segments.length - 1] ?? '')
    ? segments.slice(0, -1)
    : segments;

  const regionSegments = (dirSegments.length ? dirSegments : segments).slice(0, REGION_DEPTH);
  if (regionSegments.length === 0) {
    throw new Error(`deriveRegion: "${filePath}" has no clusterable path segment`);
  }

  const raw = repo ? `${repo}/${regionSegments.join('/')}` : regionSegments.join('/');
  return normalizeRegionKey(raw);
}
