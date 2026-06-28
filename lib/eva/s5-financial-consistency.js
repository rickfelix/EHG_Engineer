/**
 * S5 financial single-source-of-truth helpers.
 * SD-LEO-INFRA-S5-FINANCIAL-SINGLE-SOURCE-001.
 *
 * The S5 kill gate persists a truth_financial_model artifact whose verdict fields
 * (decision/reasons/blockProgression/remediationRoute) must always equal the deterministic
 * recompute over the artifact's own inputs (recomputeKillGateVerdict). The drift seam is the
 * reEvaluateOnly path: it recomputes the verdict into stageOutput but never re-persists it onto
 * the artifact, so artifact readers (S17 strategy, kill-gate recompute) can see a stale decision.
 *
 * These helpers (a) compare a persisted artifact's verdict to a fresh recompute and (b) lockstep
 * the persisted artifact to the recompute via a TARGETED jsonb update of ONLY the verdict fields —
 * never the LLM-derived model content (honors the 'no regen / no overwrite' contract). The same
 * recompute fn drives the orchestrator lockstep (FR-1), the invariant checker (FR-3) and the
 * backfill (FR-4), so they cannot diverge.
 */

import { recomputeKillGateVerdict } from './kill-gate-recompute.js';

export const S5_ARTIFACT_TYPE = 'truth_financial_model';

// Only these DERIVED verdict fields are ever written back. Inputs / LLM model content are left
// untouched, so a targeted update cannot mask input drift or destroy narrative.
export const VERDICT_FIELDS = Object.freeze(['decision', 'reasons', 'blockProgression', 'remediationRoute']);

/** Deterministic, key-order-insensitive structural compare of a verdict field (handles arrays/objects). */
function fieldEquals(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (typeof a !== 'object' && typeof b !== 'object') return a === b;
  try {
    return stableStringify(a) === stableStringify(b);
  } catch {
    return false;
  }
}

function stableStringify(v) {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

/**
 * Does the persisted artifact payload's verdict differ from the recomputed verdict?
 * Only the VERDICT_FIELDS are compared.
 * @param {Object} payload - persisted truth_financial_model artifact_data
 * @param {Object} verdict - recompute result (decision/reasons/blockProgression/remediationRoute)
 * @returns {boolean}
 */
export function verdictDiffers(payload, verdict) {
  if (!payload || !verdict) return false; // nothing to reconcile
  return VERDICT_FIELDS.some((f) => f in verdict && !fieldEquals(payload[f], verdict[f]));
}

/**
 * Pure consistency evaluation for a venture's S5: compare the persisted truth_financial_model
 * verdict to a fresh recompute over the same artifact.
 * @param {Array<{artifactType?:string, payload?:Object}>} artifacts - loaded persisted artifacts
 * @returns {{applicable:boolean, consistent:boolean, persistedDecision:any, recomputedDecision:any}}
 */
export function evaluateS5Consistency(artifacts) {
  const verdict = recomputeKillGateVerdict(5, artifacts);
  const payload = (Array.isArray(artifacts) ? artifacts.find((a) => a?.artifactType === S5_ARTIFACT_TYPE) : null)?.payload
    || (Array.isArray(artifacts) ? artifacts[0]?.payload : null);
  if (!verdict || !payload) {
    return { applicable: false, consistent: true, persistedDecision: payload?.decision, recomputedDecision: verdict?.decision };
  }
  return {
    applicable: true,
    consistent: !verdictDiffers(payload, verdict),
    persistedDecision: payload.decision,
    recomputedDecision: verdict.decision,
  };
}

/**
 * Lockstep: persist the recomputed verdict fields onto the CURRENT truth_financial_model artifact
 * (targeted in-place jsonb merge) when (and only when) they differ. No LLM regen, no version bump,
 * no is_current flip (per DB validation). Must run on a service-role connection (RLS).
 *
 * @param {Object} supabase - service-role client
 * @param {Object} args - { ventureId, stage, payload, verdict, logger }
 * @returns {Promise<{updated:boolean, decision:any}>}
 */
export async function persistRecomputedVerdict(supabase, { ventureId, stage = 5, payload, verdict, logger = console }) {
  if (!supabase || !ventureId || !verdict || !payload) return { updated: false, decision: verdict?.decision };
  if (!verdictDiffers(payload, verdict)) return { updated: false, decision: verdict.decision };

  const merged = { ...payload };
  for (const f of VERDICT_FIELDS) if (f in verdict) merged[f] = verdict[f];

  const { error } = await supabase
    .from('venture_artifacts')
    .update({ artifact_data: merged })
    .eq('venture_id', ventureId)
    .eq('lifecycle_stage', stage)
    .eq('artifact_type', S5_ARTIFACT_TYPE)
    .eq('is_current', true);

  if (error) {
    logger?.warn?.(`[S5Consistency] lockstep verdict persist failed (non-fatal): ${error.message}`);
    return { updated: false, decision: verdict.decision };
  }
  logger?.log?.(`[S5Consistency] lockstep: re-persisted recomputed verdict (decision='${verdict.decision}') onto venture ${ventureId} S${stage} truth_financial_model`);
  return { updated: true, decision: verdict.decision };
}
