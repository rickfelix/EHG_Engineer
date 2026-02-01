/**
 * Feedback Sanitizer
 * SD-LEO-SELF-IMPROVE-001C - Phase 1: Feedback Quality Layer
 *
 * Provides PII redaction and prompt injection detection for feedback items.
 * Loads patterns from feedback_quality_config database table.
 *
 * Features:
 * - Pattern-based PII detection and redaction
 * - Prompt injection pattern detection with risk scoring
 * - Configurable redaction tokens
 * - Pattern caching for performance
 *
 * @module lib/quality/sanitizer
 */

import { createClient } from '@supabase/supabase-js';

// Configuration cache
let configCache = null;
let configCacheTime = 0;
const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get Supabase client for config loading
 * @returns {Object} Supabase client
 */
function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing Supabase credentials for sanitizer config');
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

/**
 * Load active configuration from database with caching
 * @returns {Promise<Object>} Active feedback quality config
 */
export async function loadConfig() {
  const now = Date.now();

  // Return cached config if still valid
  if (configCache && (now - configCacheTime) < CONFIG_CACHE_TTL_MS) {
    return configCache;
  }

  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('feedback_quality_config')
    .select('*')
    .eq('status', 'active')
    .single();

  if (error) {
    console.error('[Sanitizer] Failed to load config:', error.message);
    throw new Error(`Failed to load feedback quality config: ${error.message}`);
  }

  if (!data) {
    throw new Error('No active feedback quality configuration found');
  }

  // Update cache
  configCache = data;
  configCacheTime = now;

  return data;
}

/**
 * Clear the configuration cache (useful for testing)
 */
export function clearConfigCache() {
  configCache = null;
  configCacheTime = 0;
}

/**
 * Compile a pattern string into a RegExp
 * @param {Object} patternDef - Pattern definition from config
 * @returns {RegExp} Compiled regular expression
 */
function compilePattern(patternDef) {
  let flags = patternDef.flags || 'gi'; // Default: global, case-insensitive
  // Ensure global flag is present for matchAll compatibility
  if (!flags.includes('g')) {
    flags = 'g' + flags;
  }
  return new RegExp(patternDef.pattern, flags);
}

/**
 * Apply sanitization patterns to text, redacting matched content
 * @param {string} text - Text to sanitize
 * @param {Array} patterns - Sanitization pattern definitions
 * @param {Object} redactionTokens - Replacement tokens by type
 * @returns {{ sanitized: string, redactions: Array<Object> }}
 */
function applySanitizationPatterns(text, patterns, redactionTokens) {
  if (!text || typeof text !== 'string') {
    return { sanitized: text || '', redactions: [] };
  }

  let sanitized = text;
  const redactions = [];

  for (const patternDef of patterns) {
    try {
      const regex = compilePattern(patternDef);
      const matches = sanitized.matchAll(new RegExp(regex.source, regex.flags));

      for (const match of matches) {
        const token = redactionTokens[patternDef.type] || '[REDACTED]';

        redactions.push({
          type: patternDef.type,
          severity: patternDef.severity,
          position: match.index,
          length: match[0].length,
          action: patternDef.action || 'redact'
        });
      }

      // Apply redaction
      const token = redactionTokens[patternDef.type] || '[REDACTED]';
      sanitized = sanitized.replace(regex, token);

    } catch (patternError) {
      console.warn(`[Sanitizer] Invalid pattern for ${patternDef.type}:`, patternError.message);
    }
  }

  return { sanitized, redactions };
}

/**
 * Detect prompt injection patterns and calculate risk score
 * @param {string} text - Text to analyze
 * @param {Array} injectionPatterns - Injection pattern definitions
 * @returns {{ detected: boolean, risk_score: number, patterns: Array<Object> }}
 */
function detectInjectionPatterns(text, injectionPatterns) {
  if (!text || typeof text !== 'string') {
    return { detected: false, risk_score: 0, patterns: [] };
  }

  const matchedPatterns = [];
  let maxRiskScore = 0;

  for (const patternDef of injectionPatterns) {
    try {
      const regex = compilePattern(patternDef);

      if (regex.test(text)) {
        const riskScore = patternDef.risk_score || 80; // Default high risk

        matchedPatterns.push({
          type: patternDef.type,
          severity: patternDef.severity,
          risk_score: riskScore
        });

        maxRiskScore = Math.max(maxRiskScore, riskScore);
      }
    } catch (patternError) {
      console.warn(`[Sanitizer] Invalid injection pattern for ${patternDef.type}:`, patternError.message);
    }
  }

  return {
    detected: matchedPatterns.length > 0,
    risk_score: maxRiskScore,
    patterns: matchedPatterns
  };
}

/**
 * Sanitize feedback content
 * @param {Object} feedback - Feedback item to sanitize
 * @param {Object} options - Sanitization options
 * @param {boolean} options.skipSanitization - Skip PII sanitization
 * @param {boolean} options.skipInjectionCheck - Skip injection detection
 * @returns {Promise<Object>} Sanitization result
 */
export async function sanitize(feedback, options = {}) {
  const config = await loadConfig();

  // Check feature flags
  const skipSanitization = options.skipSanitization || !config.enable_sanitization;
  const skipInjectionCheck = options.skipInjectionCheck || !config.enable_quarantine;

  const result = {
    original: { ...feedback },
    sanitized: { ...feedback },
    redactions: [],
    injection: { detected: false, risk_score: 0, patterns: [] },
    processing_time_ms: 0
  };

  const startTime = Date.now();

  try {
    // Fields to sanitize
    const fieldsToSanitize = ['title', 'description', 'source_url', 'context'];

    // Apply PII sanitization
    if (!skipSanitization && config.sanitization_patterns?.length > 0) {
      for (const field of fieldsToSanitize) {
        if (feedback[field] && typeof feedback[field] === 'string') {
          const { sanitized, redactions } = applySanitizationPatterns(
            feedback[field],
            config.sanitization_patterns,
            config.redaction_tokens || {}
          );

          result.sanitized[field] = sanitized;

          if (redactions.length > 0) {
            result.redactions.push(...redactions.map(r => ({ ...r, field })));
          }
        }
      }
    }

    // Detect injection patterns (combine all text fields)
    if (!skipInjectionCheck && config.injection_patterns?.length > 0) {
      const allText = fieldsToSanitize
        .map(f => feedback[f] || '')
        .filter(Boolean)
        .join(' ');

      result.injection = detectInjectionPatterns(allText, config.injection_patterns);
    }

    result.processing_time_ms = Date.now() - startTime;

    return result;

  } catch (error) {
    console.error('[Sanitizer] Sanitization failed:', error.message);
    result.error = error.message;
    result.processing_time_ms = Date.now() - startTime;
    return result;
  }
}

/**
 * Quick check if content contains potential PII or injection
 * @param {string} text - Text to check
 * @returns {Promise<{ hasPII: boolean, hasInjection: boolean, riskScore: number }>}
 */
export async function quickRiskCheck(text) {
  if (!text || typeof text !== 'string') {
    return { hasPII: false, hasInjection: false, riskScore: 0 };
  }

  const config = await loadConfig();

  // Check for PII
  let hasPII = false;
  for (const pattern of config.sanitization_patterns || []) {
    try {
      const regex = compilePattern(pattern);
      if (regex.test(text)) {
        hasPII = true;
        break;
      }
    } catch {
      // Skip invalid patterns
    }
  }

  // Check for injection
  const injectionResult = detectInjectionPatterns(text, config.injection_patterns || []);

  return {
    hasPII,
    hasInjection: injectionResult.detected,
    riskScore: injectionResult.risk_score
  };
}

/**
 * Get configured thresholds
 * @returns {Promise<Object>} Threshold configuration
 */
export async function getThresholds() {
  const config = await loadConfig();

  return {
    lowQualityThreshold: config.threshold_low,
    quarantineRiskThreshold: config.quarantine_risk_threshold,
    qualityScoreRange: {
      min: config.quality_score_min,
      max: config.quality_score_max
    }
  };
}

// Export default for CommonJS compatibility
export default {
  sanitize,
  quickRiskCheck,
  loadConfig,
  clearConfigCache,
  getThresholds
};
