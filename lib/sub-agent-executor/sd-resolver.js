/**
 * SD Key/UUID Resolution
 * Resolves Strategic Directive keys to UUIDs and retrieves phase info
 *
 * Extracted from sub-agent-executor.js for modularity
 * SD-LEO-REFACTOR-SUBAGENT-EXEC-001
 */

import { getSupabaseClient } from './supabase-client.js';

/**
 * Resolve SD key (e.g., "SD-VISION-V2-013") to UUID
 * Returns the UUID if sdId is already a UUID, otherwise looks up by sd_key
 * @param {string} sdId - SD key or UUID
 * @returns {Promise<{uuid: string, sd_key: string}|null>} Resolved SD info or null
 */
export async function resolveSdKeyToUUID(sdId) {
  if (!sdId) return null;

  // Check if it's already a UUID (simple regex check)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isUUID = uuidRegex.test(sdId);

  try {
    const supabase = await getSupabaseClient();
    let data = null;
    let _error = null;

    if (isUUID) {
      // Query by uuid_id for UUID inputs
      const result = await supabase
        .from('strategic_directives_v2')
        .select('id, sd_key, current_phase, status, uuid_id')
        .eq('uuid_id', sdId)
        .single();
      data = result.data;
      // error assigned for logging/debugging if needed
      _error = result.error;
    } else {
      // SD-RETRO-FIX-001: For non-UUID inputs, try multiple columns in order:
      // 1. First try `id` column (stores legacy IDs like 'SD-E2E-FOUNDATION-001')
      // 2. Then try `sd_key` column
      // 3. Finally try `legacy_id` column
      const queries = [
        { column: 'id', value: sdId },
        { column: 'sd_key', value: sdId },
        { column: 'legacy_id', value: sdId }
      ];

      for (const q of queries) {
        const result = await supabase
          .from('strategic_directives_v2')
          .select('id, sd_key, current_phase, status, uuid_id')
          .eq(q.column, sdId)
          .maybeSingle();

        if (result.data) {
          data = result.data;
          break;
        }
      }
    }

    if (!data) {
      return null;
    }

    // SD-RETRO-FIX-001: The `id` column is the primary key used by foreign keys
    // (it's a text value like 'SD-E2E-FOUNDATION-001', not a UUID)
    // uuid_id is a separate column that's not used for FK constraints
    return {
      uuid: data.id,           // Use `id` column for FK operations
      sd_key: data.sd_key || data.id,
      current_phase: data.current_phase,
      status: data.status
    };
  } catch (err) {
    console.error(`   Warning: Error resolving SD key ${sdId}:`, err.message);
    return null;
  }
}

/**
 * Get current phase for an SD from database
 * @param {string} sdId - Strategic Directive ID (key or UUID)
 * @returns {Promise<string|null>} Current phase (LEAD, PLAN, EXEC) or null
 */
export async function getSDPhase(sdId) {
  if (!sdId) return null;

  try {
    // Use the resolution function to handle both UUID and sd_key
    const resolved = await resolveSdKeyToUUID(sdId);

    if (!resolved) {
      console.log(`   Info: Could not determine phase for ${sdId}`);
      return null;
    }

    // Normalize phase from current_phase or status
    const phase = resolved.current_phase || resolved.status;

    // Map status values to canonical phases
    const phaseMap = {
      'lead_review': 'LEAD',
      'plan_active': 'PLAN',
      'exec_active': 'EXEC',
      'LEAD': 'LEAD',
      'PLAN': 'PLAN',
      'EXEC': 'EXEC',
    };

    return phaseMap[phase] || null;
  } catch (err) {
    console.log(`   Warning: Phase lookup error: ${err.message}`);
    return null;
  }
}
