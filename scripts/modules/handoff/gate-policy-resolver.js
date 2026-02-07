/**
 * Gate Policy Resolver
 * SD-LEO-INFRA-VALIDATION-GATE-REGISTRY-001
 *
 * Queries validation_gate_registry to determine gate applicability
 * for a given SD context. Falls back to default behavior if DB unavailable.
 *
 * Precedence (most specific wins):
 *   1. gate_key + sd_type + validation_profile
 *   2. gate_key + sd_type (validation_profile IS NULL)
 *   3. gate_key + validation_profile (sd_type IS NULL)
 *   4. No match → gate included by default (fail-open)
 */

// In-memory cache with TTL
let _policyCache = null;
let _policyCacheTimestamp = 0;
const CACHE_TTL_MS = parseInt(process.env.GATE_POLICY_CACHE_TTL_SECONDS || '60', 10) * 1000;
const DB_TIMEOUT_MS = parseInt(process.env.GATE_POLICY_DB_TIMEOUT_MS || '200', 10);

// Metrics counters (simple in-process counters)
let _metrics = {
  dbFallbackTotal: 0,
  disabledGateTotal: 0,
  resolutionCount: 0
};

/**
 * Fetch all policy rows from validation_gate_registry
 * Uses caching to minimize DB calls
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Array|null>} Policy rows or null on failure
 */
async function fetchPolicies(supabase) {
  const now = Date.now();

  // Return cached if fresh
  if (_policyCache && (now - _policyCacheTimestamp) < CACHE_TTL_MS) {
    return _policyCache;
  }

  try {
    // Use AbortController for timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DB_TIMEOUT_MS);

    const { data, error } = await supabase
      .from('validation_gate_registry')
      .select('gate_key, sd_type, validation_profile, applicability, reason')
      .abortSignal(controller.signal);

    clearTimeout(timeout);

    if (error) {
      console.log(`   [GatePolicyResolver] ⚠️ DB query error: ${error.message}`);
      return null;
    }

    // Update cache
    _policyCache = data || [];
    _policyCacheTimestamp = now;
    return _policyCache;
  } catch (err) {
    if (err.name === 'AbortError') {
      console.log(`   [GatePolicyResolver] ⚠️ DB query timeout (${DB_TIMEOUT_MS}ms)`);
    } else {
      console.log(`   [GatePolicyResolver] ⚠️ DB error: ${err.message}`);
    }
    return null;
  }
}

/**
 * Resolve the effective applicability for a single gate
 * @param {Array} policies - All policy rows
 * @param {string} gateKey - Gate identifier
 * @param {string} sdType - SD type (lowercase)
 * @param {string} validationProfile - Validation profile (optional)
 * @returns {{ applicability: string, matchedScope: string, reason: string } | null}
 */
function resolveGatePolicy(policies, gateKey, sdType, validationProfile) {
  if (!policies || policies.length === 0) return null;

  // Filter to rows matching this gate_key
  const gatePolicies = policies.filter(p => p.gate_key === gateKey);
  if (gatePolicies.length === 0) return null;

  // Find best match by precedence
  // 1. Exact: sd_type + validation_profile
  if (sdType && validationProfile) {
    const exact = gatePolicies.find(
      p => p.sd_type === sdType && p.validation_profile === validationProfile
    );
    if (exact) {
      return {
        applicability: exact.applicability,
        matchedScope: 'sd_type+profile',
        reason: exact.reason
      };
    }
  }

  // 2. sd_type only
  if (sdType) {
    const byType = gatePolicies.find(
      p => p.sd_type === sdType && !p.validation_profile
    );
    if (byType) {
      return {
        applicability: byType.applicability,
        matchedScope: 'sd_type',
        reason: byType.reason
      };
    }
  }

  // 3. validation_profile only
  if (validationProfile) {
    const byProfile = gatePolicies.find(
      p => !p.sd_type && p.validation_profile === validationProfile
    );
    if (byProfile) {
      return {
        applicability: byProfile.applicability,
        matchedScope: 'profile',
        reason: byProfile.reason
      };
    }
  }

  return null; // No match → default behavior
}

/**
 * Apply gate policies to filter a list of gates
 *
 * @param {Object} supabase - Supabase client
 * @param {Array} gates - Array of gate definitions (with .name property)
 * @param {Object} context - SD context
 * @param {string} context.sdType - SD type (e.g., 'infrastructure')
 * @param {string} [context.validationProfile] - Validation profile
 * @param {string} [context.sdId] - SD ID for logging
 * @returns {Promise<{ filteredGates: Array, resolutions: Array, fallbackUsed: boolean }>}
 */
export async function applyGatePolicies(supabase, gates, context = {}) {
  const featureFlag = process.env.FF_GATE_POLICY_REGISTRY !== 'false'; // Default: enabled
  if (!featureFlag) {
    return { filteredGates: gates, resolutions: [], fallbackUsed: false };
  }

  const sdType = (context.sdType || '').toLowerCase();
  const validationProfile = context.validationProfile || null;
  const sdId = context.sdId || 'unknown';

  // Fetch policies from DB
  const policies = await fetchPolicies(supabase);
  const fallbackUsed = policies === null;

  if (fallbackUsed) {
    _metrics.dbFallbackTotal++;
    console.log(`   [GatePolicyResolver] DB unavailable - using default gate set (fallback #${_metrics.dbFallbackTotal})`);
    return { filteredGates: gates, resolutions: [], fallbackUsed: true };
  }

  const filteredGates = [];
  const resolutions = [];

  for (const gate of gates) {
    const gateKey = gate.name || gate.key || 'unknown';
    const resolution = resolveGatePolicy(policies, gateKey, sdType, validationProfile);

    if (resolution) {
      _metrics.resolutionCount++;

      // Emit structured log event
      const logEvent = {
        event: 'gate_policy_resolution',
        sd_id: sdId,
        sd_type: sdType,
        validation_profile: validationProfile,
        gate_key: gateKey,
        matched_scope: resolution.matchedScope,
        applicability: resolution.applicability,
        fallback_used: false
      };

      resolutions.push(logEvent);

      if (resolution.applicability === 'DISABLED') {
        _metrics.disabledGateTotal++;
        console.log(`   [GatePolicyResolver] DISABLED: ${gateKey} (${resolution.matchedScope}: ${resolution.reason})`);
        continue; // Skip this gate
      }

      // REQUIRED or OPTIONAL → include gate
      filteredGates.push(gate);
    } else {
      // No policy match → include gate (fail-open)
      filteredGates.push(gate);
    }
  }

  const disabledCount = gates.length - filteredGates.length;
  if (disabledCount > 0) {
    console.log(`   [GatePolicyResolver] ${disabledCount} gate(s) disabled by policy for sd_type='${sdType}'`);
  }

  return { filteredGates, resolutions, fallbackUsed: false };
}

/**
 * Get current metrics (for monitoring/testing)
 * @returns {Object} Metric counters
 */
export function getGatePolicyMetrics() {
  return { ..._metrics };
}

/**
 * Reset metrics (for testing)
 */
export function resetGatePolicyMetrics() {
  _metrics = { dbFallbackTotal: 0, disabledGateTotal: 0, resolutionCount: 0 };
}

/**
 * Invalidate the policy cache (for testing or after DB changes)
 */
export function invalidatePolicyCache() {
  _policyCache = null;
  _policyCacheTimestamp = 0;
}

export default { applyGatePolicies, getGatePolicyMetrics, resetGatePolicyMetrics, invalidatePolicyCache };
