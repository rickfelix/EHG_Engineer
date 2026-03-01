/**
 * Capacity-Aware Work Assignment Engine
 * SD: SD-MAN-ORCH-VISION-HEAL-SCORE-93-002-04-A
 *
 * Analyzes active session capacity and recommends SD-to-session
 * assignments based on workload, complexity tier, and priority scoring.
 *
 * @module lib/eva/capacity-assignment-engine
 */

const COMPLEXITY_TIERS = Object.freeze({
  TIER_1: { label: 'Auto-approve', maxLOC: 30, weight: 1 },
  TIER_2: { label: 'Standard QF', maxLOC: 75, weight: 2 },
  TIER_3: { label: 'Full SD', maxLOC: Infinity, weight: 3 },
});

const MAX_CONCURRENT_CLAIMS = 1; // Each session can claim 1 SD at a time

/**
 * Get assignment recommendations for an unassigned SD.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} params
 * @param {string} params.sdId - SD UUID to assign
 * @param {string} [params.sdType] - SD type for complexity matching
 * @param {string} [params.priority] - SD priority level
 * @param {Object} [options]
 * @param {Object} [options.logger] - Logger instance
 * @returns {Promise<{ recommendations: Array, totalSessions: number, availableSessions: number, error?: string }>}
 */
export async function getAssignmentRecommendations(supabase, params, options = {}) {
  const { logger = console } = options;
  const { sdId, sdType, priority } = params;

  if (!supabase || !sdId) {
    return { recommendations: [], totalSessions: 0, availableSessions: 0, error: 'Missing required params' };
  }

  try {
    // Get active sessions with their claims
    const { data: sessions, error: sessionError } = await supabase
      .from('claude_sessions')
      .select('session_id, sd_id, status, heartbeat_at, metadata')
      .in('status', ['active', 'idle']);

    if (sessionError) {
      logger.warn(`[CapacityEngine] Session query failed: ${sessionError.message}`);
      return { recommendations: [], totalSessions: 0, availableSessions: 0, error: sessionError.message };
    }

    const all = sessions || [];
    const now = Date.now();

    // Calculate capacity for each session
    const sessionCapacities = all.map((s) => {
      const hasClaim = s.sd_id != null;
      const heartbeatAge = s.heartbeat_at
        ? (now - new Date(s.heartbeat_at).getTime()) / 1000
        : Infinity;
      const isStale = heartbeatAge > 300; // 5 minutes stale threshold
      const available = !hasClaim && !isStale;

      return {
        sessionId: s.session_id,
        status: s.status,
        currentSdId: s.sd_id,
        heartbeatAgeSec: Math.round(heartbeatAge),
        isStale,
        hasClaim,
        available,
        capacityScore: calculateCapacityScore(s, heartbeatAge, isStale),
      };
    });

    // Filter to available sessions and sort by capacity score
    const available = sessionCapacities.filter((s) => s.available);
    available.sort((a, b) => b.capacityScore - a.capacityScore);

    // Build recommendations with match quality
    const recommendations = available.map((s, rank) => ({
      sessionId: s.sessionId,
      rank: rank + 1,
      capacityScore: s.capacityScore,
      matchQuality: getMatchQuality(s, sdType, priority),
      reasoning: buildReasoning(s, sdType),
    }));

    return {
      recommendations,
      totalSessions: all.length,
      availableSessions: available.length,
      queueRecommendation: available.length === 0
        ? 'All sessions are busy. SD will be queued for next available session.'
        : null,
    };
  } catch (err) {
    logger.warn(`[CapacityEngine] Assignment error: ${err.message}`);
    return { recommendations: [], totalSessions: 0, availableSessions: 0, error: err.message };
  }
}

/**
 * Get current session capacity overview.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} [options]
 * @param {Object} [options.logger] - Logger instance
 * @returns {Promise<{ overview: Object, error?: string }>}
 */
export async function getCapacityOverview(supabase, options = {}) {
  const { logger = console } = options;

  if (!supabase) {
    return { overview: emptyOverview(), error: 'No supabase client' };
  }

  try {
    const { data: sessions, error } = await supabase
      .from('claude_sessions')
      .select('session_id, sd_id, status, heartbeat_at')
      .in('status', ['active', 'idle']);

    if (error) {
      logger.warn(`[CapacityEngine] Overview query failed: ${error.message}`);
      return { overview: emptyOverview(), error: error.message };
    }

    const all = sessions || [];
    const now = Date.now();

    let active = 0;
    let idle = 0;
    let stale = 0;
    let claimed = 0;

    for (const s of all) {
      const age = s.heartbeat_at
        ? (now - new Date(s.heartbeat_at).getTime()) / 1000
        : Infinity;

      if (age > 300) {
        stale++;
      } else if (s.status === 'active') {
        active++;
      } else {
        idle++;
      }

      if (s.sd_id != null) claimed++;
    }

    return {
      overview: {
        totalSessions: all.length,
        active,
        idle,
        stale,
        claimed,
        available: all.length - claimed - stale,
        utilizationPercent: all.length > 0
          ? Math.round((claimed / all.length) * 100)
          : 0,
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    logger.warn(`[CapacityEngine] Overview error: ${err.message}`);
    return { overview: emptyOverview(), error: err.message };
  }
}

/**
 * Get complexity tier configuration.
 * @returns {Object}
 */
export function getComplexityTiers() {
  return { ...COMPLEXITY_TIERS };
}

// ── Internal Helpers ─────────────────────────────

function calculateCapacityScore(session, heartbeatAge, isStale) {
  if (isStale) return 0;
  if (session.sd_id != null) return 0;

  let score = 100;

  // Prefer idle sessions (ready for work)
  if (session.status === 'idle') {
    score += 20;
  }

  // Prefer sessions with recent heartbeats (more responsive)
  if (heartbeatAge < 30) {
    score += 10;
  } else if (heartbeatAge < 60) {
    score += 5;
  }

  return Math.min(130, score);
}

function getMatchQuality(session, sdType, priority) {
  // Simple match quality based on capacity score
  if (session.capacityScore >= 120) return 'excellent';
  if (session.capacityScore >= 100) return 'good';
  return 'fair';
}

function buildReasoning(session, sdType) {
  const parts = [];
  if (session.status === 'idle') parts.push('session is idle and ready');
  else parts.push('session is active');

  if (session.heartbeatAgeSec < 30) parts.push('recent heartbeat');

  return parts.join(', ');
}

function emptyOverview() {
  return {
    totalSessions: 0,
    active: 0,
    idle: 0,
    stale: 0,
    claimed: 0,
    available: 0,
    utilizationPercent: 0,
    generatedAt: new Date().toISOString(),
  };
}
