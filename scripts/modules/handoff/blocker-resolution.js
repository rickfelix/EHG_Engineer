/**
 * Blocker Resolution Module
 *
 * Implements pre-gate blocker detection and resolution for AUTO-PROCEED mode.
 * When an SD has unresolved dependencies (blockers), this module attempts to
 * identify and resolve them before the SD can proceed with gate validation.
 *
 * Part of SD-LEO-ENH-AUTO-PROCEED-001-10
 * Discovery Decision D21: Mid-exec blockers - Attempt to identify and resolve dependency first
 *
 * Key differences from skip-and-continue:
 * - This runs BEFORE gate validation (pre-gate detection)
 * - This attempts resolution, not skipping
 * - Falls back to skip-and-continue if resolution fails
 *
 * @module blocker-resolution
 */

import { createClient } from '@supabase/supabase-js';
// Note: getNextReadyChild and getOrchestratorContext imported in cli-main.js for integration

// Configuration constants (exported for use in other modules)
export const DEFAULT_MAX_RETRIES = 3;
export const DEFAULT_MAX_CHAIN_DEPTH = 2;
export const DETECTION_TIMEOUT_MS = 2000;

// Blocker detection patterns from error messages
export const BLOCKER_PATTERNS = [
  { pattern: /dependency[:\s]+(\S+)/i, type: 'dependency' },
  { pattern: /blocked[:\s]+by[:\s]+(\S+)/i, type: 'blocked_by' },
  { pattern: /requires[:\s]+(\S+)/i, type: 'requires' },
  { pattern: /prerequisite[:\s]+(\S+)/i, type: 'prerequisite' },
  { pattern: /waiting[:\s]+for[:\s]+(\S+)/i, type: 'waiting_for' },
  { pattern: /missing[:\s]+(\S+)/i, type: 'missing' }
];

/**
 * Detect blockers for an SD
 *
 * Uses multiple signals to detect blockers:
 * 1. Explicit metadata.blocked_by array (highest priority)
 * 2. Dependencies array with incomplete status
 * 3. Error pattern matching from recent failures
 *
 * @param {object} sd - SD record
 * @param {object} supabase - Supabase client
 * @returns {Promise<{blockers: string[], method: string, confidence: number}>}
 */
export async function detectBlockers(sd, supabase) {
  const startTime = Date.now();
  const blockers = [];
  let method = 'none';
  let confidence = 0;

  try {
    // Signal 1: Explicit metadata.blocked_by (highest confidence)
    if (sd?.metadata?.blocked_by && Array.isArray(sd.metadata.blocked_by) && sd.metadata.blocked_by.length > 0) {
      blockers.push(...sd.metadata.blocked_by);
      method = 'explicit_metadata';
      confidence = 100;
      console.log(`   [blocker-detection] Found ${blockers.length} explicit blocker(s) in metadata`);
      return { blockers, method, confidence, detectionTime: Date.now() - startTime };
    }

    // Signal 2: Dependencies array with incomplete status
    if (sd?.dependencies && Array.isArray(sd.dependencies) && sd.dependencies.length > 0) {
      // Query dependency SDs to check their status
      const depIds = sd.dependencies.map(d => typeof d === 'string' ? d : d.sd_id || d.id).filter(Boolean);

      if (depIds.length > 0) {
        const { data: depSDs, error } = await supabase
          .from('strategic_directives_v2')
          .select('id, status, progress')
          .in('id', depIds);

        if (!error && depSDs) {
          const incomplete = depSDs.filter(d => d.status !== 'completed' || d.progress < 100);
          if (incomplete.length > 0) {
            blockers.push(...incomplete.map(d => d.id));
            method = 'dependency_status';
            confidence = 90;
            console.log(`   [blocker-detection] Found ${incomplete.length} incomplete dependency/dependencies`);
            return { blockers, method, confidence, detectionTime: Date.now() - startTime };
          }
        }
      }
    }

    // Signal 3: Check for recent gate failures that mention blockers
    const { data: recentHandoffs, error: handoffError } = await supabase
      .from('sd_phase_handoffs')
      .select('failure_reasons, status, created_at')
      .eq('sd_id', sd.id)
      .eq('status', 'rejected')
      .order('created_at', { ascending: false })
      .limit(3);

    if (!handoffError && recentHandoffs && recentHandoffs.length > 0) {
      for (const handoff of recentHandoffs) {
        const failureText = JSON.stringify(handoff.failure_reasons || '');
        for (const { pattern } of BLOCKER_PATTERNS) {
          const match = failureText.match(pattern);
          if (match && match[1]) {
            const blockerId = match[1].trim();
            if (blockerId.startsWith('SD-') && !blockers.includes(blockerId)) {
              blockers.push(blockerId);
            }
          }
        }
      }

      if (blockers.length > 0) {
        method = 'error_pattern';
        confidence = 60;
        console.log(`   [blocker-detection] Found ${blockers.length} blocker(s) from error patterns`);
        return { blockers, method, confidence, detectionTime: Date.now() - startTime };
      }
    }

    // Check detection timeout
    if (Date.now() - startTime > DETECTION_TIMEOUT_MS) {
      console.warn(`   [blocker-detection] Detection timeout (${DETECTION_TIMEOUT_MS}ms)`);
    }

    return { blockers: [], method: 'none', confidence: 0, detectionTime: Date.now() - startTime };
  } catch (err) {
    console.warn(`   [blocker-detection] Error: ${err.message}`);
    return { blockers: [], method: 'error', confidence: 0, detectionTime: Date.now() - startTime };
  }
}

/**
 * Identify blocker SD details
 *
 * @param {string} blockerId - Blocker SD ID
 * @param {object} supabase - Supabase client
 * @returns {Promise<{blockerSD: object|null, found: boolean, status: string}>}
 */
export async function identifyBlockerSD(blockerId, supabase) {
  try {
    const { data: blockerSD, error } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, status, progress, current_phase, parent_sd_id, dependencies, metadata')
      .eq('id', blockerId)
      .single();

    if (error || !blockerSD) {
      console.log(`   [blocker-identify] Blocker ${blockerId} not found in database`);
      return { blockerSD: null, found: false, status: 'not_found' };
    }

    console.log(`   [blocker-identify] Found: ${blockerSD.id} - ${blockerSD.title?.slice(0, 40)}`);
    console.log(`      Status: ${blockerSD.status}, Progress: ${blockerSD.progress}%`);

    return { blockerSD, found: true, status: blockerSD.status };
  } catch (err) {
    console.warn(`   [blocker-identify] Error: ${err.message}`);
    return { blockerSD: null, found: false, status: 'error' };
  }
}

/**
 * Check if blocker SD is ready to be worked on
 *
 * @param {object} blockerSD - Blocker SD record
 * @returns {{ready: boolean, reason: string}}
 */
export function isBlockerReady(blockerSD) {
  if (!blockerSD) {
    return { ready: false, reason: 'Blocker SD not found' };
  }

  // Already completed - not a blocker
  if (blockerSD.status === 'completed' && blockerSD.progress >= 100) {
    return { ready: false, reason: 'Already completed (not actually blocking)' };
  }

  // Currently blocked - can't resolve
  if (blockerSD.status === 'blocked') {
    return { ready: false, reason: 'Blocker is itself blocked (chain dependency)' };
  }

  // Ready statuses that can be worked on
  const readyStatuses = ['draft', 'in_progress', 'planning', 'active', 'pending_approval', 'review'];
  if (readyStatuses.includes(blockerSD.status)) {
    return { ready: true, reason: 'Blocker is in workable status' };
  }

  return { ready: false, reason: `Unknown status: ${blockerSD.status}` };
}

/**
 * Resolve a blocker by executing handoff for it
 *
 * @param {object} params - Resolution parameters
 * @param {object} params.blockerSD - Blocker SD record
 * @param {object} params.supabase - Supabase client
 * @param {number} params.depth - Current chain depth
 * @param {string[]} params.chain - Resolution chain for cycle detection
 * @param {string} params.correlationId - Correlation ID
 * @returns {Promise<{resolved: boolean, error?: string, newBlockers?: string[]}>}
 */
export async function resolveBlocker(params) {
  const { blockerSD, supabase, depth = 0, chain = [], correlationId } = params;

  // Check chain depth
  if (depth >= DEFAULT_MAX_CHAIN_DEPTH) {
    console.log(`   [blocker-resolve] Max chain depth reached (${DEFAULT_MAX_CHAIN_DEPTH})`);
    await recordBlockerEvent(supabase, 'BLOCKER_CHAIN_DEPTH_EXCEEDED', {
      blocker_sd_id: blockerSD.id,
      chain,
      depth,
      correlation_id: correlationId
    });
    return { resolved: false, error: 'Max chain depth exceeded' };
  }

  // Cycle detection
  if (chain.includes(blockerSD.id)) {
    console.log(`   [blocker-resolve] Cycle detected: ${[...chain, blockerSD.id].join(' -> ')}`);
    await recordBlockerEvent(supabase, 'BLOCKER_CYCLE_DETECTED', {
      blocker_sd_id: blockerSD.id,
      chain: [...chain, blockerSD.id],
      correlation_id: correlationId
    });
    return { resolved: false, error: 'Circular dependency detected' };
  }

  console.log(`   [blocker-resolve] Attempting to resolve: ${blockerSD.id} (depth: ${depth})`);

  // Record resolution attempt start
  await recordBlockerEvent(supabase, 'BLOCKER_RESOLUTION_STARTED', {
    blocker_sd_id: blockerSD.id,
    depth,
    chain: [...chain, blockerSD.id],
    correlation_id: correlationId
  });

  // Check if blocker has its own blockers (recursive check)
  const { blockers: nestedBlockers } = await detectBlockers(blockerSD, supabase);
  if (nestedBlockers.length > 0) {
    console.log(`   [blocker-resolve] Blocker has ${nestedBlockers.length} nested blocker(s)`);

    // Try to resolve nested blockers first
    for (const nestedBlockerId of nestedBlockers) {
      const { blockerSD: nestedSD, found } = await identifyBlockerSD(nestedBlockerId, supabase);
      if (!found) continue;

      const { ready, reason } = isBlockerReady(nestedSD);
      if (!ready) {
        console.log(`   [blocker-resolve] Nested blocker ${nestedBlockerId} not ready: ${reason}`);
        continue;
      }

      const nestedResult = await resolveBlocker({
        blockerSD: nestedSD,
        supabase,
        depth: depth + 1,
        chain: [...chain, blockerSD.id],
        correlationId
      });

      if (!nestedResult.resolved) {
        console.log(`   [blocker-resolve] Could not resolve nested blocker: ${nestedBlockerId}`);
        return { resolved: false, error: `Nested blocker ${nestedBlockerId} unresolved`, newBlockers: nestedBlockers };
      }
    }
  }

  // At this point, blocker SD is ready to be executed
  // Mark that resolution succeeded (in reality, the handoff system will handle actual execution)
  console.log(`   [blocker-resolve] Blocker ${blockerSD.id} is ready for execution`);

  await recordBlockerEvent(supabase, 'BLOCKER_RESOLUTION_SUCCESS', {
    blocker_sd_id: blockerSD.id,
    depth,
    correlation_id: correlationId
  });

  return { resolved: true, blockerSD };
}

/**
 * Record a blocker-related event
 *
 * @param {object} supabase - Supabase client
 * @param {string} eventType - Event type
 * @param {object} data - Event data
 * @returns {Promise<{success: boolean, eventId?: string}>}
 */
export async function recordBlockerEvent(supabase, eventType, data) {
  try {
    const { data: result, error } = await supabase
      .from('system_events')
      .insert({
        event_type: eventType,
        sd_id: data.blocker_sd_id || data.sd_id,
        details: {
          ...data,
          timestamp: new Date().toISOString()
        }
      })
      .select('id')
      .single();

    if (error) {
      console.warn(`   [blocker-event] Could not record ${eventType}: ${error.message}`);
      return { success: false };
    }

    return { success: true, eventId: result.id };
  } catch (err) {
    console.warn(`   [blocker-event] Error: ${err.message}`);
    return { success: false };
  }
}

/**
 * Update SD metadata with blocker information
 *
 * @param {object} supabase - Supabase client
 * @param {string} sdId - SD ID
 * @param {object} blockerInfo - Blocker information to add
 * @returns {Promise<{success: boolean}>}
 */
export async function updateBlockerMetadata(supabase, sdId, blockerInfo) {
  try {
    const { data: currentSD, error: fetchError } = await supabase
      .from('strategic_directives_v2')
      .select('metadata')
      .eq('id', sdId)
      .single();

    if (fetchError) {
      return { success: false };
    }

    const metadata = currentSD.metadata || {};
    metadata.blocker_resolution_attempts = metadata.blocker_resolution_attempts || [];
    metadata.blocker_resolution_attempts.push({
      ...blockerInfo,
      timestamp: new Date().toISOString()
    });

    const { error: updateError } = await supabase
      .from('strategic_directives_v2')
      .update({ metadata })
      .eq('id', sdId);

    return { success: !updateError };
  } catch (_err) {
    return { success: false };
  }
}

/**
 * Execute blocker detection and resolution
 *
 * Main entry point for blocker resolution. Detects blockers, attempts to resolve
 * them, and returns information about what to do next.
 *
 * @param {object} params - Execution parameters
 * @param {object} params.supabase - Supabase client
 * @param {object} params.sd - Current SD that may be blocked
 * @param {string} params.correlationId - Correlation ID
 * @param {string} params.sessionId - Session ID
 * @returns {Promise<{
 *   hasBlockers: boolean,
 *   blockers: string[],
 *   resolved: boolean,
 *   blockerToExecute: object|null,
 *   fallbackToSkip: boolean,
 *   reason: string
 * }>}
 */
export async function executeBlockerResolution(params) {
  const { supabase, sd, correlationId, sessionId } = params;

  console.log('\n🔍 BLOCKER DETECTION (D21)');
  console.log('─'.repeat(50));
  console.log(`   SD: ${sd.id}`);
  console.log(`   Title: ${sd.title?.slice(0, 50)}`);

  // Step 1: Detect blockers
  const { blockers, method, confidence, detectionTime } = await detectBlockers(sd, supabase);

  console.log(`   Detection: ${method} (${confidence}% confidence, ${detectionTime}ms)`);

  if (blockers.length === 0) {
    console.log('   ✅ No blockers detected');
    console.log('─'.repeat(50));
    return {
      hasBlockers: false,
      blockers: [],
      resolved: true,
      blockerToExecute: null,
      fallbackToSkip: false,
      reason: 'No blockers detected'
    };
  }

  console.log(`   ⚠️  ${blockers.length} blocker(s) detected: ${blockers.join(', ')}`);

  // Record detection event
  await recordBlockerEvent(supabase, 'BLOCKER_DETECTED', {
    sd_id: sd.id,
    blockers,
    method,
    confidence,
    detection_time_ms: detectionTime,
    correlation_id: correlationId,
    session_id: sessionId
  });

  // Step 2: Try to resolve each blocker
  for (let attempt = 0; attempt < DEFAULT_MAX_RETRIES; attempt++) {
    console.log(`\n   Resolution attempt ${attempt + 1}/${DEFAULT_MAX_RETRIES}`);

    for (const blockerId of blockers) {
      // Identify blocker
      const { blockerSD, found } = await identifyBlockerSD(blockerId, supabase);

      if (!found) {
        console.log(`   ⚠️  Blocker ${blockerId} not found - may be resolved or invalid`);
        continue;
      }

      // Check if ready
      const { ready, reason } = isBlockerReady(blockerSD);
      if (!ready) {
        console.log(`   ⚠️  Blocker ${blockerId} not ready: ${reason}`);
        continue;
      }

      // Attempt resolution
      const result = await resolveBlocker({
        blockerSD,
        supabase,
        depth: 0,
        chain: [],
        correlationId
      });

      if (result.resolved) {
        // Record metadata update
        await updateBlockerMetadata(supabase, sd.id, {
          blocker_id: blockerId,
          attempt: attempt + 1,
          status: 'resolved',
          correlation_id: correlationId
        });

        console.log('\n   ✅ BLOCKER RESOLVED');
        console.log(`   Execute ${blockerSD.id} before continuing with ${sd.id}`);
        console.log('─'.repeat(50));

        return {
          hasBlockers: true,
          blockers,
          resolved: true,
          blockerToExecute: blockerSD,
          fallbackToSkip: false,
          reason: `Blocker ${blockerSD.id} ready for execution`
        };
      }
    }
  }

  // Step 3: Resolution failed - fallback to skip-and-continue
  console.log('\n   ❌ BLOCKER RESOLUTION FAILED');
  console.log('   Falling back to skip-and-continue');
  console.log('─'.repeat(50));

  await recordBlockerEvent(supabase, 'BLOCKER_RESOLUTION_FAILED', {
    sd_id: sd.id,
    blockers,
    attempts: DEFAULT_MAX_RETRIES,
    correlation_id: correlationId
  });

  return {
    hasBlockers: true,
    blockers,
    resolved: false,
    blockerToExecute: null,
    fallbackToSkip: true,
    reason: `Could not resolve blockers after ${DEFAULT_MAX_RETRIES} attempts`
  };
}

/**
 * Create a Supabase client using environment variables
 * @returns {object} Supabase client
 */
export function createSupabaseClient() {
  return createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export default {
  detectBlockers,
  identifyBlockerSD,
  isBlockerReady,
  resolveBlocker,
  recordBlockerEvent,
  updateBlockerMetadata,
  executeBlockerResolution,
  createSupabaseClient,
  DEFAULT_MAX_RETRIES,
  DEFAULT_MAX_CHAIN_DEPTH,
  DETECTION_TIMEOUT_MS,
  BLOCKER_PATTERNS
};
