/**
 * Pattern Tracking System for Adaptive Thresholds
 *
 * Tracks SD implementation patterns to enable maturity bonuses:
 * - After 10 SDs with similar pattern → +5% threshold (raise the bar)
 * - Identifies patterns by: categories, risk level, complexity
 * - Calculates pattern success rate (avgROI) based on gate scores
 *
 * Created: 2025-10-28
 * Part of: SD-INTELLIGENT-THRESHOLDS-005
 */

/**
 * Extract pattern signature from SD
 *
 * Pattern = combination of categories + risk level
 *
 * @param {Object} sd - Strategic directive record
 * @returns {string} Pattern signature for matching
 */
function extractPatternSignature(sd) {
  const categories = Array.isArray(sd.category) ? sd.category : [sd.category];
  const categoriesStr = categories
    .filter(c => c)
    .map(c => c.toLowerCase())
    .sort()
    .join(',');

  const riskLevel = sd.risk_level || 'medium';

  return `${categoriesStr}|${riskLevel.toLowerCase()}`;
}

/**
 * Fetch pattern statistics for an SD
 *
 * Queries historical SDs with similar pattern to calculate:
 * - sdCount: Number of completed SDs with this pattern
 * - avgROI: Average success score across all gates
 *
 * @param {Object} sd - Strategic directive record
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Object|null>} Pattern stats { sdCount, avgROI } or null
 */
export async function fetchPatternStats(sd, supabase) {
  try {
    if (!sd || !supabase) {
      return null;
    }

    const patternSignature = extractPatternSignature(sd);

    // Query completed SDs with similar pattern
    const { data: historicalSDs, error } = await supabase
      .from('strategic_directives_v2')
      .select('id, category, risk_level, status')
      .eq('status', 'completed')
      .limit(100); // Analyze last 100 completed SDs

    if (error) {
      console.warn('[Pattern Tracking] Query error:', error.message);
      return null;
    }

    if (!historicalSDs || historicalSDs.length === 0) {
      return { sdCount: 0, avgROI: 0 };
    }

    // Filter for matching pattern
    const matchingSDs = historicalSDs.filter(historicalSD => {
      const historicalSignature = extractPatternSignature(historicalSD);
      return historicalSignature === patternSignature;
    });

    if (matchingSDs.length === 0) {
      return { sdCount: 0, avgROI: 0 };
    }

    // Fetch gate results for matching SDs to calculate avgROI
    const sdIds = matchingSDs.map(sd => sd.id);

    const { data: handoffs, error: handoffError } = await supabase
      .from('sd_phase_handoffs')
      .select('sd_id, metadata')
      .in('sd_id', sdIds)
      .in('handoff_type', ['PLAN-TO-EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD']);

    if (handoffError) {
      console.warn('[Pattern Tracking] Handoff query error:', handoffError.message);
      return { sdCount: matchingSDs.length, avgROI: 0 };
    }

    // Calculate average ROI from gate scores
    const gateScores = [];

    if (handoffs) {
      handoffs.forEach(handoff => {
        if (handoff.metadata?.gate1_validation?.score) {
          gateScores.push(handoff.metadata.gate1_validation.score);
        }
        if (handoff.metadata?.gate2_validation?.score) {
          gateScores.push(handoff.metadata.gate2_validation.score);
        }
        if (handoff.metadata?.gate3_validation?.score) {
          gateScores.push(handoff.metadata.gate3_validation.score);
        }
        if (handoff.metadata?.gate4_validation?.score) {
          gateScores.push(handoff.metadata.gate4_validation.score);
        }
      });
    }

    const avgROI = gateScores.length > 0
      ? gateScores.reduce((sum, score) => sum + score, 0) / gateScores.length
      : 0;

    return {
      sdCount: matchingSDs.length,
      avgROI: Math.round(avgROI * 10) / 10, // Round to 1 decimal
      patternSignature
    };

  } catch (error) {
    console.warn('[Pattern Tracking] Unexpected error:', error.message);
    return null;
  }
}

/**
 * Get pattern statistics with caching
 *
 * In-memory cache to avoid repeated DB queries within same session
 *
 * @param {Object} sd - Strategic directive record
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Object|null>} Pattern stats or null
 */
const patternCache = new Map();

export async function getPatternStats(sd, supabase) {
  if (!sd) return null;

  const signature = extractPatternSignature(sd);

  // Check cache first (5 minute TTL)
  const cached = patternCache.get(signature);
  if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
    return cached.stats;
  }

  // Fetch fresh stats
  const stats = await fetchPatternStats(sd, supabase);

  // Cache result
  if (stats) {
    patternCache.set(signature, {
      stats,
      timestamp: Date.now()
    });
  }

  return stats;
}

/**
 * Clear pattern cache (for testing or manual refresh)
 */
export function clearPatternCache() {
  patternCache.clear();
}
