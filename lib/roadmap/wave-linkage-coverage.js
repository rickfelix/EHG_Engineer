// Wave-linkage coverage — QF-20260711-045 (coordinator PRD rider on
// SD-LEO-INFRA-ROADMAP-FOLD-SEAM-001, origin: Solomon plan-gap verdict).
//
// Criterion: >= 80% of CLAIMABLE LEAF SDs must be wave-linked — linked
// directly (roadmap_wave_items.promoted_to_sd_key or metadata.wave_disposition)
// or through their orchestrator parent. Below threshold, starvation is a
// NAMED failure (WAVE_LINKAGE_STARVATION), never a silent state.

import { createRequire } from 'node:module';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8 — this is a governance-critical
// coverage RATIO over ALL non-closed SDs and ALL promoted wave items; both
// strategic_directives_v2 and roadmap_wave_items grow over the system's lifetime, and a
// capped read on either side would silently skew the coverage % (false starvation OR
// masked real starvation) rather than a merely-stale display number.
import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';
import { resolveCanonicalWaveIds } from './canonical-roadmap.js';

/**
 * Thrown when no canonical roadmap exists, so coverage CANNOT be computed over a defined corpus.
 *
 * *** THIS IS A REPORTABLE STATE, NOT A CRASH. *** Zero active roadmaps is the normal
 * post-condition of a successful `--full --replace-active` (old archived, new draft) and of plain
 * bootstrap, and it persists until chairman approval. The refresher cron
 * (.github/workflows/wave-progress-refresher.yml, every 6h with --apply) calls this, and its
 * consumer caught EVERY error into one `console.error` WARN — so in that window the named
 * WAVE_LINKAGE_STARVATION signal and the FR-3 retro time-series row were both silently skipped
 * while the job exited green. Tagging the error is what lets the consumer report the state
 * instead of swallowing it. (SD-LEO-INFRA-ROADMAP-REGENERATION-DUPLICATES-001, EXEC security
 * review SEC-3, upgraded LATENT -> LIVE on re-verification.)
 */
export const ERR_NO_CANONICAL_ROADMAP = 'NO_CANONICAL_ROADMAP';

export const COVERAGE_THRESHOLD = 0.8;
export const STARVATION_NAME = 'WAVE_LINKAGE_STARVATION';

const CLOSED_STATUSES = ['completed', 'cancelled', 'archived', 'superseded', 'deferred'];

// Test-fixture SDs (SD-DEMO-*/SD-TEST-*/UAT e2e fixtures) are categorically never
// claimable (the test_fixture_key dispatch axis blocks them), so they must not sit in
// the coverage denominator — live dry-run showed them dominating the unlinked list and
// dragging coverage toward false starvation. Reuse the SSOT regex, never a local copy.
const require = createRequire(import.meta.url);
const { TEST_FIXTURE_KEY_RE } = require('../fleet/claim-eligibility.cjs');
// SD-LEO-FIX-FIXTURE-PREFIX-EXCLUSION-001 (FR-3): UAT regex lifted to the canonical
// fixture-exclusion module and imported back — this gauge's exclusion SET is unchanged
// byte-for-byte (WAVE_LINKAGE_STARVATION is a designed signal; exclusions here are
// deliberately NOT broadened to the full fixture union).
const { UAT_FIXTURE_KEY_RE } = require('../governance/fixture-exclusion.mjs');

/**
 * Compute wave-linkage coverage over claimable leaf SDs.
 * Pure aggregation — no writes.
 *
 * @param {object} supabase - service-role client
 * @returns {Promise<{coverage:number|null, linked:number, total:number, starved:boolean, unlinkedKeys:string[]}>}
 *   coverage is null when there are zero claimable leaves (vacuous — not starvation).
 */
export async function computeWaveLinkageCoverage(supabase) {
  let sds;
  try {
    sds = await fetchAllPaginated(() => supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, sd_type, status, parent_sd_id, metadata')
      .not('status', 'in', `(${CLOSED_STATUSES.join(',')})`)
      .order('id', { ascending: true })); // unique tiebreaker: stable page boundaries (FR-6)
  } catch (error) {
    throw new Error(`wave-linkage-coverage: SD query failed: ${error.message}`);
  }

  // SD-LEO-INFRA-ROADMAP-REGENERATION-DUPLICATES-001 FR-4: scope to the canonical roadmap.
  // This was UNSCOPED, so promoted_to_sd_key values belonging to ARCHIVED roadmaps landed in
  // promotedKeys and an SD linked only from an archived plan counted as linked. Measured live
  // 2026-07-29: 114 orphan links, of which 99 SD keys appear ONLY in archived-roadmap items —
  // 28.7% of the promoted universe, all of them from ed12bf74 (March 2026).
  //
  // Note ed12bf74 is NOT one of the duplicates this SD cleans up, which is the point: removing
  // this SD's duplicate rows would not have corrected this reader by even one link. Only the
  // predicate fixes it.
  let canonicalWaveIds;
  try {
    canonicalWaveIds = await resolveCanonicalWaveIds(supabase);
  } catch (rErr) {
    throw new Error(`wave-linkage-coverage: canonical roadmap unresolvable: ${rErr.message}`);
  }
  if (canonicalWaveIds === null) {
    // Tagged so callers can tell "there is no canonical roadmap right now" (a real, REPORTABLE
    // state) apart from "the coverage computation broke" (a bug). Untagged, the only consumer
    // collapsed both into one swallowed WARN line — see ERR_NO_CANONICAL_ROADMAP's note.
    const err = new Error('wave-linkage-coverage: no active roadmap — refusing to compute coverage over an unscoped corpus');
    err.code = ERR_NO_CANONICAL_ROADMAP;
    throw err;
  }

  let items;
  try {
    items = await fetchAllPaginated(() => supabase
      .from('roadmap_wave_items')
      .select('promoted_to_sd_key')
      .in('wave_id', canonicalWaveIds)
      .not('promoted_to_sd_key', 'is', null)
      .order('id', { ascending: true })); // unique tiebreaker: stable page boundaries (FR-6)
  } catch (iErr) {
    throw new Error(`wave-linkage-coverage: wave-items query failed: ${iErr.message}`);
  }

  const promotedKeys = new Set(items.map((i) => i.promoted_to_sd_key));
  const rows = sds;
  const byId = new Map(rows.map((s) => [s.id, s]));
  const directlyLinked = (s) =>
    promotedKeys.has(s.sd_key) || Boolean(s.metadata?.wave_disposition);

  const isFixture = (s) =>
    typeof s.sd_key === 'string' && (TEST_FIXTURE_KEY_RE.test(s.sd_key) || UAT_FIXTURE_KEY_RE.test(s.sd_key));
  const leaves = rows.filter((s) => s.sd_type !== 'orchestrator' && !isFixture(s));
  const linkedLeaves = leaves.filter((s) => {
    if (directlyLinked(s)) return true;
    const parent = s.parent_sd_id ? byId.get(s.parent_sd_id) : null;
    return parent ? directlyLinked(parent) : false;
  });

  const total = leaves.length;
  const linked = linkedLeaves.length;
  const coverage = total === 0 ? null : linked / total;
  return {
    coverage,
    linked,
    total,
    starved: coverage !== null && coverage < COVERAGE_THRESHOLD,
    unlinkedKeys: leaves.filter((s) => !linkedLeaves.includes(s)).map((s) => s.sd_key).slice(0, 25),
  };
}

export default { computeWaveLinkageCoverage, COVERAGE_THRESHOLD, STARVATION_NAME };
