/**
 * Feature Flag Evaluator
 * SD-LEO-SELF-IMPROVE-001D - Phase 1.5: Feature Flag Foundation
 *
 * Provides deterministic flag evaluation with rollout percentages,
 * user targeting, and CONST-009 kill switch integration.
 *
 * @module lib/feature-flags/evaluator
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Cache configuration
let flagCache = new Map();
let killSwitchCache = null;
let lastCacheRefresh = 0;
const CACHE_TTL_MS = 30 * 1000; // 30 seconds

// Singleton Supabase client
let supabaseClient = null;

/**
 * Get or create Supabase client
 * @returns {Object} Supabase client instance
 */
function getSupabase() {
  if (!supabaseClient) {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error('Missing Supabase credentials for feature flag evaluator');
    }

    supabaseClient = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return supabaseClient;
}

/**
 * Generate deterministic hash for rollout percentage evaluation
 * Uses flagKey + subjectId to ensure consistent results across calls
 * @param {string} flagKey - Feature flag key
 * @param {string} subjectId - User/subject identifier
 * @returns {number} Hash value 0-99
 */
function generateRolloutHash(flagKey, subjectId) {
  const input = `${flagKey}:${subjectId}`;
  const hash = crypto.createHash('md5').update(input).digest('hex');
  // Take first 8 hex chars and convert to number, then mod 100
  const hashNum = parseInt(hash.substring(0, 8), 16);
  return hashNum % 100;
}

/**
 * Refresh cache if stale
 */
async function refreshCacheIfNeeded() {
  const now = Date.now();
  if (now - lastCacheRefresh < CACHE_TTL_MS) {
    return;
  }

  const supabase = getSupabase();

  // Fetch all flags with their policies
  const { data: flags, error: flagsError } = await supabase
    .from('leo_feature_flags')
    .select('*, leo_feature_flag_policies(*)');

  if (!flagsError && flags) {
    flagCache.clear();
    for (const flag of flags) {
      flagCache.set(flag.flag_key, flag);
    }
  }

  // Fetch CONST-009 kill switch
  const { data: killSwitch, error: killError } = await supabase
    .from('leo_kill_switches')
    .select('*')
    .eq('switch_key', 'CONST-009')
    .single();

  if (!killError && killSwitch) {
    killSwitchCache = killSwitch;
  }

  lastCacheRefresh = now;
}

/**
 * Force cache refresh (useful for testing or after config changes)
 */
export function clearCache() {
  flagCache.clear();
  killSwitchCache = null;
  lastCacheRefresh = 0;
}

/**
 * Evaluate a feature flag for a given context
 *
 * Evaluation order:
 * 1. Check CONST-009 kill switch - if active, return disabled
 * 2. Check if flag exists and is globally enabled
 * 3. Check user targeting (allowlist overrides, blocklist blocks)
 * 4. Check rollout percentage using deterministic hashing
 *
 * @param {string} flagKey - Feature flag key to evaluate
 * @param {Object} context - Evaluation context
 * @param {string} context.subjectId - User/subject identifier for rollout
 * @param {string} context.environment - Environment (default: 'production')
 * @returns {Promise<Object>} Evaluation result
 */
export async function evaluateFlag(flagKey, context = {}) {
  const startTime = Date.now();
  const { subjectId = 'anonymous', environment = 'production' } = context;

  const result = {
    flagKey,
    enabled: false,
    reason: 'unknown',
    subjectId,
    environment,
    evaluationTimeMs: 0
  };

  try {
    await refreshCacheIfNeeded();

    // Step 1: Check CONST-009 kill switch
    if (killSwitchCache?.is_active === true) {
      result.enabled = false;
      result.reason = 'kill_switch_active';
      result.evaluationTimeMs = Date.now() - startTime;
      return result;
    }

    // Step 2: Get flag from cache
    const flag = flagCache.get(flagKey);

    if (!flag) {
      result.enabled = false;
      result.reason = 'flag_not_found';
      result.evaluationTimeMs = Date.now() - startTime;
      return result;
    }

    // Step 3: Check lifecycle state (SD-LEO-SELF-IMPROVE-001K)
    // Expired and archived flags are treated as disabled regardless of is_enabled
    const lifecycleState = flag.lifecycle_state || 'enabled';
    if (lifecycleState === 'expired' || lifecycleState === 'archived') {
      result.enabled = false;
      result.reason = `lifecycle_${lifecycleState}`;
      result.lifecycleState = lifecycleState;
      result.evaluationTimeMs = Date.now() - startTime;
      return result;
    }

    // Step 4: Check global enabled state
    if (!flag.is_enabled || lifecycleState === 'disabled' || lifecycleState === 'draft') {
      result.enabled = false;
      result.reason = lifecycleState === 'draft' ? 'lifecycle_draft' : 'globally_disabled';
      result.lifecycleState = lifecycleState;
      result.evaluationTimeMs = Date.now() - startTime;
      return result;
    }

    // Step 5: Get policy for environment
    const policy = flag.leo_feature_flag_policies?.find(p => p.environment === environment);

    if (!policy) {
      // No policy = enabled by default if flag is enabled
      result.enabled = true;
      result.reason = 'no_policy_default_enabled';
      result.evaluationTimeMs = Date.now() - startTime;
      return result;
    }

    // Step 6: Check user targeting - allowlist override
    const allowlist = policy.user_targeting?.allowlist?.subject_ids || [];
    if (allowlist.length > 0 && allowlist.includes(subjectId)) {
      result.enabled = true;
      result.reason = 'allowlist_match';
      result.evaluationTimeMs = Date.now() - startTime;
      return result;
    }

    // Step 7: Check user targeting - blocklist
    const blocklist = policy.user_targeting?.blocklist?.subject_ids || [];
    if (blocklist.length > 0 && blocklist.includes(subjectId)) {
      result.enabled = false;
      result.reason = 'blocklist_match';
      result.evaluationTimeMs = Date.now() - startTime;
      return result;
    }

    // Step 8: Check rollout percentage
    const rolloutPercentage = policy.rollout_percentage ?? 100;

    if (rolloutPercentage === 100) {
      result.enabled = true;
      result.reason = 'rollout_100_percent';
      result.evaluationTimeMs = Date.now() - startTime;
      return result;
    }

    if (rolloutPercentage === 0) {
      result.enabled = false;
      result.reason = 'rollout_0_percent';
      result.evaluationTimeMs = Date.now() - startTime;
      return result;
    }

    // Deterministic rollout based on hash
    const hashValue = generateRolloutHash(flagKey, subjectId);
    const isInRollout = hashValue < rolloutPercentage;

    result.enabled = isInRollout;
    result.reason = isInRollout ? 'rollout_included' : 'rollout_excluded';
    result.rolloutHash = hashValue;
    result.rolloutThreshold = rolloutPercentage;
    result.evaluationTimeMs = Date.now() - startTime;

    return result;

  } catch (error) {
    result.enabled = false;
    result.reason = 'evaluation_error';
    result.error = error.message;
    result.evaluationTimeMs = Date.now() - startTime;
    return result;
  }
}

/**
 * Evaluate multiple flags at once (batch evaluation)
 * @param {Array<string>} flagKeys - Array of flag keys to evaluate
 * @param {Object} context - Evaluation context
 * @returns {Promise<Map<string, Object>>} Map of flagKey to evaluation result
 */
export async function evaluateFlags(flagKeys, context = {}) {
  const results = new Map();

  // Ensure cache is fresh before batch evaluation
  await refreshCacheIfNeeded();

  // Evaluate each flag
  for (const flagKey of flagKeys) {
    results.set(flagKey, await evaluateFlag(flagKey, context));
  }

  return results;
}

/**
 * Quick check if a flag is enabled (simplified boolean return)
 * @param {string} flagKey - Feature flag key
 * @param {Object} context - Evaluation context
 * @returns {Promise<boolean>} True if enabled
 */
export async function isEnabled(flagKey, context = {}) {
  const result = await evaluateFlag(flagKey, context);
  return result.enabled;
}

/**
 * Check if CONST-009 kill switch is currently active
 * @returns {Promise<boolean>} True if kill switch is active
 */
export async function isKillSwitchActive() {
  await refreshCacheIfNeeded();
  return killSwitchCache?.is_active === true;
}

/**
 * Get all enabled flags for a context (useful for client-side hydration)
 * @param {Object} context - Evaluation context
 * @returns {Promise<Object>} Object with flagKey: boolean pairs
 */
export async function getEnabledFlags(context = {}) {
  await refreshCacheIfNeeded();

  const enabledFlags = {};

  for (const [flagKey] of flagCache) {
    const result = await evaluateFlag(flagKey, context);
    enabledFlags[flagKey] = result.enabled;
  }

  return enabledFlags;
}

// Default export for CommonJS compatibility
export default {
  evaluateFlag,
  evaluateFlags,
  isEnabled,
  isKillSwitchActive,
  getEnabledFlags,
  clearCache
};
