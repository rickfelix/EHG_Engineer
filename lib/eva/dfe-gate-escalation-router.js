/**
 * DFE Gate Escalation Router — Pattern-Based Gate Failure Routing
 * SD: SD-MAN-ORCH-VISION-HEAL-SCORE-93-002-03-C
 *
 * Monitors gate failures from handoff pipeline, detects recurring
 * patterns, and routes escalations to chairman via unified-escalation-router.
 * Provides configurable timeout-based auto-escalation per gate type.
 *
 * @module lib/eva/dfe-gate-escalation-router
 */

const DEFAULT_PATTERN_THRESHOLD = 3; // Minimum occurrences to detect a pattern
const DEFAULT_LOOKBACK_DAYS = 14;

const GATE_SLA_HOURS = Object.freeze({
  PRD_QUALITY: 4,
  RETROSPECTIVE_QUALITY_GATE: 8,
  USER_STORY_EXISTENCE_GATE: 4,
  GATE5_GIT_COMMIT_ENFORCEMENT: 2,
  GATE_SD_START_PROTOCOL: 8,
  GATE_PROTOCOL_FILE_READ: 8,
  DEFAULT: 12,
});

const ESCALATION_LEVELS = Object.freeze({
  INFO: 'L1',
  WARN: 'L2',
  CRITICAL: 'L3',
});

/**
 * Route a gate failure for potential escalation.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} params
 * @param {string} params.sdId - SD UUID
 * @param {string} params.gateType - Gate identifier
 * @param {number} params.score - Gate score achieved
 * @param {number} params.threshold - Gate threshold required
 * @param {Object} [params.context] - Additional gate context
 * @param {Object} [options]
 * @param {Object} [options.logger] - Logger instance
 * @param {number} [options.patternThreshold] - Min occurrences (default: 3)
 * @returns {Promise<{ routed: boolean, escalationLevel: string|null, patternDetected: boolean, error?: string }>}
 */
export async function routeGateFailure(supabase, params, options = {}) {
  const { logger = console, patternThreshold = DEFAULT_PATTERN_THRESHOLD } = options;
  const { sdId, gateType, score, threshold, context = {} } = params;

  if (!supabase || !sdId || !gateType) {
    return { routed: false, escalationLevel: null, patternDetected: false, error: 'Missing required params' };
  }

  try {
    // Record the failure
    const failureRecord = {
      sd_id: sdId,
      gate_type: gateType,
      score,
      threshold,
      context,
      created_at: new Date().toISOString(),
    };

    const { error: insertError } = await supabase
      .from('eva_event_log')
      .insert({
        event_type: 'gate_failure',
        payload: failureRecord,
        created_at: failureRecord.created_at,
      });

    if (insertError) {
      logger.warn(`[GateEscalation] Failed to log gate failure: ${insertError.message}`);
    }

    // Check for pattern
    const { patterns } = await detectPatterns(supabase, {
      sdId,
      gateType,
      patternThreshold,
      logger,
    });

    const patternDetected = patterns.length > 0;

    if (!patternDetected) {
      return { routed: false, escalationLevel: null, patternDetected: false };
    }

    // Determine escalation level
    const level = determineEscalationLevel(patterns[0], threshold, score);

    // Route to chairman
    const { error: escalationError } = await supabase
      .from('chairman_decisions')
      .insert({
        decision_type: 'gate_escalation',
        status: 'pending',
        context: {
          sd_id: sdId,
          gate_type: gateType,
          pattern_count: patterns[0].occurrences,
          recent_scores: patterns[0].recentScores,
          escalation_level: level,
          threshold,
          latest_score: score,
        },
        created_at: new Date().toISOString(),
      });

    if (escalationError) {
      logger.warn(`[GateEscalation] Failed to create escalation: ${escalationError.message}`);
      return { routed: false, escalationLevel: level, patternDetected: true, error: escalationError.message };
    }

    logger.info(`[GateEscalation] Escalated ${gateType} for SD ${sdId} at level ${level}`);

    return { routed: true, escalationLevel: level, patternDetected: true };
  } catch (err) {
    logger.warn(`[GateEscalation] Route error: ${err.message}`);
    return { routed: false, escalationLevel: null, patternDetected: false, error: err.message };
  }
}

/**
 * Detect recurring gate failure patterns.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} [options]
 * @param {string} [options.sdId] - Filter by SD
 * @param {string} [options.gateType] - Filter by gate type
 * @param {number} [options.patternThreshold] - Min occurrences
 * @param {number} [options.lookbackDays] - Days to look back
 * @param {Object} [options.logger] - Logger instance
 * @returns {Promise<{ patterns: Array, totalFailures: number, error?: string }>}
 */
export async function detectPatterns(supabase, options = {}) {
  const {
    sdId,
    gateType,
    patternThreshold = DEFAULT_PATTERN_THRESHOLD,
    lookbackDays = DEFAULT_LOOKBACK_DAYS,
    logger = console,
  } = options;

  if (!supabase) {
    return { patterns: [], totalFailures: 0, error: 'No supabase client' };
  }

  try {
    const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

    let query = supabase
      .from('eva_event_log')
      .select('id, payload, created_at')
      .eq('event_type', 'gate_failure')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false });

    const { data: events, error: queryError } = await query;

    if (queryError) {
      logger.warn(`[GateEscalation] Pattern query failed: ${queryError.message}`);
      return { patterns: [], totalFailures: 0, error: queryError.message };
    }

    const all = events || [];

    // Filter by sdId and gateType if provided
    const filtered = all.filter((e) => {
      const p = e.payload || {};
      if (sdId && p.sd_id !== sdId) return false;
      if (gateType && p.gate_type !== gateType) return false;
      return true;
    });

    // Group by gate_type + sd_id combination
    const groups = {};
    for (const event of filtered) {
      const p = event.payload || {};
      const key = `${p.gate_type}::${p.sd_id}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(event);
    }

    const patterns = [];
    for (const [key, events] of Object.entries(groups)) {
      if (events.length >= patternThreshold) {
        const [gt, sid] = key.split('::');
        patterns.push({
          gateType: gt,
          sdId: sid,
          occurrences: events.length,
          recentScores: events.slice(0, 5).map((e) => e.payload?.score),
          firstSeen: events[events.length - 1].created_at,
          lastSeen: events[0].created_at,
        });
      }
    }

    patterns.sort((a, b) => b.occurrences - a.occurrences);

    return { patterns, totalFailures: filtered.length };
  } catch (err) {
    logger.warn(`[GateEscalation] Detect error: ${err.message}`);
    return { patterns: [], totalFailures: 0, error: err.message };
  }
}

/**
 * Get pending escalation queue for chairman review.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} [options]
 * @param {Object} [options.logger] - Logger instance
 * @returns {Promise<{ queue: Array, totalPending: number, overdueCount: number, error?: string }>}
 */
export async function getEscalationQueue(supabase, options = {}) {
  const { logger = console } = options;

  if (!supabase) {
    return { queue: [], totalPending: 0, overdueCount: 0, error: 'No supabase client' };
  }

  try {
    const { data: decisions, error: queryError } = await supabase
      .from('chairman_decisions')
      .select('id, decision_type, status, context, created_at')
      .eq('decision_type', 'gate_escalation')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (queryError) {
      logger.warn(`[GateEscalation] Queue query failed: ${queryError.message}`);
      return { queue: [], totalPending: 0, overdueCount: 0, error: queryError.message };
    }

    const all = decisions || [];
    const now = Date.now();
    let overdueCount = 0;

    const queue = all.map((d) => {
      const ctx = d.context || {};
      const slaHours = GATE_SLA_HOURS[ctx.gate_type] || GATE_SLA_HOURS.DEFAULT;
      const createdMs = new Date(d.created_at).getTime();
      const ageHours = (now - createdMs) / (1000 * 60 * 60);
      const overdue = ageHours > slaHours;
      if (overdue) overdueCount++;

      return {
        decisionId: d.id,
        gateType: ctx.gate_type,
        sdId: ctx.sd_id,
        escalationLevel: ctx.escalation_level,
        patternCount: ctx.pattern_count,
        ageHours: Math.round(ageHours * 10) / 10,
        slaHours,
        overdue,
      };
    });

    return { queue, totalPending: all.length, overdueCount };
  } catch (err) {
    logger.warn(`[GateEscalation] Queue error: ${err.message}`);
    return { queue: [], totalPending: 0, overdueCount: 0, error: err.message };
  }
}

/**
 * Get the gate SLA configuration.
 * @returns {Object}
 */
export function getGateSLAConfig() {
  return { ...GATE_SLA_HOURS };
}

// ── Internal Helpers ─────────────────────────────

function determineEscalationLevel(pattern, threshold, score) {
  const deficit = threshold - score;
  const deficitPercent = threshold > 0 ? (deficit / threshold) * 100 : 0;

  if (pattern.occurrences >= 5 || deficitPercent > 50) {
    return ESCALATION_LEVELS.CRITICAL;
  }
  if (pattern.occurrences >= 3 || deficitPercent > 25) {
    return ESCALATION_LEVELS.WARN;
  }
  return ESCALATION_LEVELS.INFO;
}
