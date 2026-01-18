/**
 * Snooze Manager for Quality Lifecycle System
 *
 * Manages snoozing and unsnoozing of feedback items to allow developers
 * to defer non-urgent items while maintaining tracking.
 * Part of SD-QUALITY-TRIAGE-001: Triage & Prioritization Engine
 *
 * @module lib/quality/snooze-manager
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Snooze duration presets
 */
const SNOOZE_PRESETS = {
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '3d': 3 * 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
  '2w': 14 * 24 * 60 * 60 * 1000,
  '1m': 30 * 24 * 60 * 60 * 1000
};

/**
 * Parse a snooze duration into milliseconds
 *
 * @param {string|number} duration - Duration string (e.g., '1h', '3d') or milliseconds
 * @returns {number} Duration in milliseconds
 */
function parseDuration(duration) {
  if (typeof duration === 'number') {
    return duration;
  }

  // Check presets first
  if (SNOOZE_PRESETS[duration.toLowerCase()]) {
    return SNOOZE_PRESETS[duration.toLowerCase()];
  }

  // Parse custom format (e.g., '2h', '5d', '1w')
  const match = duration.match(/^(\d+)(h|d|w|m)$/i);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}. Use format like '2h', '5d', '1w'`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  const multipliers = {
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
    m: 30 * 24 * 60 * 60 * 1000
  };

  return value * multipliers[unit];
}

/**
 * Snooze a feedback item
 *
 * @param {string} feedbackId - ID of the feedback item to snooze
 * @param {string|number} duration - Duration to snooze (e.g., '1h', '3d', or milliseconds)
 * @param {Object} [options] - Optional parameters
 * @param {string} [options.reason] - Reason for snoozing
 * @param {string} [options.userId] - User who snoozed the item
 * @returns {Object} Updated feedback item
 */
async function snoozeFeedback(feedbackId, duration, options = {}) {
  const durationMs = parseDuration(duration);
  const snoozedUntil = new Date(Date.now() + durationMs);

  const { data: updated, error } = await supabase
    .from('feedback')
    .update({
      status: 'snoozed',
      snoozed_until: snoozedUntil.toISOString(),
      snoozed_at: new Date().toISOString(),
      snoozed_by: options.userId || null,
      snooze_reason: options.reason || null,
      updated_at: new Date().toISOString()
    })
    .eq('id', feedbackId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to snooze feedback: ${error.message}`);
  }

  return {
    ...updated,
    snoozeInfo: {
      snoozedUntil,
      durationMs,
      durationHuman: formatDuration(durationMs)
    }
  };
}

/**
 * Unsnooze a feedback item (manually wake it up)
 *
 * @param {string} feedbackId - ID of the feedback item to unsnooze
 * @returns {Object} Updated feedback item
 */
async function unsnoozeFeedback(feedbackId) {
  const { data: updated, error } = await supabase
    .from('feedback')
    .update({
      status: 'open',
      snoozed_until: null,
      updated_at: new Date().toISOString()
    })
    .eq('id', feedbackId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to unsnooze feedback: ${error.message}`);
  }

  return updated;
}

/**
 * Re-snooze an item (extend or reset snooze period)
 *
 * @param {string} feedbackId - ID of the feedback item
 * @param {string|number} duration - New duration to snooze
 * @param {Object} [options] - Optional parameters
 * @returns {Object} Updated feedback item
 */
async function resnooze(feedbackId, duration, options = {}) {
  return snoozeFeedback(feedbackId, duration, options);
}

/**
 * Check for and wake up expired snoozes
 * Should be called periodically (e.g., by a cron job or scheduler)
 *
 * @returns {Object} Summary of woken items
 */
async function wakeExpiredSnoozes() {
  const now = new Date().toISOString();

  const { data: expiredItems, error: fetchError } = await supabase
    .from('feedback')
    .select('id, title')
    .eq('status', 'snoozed')
    .lt('snoozed_until', now);

  if (fetchError) {
    throw new Error(`Failed to fetch expired snoozes: ${fetchError.message}`);
  }

  if (!expiredItems || expiredItems.length === 0) {
    return { woken: 0, items: [] };
  }

  const ids = expiredItems.map(i => i.id);

  const { error: updateError } = await supabase
    .from('feedback')
    .update({
      status: 'open',
      snoozed_until: null,
      updated_at: now
    })
    .in('id', ids);

  if (updateError) {
    throw new Error(`Failed to wake expired snoozes: ${updateError.message}`);
  }

  return {
    woken: expiredItems.length,
    items: expiredItems
  };
}

/**
 * Get all currently snoozed items
 *
 * @param {Object} [options] - Filter options
 * @param {string} [options.userId] - Filter by user who snoozed
 * @returns {Object[]} Array of snoozed items with time remaining
 */
async function getSnoozedItems(options = {}) {
  let query = supabase
    .from('feedback')
    .select('*')
    .eq('status', 'snoozed')
    .order('snoozed_until', { ascending: true });

  if (options.userId) {
    query = query.eq('snoozed_by', options.userId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch snoozed items: ${error.message}`);
  }

  const now = Date.now();
  return data.map(item => ({
    ...item,
    timeRemaining: item.snoozed_until
      ? formatDuration(new Date(item.snoozed_until).getTime() - now)
      : null,
    isExpired: item.snoozed_until
      ? new Date(item.snoozed_until).getTime() < now
      : false
  }));
}

/**
 * Format a duration in milliseconds to human-readable string
 *
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Human-readable duration
 */
function formatDuration(ms) {
  if (ms < 0) return 'expired';

  const hours = Math.floor(ms / (60 * 60 * 1000));
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);

  if (weeks > 0) {
    const remainingDays = days % 7;
    return remainingDays > 0 ? `${weeks}w ${remainingDays}d` : `${weeks}w`;
  }
  if (days > 0) {
    const remainingHours = hours % 24;
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }
  const minutes = Math.floor(ms / (60 * 1000));
  return minutes > 0 ? `${minutes}m` : 'less than 1m';
}

module.exports = {
  snoozeFeedback,
  unsnoozeFeedback,
  resnooze,
  wakeExpiredSnoozes,
  getSnoozedItems,
  parseDuration,
  formatDuration,
  SNOOZE_PRESETS
};
