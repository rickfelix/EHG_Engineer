/**
 * score-opportunity.mjs — DETERMINISTIC opportunity axis (1-5). NEVER calls a model.
 * SD-LEO-INFRA-FABLE-SUITABILITY-MAP-001-B (FR-2).
 *
 * Opportunity = "how much unrealized value is trapped in this region" — recurrence-weighted from
 * signals that already exist in the DB. LLM-free (RISK R1). Signals:
 *   - recurrence: issue_patterns.occurrence_count + trend for this region. SYNTHETIC vision-gap rows
 *     (occurrence_count in the 10k-73k band) MUST be filtered BEFORE weighting — they are seeded
 *     gauge rows, not real recurrence, and would otherwise dominate every region (mirrors the
 *     ventures-table synthetic-hygiene lesson).
 *   - bypass: sd_phase_handoffs where resolution_type IN ('bypass','bypass_planned','library_sd_bypass').
 *     (There is NO 'ADMIN_OVERRIDE' label — using it would silently match nothing.)
 *   - failurePatterns: retrospectives.failure_patterns touching this region.
 *   - nthConsumer: (consumer count x git churn) x a cheap complexity proxy (AST-node-count + LOC +
 *     churn). No cyclomatic tool exists, so the proxy is intentionally coarse and documented.
 *
 * scoreOpportunity is a PURE band-mapper over already-aggregated counts (fixture-testable). The DB
 * aggregation lives in the caller / child C; the SYNTHETIC_FLOOR/CEILING here is the reusable guard
 * so any caller can apply the filter identically.
 */
import { getFamily } from './cluster-families.mjs';

// Synthetic vision-gap rows carry an occurrence_count in this band. Filter them BEFORE weighting.
export const SYNTHETIC_OCCURRENCE_FLOOR = 10000;
export const SYNTHETIC_OCCURRENCE_CEILING = 73000;

export const BYPASS_RESOLUTION_TYPES = ['bypass', 'bypass_planned', 'library_sd_bypass'];

const BAND_THRESHOLDS = [
  { min: 0.8, score: 5 },
  { min: 0.6, score: 4 },
  { min: 0.4, score: 3 },
  { min: 0.2, score: 2 },
  { min: 0.0, score: 1 },
];
const norm = (value, saturateAt) => Math.min(1, Math.max(0, (Number(value) || 0) / saturateAt));
function bandFor(blend) {
  for (const b of BAND_THRESHOLDS) if (blend >= b.min) return b.score;
  return 1;
}

/**
 * Filter out synthetic vision-gap issue_patterns rows before they are weighted.
 * A row is synthetic when its occurrence_count sits in the seeded [FLOOR, CEILING] band.
 * @param {Array<{occurrence_count:number}>} patterns
 * @returns {Array} real (non-synthetic) patterns
 */
export function filterSyntheticPatterns(patterns = []) {
  return patterns.filter((p) => {
    const n = Number(p?.occurrence_count) || 0;
    return !(n >= SYNTHETIC_OCCURRENCE_FLOOR && n <= SYNTHETIC_OCCURRENCE_CEILING);
  });
}

/**
 * @param {object} signals
 * @param {Array<{occurrence_count:number, trend?:string}>} signals.issuePatterns  RAW rows (synthetic filtered here)
 * @param {number} signals.bypassCount        count of matching sd_phase_handoffs
 * @param {number} signals.failurePatternCount count of retrospectives.failure_patterns hits
 * @param {number} signals.consumerCount       consumers of the region (for Nth-consumer-patch)
 * @param {number} signals.churn               git churn (commits/edits touching the region)
 * @param {number} signals.complexityProxy     AST-node-count + LOC + churn proxy
 * @param {string} dutyCluster
 * @returns {{score:number, inputs:object, rationale:string, recurrenceWeight:number, sourceIds:string[]}}
 */
export function scoreOpportunity(signals = {}, dutyCluster) {
  const w = getFamily(dutyCluster).opportunity;

  const realPatterns = filterSyntheticPatterns(signals.issuePatterns || []);
  const filteredCount = (signals.issuePatterns || []).length - realPatterns.length;
  const recurrenceRaw = realPatterns.reduce((sum, p) => {
    const trendMult = p.trend === 'increasing' ? 1.5 : p.trend === 'decreasing' ? 0.5 : 1;
    return sum + (Number(p.occurrence_count) || 0) * trendMult;
  }, 0);

  // Nth-consumer-patch: the more consumers x churn x complexity, the more a fix pays back.
  const nthConsumer = (Number(signals.consumerCount) || 0) * (Number(signals.churn) || 0) * Math.max(1, Number(signals.complexityProxy) || 1);

  const nRecurrence = norm(recurrenceRaw, 50);           // 50 real weighted recurrences saturates
  const nBypass = norm(signals.bypassCount, 5);          // 5 bypasses saturates
  const nFailure = norm(signals.failurePatternCount, 5); // 5 failure-pattern hits saturates
  const nNth = norm(nthConsumer, 500);                   // coarse proxy saturation

  const blend = w.recurrence * nRecurrence + w.bypass * nBypass + w.failurePatterns * nFailure + w.nthConsumer * nNth;
  const score = bandFor(blend);

  const sourceIds = realPatterns.map((p) => p.id).filter(Boolean);

  return {
    score,
    recurrenceWeight: Number(recurrenceRaw.toFixed(2)),
    sourceIds,
    inputs: {
      realPatternCount: realPatterns.length,
      syntheticFiltered: filteredCount,
      recurrenceRaw: Number(recurrenceRaw.toFixed(2)),
      bypassCount: Number(signals.bypassCount) || 0,
      failurePatternCount: Number(signals.failurePatternCount) || 0,
      nthConsumer: Number(nthConsumer.toFixed(2)),
      normalized: { recurrence: nRecurrence, bypass: nBypass, failure: nFailure, nthConsumer: nNth },
      blend: Number(blend.toFixed(4)),
      weights: w,
    },
    rationale: `opportunity ${score}/5 — ${realPatterns.length} real recurrence pattern(s) (${filteredCount} synthetic filtered), ${signals.bypassCount || 0} bypass(es), ${signals.failurePatternCount || 0} failure-pattern hit(s), ${dutyCluster}-weighted blend=${blend.toFixed(2)}`,
  };
}
