/**
 * Pure per-SD / per-phase cost rollup over model_usage_log rows.
 * SD-LEO-INFRA-FACTORY-COST-UNIT-001 (FR-2) — rows in, aggregates out; no DB access,
 * so the CLI, the coordinator email panel, and tests share one implementation.
 *
 * @module lib/cost/usage-rollup
 */

import { rowCost } from './llm-pricing.js';

const UNATTRIBUTED = 'UNATTRIBUTED';

function bump(map, key, c, r) {
  if (!map[key]) map[key] = { calls: 0, inT: 0, outT: 0, usd: 0, cacheHits: 0 };
  const e = map[key];
  e.calls++; e.inT += c.inT; e.outT += c.outT; e.usd += c.usd;
  if (r?.metadata?.cache_hit) e.cacheHits++;
}

/**
 * Roll model_usage_log rows up by SD, by phase, and by SD+phase.
 * Rows with null/empty sd_id land in the UNATTRIBUTED bucket (never dropped).
 *
 * @param {Array<object>} rows model_usage_log rows ({sd_id, phase, reported_model_name, metadata})
 * @returns {{
 *   bySd: Record<string, {calls:number,inT:number,outT:number,usd:number,cacheHits:number}>,
 *   byPhase: Record<string, object>,
 *   bySdPhase: Record<string, object>,
 *   totals: {calls:number,inT:number,outT:number,usd:number},
 *   coverage: {attributedCalls:number, totalCalls:number, pct:number}
 * }}
 */
export function rollup(rows = []) {
  const bySd = {};
  const byPhase = {};
  const bySdPhase = {};
  const totals = { calls: 0, inT: 0, outT: 0, usd: 0 };
  let attributedCalls = 0;

  for (const r of rows) {
    const c = rowCost(r);
    const sd = r?.sd_id || UNATTRIBUTED;
    const phase = r?.phase || 'UNKNOWN';
    if (sd !== UNATTRIBUTED) attributedCalls++;
    bump(bySd, sd, c, r);
    bump(byPhase, phase, c, r);
    bump(bySdPhase, `${sd}|${phase}`, c, r);
    totals.calls++; totals.inT += c.inT; totals.outT += c.outT; totals.usd += c.usd;
  }

  return {
    bySd,
    byPhase,
    bySdPhase,
    totals,
    coverage: {
      attributedCalls,
      totalCalls: totals.calls,
      pct: totals.calls ? Number(((attributedCalls / totals.calls) * 100).toFixed(1)) : 0,
    },
  };
}

export { UNATTRIBUTED };
export default { rollup, UNATTRIBUTED };
