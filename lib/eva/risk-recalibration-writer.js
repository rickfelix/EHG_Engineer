/**
 * Risk Recalibration Writer
 * SD-LEO-INFRA-EXTEND-RISK-SCHEMA-001
 *
 * Centralized write logic for risk recalibration forms.
 * Preserves the advisory_data write path for backward compatibility.
 */

import { createSupabaseServiceClient } from '../supabase-client.js';
import 'dotenv/config';
import { mapScore, computeDelta, RISK_CATEGORIES } from './risk-category-mapper.js';

const supabase = createSupabaseServiceClient();

/**
 * Write or update a risk recalibration form.
 * Uses upsert with the partial unique index (venture_id, gate_number, risk_context).
 *
 * @param {Object} params
 * @param {string} params.ventureId - Venture UUID
 * @param {number} params.gateNumber - Gate/stage number (1-26)
 * @param {string} [params.riskContext='evaluation'] - Context: 'evaluation' or 'operations'
 * @param {Object} params.risks - Risk scores by category { market_risk: 80, technical_risk: 45, ... }
 * @param {Object} [params.previousRisks] - Previous risk levels for delta computation
 * @param {Object} [params.metadata] - Additional metadata (assessor_type, conditions, etc.)
 * @returns {Promise<Object>} Created/updated form record
 */
export async function writeRiskForm({ ventureId, gateNumber, riskContext = 'evaluation', risks, previousRisks = {}, metadata = {} }) {
  const form = {
    venture_id: ventureId,
    gate_number: gateNumber,
    risk_context: riskContext,
    from_phase: metadata.from_phase || 'evaluation',
    to_phase: metadata.to_phase || 'assessment',
    assessment_date: new Date().toISOString(),
    assessor_type: metadata.assessor_type || 'ai_agent',
    status: 'pending',
    go_decision: 'pending',
    risk_trajectory: 'stable',
    blocking_risks: false,
    chairman_review_required: false,
  };

  let hasBlocking = false;

  for (const category of RISK_CATEGORIES) {
    const score = risks[category];
    if (score === undefined || score === null) continue;

    const current = mapScore(score);
    const previous = previousRisks[category] ? mapScore(previousRisks[category]) : null;
    const delta = computeDelta(previous, current);

    form[`${category}_current`] = current;
    form[`${category}_delta`] = delta;
    if (previous) form[`${category}_previous`] = previous;

    if (current === 'CRITICAL') hasBlocking = true;
  }

  form.blocking_risks = hasBlocking;

  const { data, error } = await supabase
    .from('risk_recalibration_forms')
    .insert(form)
    .select()
    .single();

  if (error) throw new Error(`Failed to write risk form: ${error.message}`);
  return data;
}
