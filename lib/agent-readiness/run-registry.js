/**
 * lib/agent-readiness/run-registry.js
 * SD-LEO-FEAT-AGENT-READINESS-SERVICE-001 FR-3 / FR-5 / US-006 / US-010.
 *
 * Writes public.agent_readiness_audit_run with the full pre-registered methodology. Mirrors
 * public.canonical_model_set() client-side (sort+dedupe) before insert so a well-behaved caller never
 * round-trips a CHECK refusal — the DB constraint (agent_readiness_audit_run_model_set_canonical)
 * remains the real enforcement, this is just not making the caller rely on trial-and-error to satisfy it.
 *
 * stage_tag has NO DEFAULT here on purpose (FR-5/US-010 AC-010-3): every caller must name one of
 * standalone_pre_pipeline / eva_stage0_nursery / dogfood_internal explicitly.
 */

import { createClient } from '@supabase/supabase-js';

export const STAGE_TAGS = Object.freeze({
  STANDALONE_PRE_PIPELINE: 'standalone_pre_pipeline',
  EVA_STAGE0_NURSERY: 'eva_stage0_nursery',
  DOGFOOD_INTERNAL: 'dogfood_internal'
});

const VALID_STAGE_TAGS = new Set(Object.values(STAGE_TAGS));
const VALID_RUN_TYPES = new Set(['before', 'after']);

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Client-side mirror of public.canonical_model_set(TEXT[]) — sort + dedupe. */
export function canonicalModelSet(models) {
  return Array.from(new Set(models)).sort();
}

/** Client-side mirror of the venture_url normalization CHECK (lower/trim/no trailing slash/http(s)://). */
export function normalizeVentureUrl(url) {
  const trimmed = String(url || '').trim().toLowerCase();
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

/**
 * @param {object} params
 * @param {string} params.ventureUrl
 * @param {'before'|'after'} params.runType
 * @param {string} params.promptSetId
 * @param {number} params.promptCount
 * @param {string[]} params.modelSet
 * @param {number} params.samplesPerCell
 * @param {number} params.pinnedTemperature
 * @param {string} params.stageTag - REQUIRED, one of STAGE_TAGS, no default
 * @returns {Promise<{id:string, expected_sample_count:number}>}
 */
export async function registerAuditRun({
  ventureUrl,
  runType,
  promptSetId,
  promptCount,
  modelSet,
  samplesPerCell,
  pinnedTemperature,
  stageTag
}) {
  if (!VALID_RUN_TYPES.has(runType)) {
    throw new Error(`run_type must be 'before' or 'after', got: ${runType}`);
  }
  if (!stageTag || !VALID_STAGE_TAGS.has(stageTag)) {
    throw new Error(`stage_tag is required and must be one of: ${[...VALID_STAGE_TAGS].join(', ')} (got: ${stageTag})`);
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('agent_readiness_audit_run')
    .insert({
      venture_url: normalizeVentureUrl(ventureUrl),
      run_type: runType,
      prompt_set_id: promptSetId,
      prompt_count: promptCount,
      model_set: canonicalModelSet(modelSet),
      samples_per_cell: samplesPerCell,
      pinned_temperature: pinnedTemperature,
      stage_tag: stageTag
    })
    .select('id, expected_sample_count')
    .single();

  if (error) {
    throw new Error(`agent_readiness_audit_run insert refused: ${error.message}`);
  }
  return data;
}
