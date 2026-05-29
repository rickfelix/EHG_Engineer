/**
 * Capability Scoring + Reuse Hook (LEAD-FINAL-APPROVAL)
 * SD: SD-LEO-INFRA-ACTIVATE-CAPABILITY-SCORING-001 | FR-4
 *
 * Runs at SD completion, AFTER trg_capability_lifecycle has registered the SD's
 * delivers_capabilities into sd_capabilities (with maturity=extraction=0). For the
 * completing SD this hook:
 *   (a) records a reuse for each capability_key already registered by a DIFFERENT
 *       prior SD — BEFORE scoring, so the trigger sees the updated reuse_count; then
 *   (b) derives + persists maturity_score/extraction_score for the SD's freshly
 *       registered rows (the BEFORE trigger recomputes plane1_score).
 *
 * Fail-safe: every error is caught and logged; this hook NEVER blocks SD completion.
 */

import { recordReuseEvent } from '../../../../../../lib/capabilities/capability-reuse-tracker.js';
import { scoreAndPersistCapabilities } from '../../../../../../lib/capabilities/plane1-scoring.js';

/**
 * @param {Object} sd - completing SD (has sd_key / id)
 * @param {Object} supabase - service-role client
 * @returns {Promise<{ scored:number, reused:number, capabilities:number, note?:string }>}
 */
export async function runCapabilityScoringOnCompletion(sd, supabase) {
  const sdKey = sd.sd_key || sd.id;
  const summary = { scored: 0, reused: 0, capabilities: 0 };

  // The completing SD's freshly-registered capability rows (sd_id is the VARCHAR sd_key).
  const { data: ownCaps, error: ownErr } = await supabase
    .from('sd_capabilities')
    .select('capability_key')
    .eq('sd_id', sdKey)
    .eq('action', 'registered');

  if (ownErr) {
    summary.note = `lookup failed: ${ownErr.message}`;
    return summary;
  }
  if (!ownCaps || ownCaps.length === 0) {
    summary.note = 'no registered capabilities for this SD';
    return summary;
  }
  summary.capabilities = ownCaps.length;

  // (a) Record reuse for keys also registered by a different prior SD — before scoring.
  for (const cap of ownCaps) {
    const { data: priorRow } = await supabase
      .from('sd_capabilities')
      .select('id')
      .eq('capability_key', cap.capability_key)
      .eq('action', 'registered') // only a prior REGISTERED row counts as reuse (not deprecated/superseded)
      .neq('sd_id', sdKey)
      .limit(1)
      .maybeSingle();

    if (priorRow) {
      const res = await recordReuseEvent(
        supabase,
        cap.capability_key,
        sdKey, // VARCHAR sd_key — NOT the uuid (FR-6/TR-2)
        `Reused at completion of ${sdKey}`,
        'direct'
      );
      if (res?.success) summary.reused += 1;
    }
  }

  // (b) Score + persist maturity/extraction for this SD's rows (trigger recomputes plane1).
  const scoreRes = await scoreAndPersistCapabilities(supabase, { sdId: sdKey });
  summary.scored = scoreRes?.scored || 0;
  if (scoreRes?.error) summary.note = `scoring partial: ${scoreRes.error}`;

  return summary;
}
