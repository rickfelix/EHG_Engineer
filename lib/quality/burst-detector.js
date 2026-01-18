/**
 * Burst Detector for Quality Lifecycle System
 *
 * Detects and groups "error storms" - rapid sequences of similar errors
 * that should be grouped into a single issue to prevent inbox flooding.
 * Part of SD-QUALITY-TRIAGE-001: Triage & Prioritization Engine
 *
 * @module lib/quality/burst-detector
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Configuration for burst detection
 *
 * THRESHOLD DEVIATION (SD-QUALITY-FIXES-001):
 * The original PRD (SD-QUALITY-TRIAGE-001) specified 100+ errors/minute.
 * Implementation uses 3+ occurrences in a 5-minute window. This deviation
 * is intentional for EHG Engineer's CLI-centric workflow where:
 *
 * 1. Error "storms" are less frequent than production web apps
 * 2. CLI tools have lower traffic (single-user sessions vs. concurrent web users)
 * 3. 3 occurrences in 5 minutes already indicates a pattern worth grouping
 * 4. The 100/minute threshold would rarely trigger in CLI context
 *
 * These values are configurable and can be adjusted for venture-specific
 * deployments that have higher traffic patterns. Use detectBursts({ timeWindowMs, minOccurrences })
 * to override defaults.
 *
 * Triangulation Note: Reviewed by Claude, OpenAI, and Gemini (2026-01-18).
 * Consensus was to document the deviation rather than change thresholds.
 */
export const BURST_CONFIG = {
  // Time window to consider for grouping (in milliseconds)
  // Default: 5 minutes (CLI-appropriate); adjust for high-traffic ventures
  timeWindowMs: 5 * 60 * 1000, // 5 minutes
  // Minimum occurrences to qualify as a burst
  // Default: 3 (CLI-appropriate); for web apps consider 10-100
  minOccurrences: 3,
  // Fields to use for similarity matching
  groupingFields: ['error_type', 'source_application', 'source_file'],
  // Maximum items to group into single burst
  maxGroupSize: 100
};

/**
 * Generate a fingerprint for an error based on grouping fields
 *
 * @param {Object} error - Error/feedback item
 * @returns {string} Fingerprint hash for grouping
 */
export function generateFingerprint(error) {
  const parts = BURST_CONFIG.groupingFields.map(field => {
    const value = error[field] || error.metadata?.[field] || '';
    return String(value).toLowerCase().trim();
  });
  return parts.join('|');
}

/**
 * Detect bursts in recent feedback items
 *
 * @param {Object} [options] - Detection options
 * @param {number} [options.timeWindowMs] - Override time window
 * @param {number} [options.minOccurrences] - Override minimum occurrences
 * @returns {Object[]} Array of detected bursts with grouped items
 */
export async function detectBursts(options = {}) {
  const timeWindow = options.timeWindowMs || BURST_CONFIG.timeWindowMs;
  const minOccurrences = options.minOccurrences || BURST_CONFIG.minOccurrences;

  const cutoffTime = new Date(Date.now() - timeWindow).toISOString();

  // Fetch recent ungrouped feedback items
  const { data: recentItems, error } = await supabase
    .from('feedback')
    .select('*')
    .eq('source_type', 'error_capture')
    .is('burst_group_id', null)
    .gte('created_at', cutoffTime)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch recent items: ${error.message}`);
  }

  // Group by fingerprint
  const groups = new Map();
  for (const item of recentItems) {
    const fingerprint = generateFingerprint(item);
    if (!groups.has(fingerprint)) {
      groups.set(fingerprint, []);
    }
    groups.get(fingerprint).push(item);
  }

  // Filter to bursts (groups meeting minimum threshold)
  const bursts = [];
  for (const [fingerprint, items] of groups) {
    if (items.length >= minOccurrences) {
      bursts.push({
        fingerprint,
        count: items.length,
        firstSeen: items[0].created_at,
        lastSeen: items[items.length - 1].created_at,
        items: items.slice(0, BURST_CONFIG.maxGroupSize),
        representative: items[0] // Use first item as representative
      });
    }
  }

  return bursts;
}

/**
 * Create a grouped issue from a burst
 *
 * @param {Object} burst - Burst object from detectBursts
 * @returns {Object} Created group issue
 */
export async function createBurstGroup(burst) {
  const representative = burst.representative;

  // Create the group issue
  const { data: groupIssue, error: createError } = await supabase
    .from('feedback')
    .insert({
      type: 'issue',
      title: `[Burst] ${representative.title || representative.error_type} (${burst.count}x)`,
      description: `Grouped ${burst.count} similar errors detected between ${burst.firstSeen} and ${burst.lastSeen}.\n\nRepresentative error: ${representative.description || 'No description'}`,
      priority: 'P1', // Bursts are always high priority
      status: 'open',
      source_type: 'burst_group',
      source_application: representative.source_application,
      severity: 'high',
      metadata: {
        burst_fingerprint: burst.fingerprint,
        burst_count: burst.count,
        burst_first_seen: burst.firstSeen,
        burst_last_seen: burst.lastSeen,
        grouped_item_ids: burst.items.map(i => i.id)
      },
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (createError) {
    throw new Error(`Failed to create burst group: ${createError.message}`);
  }

  // Update all grouped items to reference the group
  const { error: updateError } = await supabase
    .from('feedback')
    .update({
      burst_group_id: groupIssue.id,
      status: 'grouped',
      updated_at: new Date().toISOString()
    })
    .in('id', burst.items.map(i => i.id));

  if (updateError) {
    throw new Error(`Failed to update grouped items: ${updateError.message}`);
  }

  return {
    groupIssue,
    groupedCount: burst.items.length
  };
}

/**
 * Run burst detection and automatically group detected bursts
 *
 * @param {Object} [options] - Detection options
 * @returns {Object} Summary of detection and grouping
 */
export async function runBurstDetection(options = {}) {
  const bursts = await detectBursts(options);

  const results = {
    burstsDetected: bursts.length,
    groupsCreated: 0,
    itemsGrouped: 0,
    errors: []
  };

  for (const burst of bursts) {
    try {
      const { groupedCount } = await createBurstGroup(burst);
      results.groupsCreated++;
      results.itemsGrouped += groupedCount;
    } catch (err) {
      results.errors.push({
        fingerprint: burst.fingerprint,
        error: err.message
      });
    }
  }

  return results;
}

/**
 * Check if a new error should be added to an existing burst group
 *
 * @param {Object} newError - New error to check
 * @returns {Object|null} Existing burst group if found, null otherwise
 */
export async function findExistingBurstGroup(newError) {
  const fingerprint = generateFingerprint(newError);
  const cutoffTime = new Date(Date.now() - BURST_CONFIG.timeWindowMs).toISOString();

  const { data: existingGroups, error } = await supabase
    .from('feedback')
    .select('*')
    .eq('source_type', 'burst_group')
    .eq('status', 'open')
    .gte('created_at', cutoffTime)
    .filter('metadata->>burst_fingerprint', 'eq', fingerprint)
    .limit(1);

  if (error) {
    throw new Error(`Failed to find burst group: ${error.message}`);
  }

  return existingGroups?.[0] || null;
}

/**
 * Add an error to an existing burst group
 *
 * @param {Object} error - Error to add
 * @param {Object} burstGroup - Existing burst group
 * @returns {Object} Updated burst group
 */
export async function addToBurstGroup(error, burstGroup) {
  const metadata = burstGroup.metadata || {};
  const groupedIds = metadata.grouped_item_ids || [];
  groupedIds.push(error.id);

  // Update the group metadata
  const { data: updated, error: updateError } = await supabase
    .from('feedback')
    .update({
      title: `[Burst] ${burstGroup.title?.replace(/\[Burst\]\s*/, '').replace(/\(\d+x\)/, '')} (${groupedIds.length}x)`,
      metadata: {
        ...metadata,
        burst_count: groupedIds.length,
        burst_last_seen: new Date().toISOString(),
        grouped_item_ids: groupedIds
      },
      updated_at: new Date().toISOString()
    })
    .eq('id', burstGroup.id)
    .select()
    .single();

  if (updateError) {
    throw new Error(`Failed to update burst group: ${updateError.message}`);
  }

  // Mark the error as grouped
  await supabase
    .from('feedback')
    .update({
      burst_group_id: burstGroup.id,
      status: 'grouped',
      updated_at: new Date().toISOString()
    })
    .eq('id', error.id);

  return updated;
}
