/**
 * lib/chairman/ratification-regression-detector.mjs — SD-LEO-INFRA-CHAIRMAN-RATIFICATION-LEDGER-001
 * FR-4 (US-004). Detects an ALREADY-ENCODED chairman_ratifications row (encoded_at IS NOT NULL —
 * a regression is by definition a reverted encoding, not an unencoded row) whose ratified clause
 * silently disappeared from a regenerated contract.
 *
 * Two-stage design (VALIDATION/TESTING finding): hash-only detection is structurally blind to a
 * clause deleted from WITHIN a surviving section — only whole-section deletion changes the
 * section hash. Pure functions only — no DB, no fs. Callers (the quiet-tick integrations) supply
 * manifests/content already read.
 *
 * Stage 1 reuses scripts/check-claude-md-drift.cjs's diffSectionDigests (read-only import, never
 * reimplemented).
 */
import { diffSectionDigests } from '../../scripts/check-claude-md-drift.cjs';

/**
 * Stage 1 — whole-section removal. diffSectionDigests's own contract: removed[] = "in stored,
 * absent from live", so newerManifest is "live" and olderManifest is "stored" — NOT the reverse.
 * removed[] holds OBJECTS {id, section_type, target_file, title}; match via .some(r => r.id ===
 * sectionId), never array.includes(). A missing manifest (first-ever snapshot, nothing to diff
 * against) is a structural no-op, never a trip and never an error.
 *
 * SD-LEO-INFRA-SOLOMON-RATIFICATION-CAPTURE-001-B (FR-2): removed[].id always comes from
 * Object.keys() (always a string); sectionId can be a NUMBER on rows written before this SD's
 * FR-1 type guard (live-measured: 4 of 8 chairman_ratifications rows), which strict === can never
 * match. Both sides are coerced with String() so the 4 pre-existing numeric-typed rows are no
 * longer permanently blind to Stage-1 detection — the ledger's append-only triggers forbid
 * correcting the STORED bytes, so this reader-side coercion is the only viable fix.
 * @param {object} newerManifest - current section_digests snapshot (byId/meta/global)
 * @param {object} olderManifest - a prior section_digests snapshot
 * @param {string|number} sectionId
 * @returns {boolean}
 */
export function detectSectionRemoved(newerManifest, olderManifest, sectionId) {
  if (!newerManifest || !olderManifest || !sectionId) return false;
  const { removed } = diffSectionDigests(newerManifest, olderManifest);
  return removed.some((r) => String(r.id) === String(sectionId));
}

/**
 * Stage 2 — within-section clause deletion. The manifest itself only ever stores content_hash,
 * never raw content, so the caller supplies what it read LIVE from disk. Absence of markerText
 * trips the gauge even when the containing section's hash survived unchanged.
 * @param {string} liveFileContent - the live on-disk content of encoded_ref's target_file
 * @param {string} markerText
 * @returns {boolean}
 */
export function detectMarkerMissing(liveFileContent, markerText) {
  const trimmedMarker = typeof markerText === 'string' ? markerText.trim() : '';
  if (!trimmedMarker) return false; // nothing was ever recorded to check — not this detector's failure to report
  if (typeof liveFileContent !== 'string') return true; // file unreadable == the marker is gone
  return !liveFileContent.includes(trimmedMarker);
}

/**
 * Orchestrates both stages for one already-encoded row. Both stages feed the SAME regression
 * verdict — a regression IS a staleness case (the encoding was reverted), reusing FR-3's
 * QUIET_TICK_RATIFICATION_STALE line at the call site rather than duplicating a second token
 * here. A row missing encoded_at is out of scope (nothing was ever encoded to regress).
 * @param {{encoded_at:?string, encoded_ref:?{section_id:string,manifest_hash:string}, marker_text:?string}} row
 * @param {{newerManifest?:object, olderManifest?:object, liveFileContent?:string}} [opts]
 * @returns {{regressed:boolean, stage1:boolean, stage2:boolean}}
 */
export function detectRatificationRegression(row, { newerManifest, olderManifest, liveFileContent } = {}) {
  if (!row || !row.encoded_at) return { regressed: false, stage1: false, stage2: false };
  const sectionId = row.encoded_ref && row.encoded_ref.section_id;
  const stage1 = detectSectionRemoved(newerManifest, olderManifest, sectionId);
  const stage2 = detectMarkerMissing(liveFileContent, row.marker_text);
  return { regressed: stage1 || stage2, stage1, stage2 };
}
