/**
 * Ignore Patterns for Quality Lifecycle System
 *
 * Manages patterns for permanently ignoring certain types of errors/feedback
 * that are known to be non-actionable (e.g., expected errors, third-party issues).
 * Part of SD-QUALITY-TRIAGE-001: Triage & Prioritization Engine
 *
 * @module lib/quality/ignore-patterns
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Pattern types that can be used for matching
 */
export const PATTERN_TYPES = {
  EXACT: 'exact',           // Exact string match
  CONTAINS: 'contains',     // Contains substring
  REGEX: 'regex',           // Regular expression
  GLOB: 'glob'              // Glob pattern (*, ?)
};

/**
 * Fields that can be matched against
 */
export const MATCHABLE_FIELDS = [
  'title',
  'error_type',
  'source_file',
  'source_application',
  'error_message',
  'stack_trace'
];

/**
 * In-memory cache of active patterns for performance
 */
let patternsCache = null;
let patternsCacheExpiry = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Create a new ignore pattern
 *
 * @param {Object} pattern - Pattern definition
 * @param {string} pattern.field - Field to match against (e.g., 'title', 'error_type')
 * @param {string} pattern.type - Pattern type (exact, contains, regex, glob)
 * @param {string} pattern.value - Pattern value to match
 * @param {string} [pattern.reason] - Reason for ignoring
 * @param {string} [pattern.createdBy] - User who created the pattern
 * @param {Date} [pattern.expiresAt] - Optional expiration date
 * @returns {Object} Created pattern
 */
export async function createIgnorePattern(pattern) {
  if (!MATCHABLE_FIELDS.includes(pattern.field)) {
    throw new Error(`Invalid field: ${pattern.field}. Must be one of: ${MATCHABLE_FIELDS.join(', ')}`);
  }

  if (!Object.values(PATTERN_TYPES).includes(pattern.type)) {
    throw new Error(`Invalid pattern type: ${pattern.type}. Must be one of: ${Object.values(PATTERN_TYPES).join(', ')}`);
  }

  // Validate regex patterns
  if (pattern.type === PATTERN_TYPES.REGEX) {
    try {
      new RegExp(pattern.value);
    } catch (e) {
      throw new Error(`Invalid regex pattern: ${e.message}`);
    }
  }

  const { data, error } = await supabase
    .from('feedback_ignore_patterns')
    .insert({
      field: pattern.field,
      pattern_type: pattern.type,
      pattern_value: pattern.value,
      reason: pattern.reason || null,
      created_by: pattern.createdBy || null,
      expires_at: pattern.expiresAt || null,
      is_active: true,
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    // If table doesn't exist, create it inline
    if (error.code === '42P01') {
      await createIgnorePatternsTable();
      return createIgnorePattern(pattern);
    }
    throw new Error(`Failed to create ignore pattern: ${error.message}`);
  }

  // Invalidate cache
  patternsCache = null;

  return data;
}

/**
 * Create the ignore patterns table if it doesn't exist.
 * NOTE: exec_sql RPC does not exist in Supabase. Table must be created
 * via a database migration. This function logs a warning and returns.
 */
async function createIgnorePatternsTable() {
  console.warn(
    'feedback_ignore_patterns table does not exist. ' +
    'Create it via a database migration (database/migrations/) — ' +
    'Supabase does not support exec_sql RPC for DDL from the client.'
  );
}

/**
 * Get all active ignore patterns
 *
 * @param {boolean} [forceRefresh=false] - Force cache refresh
 * @returns {Object[]} Array of active patterns
 */
export async function getActivePatterns(forceRefresh = false) {
  const now = Date.now();

  // Return cached if valid
  if (!forceRefresh && patternsCache && now < patternsCacheExpiry) {
    return patternsCache;
  }

  const { data, error } = await supabase
    .from('feedback_ignore_patterns')
    .select('*')
    .eq('is_active', true)
    .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString());

  if (error) {
    if (error.code === '42P01') {
      // Table doesn't exist yet, return empty
      return [];
    }
    throw new Error(`Failed to fetch ignore patterns: ${error.message}`);
  }

  patternsCache = data || [];
  patternsCacheExpiry = now + CACHE_TTL_MS;

  return patternsCache;
}

/**
 * Check if a feedback item matches any ignore pattern
 *
 * @param {Object} feedback - Feedback item to check
 * @returns {Object|null} Matching pattern if found, null otherwise
 */
export async function matchesIgnorePattern(feedback) {
  const patterns = await getActivePatterns();

  for (const pattern of patterns) {
    const fieldValue = feedback[pattern.field] ||
      feedback.metadata?.[pattern.field] ||
      '';

    if (!fieldValue) continue;

    const matches = checkMatch(fieldValue, pattern.pattern_type, pattern.pattern_value);

    if (matches) {
      // Update match stats (fire and forget)
      updateMatchStats(pattern.id);
      return pattern;
    }
  }

  return null;
}

/**
 * Check if a value matches a pattern
 *
 * @param {string} value - Value to check
 * @param {string} type - Pattern type
 * @param {string} pattern - Pattern value
 * @returns {boolean} True if matches
 */
export function checkMatch(value, type, pattern) {
  const valueStr = String(value).toLowerCase();
  const patternLower = pattern.toLowerCase();

  switch (type) {
  case PATTERN_TYPES.EXACT:
    return valueStr === patternLower;

  case PATTERN_TYPES.CONTAINS:
    return valueStr.includes(patternLower);

  case PATTERN_TYPES.REGEX:
    try {
      const regex = new RegExp(pattern, 'i');
      return regex.test(value);
    } catch {
      return false;
    }

  case PATTERN_TYPES.GLOB:
    return globMatch(value, pattern);

  default:
    return false;
  }
}

/**
 * Simple glob pattern matching
 *
 * @param {string} str - String to match
 * @param {string} pattern - Glob pattern (* = any chars, ? = single char)
 * @returns {boolean} True if matches
 */
export function globMatch(str, pattern) {
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special chars
    .replace(/\*/g, '.*')                  // * -> .*
    .replace(/\?/g, '.');                  // ? -> .

  try {
    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(str);
  } catch {
    return false;
  }
}

/**
 * Update match statistics for a pattern
 *
 * @param {string} patternId - Pattern ID
 */
async function updateMatchStats(patternId) {
  try {
    await supabase.rpc('increment_pattern_match', { pattern_id: patternId });
  } catch {
    // Fallback to manual update
    await supabase
      .from('feedback_ignore_patterns')
      .update({
        match_count: supabase.sql`match_count + 1`,
        last_match_at: new Date().toISOString()
      })
      .eq('id', patternId);
  }
}

/**
 * Deactivate an ignore pattern
 *
 * @param {string} patternId - Pattern ID to deactivate
 * @returns {Object} Updated pattern
 */
export async function deactivatePattern(patternId) {
  const { data, error } = await supabase
    .from('feedback_ignore_patterns')
    .update({
      is_active: false,
      updated_at: new Date().toISOString()
    })
    .eq('id', patternId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to deactivate pattern: ${error.message}`);
  }

  // Invalidate cache
  patternsCache = null;

  return data;
}

/**
 * Delete an ignore pattern permanently
 *
 * @param {string} patternId - Pattern ID to delete
 */
export async function deletePattern(patternId) {
  const { error } = await supabase
    .from('feedback_ignore_patterns')
    .delete()
    .eq('id', patternId);

  if (error) {
    throw new Error(`Failed to delete pattern: ${error.message}`);
  }

  // Invalidate cache
  patternsCache = null;
}

/**
 * Auto-ignore a feedback item based on a matched pattern
 *
 * @param {string} feedbackId - Feedback item ID
 * @param {Object} pattern - Matched pattern
 * @returns {Object} Updated feedback item
 */
export async function autoIgnoreFeedback(feedbackId, pattern) {
  const { data, error } = await supabase
    .from('feedback')
    .update({
      status: 'wont_fix',  // Using valid status per schema
      ignored_by_pattern_id: pattern.id,
      ignore_reason: pattern.reason || `Matched pattern: ${pattern.pattern_value}`,
      updated_at: new Date().toISOString()
    })
    .eq('id', feedbackId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to auto-ignore feedback: ${error.message}`);
  }

  return data;
}

/**
 * Process a feedback item - check for ignore patterns and auto-ignore if matched
 *
 * @param {Object} feedback - Feedback item to process
 * @returns {Object} Result with matched pattern or null
 */
export async function processFeedbackForIgnore(feedback) {
  const matchedPattern = await matchesIgnorePattern(feedback);

  if (matchedPattern) {
    const ignored = await autoIgnoreFeedback(feedback.id, matchedPattern);
    return {
      ignored: true,
      pattern: matchedPattern,
      feedback: ignored
    };
  }

  return {
    ignored: false,
    pattern: null,
    feedback
  };
}

// Default export for compatibility
export default {
  createIgnorePattern,
  getActivePatterns,
  matchesIgnorePattern,
  deactivatePattern,
  deletePattern,
  autoIgnoreFeedback,
  processFeedbackForIgnore,
  checkMatch,
  globMatch,
  PATTERN_TYPES,
  MATCHABLE_FIELDS
};
