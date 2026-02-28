/**
 * Chairman Override Auditor
 * Part of SD-MAN-GEN-CORRECTIVE-VISION-GAP-003
 *
 * Provides audit trail for chairman overrides used in guardrail checks.
 * When a chairman override bypasses a guardrail, this module records the
 * event in the chairman_decisions table for governance traceability.
 */

import { DECISION_TYPES, ESCALATION_STATUS } from './chairman-escalation.js';

/**
 * Record a chairman override in the audit trail.
 *
 * @param {Object} params
 * @param {string} params.guardrailId - ID of the guardrail being overridden (e.g., 'GR-OKR-HARD-STOP')
 * @param {string} params.sdId - UUID of the SD receiving the override
 * @param {string} params.sdKey - Human-readable SD key
 * @param {string} [params.reason] - Reason for the override
 * @param {Object} [params.metadata] - Additional context
 * @param {Object} supabase - Supabase client
 * @returns {Promise<{success: boolean, decisionId?: string, error?: string}>}
 */
export async function auditChairmanOverride(params, supabase) {
  const { guardrailId, sdId, sdKey, reason, metadata } = params;

  if (!supabase) {
    return { success: false, error: 'No supabase client provided' };
  }

  try {
    const record = {
      decision_type: DECISION_TYPES.OVERRIDE_REQUEST,
      status: ESCALATION_STATUS.APPROVED,
      sd_id: sdId,
      context: {
        guardrail_id: guardrailId,
        sd_key: sdKey,
        override_reason: reason || 'Chairman override applied via metadata flag',
        source: 'guardrail-registry',
        ...metadata,
      },
      created_at: new Date().toISOString(),
      resolved_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('chairman_decisions')
      .insert(record)
      .select('id')
      .single();

    if (error) {
      console.warn(`   ⚠️  Chairman override audit failed: ${error.message}`);
      return { success: false, error: error.message };
    }

    return { success: true, decisionId: data.id };
  } catch (err) {
    console.warn(`   ⚠️  Chairman override audit error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Query override audit history for an SD.
 *
 * @param {string} sdId - UUID of the SD
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Array>} List of override audit records
 */
export async function getOverrideHistory(sdId, supabase) {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('chairman_decisions')
    .select('id, decision_type, status, context, created_at')
    .eq('sd_id', sdId)
    .eq('decision_type', DECISION_TYPES.OVERRIDE_REQUEST)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn(`   ⚠️  Override history query failed: ${error.message}`);
    return [];
  }

  return data || [];
}
