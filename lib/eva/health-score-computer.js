/**
 * Health Score Computer — Heuristic venture stage quality scoring.
 *
 * Computes a 0-100 health score from stage artifacts without LLM calls.
 * Score components:
 *   - Word count (30 pts): Is the artifact substantive?
 *   - JSON validity (35 pts): Did the LLM produce parseable output?
 *   - Field completeness (35 pts): Are expected fields present?
 *
 * SD-MAN-FIX-PIPELINE-HEALTH-GAPS-ORCH-001-A
 * @module lib/eva/health-score-computer
 */

/**
 * Compute a health score from stage advisory_data.
 *
 * Returns a traffic-light string ('green', 'yellow', 'red') compatible
 * with the venture_stage_work.health_score CHECK constraint.
 *
 * @param {object|null} advisoryData - The venture_stage_work.advisory_data JSONB
 * @returns {string} 'green' (score >= 60), 'yellow' (30-59), 'red' (< 30)
 */
// SD-LEO-INFRA-CHAIRMAN-DECISION-HEALTH-PROVENANCE-001 FR-2: recognize a skip/structural stub so it
// is never scored as a RED failure. The stage worker marks skipped pre-exec stages with one of these
// flags rather than producing a real artifact. Exported pure for unit testing.
export function isSkipStub(advisoryData) {
  if (!advisoryData || typeof advisoryData !== 'object') return false;
  if (advisoryData.pre_exec_skip === true) return true;
  if (advisoryData.skipped === true || advisoryData.skip === true) return true;
  const status = String(advisoryData.status || advisoryData.stage_status || '').toLowerCase();
  return status === 'skipped' || status === 'pre_exec_skip';
}

export function computeHealthScore(advisoryData) {
  if (!advisoryData || typeof advisoryData !== 'object') return 0;

  // SD-LEO-INFRA-CHAIRMAN-DECISION-HEALTH-PROVENANCE-001 FR-2: a pre_exec_skip (or otherwise
  // skipped/structural) advisory_data stub is NOT unhealthy — it is a deliberate skip with no
  // substantive artifact to score. Scoring it RED made the chairman see a false failure. Treat such
  // stubs as NEUTRAL ('yellow'), never RED. (Detected via the skip markers the worker writes.)
  if (isSkipStub(advisoryData)) return 'yellow';

  let score = 0;

  // Component 1: Word count (0-30 pts)
  const text = JSON.stringify(advisoryData);
  const wordCount = text.split(/\s+/).length;
  if (wordCount >= 200) {
    score += 30;
  } else {
    score += Math.round((wordCount / 200) * 30);
  }

  // Component 2: JSON structural validity (0-35 pts)
  // Check that the data is well-formed and has nested structure
  const hasNestedObjects = Object.values(advisoryData).some(
    (v) => v !== null && typeof v === 'object'
  );
  const keyCount = Object.keys(advisoryData).length;

  if (keyCount >= 3 && hasNestedObjects) {
    score += 35;
  } else if (keyCount >= 2) {
    score += 20;
  } else if (keyCount >= 1) {
    score += 10;
  }

  // Component 3: Field completeness (0-35 pts)
  // Check for common expected fields across stage types
  const expectedFields = [
    'analysis', 'summary', 'recommendation', 'score',
    'results', 'output', 'data', 'content', 'findings',
  ];
  const presentFields = expectedFields.filter(
    (f) => f in advisoryData || Object.keys(advisoryData).some((k) => k.includes(f))
  );
  const completeness = Math.min(presentFields.length / 3, 1); // 3+ fields = full marks
  score += Math.round(completeness * 35);

  const numericScore = Math.min(score, 100);

  // Convert to traffic-light (CHECK constraint on venture_stage_work.health_score)
  if (numericScore >= 60) return 'green';
  if (numericScore >= 30) return 'yellow';
  return 'red';
}
