/**
 * Friday Pre-Flight Briefing Card + Decision Consequence Tracking
 * SD-EVA-FRIDAY-MEETING-ENHANCEMENT-ORCH-001-B
 *
 * Generates a canvas-renderable briefing card before Friday meetings and
 * tracks decision consequences when the chairman accepts or dismisses.
 */

import { createSupabaseServiceClient } from '../../supabase-client.js';

let sanitizeLLMInput;
try {
  ({ sanitizeLLMInput } = await import('./input-sanitizer.js'));
} catch {
  console.warn('[friday-briefing-card] SANITIZER_UNAVAILABLE: input-sanitizer.js could not be imported. Using raw strings.');
  sanitizeLLMInput = (text) => ({ clean: text, warnings: [] });
}

/**
 * Generate a canvas-renderable briefing card from Friday meeting data.
 *
 * @param {Object|null} fridayData - Friday meeting data with sections, decisions, risks, krs
 * @returns {{ type: string, version: number, agenda_preview: string[], pending_decisions_count: number, risk_flags: string[], stale_krs_count: number }}
 */
export function generateBriefingCard(fridayData) {
  if (!fridayData) {
    return {
      type: 'briefing_card',
      version: 1,
      agenda_preview: [],
      pending_decisions_count: 0,
      risk_flags: [],
      stale_krs_count: 0,
    };
  }

  const sections = Array.isArray(fridayData.sections) ? fridayData.sections : [];
  const decisions = Array.isArray(fridayData.decisions) ? fridayData.decisions : [];
  const risks = Array.isArray(fridayData.risks) ? fridayData.risks : [];
  const krs = Array.isArray(fridayData.krs) ? fridayData.krs : [];

  // agenda_preview: sanitize section titles/summaries
  const agenda_preview = sections.map(s => {
    const raw = s.title || s.summary || String(s);
    const { clean } = sanitizeLLMInput(raw);
    return clean;
  }).filter(Boolean);

  // pending_decisions_count: decisions not yet resolved
  const pending_decisions_count = decisions.filter(
    d => !d.resolved && d.status !== 'resolved' && d.status !== 'accepted' && d.status !== 'dismissed'
  ).length;

  // risk_flags: elevated/high risks
  const risk_flags = risks
    .filter(r => r.severity === 'high' || r.severity === 'elevated' || r.level === 'high' || r.level === 'elevated')
    .map(r => {
      const raw = r.title || r.description || String(r);
      const { clean } = sanitizeLLMInput(raw);
      return clean;
    })
    .filter(Boolean);

  // stale_krs_count: KRs with no recent update (stale flag or missing progress)
  const stale_krs_count = krs.filter(
    kr => kr.stale === true || kr.is_stale === true || kr.status === 'stale'
  ).length;

  return {
    type: 'briefing_card',
    version: 1,
    agenda_preview,
    pending_decisions_count,
    risk_flags,
    stale_krs_count,
  };
}

/**
 * Populate decision consequences after chairman accepts or dismisses.
 * Writes structured JSONB to eva_friday_decisions.consequences.
 *
 * @param {string} decisionId - UUID of the decision record
 * @param {{ reasoning: string, action_implied: string, outcome_type: string }} outcome
 * @returns {Promise<void>}
 */
export async function populateDecisionConsequences(decisionId, outcome) {
  if (!decisionId || !outcome) return;

  const { clean: reasoning } = sanitizeLLMInput(outcome.reasoning || '');
  const { clean: action_implied } = sanitizeLLMInput(outcome.action_implied || '');

  const consequences = {
    reasoning,
    action_implied,
    decided_at: new Date().toISOString(),
    outcome_type: outcome.outcome_type || 'unknown',
  };

  const supabase = createSupabaseServiceClient();
  const { error } = await supabase
    .from('eva_friday_decisions')
    .update({ consequences })
    .eq('id', decisionId);

  if (error) {
    console.error('[friday-briefing-card] populateDecisionConsequences failed:', error.message);
  }
}
