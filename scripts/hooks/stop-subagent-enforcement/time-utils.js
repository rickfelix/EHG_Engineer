/**
 * Timezone Normalization Utilities
 *
 * SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-M
 *
 * Fixes: Timestamps without timezone suffix (from Supabase) were being
 * interpreted as local time, causing timing validation mismatches.
 *
 * @module stop-subagent-enforcement/time-utils
 */

/**
 * Normalize a timestamp to UTC Date object.
 *
 * @param {string|Date} timestamp - The timestamp to normalize
 * @returns {Date|null} A Date object in UTC, or null if no input
 */
export function normalizeToUTC(timestamp) {
  if (!timestamp) return null;

  // Already a Date object
  if (timestamp instanceof Date) {
    return timestamp;
  }

  const str = String(timestamp);

  // Check if timestamp already has timezone info
  // Patterns: ends with Z, +HH:MM, -HH:MM
  const hasTimezone = /Z$|[+-]\d{2}:\d{2}$/.test(str);

  if (hasTimezone) {
    // Already has timezone, parse directly
    return new Date(str);
  }

  // No timezone suffix - assume UTC by appending Z
  // This is the fix: Supabase timestamps without Z were being
  // interpreted as local time, causing validation mismatches
  return new Date(str + 'Z');
}
