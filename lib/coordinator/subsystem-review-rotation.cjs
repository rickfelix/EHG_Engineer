/**
 * Subsystem review rotation — SD-LEO-INFRA-CODIFY-SUBSYSTEM-REVIEW-001.
 *
 * The chairman hand-drove four subsystem reviews on 2026-06-10 (harness,
 * protocol, data layer, EVA pipeline) yielding 27 evidenced draft SDs — the
 * highest-leverage work of the week, and entirely dependent on being asked.
 * This module makes the rotation STANDING and STATELESS:
 *
 *   - The registry derives from SD history: a review SD carries
 *     metadata.subsystem_review = '<subsystem>'; last_reviewed = the latest
 *     completion of such an SD per subsystem. No new table, no state file.
 *   - pickNextDue selects the least-recently-reviewed subsystem
 *     (never-reviewed first, registry order as the tiebreak).
 *   - The weekly tick posts ONE coordinator-inbox review-supply row naming the
 *     subsystem and the /review-subsystem command. It NEVER auto-creates SDs —
 *     review SDs are the OUTPUT of a worker running the skill.
 *
 * Doctrine matches lib/coordinator/row-growth.cjs: pure decisions over injected
 * data, thin fail-soft IO at the edges.
 *
 * @module lib/coordinator/subsystem-review-rotation
 */
'use strict';

/** The standing rotation. Order = cold-start priority (never-reviewed tiebreak). */
const SUBSYSTEMS = [
  'harness',        // LEO gates, handoffs, hooks, claim machinery
  'protocol',       // leo_protocol_sections publication pipeline + CLAUDE files
  'data-layer',     // tables/views/triggers/columns vs code (phantoms, orphans)
  'eva-pipeline',   // EVA scheduler, stages, venture artifacts, OKR generation
  'test-estate',    // unit/e2e tiers, mock rot, flaky intel, CI posture
  'scripts-estate', // scripts/CLI sprawl, orphans, archive lag, npm wiring
  'security',       // RLS, SECURITY DEFINER RPCs, key handling, authz guards
  'docs',           // docs/ tree vs reality, retired content, broken links
];

/** Weekly cadence with jitter tolerance (~6 days). */
const ROTATION_DUE_MS = 6 * 24 * 60 * 60 * 1000;

const REVIEW_SUPPLY_KIND = 'review_supply';

/**
 * PURE: derive the rotation table from completed review-SD rows.
 * @param {Array<{metadata:object|null, status:string, updated_at:string}>} sdRows
 *   Rows from strategic_directives_v2 carrying metadata.subsystem_review.
 * @param {string[]} [subsystems]
 * @returns {Array<{subsystem:string, last_reviewed:string|null, reviews:number}>}
 */
function deriveRotation(sdRows, subsystems = SUBSYSTEMS) {
  const bySubsystem = new Map(subsystems.map((s) => [s, { subsystem: s, last_reviewed: null, reviews: 0 }]));
  for (const row of sdRows || []) {
    const name = row && row.metadata && row.metadata.subsystem_review;
    if (!name || !bySubsystem.has(name)) continue; // unknown names ignored (registry is canonical)
    if (row.status !== 'completed') continue;      // only completed reviews count
    const entry = bySubsystem.get(name);
    entry.reviews += 1;
    const ts = row.updated_at || null;
    if (ts && (!entry.last_reviewed || ts > entry.last_reviewed)) entry.last_reviewed = ts;
  }
  return [...bySubsystem.values()];
}

/**
 * PURE: pick the next-due subsystem — never-reviewed first (registry order),
 * else the stalest last_reviewed.
 * @param {Array<{subsystem:string, last_reviewed:string|null}>} rotation
 * @returns {{subsystem:string, last_reviewed:string|null}|null}
 */
function pickNextDue(rotation) {
  if (!rotation || !rotation.length) return null;
  const never = rotation.find((r) => !r.last_reviewed);
  if (never) return never;
  return [...rotation].sort((a, b) => String(a.last_reviewed).localeCompare(String(b.last_reviewed)))[0];
}

/**
 * PURE: is the weekly tick due? Gate on the latest review-supply post time.
 * Garbage/absent timestamps fail toward due (a missed week beats a silent stall).
 * @param {string|null} lastPostedAt
 * @param {number} nowMs
 * @param {number} [dueMs]
 * @returns {boolean}
 */
function isRotationDue(lastPostedAt, nowMs, dueMs = ROTATION_DUE_MS) {
  if (!lastPostedAt) return true;
  const t = new Date(/Z$|[+-]\d{2}:?\d{2}$/.test(String(lastPostedAt)) ? lastPostedAt : lastPostedAt + 'Z').getTime();
  if (!Number.isFinite(t)) return true;
  return nowMs - t >= dueMs;
}

/** IO (fail-soft): completed review-SD rows.
 * FR-6 (count-truncation discipline): the rotation derives per-subsystem last-review times from
 * EVERY row — paginate past the PostgREST 1000-row cap (the completed corpus grows unbounded).
 * Fail-soft [] policy preserved (fetchAllPaginated throws → caught below). */
async function readReviewHistory(sb) {
  try {
    const { fetchAllPaginated } = await import('../db/fetch-all-paginated.mjs');
    const data = await fetchAllPaginated(() => sb
      .from('strategic_directives_v2')
      .select('sd_key, metadata, status, updated_at')
      .eq('status', 'completed')
      .not('metadata->>subsystem_review', 'is', null)
      .order('sd_key')); // unique-key tiebreaker for stable pagination
    return data || [];
  } catch { return []; }
}

/** IO (fail-soft): when the rotation last posted a review-supply row. */
async function readLastSupplyPost(sb) {
  try {
    const { data, error } = await sb
      .from('session_coordination')
      .select('created_at')
      .eq('message_type', 'INFO')
      .eq('payload->>kind', REVIEW_SUPPLY_KIND)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error || !data || !data.length) return null;
    return data[0].created_at;
  } catch { return null; }
}

module.exports = {
  SUBSYSTEMS,
  ROTATION_DUE_MS,
  REVIEW_SUPPLY_KIND,
  deriveRotation,
  pickNextDue,
  isRotationDue,
  readReviewHistory,
  readLastSupplyPost,
};
