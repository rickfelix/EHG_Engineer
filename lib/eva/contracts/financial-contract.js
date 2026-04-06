/**
 * Financial Consistency Contract Module
 * Part of SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-F
 *
 * Cross-stage financial consistency enforcement for the EVA pipeline.
 * Stage 5 sets the canonical baseline; downstream stages validate against it.
 *
 * @module lib/eva/contracts/financial-contract
 */

import { createClient } from '@supabase/supabase-js';

const TABLE = 'venture_financial_contract';

// Tolerance thresholds
const WARN_THRESHOLD = 0.20;  // 20%
const BLOCK_THRESHOLD = 0.50; // 50%

// Numeric fields that can be compared for deviation
const NUMERIC_FIELDS = ['capital_required', 'cac_estimate', 'ltv_estimate'];

/**
 * Get a Supabase client (service role for write ops).
 * Consumers can override by passing their own client.
 */
function getClient(supabaseClient) {
  if (supabaseClient) return supabaseClient;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key);
}

/**
 * Set (create or update) the canonical financial contract for a venture.
 * Called by Stage 5 after financial model generation.
 *
 * @param {string} ventureId - UUID of the venture
 * @param {number} stageNumber - Stage that sets the contract (typically 5)
 * @param {Object} financialData - Financial metrics
 * @param {Object} [options]
 * @param {Object} [options.supabaseClient] - Optional Supabase client override
 * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
 */
export async function setContract(ventureId, stageNumber, financialData, options = {}) {
  const client = getClient(options.supabaseClient);

  // Check for existing contract
  const { data: existing } = await client
    .from(TABLE)
    .select('*')
    .eq('venture_id', ventureId)
    .maybeSingle();

  const row = {
    venture_id: ventureId,
    capital_required: financialData.capitalRequired ?? financialData.capital_required ?? null,
    cac_estimate: financialData.cac ?? financialData.cac_estimate ?? null,
    ltv_estimate: financialData.ltv ?? financialData.ltv_estimate ?? null,
    unit_economics: financialData.unitEconomics ?? financialData.unit_economics ?? null,
    pricing_model: financialData.pricingModel ?? financialData.pricing_model ?? null,
    price_points: financialData.pricePoints ?? financialData.price_points ?? null,
    revenue_projection: financialData.revenueProjection ?? financialData.revenue_projection ?? null,
    set_by_stage: stageNumber,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    // Append to refinement history
    const history = Array.isArray(existing.refinement_history) ? existing.refinement_history : [];
    history.push({
      stage: stageNumber,
      timestamp: new Date().toISOString(),
      action: 'reset',
      old_values: {
        capital_required: existing.capital_required,
        cac_estimate: existing.cac_estimate,
        ltv_estimate: existing.ltv_estimate,
      },
    });

    const { data, error } = await client
      .from(TABLE)
      .update({ ...row, refinement_history: history, last_refined_by_stage: stageNumber })
      .eq('venture_id', ventureId)
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data };
  }

  // Insert new
  const { data, error } = await client
    .from(TABLE)
    .insert(row)
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

/**
 * Get the current canonical financial contract for a venture.
 *
 * @param {string} ventureId - UUID of the venture
 * @param {Object} [options]
 * @param {Object} [options.supabaseClient] - Optional Supabase client override
 * @returns {Promise<Object|null>} Contract data or null if none exists
 */
export async function getContract(ventureId, options = {}) {
  const client = getClient(options.supabaseClient);

  const { data, error } = await client
    .from(TABLE)
    .select('*')
    .eq('venture_id', ventureId)
    .maybeSingle();

  if (error) {
    // Defensive: callers in the stage pipeline have been observed passing
    // the venture *name* (e.g., "FormatShift API") instead of the UUID,
    // which causes PostgreSQL to throw "invalid input syntax for type uuid"
    // (SQLSTATE 22P02). Returning null on UUID-shape errors matches the
    // existing optional/non-blocking semantics of the callers (Stage 15
    // swallows the error already) without breaking other failure modes.
    if (error.code === '22P02' || /invalid input syntax for type uuid/i.test(error.message || '')) {
      console.warn(`[financial-contract] getContract: non-UUID ventureId rejected by Postgres (${JSON.stringify(ventureId)}) — returning null`);
      return null;
    }
    throw new Error(`Failed to get financial contract: ${error.message}`);
  }
  return data || null;
}

/**
 * Validate proposed financial data against the canonical contract.
 *
 * @param {string} ventureId - UUID of the venture
 * @param {number} stageNumber - Stage performing validation
 * @param {Object} proposedData - Proposed financial values
 * @param {Object} [options]
 * @param {Object} [options.supabaseClient] - Optional Supabase client override
 * @returns {Promise<{consistent: boolean, deviations: Array}>}
 */
export async function validateConsistency(ventureId, stageNumber, proposedData, options = {}) {
  const contract = await getContract(ventureId, options);

  // No contract = backward compatible (pre-Stage 5 ventures)
  if (!contract) {
    return { consistent: true, deviations: [], message: 'No contract exists (pre-Stage 5)' };
  }

  const deviations = [];

  // Map proposed data fields to contract column names
  const fieldMap = {
    capital_required: proposedData.capitalRequired ?? proposedData.capital_required,
    cac_estimate: proposedData.cac ?? proposedData.cac_estimate,
    ltv_estimate: proposedData.ltv ?? proposedData.ltv_estimate,
  };

  for (const field of NUMERIC_FIELDS) {
    const contractValue = contract[field];
    const proposedValue = fieldMap[field];

    // Skip if either value is null/undefined
    if (contractValue == null || proposedValue == null) continue;
    if (contractValue === 0) continue; // Can't compute deviation from zero

    const pctDeviation = Math.abs((proposedValue - contractValue) / contractValue);
    let severity = 'ok';

    if (pctDeviation > BLOCK_THRESHOLD) {
      severity = 'block';
    } else if (pctDeviation > WARN_THRESHOLD) {
      severity = 'warning';
    }

    deviations.push({
      field,
      contract_value: contractValue,
      proposed_value: proposedValue,
      pct_deviation: Math.round(pctDeviation * 10000) / 100, // e.g. 35.25 for 35.25%
      severity,
    });
  }

  const hasBlock = deviations.some(d => d.severity === 'block');
  const hasWarning = deviations.some(d => d.severity === 'warning');

  return {
    consistent: !hasBlock && !hasWarning,
    deviations,
    stage: stageNumber,
    hasBlock,
    hasWarning,
  };
}

/**
 * Refine the canonical contract from a downstream stage.
 * Respects tolerance thresholds for allowed refinement.
 *
 * @param {string} ventureId - UUID of the venture
 * @param {number} stageNumber - Stage performing refinement
 * @param {Object} refinedData - New values to apply
 * @param {string} rationale - Why the refinement is needed
 * @param {Object} [options]
 * @param {Object} [options.supabaseClient] - Optional Supabase client override
 * @returns {Promise<{success: boolean, warning?: boolean, data?: Object, error?: string, deviations?: Array}>}
 */
export async function refineContract(ventureId, stageNumber, refinedData, rationale, options = {}) {
  const contract = await getContract(ventureId, options);
  if (!contract) {
    return { success: false, error: 'No financial contract exists for this venture' };
  }

  // Validate the refinement against current contract
  const validation = await validateConsistency(ventureId, stageNumber, refinedData, options);

  if (validation.hasBlock) {
    return {
      success: false,
      error: 'Refinement blocked: deviation exceeds 50% tolerance',
      deviations: validation.deviations,
    };
  }

  const client = getClient(options.supabaseClient);

  // Build update with only provided fields
  const updates = {};
  if (refinedData.capitalRequired != null || refinedData.capital_required != null) {
    updates.capital_required = refinedData.capitalRequired ?? refinedData.capital_required;
  }
  if (refinedData.cac != null || refinedData.cac_estimate != null) {
    updates.cac_estimate = refinedData.cac ?? refinedData.cac_estimate;
  }
  if (refinedData.ltv != null || refinedData.ltv_estimate != null) {
    updates.ltv_estimate = refinedData.ltv ?? refinedData.ltv_estimate;
  }
  if (refinedData.unitEconomics != null || refinedData.unit_economics != null) {
    updates.unit_economics = refinedData.unitEconomics ?? refinedData.unit_economics;
  }
  if (refinedData.pricingModel != null || refinedData.pricing_model != null) {
    updates.pricing_model = refinedData.pricingModel ?? refinedData.pricing_model;
  }
  if (refinedData.pricePoints != null || refinedData.price_points != null) {
    updates.price_points = refinedData.pricePoints ?? refinedData.price_points;
  }
  if (refinedData.revenueProjection != null || refinedData.revenue_projection != null) {
    updates.revenue_projection = refinedData.revenueProjection ?? refinedData.revenue_projection;
  }

  // Append to history
  const history = Array.isArray(contract.refinement_history) ? [...contract.refinement_history] : [];
  history.push({
    stage: stageNumber,
    timestamp: new Date().toISOString(),
    action: 'refine',
    rationale,
    old_values: {
      capital_required: contract.capital_required,
      cac_estimate: contract.cac_estimate,
      ltv_estimate: contract.ltv_estimate,
    },
    new_values: updates,
    deviations: validation.deviations,
  });

  const { data, error } = await client
    .from(TABLE)
    .update({
      ...updates,
      last_refined_by_stage: stageNumber,
      refinement_history: history,
      updated_at: new Date().toISOString(),
    })
    .eq('venture_id', ventureId)
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, warning: validation.hasWarning, data, deviations: validation.deviations };
}
