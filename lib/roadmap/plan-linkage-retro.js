// SD-LEO-INFRA-PLAN-LINKAGE-BELT-001 (FR-3): pure payload builder for the always-emit
// plan-linked-fraction retro metric. Kept separate from rung-progress-rollup.mjs's I/O
// (DB fetch + emitFeedback call) so the delta computation is unit-testable without
// mocking Date.now() or a live client.
export const PLAN_LINKAGE_RETRO_CATEGORY = 'plan_linkage_retro';
export const PLAN_LINKAGE_RETRO_DEDUP_KEY = 'PLAN_LINKAGE_RETRO';

/**
 * @param {{coverage: number|null, linked: number, total: number}} current
 * @param {{metadata?: {coverage?: number|null}}|null} priorRow - most recent prior
 *   plan_linkage_retro feedback row (or null if none exists yet)
 * @returns {{title:string, description:string, category:string, dedup_key:string, metadata:object}}
 */
export function buildPlanLinkageRetroPayload(current, priorRow) {
  const pct = current.coverage == null ? null : Math.round(current.coverage * 100);
  const priorCoverage = priorRow?.metadata?.coverage;
  const priorPct = priorCoverage == null ? null : Math.round(priorCoverage * 100);
  const delta = pct != null && priorPct != null ? pct - priorPct : null;
  const trend = delta == null ? 'no prior run' : delta > 0 ? `+${delta}pp` : `${delta}pp`;

  return {
    title: `Plan-linkage retro: ${pct == null ? 'n/a' : `${pct}%`} linked (${current.linked}/${current.total})`,
    description: `Plan-linked fraction this run: ${pct == null ? 'n/a (0 claimable leaves)' : `${pct}%`} `
      + `(${current.linked}/${current.total} claimable leaves). Trend vs prior run: ${trend}.`,
    category: PLAN_LINKAGE_RETRO_CATEGORY,
    dedup_key: PLAN_LINKAGE_RETRO_DEDUP_KEY,
    metadata: {
      coverage: current.coverage,
      linked: current.linked,
      total: current.total,
      delta_vs_prior_run: delta,
    },
  };
}

export default { buildPlanLinkageRetroPayload, PLAN_LINKAGE_RETRO_CATEGORY, PLAN_LINKAGE_RETRO_DEDUP_KEY };
