/**
 * Gate Signal Tracking Service
 *
 * Records per-gate survival signals linking evaluation profiles to
 * venture outcomes at tracked boundaries. Produces 5-6 data points
 * per venture instead of one (graduation/kill), cutting learning
 * cycles from months to weeks.
 *
 * Tracked boundaries: stage_3, 5->6, 12->13, 20->21, graduation
 *
 * Part of SD-LEO-ORCH-EVA-STAGE-CONFIGURABLE-001-D
 */

/**
 * Gate boundaries tracked for signal recording.
 */
import { ServiceError } from '../shared-services.js';

const TRACKED_BOUNDARIES = [
  'stage_3',   // Early signal
  '5->6',      // Ideation → Validation
  '12->13',    // Planning → Build
  '20->21',    // Launch → Scale
  'graduation', // Full completion
];

/**
 * Record a gate signal for a venture at a specific boundary.
 *
 * @param {Object} deps - { supabase, logger }
 * @param {Object} signal
 * @param {string} signal.ventureId - Venture UUID
 * @param {string} signal.gateBoundary - Boundary key (e.g. "5->6", "stage_3")
 * @param {string} signal.signalType - 'pass' | 'fail' | 'review' | 'skip'
 * @param {Object} [signal.outcome] - Detailed outcome data
 * @param {Object} [signal.profile] - Resolved profile (from resolveProfile)
 * @returns {Promise<Object>} Created signal record
 */
export async function recordGateSignal(deps, signal) {
  const { supabase, logger = console } = deps;
  const { ventureId, gateBoundary, signalType, outcome = {}, profile = null } = signal;

  if (!supabase) {
    logger.warn('Gate signal service: No supabase client, signal not recorded');
    return null;
  }

  if (!ventureId || !gateBoundary || !signalType) {
    throw new ServiceError('INVALID_ARGS', 'ventureId, gateBoundary, and signalType are required', 'GateSignalService');
  }

  const { data, error } = await supabase
    .from('evaluation_profile_outcomes')
    .insert({
      profile_id: profile?.id || null,
      profile_version: profile?.version || null,
      venture_id: ventureId,
      gate_boundary: gateBoundary,
      signal_type: signalType,
      outcome,
    })
    .select('id, profile_id, venture_id, gate_boundary, signal_type')
    .single();

  if (error) {
    logger.warn(`Gate signal service: Failed to record signal: ${error.message}`);
    return null;
  }

  logger.log(`   Gate signal: ${gateBoundary} → ${signalType} (venture=${ventureId.slice(0, 8)})`);
  return data;
}

/**
 * Get all gate signals for a specific profile.
 *
 * @param {Object} deps - { supabase }
 * @param {string} profileId - Profile UUID
 * @returns {Promise<Array>} Signal records
 */
export async function getSignalsByProfile(deps, profileId) {
  const { supabase } = deps;

  const { data, error } = await supabase
    .from('evaluation_profile_outcomes')
    .select('id, profile_id, profile_version, venture_id, gate_boundary, signal_type, outcome, evaluated_at')
    .eq('profile_id', profileId)
    .order('evaluated_at', { ascending: false });

  if (error) throw new ServiceError('SIGNAL_FETCH_FAILED', `Failed to fetch signals: ${error.message}`, 'GateSignalService');
  return data || [];
}

/**
 * Get aggregated pass/fail summary for a profile at a specific boundary.
 *
 * @param {Object} deps - { supabase }
 * @param {string} profileId - Profile UUID
 * @param {string} [boundary] - Optional boundary filter
 * @returns {Promise<Object>} { total, passed, failed, reviewed, skipped, pass_rate }
 */
export async function getSignalsSummary(deps, profileId, boundary = null) {
  const { supabase } = deps;

  let query = supabase
    .from('evaluation_profile_outcomes')
    .select('signal_type')
    .eq('profile_id', profileId);

  if (boundary) {
    query = query.eq('gate_boundary', boundary);
  }

  const { data, error } = await query;

  if (error) throw new ServiceError('SUMMARY_FETCH_FAILED', `Failed to fetch signal summary: ${error.message}`, 'GateSignalService');

  const signals = data || [];
  const passed = signals.filter(s => s.signal_type === 'pass').length;
  const failed = signals.filter(s => s.signal_type === 'fail').length;
  const reviewed = signals.filter(s => s.signal_type === 'review').length;
  const skipped = signals.filter(s => s.signal_type === 'skip').length;
  const total = signals.length;

  return {
    total,
    passed,
    failed,
    reviewed,
    skipped,
    pass_rate: total > 0 ? Math.round((passed / total) * 100) / 100 : 0,
  };
}

/**
 * Check if a boundary is tracked for signal recording.
 *
 * @param {string} boundary - Boundary key
 * @returns {boolean}
 */
export function isTrackedBoundary(boundary) {
  return TRACKED_BOUNDARIES.includes(boundary);
}

export { TRACKED_BOUNDARIES };
