/**
 * Capability Reuse Tracker
 * SD: SD-CAP-LEDGER-001 | US-005
 *
 * Tracks and reports on capability reuse across SDs and ventures.
 * Measures "ecosystem lift" - the value generated through capability reuse.
 *
 * Key Metrics:
 * - Reuse Count: How many times a capability is reused
 * - Reuse Rate: Reuses per month of existence
 * - Ecosystem Lift: Value multiplier from reuse
 * - Compounding Factor: Rate of capability growth
 */

import { CAPABILITY_TYPES } from './capability-taxonomy.js';
// CAPABILITY_CATEGORIES available in ./capability-taxonomy.js if needed

/**
 * Reuse tracking configuration
 */
export const REUSE_CONFIG = {
  // Reuse types with their multipliers
  REUSE_TYPES: {
    direct: { multiplier: 1.0, description: 'Direct reuse without modification' },
    extended: { multiplier: 0.8, description: 'Extended with additional features' },
    forked: { multiplier: 0.5, description: 'Forked and modified significantly' },
    referenced: { multiplier: 0.3, description: 'Referenced for patterns/inspiration' },
  },

  // Ecosystem lift thresholds
  LIFT_THRESHOLDS: {
    LOW: { maxReuses: 2, multiplier: 1.0 },
    MEDIUM: { maxReuses: 5, multiplier: 1.5 },
    HIGH: { maxReuses: 10, multiplier: 2.0 },
    EXCEPTIONAL: { maxReuses: Infinity, multiplier: 3.0 },
  },

  // Compounding calculation window (days)
  COMPOUNDING_WINDOW: 90,
};

/**
 * Calculate ecosystem lift for a capability
 *
 * Ecosystem Lift = Base Value * (1 + Weighted Reuse Factor)
 *
 * @param {Object} capability - Capability with reuse metrics
 * @returns {Object} Ecosystem lift calculation
 */
export function calculateEcosystemLift(capability) {
  const reuseCount = capability.reuse_count || 0;
  const reusedBy = capability.reused_by_sds || [];

  if (reuseCount === 0) {
    return {
      lift_multiplier: 1.0,
      total_value_generated: capability.plane1_score || 0,
      reuse_breakdown: [],
      lift_category: 'NONE',
    };
  }

  // Calculate weighted reuse factor based on reuse types
  let weightedReuses = 0;
  const reuseBreakdown = [];

  for (const reuse of reusedBy) {
    const reuseType = reuse.type || 'direct';
    const typeConfig = REUSE_CONFIG.REUSE_TYPES[reuseType] || REUSE_CONFIG.REUSE_TYPES.direct;
    const weightedValue = typeConfig.multiplier;
    weightedReuses += weightedValue;

    reuseBreakdown.push({
      sd_id: reuse.sd_id,
      date: reuse.date,
      type: reuseType,
      weighted_value: weightedValue,
    });
  }

  // Determine lift category
  let liftCategory = 'LOW';
  let categoryMultiplier = 1.0;

  for (const [category, config] of Object.entries(REUSE_CONFIG.LIFT_THRESHOLDS)) {
    if (reuseCount <= config.maxReuses) {
      liftCategory = category;
      categoryMultiplier = config.multiplier;
      break;
    }
  }

  // Calculate final lift multiplier
  const baseLift = 1 + (weightedReuses * 0.2); // 20% lift per weighted reuse
  const liftMultiplier = baseLift * categoryMultiplier;

  // Calculate total value generated
  const baseValue = capability.plane1_score || 1;
  const totalValueGenerated = baseValue * liftMultiplier;

  return {
    lift_multiplier: Math.round(liftMultiplier * 100) / 100,
    total_value_generated: Math.round(totalValueGenerated * 100) / 100,
    base_value: baseValue,
    weighted_reuses: Math.round(weightedReuses * 100) / 100,
    reuse_count: reuseCount,
    reuse_breakdown: reuseBreakdown,
    lift_category: liftCategory,
  };
}

/**
 * Calculate compounding factor for capability growth
 *
 * Measures how fast the capability ecosystem is growing
 *
 * @param {Array} capabilities - All capabilities with timestamps
 * @param {number} windowDays - Time window for calculation
 * @returns {Object} Compounding metrics
 */
export function calculateCompoundingFactor(capabilities, windowDays = REUSE_CONFIG.COMPOUNDING_WINDOW) {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  // Count capabilities created in window
  const recentCapabilities = capabilities.filter((c) => {
    const createdAt = new Date(c.first_registered_at || c.created_at);
    return createdAt >= windowStart;
  });

  // Count capabilities before window
  const previousCapabilities = capabilities.filter((c) => {
    const createdAt = new Date(c.first_registered_at || c.created_at);
    return createdAt < windowStart;
  });

  const previousCount = previousCapabilities.length;
  const recentCount = recentCapabilities.length;
  const totalCount = capabilities.length;

  // Calculate growth rate
  let growthRate = 0;
  if (previousCount > 0) {
    growthRate = (recentCount / previousCount) * 100;
  } else if (recentCount > 0) {
    growthRate = 100; // All capabilities are new
  }

  // Count total reuses in window
  let recentReuses = 0;
  for (const cap of capabilities) {
    const reusedBy = cap.reused_by_sds || [];
    for (const reuse of reusedBy) {
      const reuseDate = new Date(reuse.date);
      if (reuseDate >= windowStart) {
        recentReuses++;
      }
    }
  }

  // Calculate reuse velocity
  const reuseVelocity = recentReuses / (windowDays / 30); // Reuses per month

  // Calculate compounding factor
  // Higher when both growth rate and reuse velocity are high
  const compoundingFactor = (growthRate * 0.3 + reuseVelocity * 10 * 0.7) / 100;

  return {
    window_days: windowDays,
    total_capabilities: totalCount,
    new_capabilities: recentCount,
    previous_capabilities: previousCount,
    growth_rate_percent: Math.round(growthRate * 10) / 10,
    recent_reuses: recentReuses,
    reuse_velocity_per_month: Math.round(reuseVelocity * 10) / 10,
    compounding_factor: Math.round(compoundingFactor * 100) / 100,
    health_status: getHealthStatus(compoundingFactor),
  };
}

/**
 * Determine ecosystem health status
 */
function getHealthStatus(compoundingFactor) {
  if (compoundingFactor >= 0.8) {
    return { status: 'THRIVING', emoji: '🚀', message: 'Excellent capability growth and reuse' };
  }
  if (compoundingFactor >= 0.5) {
    return { status: 'HEALTHY', emoji: '✅', message: 'Good capability ecosystem' };
  }
  if (compoundingFactor >= 0.2) {
    return { status: 'DEVELOPING', emoji: '📈', message: 'Growing capability base' };
  }
  return { status: 'NASCENT', emoji: '🌱', message: 'Early stage capability development' };
}

/**
 * Generate reuse report for capabilities
 *
 * @param {Array} capabilities - Array of capabilities from ledger
 * @returns {Object} Comprehensive reuse report
 */
export function generateReuseReport(capabilities) {
  if (!capabilities || capabilities.length === 0) {
    return {
      summary: { total: 0, with_reuse: 0, total_reuses: 0 },
      ecosystem_lift: { total: 0 },
      top_reused: [],
      by_category: {},
      compounding: null,
    };
  }

  // Calculate lift for each capability
  const withLift = capabilities.map((cap) => ({
    ...cap,
    ecosystem_lift: calculateEcosystemLift(cap),
  }));

  // Summary stats
  const withReuse = withLift.filter((c) => (c.reuse_count || 0) > 0);
  const totalReuses = withLift.reduce((sum, c) => sum + (c.reuse_count || 0), 0);
  const totalLift = withLift.reduce(
    (sum, c) => sum + (c.ecosystem_lift?.total_value_generated || c.plane1_score || 0),
    0
  );

  // Top 10 most reused
  const topReused = [...withLift]
    .sort((a, b) => (b.reuse_count || 0) - (a.reuse_count || 0))
    .slice(0, 10)
    .map((c) => ({
      capability_key: c.capability_key,
      capability_type: c.capability_type,
      reuse_count: c.reuse_count || 0,
      lift_multiplier: c.ecosystem_lift?.lift_multiplier || 1,
      total_value: c.ecosystem_lift?.total_value_generated || 0,
    }));

  // By category
  const byCategory = {};
  for (const cap of withLift) {
    const type = CAPABILITY_TYPES[cap.capability_type];
    const category = type?.category || 'unknown';

    if (!byCategory[category]) {
      byCategory[category] = {
        count: 0,
        total_reuses: 0,
        total_lift: 0,
        capabilities: [],
      };
    }

    byCategory[category].count++;
    byCategory[category].total_reuses += cap.reuse_count || 0;
    byCategory[category].total_lift += cap.ecosystem_lift?.total_value_generated || 0;
    byCategory[category].capabilities.push(cap.capability_key);
  }

  // Calculate compounding
  const compounding = calculateCompoundingFactor(capabilities);

  return {
    summary: {
      total: capabilities.length,
      with_reuse: withReuse.length,
      reuse_rate: Math.round((withReuse.length / capabilities.length) * 100),
      total_reuses: totalReuses,
      avg_reuses_per_capability: Math.round((totalReuses / capabilities.length) * 10) / 10,
    },
    ecosystem_lift: {
      total: Math.round(totalLift * 100) / 100,
      average: Math.round((totalLift / capabilities.length) * 100) / 100,
      lift_ratio: Math.round((totalLift / capabilities.reduce((s, c) => s + (c.plane1_score || 1), 0)) * 100) / 100,
    },
    top_reused: topReused,
    by_category: byCategory,
    compounding,
  };
}

/**
 * Record a capability reuse event
 *
 * @param {Object} supabaseClient - Supabase client
 * @param {string} capabilityKey - Key of capability being reused
 * @param {string} reusingSDId - ID of SD that's reusing it
 * @param {string} context - Description of how it's being reused
 * @param {string} reuseType - Type of reuse (direct, extended, forked, referenced)
 */
export async function recordReuseEvent(
  supabaseClient,
  capabilityKey,
  reusingSDId,
  context = null,
  reuseType = 'direct'
) {
  // Use the database function
  const { error } = await supabaseClient.rpc('fn_record_capability_reuse', {
    p_capability_key: capabilityKey,
    p_reusing_sd_id: reusingSDId,
    p_reuse_context: context,
    p_reuse_type: reuseType,
  });

  if (error) {
    console.error('Error recording reuse event:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Get reuse suggestions for an SD
 *
 * Analyzes the SD and suggests capabilities from the ledger that could be reused
 *
 * @param {Object} supabaseClient - Supabase client
 * @param {Object} sd - Strategic Directive to analyze
 * @returns {Array} Suggested capabilities for reuse
 */
export async function getReusesuggestions(supabaseClient, sd) {
  // Get all capabilities from ledger
  const { data: capabilities, error } = await supabaseClient
    .from('v_capability_ledger')
    .select('*')
    .order('plane1_score', { ascending: false })
    .limit(100);

  if (error || !capabilities) {
    return [];
  }

  const suggestions = [];

  // Analyze SD title and description for keyword matches
  const sdText = `${sd.title || ''} ${sd.description || ''} ${sd.scope || ''}`.toLowerCase();

  for (const cap of capabilities) {
    const capText = `${cap.capability_key} ${cap.name || ''} ${cap.description || ''}`.toLowerCase();

    // Simple keyword matching (could be enhanced with embeddings)
    const keywords = capText.split(/\W+/).filter((w) => w.length > 3);
    const matches = keywords.filter((kw) => sdText.includes(kw));

    if (matches.length >= 2) {
      suggestions.push({
        capability_key: cap.capability_key,
        capability_type: cap.capability_type,
        name: cap.name,
        plane1_score: cap.plane1_score,
        reuse_count: cap.reuse_count,
        relevance_score: matches.length,
        matching_keywords: matches.slice(0, 5),
      });
    }
  }

  // Sort by relevance * plane1_score
  return suggestions
    .sort((a, b) => (b.relevance_score * b.plane1_score) - (a.relevance_score * a.plane1_score))
    .slice(0, 10);
}

/**
 * Format reuse report for display
 */
export function formatReuseReport(report) {
  const health = report.compounding?.health_status || { emoji: '❓', status: 'UNKNOWN' };

  return `
╔══════════════════════════════════════════════════════════════════╗
║              CAPABILITY REUSE REPORT                              ║
║              ${health.emoji} ${health.status.padEnd(20)}                            ║
╠══════════════════════════════════════════════════════════════════╣
║  SUMMARY                                                          ║
║    Total Capabilities:     ${String(report.summary.total).padStart(5)}                              ║
║    With Reuse:             ${String(report.summary.with_reuse).padStart(5)} (${report.summary.reuse_rate}%)                        ║
║    Total Reuse Events:     ${String(report.summary.total_reuses).padStart(5)}                              ║
║    Avg Reuses/Capability:  ${String(report.summary.avg_reuses_per_capability).padStart(5)}                              ║
╠══════════════════════════════════════════════════════════════════╣
║  ECOSYSTEM LIFT                                                   ║
║    Total Value Generated:  ${String(report.ecosystem_lift.total).padStart(8)}                          ║
║    Average per Capability: ${String(report.ecosystem_lift.average).padStart(8)}                          ║
║    Lift Ratio:             ${String(report.ecosystem_lift.lift_ratio).padStart(8)}x                         ║
╠══════════════════════════════════════════════════════════════════╣
║  COMPOUNDING FACTOR: ${String(report.compounding?.compounding_factor || 0).padStart(5)}                                ║
║    Growth Rate:            ${String(report.compounding?.growth_rate_percent || 0).padStart(5)}%                             ║
║    Reuse Velocity:         ${String(report.compounding?.reuse_velocity_per_month || 0).padStart(5)}/month                        ║
╠══════════════════════════════════════════════════════════════════╣
║  TOP REUSED CAPABILITIES                                          ║
${report.top_reused
    .slice(0, 5)
    .map((c) => `║    ${String(c.reuse_count).padStart(3)}x | ${c.capability_type.padEnd(15)} | ${c.capability_key.substring(0, 30).padEnd(30)}║`)
    .join('\n') || '║    (No reuse data yet)                                            ║'}
╚══════════════════════════════════════════════════════════════════╝
`.trim();
}

export default {
  REUSE_CONFIG,
  calculateEcosystemLift,
  calculateCompoundingFactor,
  generateReuseReport,
  recordReuseEvent,
  getReusesuggestions,
  formatReuseReport,
};
