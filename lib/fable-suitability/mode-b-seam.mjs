/**
 * mode-b-seam.mjs — the Solomon Mode-B read seam. Ships INERT but REACHABLE.
 * SD-LEO-INFRA-FABLE-SUITABILITY-MAP-001-C (FR-3).
 *
 * When Solomon un-parks, its Mode-B (leo_protocol_sections #611, "Solomon Role Contract") consults
 * additional PRIORITY SOURCES to decide what to work on. This seam projects child A's
 * v_fable_suitability_map_current into a versioned, machine-readable candidate contract that Mode-B
 * can read as one such source.
 *
 * DARK-SHIP GUARD (RISK R3 — the single gating risk): Solomon is parked, so NOTHING calls this in
 * production yet. But a seam that is never exercised silently rots (a whole-seam mock ships green on
 * dead code). Two things keep it honest: the dry-run entrypoint (scripts/fable-suitability/dry-run.mjs)
 * exercises the real produce->persist->read path, and the versioned contract test reads this back via
 * a fixture consumer. The contract is VERSIONED so an un-park is wire-up (bump-aware) not archaeology.
 *
 * CEREMONY_PENDING-aware: while child A's table/view is unapplied, this returns an empty inert result
 * (status 'CEREMONY_PENDING') rather than throwing — the seam exists and is reachable, just dormant.
 */
import { isMissingTableError } from './map-writer.mjs';

/**
 * The Mode-B read contract version. Bump when the candidate shape changes so an un-parking Solomon
 * detects a mismatch instead of silently mis-reading.
 */
export const MODE_B_CONTRACT_VERSION = 1;

const CURRENT_VIEW = 'v_fable_suitability_map_current';

/** Project a raw current-view row into the versioned Mode-B candidate shape. */
export function toModeBCandidate(row) {
  return {
    contract_version: MODE_B_CONTRACT_VERSION,
    region_key: row.region_key,
    repo: row.repo,
    duty_cluster: row.duty_cluster,
    composite_score: row.composite_score,
    score_version: row.score_version,
    scored_at: row.last_scored_at,
    rationale: row.evidence?.axes
      ? [row.evidence.axes.impact?.rationale, row.evidence.axes.opportunity?.rationale, row.evidence.axes.reasoning_depth?.rationale]
          .filter(Boolean)
          .join(' | ')
      : null,
    source: 'fable-suitability-map',
  };
}

/**
 * Read the current Mode-B candidate list (highest composite first). Inert-but-reachable: returns
 * a typed CEREMONY_PENDING result while child A is unapplied.
 * @returns {Promise<{status:'ok', contract_version:number, candidates:object[]} | {status:'CEREMONY_PENDING', contract_version:number, candidates:[]}>}
 */
export async function readModeBCandidates(supabase, { dutyCluster = null, limit = 20 } = {}) {
  let query = supabase.from(CURRENT_VIEW).select('*');
  if (dutyCluster) query = query.eq('duty_cluster', dutyCluster);

  const { data, error } = await query;
  if (error) {
    if (isMissingTableError(error)) {
      return { status: 'CEREMONY_PENDING', contract_version: MODE_B_CONTRACT_VERSION, candidates: [] };
    }
    throw new Error(`readModeBCandidates: ${error.message}`);
  }

  const candidates = (data || [])
    .map(toModeBCandidate)
    .sort((a, b) => (b.composite_score ?? -1) - (a.composite_score ?? -1))
    .slice(0, Number.isInteger(limit) && limit > 0 ? limit : 20);

  return { status: 'ok', contract_version: MODE_B_CONTRACT_VERSION, candidates };
}
