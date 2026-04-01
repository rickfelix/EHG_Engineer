/**
 * Taste Trust Manager
 *
 * Chairman-only trust level CRUD with auto-demote logic.
 * System NEVER auto-promotes — only the chairman can elevate trust.
 * Auto-demote triggers when override rate exceeds 20%.
 *
 * Trust levels: manual → recommend → auto
 *
 * SD: SD-LEO-ORCH-GSTACK-TASTE-GATE-001-B
 * @module lib/eva/taste-trust-manager
 */

import { createSupabaseServiceClient } from '../supabase-client.js';

const OVERRIDE_DEMOTE_THRESHOLD = 0.20;

/**
 * Get the current trust level for a gate type.
 * Resolves layered: venture-specific > global default.
 *
 * @param {string} gateType - 'design', 'scope', or 'architecture'
 * @param {string} [ventureId] - Venture ID for per-venture override
 * @returns {Promise<object>} { trustLevel, confidence, source }
 */
export async function getTrustLevel(gateType, ventureId = null) {
  const supabase = createSupabaseServiceClient();

  // Try venture-specific first
  if (ventureId) {
    const { data: ventureProfile } = await supabase
      .from('taste_profiles')
      .select('trust_level, confidence_threshold')
      .eq('gate_type', gateType)
      .eq('venture_id', ventureId)
      .maybeSingle();

    if (ventureProfile) {
      return {
        trustLevel: ventureProfile.trust_level,
        confidenceThreshold: ventureProfile.confidence_threshold,
        source: 'venture',
      };
    }
  }

  // Fall back to global
  const { data: globalProfile } = await supabase
    .from('taste_profiles')
    .select('trust_level, confidence_threshold')
    .eq('gate_type', gateType)
    .is('venture_id', null)
    .maybeSingle();

  if (globalProfile) {
    return {
      trustLevel: globalProfile.trust_level,
      confidenceThreshold: globalProfile.confidence_threshold,
      source: 'global',
    };
  }

  return { trustLevel: 'manual', confidenceThreshold: 0.70, source: 'default' };
}

/**
 * Promote trust level (chairman-only action).
 *
 * @param {string} gateType
 * @param {string} newLevel - 'manual', 'recommend', or 'auto'
 * @param {object} options
 * @param {string} [options.reason] - Chairman's stated reason
 * @param {number} [options.confidenceAtPromotion] - Current confidence score
 * @param {string} [options.chairmanId='default']
 * @returns {Promise<object>} { success, oldLevel, newLevel, auditId }
 */
export async function promoteTrustLevel(gateType, newLevel, options = {}) {
  const supabase = createSupabaseServiceClient();
  const { reason, confidenceAtPromotion, chairmanId = 'default' } = options;

  const current = await getTrustLevel(gateType);
  const oldLevel = current.trustLevel;

  if (oldLevel === newLevel) {
    return { success: true, oldLevel, newLevel, auditId: null, message: 'No change' };
  }

  // Update or insert global profile
  const { error: upsertError } = await supabase
    .from('taste_profiles')
    .upsert({
      chairman_id: chairmanId,
      venture_id: null,
      gate_type: gateType,
      trust_level: newLevel,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'chairman_id,venture_id,gate_type' });

  if (upsertError) {
    return { success: false, error: upsertError.message };
  }

  // Create immutable audit trail
  const { data: audit, error: auditError } = await supabase
    .from('trust_promotions')
    .insert({
      chairman_id: chairmanId,
      gate_type: gateType,
      old_level: oldLevel,
      new_level: newLevel,
      confidence_at_promotion: confidenceAtPromotion,
      reason: reason || `Chairman promoted ${gateType} trust from ${oldLevel} to ${newLevel}`,
    })
    .select('id')
    .single();

  return {
    success: true,
    oldLevel,
    newLevel,
    auditId: audit?.id || null,
    auditError: auditError?.message,
  };
}

/**
 * Check override rate and auto-demote if threshold exceeded.
 * Called after each chairman override of an auto-proceeded decision.
 *
 * @param {string} gateType
 * @param {string} [ventureId]
 * @returns {Promise<object>} { demoted, overrideRate, threshold }
 */
export async function checkAndDemote(gateType, ventureId = null) {
  const supabase = createSupabaseServiceClient();

  // Get last 20 decisions for this gate type
  let query = supabase
    .from('taste_interaction_logs')
    .select('decision, source')
    .eq('gate_type', gateType)
    .order('created_at', { ascending: false })
    .limit(20);

  if (ventureId) {
    query = query.eq('venture_id', ventureId);
  }

  const { data: decisions } = await query;

  if (!decisions?.length || decisions.length < 5) {
    return { demoted: false, overrideRate: 0, threshold: OVERRIDE_DEMOTE_THRESHOLD, reason: 'Insufficient decisions' };
  }

  // Override = system said APPROVE (source=system) but chairman changed it
  const systemApprovals = decisions.filter(d => d.source === 'system' || d.source === 'timeout');
  const overrides = systemApprovals.filter(d => d.decision !== 'approve');
  const overrideRate = systemApprovals.length > 0 ? overrides.length / systemApprovals.length : 0;

  if (overrideRate > OVERRIDE_DEMOTE_THRESHOLD) {
    // Auto-demote
    await promoteTrustLevel(gateType, 'manual', {
      reason: `Auto-demoted: override rate ${(overrideRate * 100).toFixed(0)}% exceeds ${(OVERRIDE_DEMOTE_THRESHOLD * 100)}% threshold`,
      confidenceAtPromotion: 1 - overrideRate,
    });

    return {
      demoted: true,
      overrideRate: Math.round(overrideRate * 100) / 100,
      threshold: OVERRIDE_DEMOTE_THRESHOLD,
    };
  }

  return {
    demoted: false,
    overrideRate: Math.round(overrideRate * 100) / 100,
    threshold: OVERRIDE_DEMOTE_THRESHOLD,
  };
}
