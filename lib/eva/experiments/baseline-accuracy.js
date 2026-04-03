/**
 * Baseline Predictive Accuracy — Measures how well Stage 0 synthesis
 * scores predict actual kill gate survival outcomes.
 *
 * Correlates Stage 0 venture_score with pass/fail at kill gates
 * (Stages 3, 5, 13) to establish a predictive baseline.
 *
 * SD-LEO-FEAT-EXPERIMENT-FEEDBACK-LOOP-001 (FR-007)
 *
 * @module lib/eva/experiments/baseline-accuracy
 */

const KILL_GATE_STAGES = [3, 5, 13];

/**
 * Compute baseline predictive accuracy of Stage 0 scores
 * against actual kill gate outcomes.
 *
 * @param {Object} deps - { supabase, logger }
 * @param {Object} [options]
 * @param {number} [options.scoreThreshold=50] - Score above which we predict survival
 * @param {number} [options.limit=500] - Max ventures to analyze
 * @returns {Promise<Object>} Accuracy metrics
 */
export async function computeBaselineAccuracy(deps, options = {}) {
  const { supabase, logger = console } = deps;
  const { scoreThreshold = 50, limit = 500 } = options;

  // Table stage_zero_experiment_telemetry does not exist yet
  const telemetry = [];

  if (!telemetry?.length) {
    // Fallback: query raw data if materialized view not yet populated
    return computeFromRawData(deps, { scoreThreshold, limit });
  }

  return analyzeAccuracy(telemetry, scoreThreshold, logger);
}

/**
 * Compute accuracy from raw experiment data when materialized view
 * is not populated.
 */
async function computeFromRawData(deps, options) {
  const { supabase, logger = console } = deps;
  const { scoreThreshold, limit } = options;

  // Get gate survival outcomes with their assignment's synthesis scores
  const { data: outcomes, error } = await supabase
    .from('experiment_outcomes')
    .select(`
      variant_key,
      kill_gate_stage,
      gate_passed,
      assignment_id,
      experiment_id
    `)
    .eq('outcome_type', 'gate_survival')
    .limit(limit);

  if (error || !outcomes?.length) {
    logger.log('   [BaselineAccuracy] No gate survival data available for baseline');
    return emptyResult('No gate survival data available');
  }

  // Get corresponding synthesis scores for the same assignments
  const assignmentIds = [...new Set(outcomes.map(o => o.assignment_id))];
  const { data: synthOutcomes } = await supabase
    .from('experiment_outcomes')
    .select('assignment_id, scores')
    .eq('outcome_type', 'synthesis')
    .in('assignment_id', assignmentIds);

  // Build score lookup
  const scoreByAssignment = {};
  for (const so of (synthOutcomes || [])) {
    scoreByAssignment[so.assignment_id] = so.scores?.venture_score;
  }

  // Combine into telemetry-like records
  const combined = outcomes
    .filter(o => scoreByAssignment[o.assignment_id] != null)
    .map(o => ({
      venture_id: o.assignment_id,
      synthesis_score: scoreByAssignment[o.assignment_id],
      kill_gate_stage: o.kill_gate_stage,
      gate_passed: o.gate_passed,
    }));

  if (combined.length === 0) {
    return emptyResult('No ventures with both synthesis scores and gate outcomes');
  }

  return analyzeAccuracy(combined, scoreThreshold, logger);
}

/**
 * Core accuracy analysis: computes precision, recall, accuracy, and
 * Brier score for Stage 0 predictions vs gate outcomes.
 *
 * @param {Array} records - { synthesis_score, kill_gate_stage, gate_passed }
 * @param {number} scoreThreshold - Score above which survival is predicted
 * @param {Object} logger
 * @returns {Object} Accuracy metrics
 */
function analyzeAccuracy(records, scoreThreshold, logger) {
  // Overall confusion matrix
  let tp = 0; // Predicted survive, actually survived
  let fp = 0; // Predicted survive, actually died
  let tn = 0; // Predicted die, actually died
  let fn = 0; // Predicted die, actually survived

  // Per-gate breakdown
  const perGate = {};
  for (const gate of KILL_GATE_STAGES) {
    perGate[gate] = { tp: 0, fp: 0, tn: 0, fn: 0, total: 0 };
  }

  // Brier score accumulator
  let brierSum = 0;

  for (const record of records) {
    const predicted = record.synthesis_score > scoreThreshold;
    const actual = record.gate_passed;
    const stage = record.kill_gate_stage;

    // Normalized prediction probability (0-1 from score)
    const predProb = Math.min(1, Math.max(0, record.synthesis_score / 100));
    const actualBinary = actual ? 1 : 0;
    brierSum += (predProb - actualBinary) ** 2;

    if (predicted && actual) tp++;
    else if (predicted && !actual) fp++;
    else if (!predicted && !actual) tn++;
    else fn++;

    // Per-gate
    if (perGate[stage]) {
      perGate[stage].total++;
      if (predicted && actual) perGate[stage].tp++;
      else if (predicted && !actual) perGate[stage].fp++;
      else if (!predicted && !actual) perGate[stage].tn++;
      else perGate[stage].fn++;
    }
  }

  const total = tp + fp + tn + fn;
  const accuracy = total > 0 ? round3((tp + tn) / total) : 0;
  const precision = (tp + fp) > 0 ? round3(tp / (tp + fp)) : 0;
  const recall = (tp + fn) > 0 ? round3(tp / (tp + fn)) : 0;
  const f1 = (precision + recall) > 0
    ? round3(2 * precision * recall / (precision + recall))
    : 0;
  const brierScore = total > 0 ? round3(brierSum / total) : 1;

  // Per-gate metrics
  const perGateMetrics = {};
  for (const [gate, counts] of Object.entries(perGate)) {
    const gTotal = counts.total;
    if (gTotal === 0) {
      perGateMetrics[gate] = { total: 0, accuracy: null };
      continue;
    }
    perGateMetrics[gate] = {
      total: gTotal,
      accuracy: round3((counts.tp + counts.tn) / gTotal),
      survival_rate: round3((counts.tp + counts.fn) / gTotal),
      prediction_survival_rate: round3((counts.tp + counts.fp) / gTotal),
    };
  }

  logger.log(
    `   [BaselineAccuracy] Analyzed ${total} records: ` +
    `accuracy=${accuracy}, precision=${precision}, recall=${recall}, ` +
    `Brier=${brierScore}`
  );

  return {
    total_records: total,
    score_threshold: scoreThreshold,
    confusion_matrix: { tp, fp, tn, fn },
    accuracy,
    precision,
    recall,
    f1_score: f1,
    brier_score: brierScore,
    per_gate: perGateMetrics,
    interpretation: interpretResults(accuracy, brierScore, total),
  };
}

/**
 * Interpret accuracy results in plain language.
 */
function interpretResults(accuracy, brierScore, totalRecords) {
  if (totalRecords < 10) {
    return 'Insufficient data for reliable baseline. Need 10+ ventures with gate outcomes.';
  }

  const parts = [];

  if (accuracy >= 0.8) {
    parts.push('Stage 0 scores are strongly predictive of gate survival.');
  } else if (accuracy >= 0.6) {
    parts.push('Stage 0 scores are moderately predictive of gate survival.');
  } else {
    parts.push('Stage 0 scores are weakly predictive of gate survival — experimentation is critical.');
  }

  if (brierScore <= 0.15) {
    parts.push('Calibration is good (Brier ≤ 0.15).');
  } else if (brierScore <= 0.25) {
    parts.push('Calibration is moderate (Brier ≤ 0.25).');
  } else {
    parts.push('Calibration is poor — scores may need recalibration.');
  }

  return parts.join(' ');
}

function emptyResult(message) {
  return {
    total_records: 0,
    score_threshold: 50,
    confusion_matrix: { tp: 0, fp: 0, tn: 0, fn: 0 },
    accuracy: 0,
    precision: 0,
    recall: 0,
    f1_score: 0,
    brier_score: 1,
    per_gate: {},
    interpretation: message,
  };
}

function round3(n) { return Math.round(n * 1000) / 1000; }

export { KILL_GATE_STAGES, analyzeAccuracy };
