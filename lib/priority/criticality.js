/**
 * lib/priority/criticality.js — CRITICALITY component (severity weight + blast radius).
 * SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-C.
 *
 * SEVERITY_WEIGHT mirrors scripts/coordinator-backlog-rank.mjs:241's PRIORITY_W so the two
 * never drift; severityWeightFor reads either an SD's `priority` or a QF's `severity`
 * (identical critical/high/medium/low enum on both tables — database/migrations/
 * 20251117_create_quick_fixes_table.sql:13 vs. strategic_directives_v2.priority).
 *
 * Blast radius reuses risk_assessments.overall_risk_score, which is keyed on
 * strategic_directives_v2.id (the UUID, never sd_key) and can carry multiple phase-scoped
 * rows per SD, so mostRecentRiskScore always reads the most recently assessed row. QFs have
 * no risk_assessments equivalent, so their blast radius always reads UNSCORED rather than
 * an assumed-zero-risk default.
 */
import { UNSCORED } from './leverage.js';

export { UNSCORED };

/** Mirrors coordinator-backlog-rank.mjs:241 PRIORITY_W — one shared weight map, never a second. */
export const SEVERITY_WEIGHT = { critical: 3, high: 2, medium: 1, low: 0 };

/** Reads an SD's `priority` or a QF's `severity` — the same 4-value enum on both tables. */
export function severityWeightFor(item) {
  const level = (item && (item.priority ?? item.severity)) || null;
  // Object.hasOwn (not the `in` operator) so a prototype-chain key (e.g. 'constructor',
  // 'toString') can never be misread as a recognized severity level.
  return typeof level === 'string' && Object.hasOwn(SEVERITY_WEIGHT, level)
    ? SEVERITY_WEIGHT[level]
    : UNSCORED;
}

/** Most-recently-assessed risk_assessments.overall_risk_score for this SD's id, or UNSCORED. */
export async function mostRecentRiskScore(sdId, supabase) {
  const { data, error } = await supabase
    .from('risk_assessments')
    .select('overall_risk_score, assessed_at')
    .eq('sd_id', sdId)
    .order('assessed_at', { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return UNSCORED;
  const score = data[0].overall_risk_score;
  return score === null || score === undefined ? UNSCORED : score;
}

/** An SD's criticality components: severity weight (sync) + blast radius (DB read). */
export async function computeSdCriticality(sd, supabase) {
  return {
    severityWeight: severityWeightFor(sd),
    blastRadius: await mostRecentRiskScore(sd.id, supabase),
  };
}

/** A QF's criticality components: shared severity weight, UNSCORED blast radius (no signal). */
export function computeQfCriticality(qf) {
  return {
    severityWeight: severityWeightFor(qf),
    blastRadius: UNSCORED,
  };
}
