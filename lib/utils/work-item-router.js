/**
 * Unified Work-Item Router
 * SD-LEO-ENH-IMPLEMENT-TIERED-QUICK-001
 *
 * Single authoritative routing function that determines whether a work item
 * becomes a Tier 1 auto-approve QF, Tier 2 standard QF, or Tier 3 full SD.
 *
 * Tiers:
 *   Tier 1 (<=tier1_max_loc): Auto-approve QF, skip compliance rubric
 *   Tier 2 (<=tier2_max_loc): Standard QF, requires compliance rubric >=70
 *   Tier 3 (>tier2_max_loc):  Full SD workflow with LEAD approval
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Default thresholds (fallback when DB is unavailable)
const DEFAULT_THRESHOLDS = {
  tier1_max_loc: 30,
  tier2_max_loc: 75,
};

// Cache for active thresholds (5-minute TTL)
let _cachedThresholds = null;
let _cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Keywords that force escalation regardless of LOC
const RISK_KEYWORDS = ['security', 'auth', 'authentication', 'authorization', 'rls', 'payments', 'credentials'];
const SCHEMA_KEYWORDS = ['migration', 'schema', 'alter table', 'create table', 'drop table'];

/**
 * @typedef {Object} RouterInput
 * @property {number} estimatedLoc - Estimated lines of code
 * @property {string} [type] - Work item type (bug, polish, feature, etc.)
 * @property {string} [entryPoint] - Which entry point called the router
 * @property {string[]} [riskTags] - Optional risk tags to force escalation
 * @property {string} [description] - Description text for keyword scanning
 */

/**
 * @typedef {Object} RoutingDecision
 * @property {number} tier - 1, 2, or 3
 * @property {string} tierLabel - 'TIER_1', 'TIER_2', or 'TIER_3'
 * @property {string} workItemType - 'QUICK_FIX' or 'STRATEGIC_DIRECTIVE'
 * @property {boolean} requiresComplianceRubric - Whether compliance scoring is needed
 * @property {number|null} complianceMinScore - Minimum compliance score (null if not required)
 * @property {boolean} requiresLeadReview - Whether LEAD approval is needed
 * @property {string|null} sdType - SD type for Tier 3 (null for Tier 1/2)
 * @property {string} thresholdId - ID of the threshold config used
 * @property {number} tier1MaxLoc - Tier 1 boundary used
 * @property {number} tier2MaxLoc - Tier 2 boundary used
 * @property {string|null} escalationReason - Why escalated (null if not escalated)
 * @property {number} decisionLatencyMs - How long the routing decision took
 */

/**
 * Get active thresholds from database with caching and fallback.
 * @param {Object} [supabase] - Optional Supabase client (created if not provided)
 * @returns {Promise<{id: string, tier1_max_loc: number, tier2_max_loc: number}>}
 */
export async function getActiveThresholds(supabase) {
  const now = Date.now();

  // Return cached if still valid
  if (_cachedThresholds && (now - _cacheTimestamp) < CACHE_TTL_MS) {
    return _cachedThresholds;
  }

  try {
    const client = supabase || createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data, error } = await client
      .from('work_item_thresholds')
      .select('id, tier1_max_loc, tier2_max_loc')
      .eq('is_active', true);

    if (error) {
      console.error('[work-item-router] DB error fetching thresholds:', error.message);
      return { id: 'fallback', ...DEFAULT_THRESHOLDS };
    }

    if (!data || data.length === 0) {
      console.warn('[work-item-router] No active thresholds found, using defaults');
      return { id: 'fallback', ...DEFAULT_THRESHOLDS };
    }

    if (data.length > 1) {
      // Multiple active rows - fail closed to Tier 3
      console.error(`[work-item-router] THRESHOLD_CONFIG_INVALID: ${data.length} active rows found. Fail-closed.`);
      return { id: 'error-multiple-active', tier1_max_loc: 0, tier2_max_loc: 0 };
    }

    _cachedThresholds = data[0];
    _cacheTimestamp = now;
    return _cachedThresholds;
  } catch (err) {
    console.error('[work-item-router] Failed to fetch thresholds:', err.message);
    return { id: 'fallback', ...DEFAULT_THRESHOLDS };
  }
}

/**
 * Clear the threshold cache (useful for testing or after DB updates).
 */
export function clearThresholdCache() {
  _cachedThresholds = null;
  _cacheTimestamp = 0;
}

/**
 * Check if input has risk keywords that should force escalation.
 * @param {RouterInput} input
 * @returns {string|null} Escalation reason or null
 */
function checkRiskEscalation(input) {
  const { type, riskTags, description } = input;

  // Feature type always requires full SD
  if (type === 'feature') {
    return 'Type "feature" requires full Strategic Directive workflow';
  }

  // Explicit risk tags
  if (riskTags && riskTags.length > 0) {
    const matchedTags = riskTags.filter(tag => RISK_KEYWORDS.includes(tag.toLowerCase()));
    if (matchedTags.length > 0) {
      return `Risk tags detected: ${matchedTags.join(', ')}`;
    }
  }

  // Description keyword scanning for schema changes
  if (description) {
    const lowerDesc = description.toLowerCase();
    for (const keyword of SCHEMA_KEYWORDS) {
      if (lowerDesc.includes(keyword)) {
        return `Schema change keyword detected: "${keyword}"`;
      }
    }
    for (const keyword of RISK_KEYWORDS) {
      if (lowerDesc.includes(keyword)) {
        return `Security/risk keyword detected: "${keyword}"`;
      }
    }
  }

  return null;
}

/**
 * Route a work item to the appropriate tier and workflow.
 *
 * @param {RouterInput} input - Work item details
 * @param {Object} [supabase] - Optional Supabase client
 * @returns {Promise<RoutingDecision>} The routing decision
 */
export async function routeWorkItem(input, supabase) {
  const startTime = Date.now();
  const { estimatedLoc = 0, type, entryPoint } = input;

  // Check for forced escalation via risk keywords
  const riskReason = checkRiskEscalation(input);
  if (riskReason) {
    const thresholds = await getActiveThresholds(supabase);
    return {
      tier: 3,
      tierLabel: 'TIER_3',
      workItemType: 'STRATEGIC_DIRECTIVE',
      requiresComplianceRubric: false,
      complianceMinScore: null,
      requiresLeadReview: true,
      sdType: type || 'enhancement',
      thresholdId: thresholds.id,
      tier1MaxLoc: thresholds.tier1_max_loc,
      tier2MaxLoc: thresholds.tier2_max_loc,
      escalationReason: riskReason,
      decisionLatencyMs: Date.now() - startTime,
    };
  }

  // Get active thresholds
  const thresholds = await getActiveThresholds(supabase);

  let tier, tierLabel, workItemType, requiresComplianceRubric, complianceMinScore, requiresLeadReview, sdType, escalationReason;

  if (estimatedLoc <= thresholds.tier1_max_loc) {
    // Tier 1: Auto-approve QF, skip compliance
    tier = 1;
    tierLabel = 'TIER_1';
    workItemType = 'QUICK_FIX';
    requiresComplianceRubric = false;
    complianceMinScore = null;
    requiresLeadReview = false;
    sdType = null;
    escalationReason = null;
  } else if (estimatedLoc <= thresholds.tier2_max_loc) {
    // Tier 2: Standard QF with compliance rubric
    tier = 2;
    tierLabel = 'TIER_2';
    workItemType = 'QUICK_FIX';
    requiresComplianceRubric = true;
    complianceMinScore = 70;
    requiresLeadReview = false;
    sdType = null;
    escalationReason = null;
  } else {
    // Tier 3: Full SD workflow
    tier = 3;
    tierLabel = 'TIER_3';
    workItemType = 'STRATEGIC_DIRECTIVE';
    requiresComplianceRubric = false;
    complianceMinScore = null;
    requiresLeadReview = true;
    sdType = type || 'enhancement';
    escalationReason = `Estimated LOC (${estimatedLoc}) exceeds Tier 2 max (${thresholds.tier2_max_loc})`;
  }

  const decision = {
    tier,
    tierLabel,
    workItemType,
    requiresComplianceRubric,
    complianceMinScore,
    requiresLeadReview,
    sdType,
    thresholdId: thresholds.id,
    tier1MaxLoc: thresholds.tier1_max_loc,
    tier2MaxLoc: thresholds.tier2_max_loc,
    escalationReason,
    decisionLatencyMs: Date.now() - startTime,
  };

  // Structured logging
  console.log(`[work-item-router] Decision: tier=${tier} loc=${estimatedLoc} type=${type || 'unspecified'} entry=${entryPoint || 'unknown'} threshold=${thresholds.id} latency=${decision.decisionLatencyMs}ms`);

  return decision;
}

export default { routeWorkItem, getActiveThresholds, clearThresholdCache };
