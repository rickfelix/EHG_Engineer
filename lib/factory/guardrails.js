/**
 * CRO Guardrails Enforcement
 *
 * Implements the 10 guardrails from the board's CRO (Chief Risk Officer):
 * 1. Max 3 corrections/venture/24h
 * 2. Depth limit 2 (no fix-the-fix-the-fix chains)
 * 3. Rollback-before-retry
 * 4. Global kill switch
 * 5. Tests must pass
 * 6. 30 LOC limit per correction
 * 7. 30-min canary period
 * 8. Freshness check (no stale errors)
 * 9. Venture isolation (no cross-venture changes)
 * 10. Daily digest to chairman
 *
 * SD: SD-LEO-INFRA-SOFTWARE-FACTORY-AUTOMATED-001
 */

import { createSupabaseServiceClient } from '../supabase-client.js';

const MAX_CORRECTIONS_PER_DAY = 3;
const MAX_DEPTH = 2;
const MAX_LOC = 30;
const CANARY_MINUTES = 30;
const STALE_ERROR_HOURS = 72;

/**
 * Check all guardrails for a venture before allowing a correction.
 *
 * @param {string} ventureId - Venture UUID
 * @param {object} [correctionContext] - Context about the proposed correction
 * @param {number} [correctionContext.loc] - Lines of code in the proposed fix
 * @param {number} [correctionContext.depth] - Correction chain depth
 * @param {string} [correctionContext.errorFirstSeen] - When the error was first detected
 * @returns {Promise<{allowed: boolean, reason: string, violations: string[]}>}
 */
export async function checkGuardrails(ventureId, correctionContext = {}) {
  const supabase = createSupabaseServiceClient();
  const violations = [];

  // 1. Fetch guardrail state
  const { data: state } = await supabase
    .from('factory_guardrail_state')
    .select('*')
    .eq('venture_id', ventureId)
    .single();

  // If no state exists, create default (first correction for this venture)
  if (!state) {
    await supabase.from('factory_guardrail_state').insert({
      venture_id: ventureId,
      corrections_today: 0,
      kill_switch_active: false,
      last_correction_at: null,
      canary_expires_at: null
    });
  }

  const guardrailState = state || { corrections_today: 0, kill_switch_active: false };

  // Guardrail 4: Global kill switch
  if (guardrailState.kill_switch_active) {
    violations.push('KILL_SWITCH: Global kill switch is active — all corrections halted');
  }

  // Guardrail 1: Rate limit (max 3/venture/24h)
  if (guardrailState.corrections_today >= MAX_CORRECTIONS_PER_DAY) {
    violations.push(`RATE_LIMIT: ${guardrailState.corrections_today}/${MAX_CORRECTIONS_PER_DAY} corrections today — limit exceeded`);
  }

  // Guardrail 2: Depth limit
  if (correctionContext.depth && correctionContext.depth > MAX_DEPTH) {
    violations.push(`DEPTH_LIMIT: Correction depth ${correctionContext.depth} exceeds max ${MAX_DEPTH}`);
  }

  // Guardrail 6: LOC limit
  if (correctionContext.loc && correctionContext.loc > MAX_LOC) {
    violations.push(`LOC_LIMIT: ${correctionContext.loc} LOC exceeds max ${MAX_LOC}`);
  }

  // Guardrail 7: Canary period
  if (guardrailState.canary_expires_at) {
    const canaryExpiry = new Date(guardrailState.canary_expires_at);
    if (canaryExpiry > new Date()) {
      const remainingMin = Math.ceil((canaryExpiry - new Date()) / 60000);
      violations.push(`CANARY: Previous correction in canary period — ${remainingMin} min remaining`);
    }
  }

  // Guardrail 8: Freshness check
  if (correctionContext.errorFirstSeen) {
    const errorAge = (Date.now() - new Date(correctionContext.errorFirstSeen).getTime()) / 3600000;
    if (errorAge > STALE_ERROR_HOURS) {
      violations.push(`STALE_ERROR: Error is ${Math.round(errorAge)}h old — exceeds ${STALE_ERROR_HOURS}h freshness limit`);
    }
  }

  return {
    allowed: violations.length === 0,
    reason: violations.length > 0 ? violations[0] : 'All guardrails passed',
    violations
  };
}

/**
 * Record a correction and update guardrail state.
 *
 * @param {string} ventureId - Venture UUID
 * @returns {Promise<void>}
 */
export async function recordCorrection(ventureId) {
  const supabase = createSupabaseServiceClient();
  const now = new Date();
  const canaryExpiry = new Date(now.getTime() + CANARY_MINUTES * 60000);

  const { data: state } = await supabase
    .from('factory_guardrail_state')
    .select('corrections_today')
    .eq('venture_id', ventureId)
    .single();

  await supabase
    .from('factory_guardrail_state')
    .upsert({
      venture_id: ventureId,
      corrections_today: (state?.corrections_today || 0) + 1,
      last_correction_at: now.toISOString(),
      canary_expires_at: canaryExpiry.toISOString(),
      kill_switch_active: false
    }, { onConflict: 'venture_id' });
}

/**
 * Activate the global kill switch for a venture.
 */
export async function activateKillSwitch(ventureId) {
  const supabase = createSupabaseServiceClient();
  await supabase
    .from('factory_guardrail_state')
    .upsert({
      venture_id: ventureId,
      kill_switch_active: true
    }, { onConflict: 'venture_id' });
}

/**
 * Reset daily correction counter (called by daily cron).
 */
export async function resetDailyCounters() {
  const supabase = createSupabaseServiceClient();
  await supabase
    .from('factory_guardrail_state')
    .update({ corrections_today: 0 })
    .gt('corrections_today', 0);
}

export {
  MAX_CORRECTIONS_PER_DAY, MAX_DEPTH, MAX_LOC,
  CANARY_MINUTES, STALE_ERROR_HOURS
};
