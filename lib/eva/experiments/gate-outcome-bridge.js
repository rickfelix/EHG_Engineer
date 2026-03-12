/**
 * Gate Outcome Bridge — Intercepts kill gate signals and records
 * experiment outcomes for ventures enrolled in active experiments.
 *
 * Async/non-blocking: gate signal recording must not slow venture progression.
 *
 * SD-LEO-FEAT-EXPERIMENT-FEEDBACK-LOOP-001 (FR-001)
 *
 * @module lib/eva/experiments/gate-outcome-bridge
 */

const KILL_GATE_STAGES = new Set([3, 5, 13]);

const BOUNDARY_TO_STAGE = {
  'stage_3': 3,
  '5->6': 5,
  '12->13': 13,
};

/**
 * Retry an async operation with exponential backoff.
 *
 * @param {Function} fn - Async function to retry
 * @param {Object} opts
 * @param {number} [opts.maxAttempts=3] - Maximum number of attempts
 * @param {number} [opts.baseDelayMs=1000] - Base delay in ms (doubles each retry)
 * @param {Object} [opts.logger=console] - Logger instance
 * @returns {Promise<*>} Result from fn
 * @throws {Error} Last error after all attempts exhausted
 */
async function retryWithBackoff(fn, { maxAttempts = 3, baseDelayMs = 1000, logger = console } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        logger.warn(
          `[GateOutcomeBridge] Attempt ${attempt}/${maxAttempts} failed: ${err.message}. ` +
          `Retrying in ${delay}ms...`
        );
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

/**
 * Record a gate outcome for a venture if it is enrolled in an active experiment.
 * This is the main entry point — called from kill gate execution paths.
 * Uses retry with exponential backoff (3 attempts: 1s, 2s, 4s).
 *
 * @param {Object} deps - { supabase, logger }
 * @param {Object} signal
 * @param {string} signal.ventureId - Venture UUID
 * @param {string} signal.gateBoundary - Gate boundary key (e.g., 'stage_3', '5->6', '12->13')
 * @param {boolean} signal.passed - Whether the venture passed the gate
 * @param {number} [signal.score] - Gate score (numeric)
 * @param {boolean} [signal.chairmanOverride] - Whether chairman overrode the gate decision
 * @param {Date} [signal.assignedAt] - When the venture was assigned to experiment (for time_to_gate calc)
 * @returns {Promise<Object|null>} Recorded outcome or null if not enrolled
 */
export async function recordGateOutcome(deps, signal) {
  const { supabase, logger = console } = deps;
  const {
    ventureId,
    gateBoundary,
    passed,
    score = null,
    chairmanOverride = false,
    assignedAt = null,
  } = signal;

  // Map boundary to kill gate stage
  const killGateStage = BOUNDARY_TO_STAGE[gateBoundary];
  if (!killGateStage || !KILL_GATE_STAGES.has(killGateStage)) {
    return null; // Not a tracked kill gate
  }

  const timeToGateHours = assignedAt
    ? (Date.now() - new Date(assignedAt).getTime()) / (1000 * 60 * 60)
    : null;

  try {
    const data = await retryWithBackoff(async () => {
      const { data: result, error } = await supabase.rpc('record_experiment_gate_outcome', {
        p_venture_id: ventureId,
        p_kill_gate_stage: killGateStage,
        p_gate_passed: passed,
        p_gate_score: score,
        p_chairman_override: chairmanOverride,
        p_time_to_gate_hours: timeToGateHours ? Math.round(timeToGateHours * 100) / 100 : null,
      });

      if (error) {
        throw new Error(`RPC error: ${error.message}`);
      }
      return result;
    }, { maxAttempts: 3, baseDelayMs: 1000, logger });

    if (!data?.success) {
      // Not enrolled or no active experiment — this is normal
      return null;
    }

    logger.log(
      `   [GateOutcomeBridge] Recorded: venture=${ventureId.slice(0, 8)} ` +
      `stage=${killGateStage} passed=${passed} variant=${data.variant_key}`
    );

    return data;
  } catch (err) {
    // All retries exhausted — log and return null (still non-blocking)
    logger.warn(
      `[GateOutcomeBridge] Failed after 3 attempts: ${err.message} ` +
      `(venture=${ventureId.slice(0, 8)} stage=${killGateStage})`
    );
    return null;
  }
}

/**
 * Check if a venture is enrolled in an active experiment.
 *
 * @param {Object} deps - { supabase }
 * @param {string} ventureId - Venture UUID
 * @returns {Promise<Object|null>} Assignment record or null
 */
export async function getActiveEnrollment(deps, ventureId) {
  const { supabase } = deps;

  const { data: experiment } = await supabase
    .from('experiments')
    .select('id')
    .eq('status', 'running')
    .order('started_at', { ascending: false })
    .limit(1)
    .single();

  if (!experiment) return null;

  const { data: assignment } = await supabase
    .from('experiment_assignments')
    .select('*')
    .eq('experiment_id', experiment.id)
    .eq('venture_id', ventureId)
    .single();

  return assignment || null;
}

/**
 * Get all gate survival outcomes for an experiment.
 *
 * @param {Object} deps - { supabase }
 * @param {string} experimentId - Experiment UUID
 * @returns {Promise<Array>} Gate survival outcome records
 */
export async function getGateSurvivalOutcomes(deps, experimentId) {
  const { supabase } = deps;

  const { data, error } = await supabase
    .from('experiment_outcomes')
    .select('*')
    .eq('experiment_id', experimentId)
    .eq('outcome_type', 'gate_survival')
    .order('evaluated_at', { ascending: true });

  if (error) return [];
  return data || [];
}

export { KILL_GATE_STAGES, BOUNDARY_TO_STAGE };
