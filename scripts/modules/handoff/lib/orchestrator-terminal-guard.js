/**
 * Orchestrator terminal-transition guard (SD-FDBK-FIX-ORCHESTRATOR-GHOST-COMPLETE-001)
 *
 * Orchestrator parents used to "ghost-complete": auto-complete paths wrote
 * status='completed' directly once all children finished, skipping the
 * LEAD-FINAL-APPROVAL executor entirely, and their retrospective checks
 * accepted ANY retro row regardless of retro_type.
 *
 * This module is the single funnel those paths now route through:
 *   1. Canonical retro check via retro-filters.js (retro_type='SD_COMPLETION',
 *      freshness after LEAD-TO-PLAN acceptance) — the same contract the
 *      LEAD-FINAL-APPROVAL RETROSPECTIVE_EXISTS gate enforces.
 *   2. Stage the SD at status='pending_approval' (the entry state the
 *      LEAD-FINAL-APPROVAL executor requires).
 *   3. Surface the LEAD-FINAL-APPROVAL command — the executor is the ONLY
 *      writer of status='completed'; no caller may fabricate completion.
 */

import { getFilteredRetrospective } from '../retro-filters.js';

/**
 * The command that genuinely completes an orchestrator parent.
 *
 * @param {string} sdRef - sd_key (preferred) or id
 * @returns {string}
 */
export function leadFinalCommand(sdRef) {
  return `node scripts/handoff.js execute LEAD-FINAL-APPROVAL ${sdRef}`;
}

/**
 * Route an orchestrator parent toward genuine completion via LEAD-FINAL-APPROVAL.
 *
 * Never writes status='completed'. On success the SD sits at 'pending_approval'
 * and the returned command drives the real executor (whose gates re-verify the
 * retro and write the canonical accepted LEAD-FINAL handoff row).
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} sd - SD row; requires id, uses sd_key/created_at when present
 * @param {Object} [opts]
 * @param {string} [opts.source] - calling path, for log attribution
 * @returns {Promise<{routed: boolean, reason: string|null, command: string|null}>}
 */
export async function routeOrchestratorToLeadFinal(supabase, sd, { source = 'orchestrator-completion' } = {}) {
  const sdRef = sd.sd_key || sd.id;

  const { retrospective, leadToPlanAcceptedAt, error: retroError } = await getFilteredRetrospective(
    sd.id, sd.created_at || null, supabase, sd.sd_key || null
  );

  if (retroError) {
    console.log(`   ⚠️  [${source}] Retro lookup failed for ${sdRef}: ${retroError.message}`);
    return { routed: false, reason: 'RETRO_LOOKUP_FAILED', command: null };
  }

  if (!retrospective) {
    console.log(`   ⛔ [${source}] ${sdRef}: no SD-completion retrospective (retro_type='SD_COMPLETION', created_at > ${leadToPlanAcceptedAt}) — refusing to advance toward completion.`);
    console.log('      Remediation: run the RETRO sub-agent to generate a retro_type=\'SD_COMPLETION\' retrospective, then re-run the completion flow.');
    return { routed: false, reason: 'RETRO_MISSING', command: null };
  }

  const { error: updateError } = await supabase
    .from('strategic_directives_v2')
    .update({
      status: 'pending_approval',
      is_working_on: false,
      updated_at: new Date().toISOString()
    })
    .eq('id', sd.id)
    .neq('status', 'completed');

  if (updateError) {
    console.log(`   ⚠️  [${source}] Could not stage ${sdRef} at pending_approval: ${updateError.message}`);
    return { routed: false, reason: 'STAGE_UPDATE_FAILED', command: null };
  }

  const command = leadFinalCommand(sdRef);
  console.log(`   ⏸  [${source}] ${sdRef} staged at pending_approval — completion requires LEAD-FINAL-APPROVAL:`);
  console.log(`      ${command}`);
  return { routed: true, reason: null, command };
}
