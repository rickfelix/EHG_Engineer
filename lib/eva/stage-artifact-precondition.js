/**
 * Stage-advancement artifact-precondition check.
 * SD-LEO-INFRA-STAGE-ADVANCEMENT-ARTIFACT-001, FR-2.
 *
 * A byte-faithful JS mirror of fn_advance_venture_stage's artifact-precondition logic
 * (database/migrations/20260704_chairman_product_review_gate_scoped_precondition_fixture_bypass.sql,
 * lines ~276-330), so lib/eva/stage-execution-worker.js::_advanceStage -- the daemon-walk's
 * single side-effecting advance for ALL stages -- can enforce the SAME artifact gate the RPC
 * path already enforces, WITHOUT calling the RPC itself.
 *
 * This is deliberately an INDEPENDENT check, not a delegation to fn_advance_venture_stage,
 * matching this exact function's own established convention (the S19 and 23->24 product-review
 * backstops are both independent JS-side mirrors of RPC-side checks -- "defense-in-depth across
 * two independent choke points, not a shared code path", per the RPC migration's own comments).
 * Routing through the full RPC would ALSO introduce its review_mode/chairman_decisions gate,
 * which _advanceStage's callers do not currently establish before calling it -- an independent
 * mirror avoids that scope creep entirely.
 *
 * FR-6 deviation valve: a missing artifact with an existing deviation-ledger record (keyed on
 * the artifact_type as the artifactRef) is treated as a documented, intentional skip -- reusing
 * lib/eva/deviation-ledger.js's readDeviations() exactly as-is, no new skip-tracking logic.
 */
import { readDeviations } from './deviation-ledger.js';

/**
 * @param {object} supabase - Supabase client
 * @param {string} ventureId
 * @param {number} stage - the FROM stage (artifacts required to leave this stage)
 * @returns {Promise<{ blocked: boolean, missingArtifacts: string[], deviatedArtifacts: string[], source: string }>}
 */
export async function checkStageArtifactPrecondition(supabase, ventureId, stage) {
  const { data: venture, error: ventureError } = await supabase
    .from('ventures')
    .select('metadata')
    .eq('id', ventureId)
    .maybeSingle();
  if (ventureError) {
    // Fail open on a transient DB blip -- mirrors this module's own S19/product-review
    // backstops' fail-open contract (a blip must not become fleet-wide denial-of-progress).
    return { blocked: false, missingArtifacts: [], source: 'check_error_failopen', error: ventureError.message };
  }
  const legacySkipped = venture?.metadata?.s22_legacy_skipped === true;

  const { data: flagRow } = await supabase
    .from('leo_feature_flags')
    .select('is_enabled')
    .eq('flag_key', 'LEO_S22_GATES_ENABLED')
    .maybeSingle();
  const s22FlagEnabled = flagRow?.is_enabled === true;

  const { data: stageConfig } = await supabase
    .from('venture_stages')
    .select('required_artifacts')
    .eq('stage_number', stage)
    .maybeSingle();
  const canonicalArray = stageConfig?.required_artifacts || [];

  const { data: legacyRows } = await supabase
    .from('stage_artifact_requirements')
    .select('artifact_type')
    .eq('stage_number', stage)
    .eq('is_blocking', true);
  const legacyArray = (legacyRows || []).map((r) => r.artifact_type);

  let requiredArtifacts;
  let source;
  if (legacySkipped && stage === 22) {
    requiredArtifacts = [];
    source = 'bypass_s22_legacy_skipped';
  } else if (s22FlagEnabled) {
    requiredArtifacts = canonicalArray;
    source = 'canonical';
  } else if (canonicalArray.length > 0) {
    requiredArtifacts = canonicalArray;
    source = 'canonical_with_fallback_available';
  } else {
    requiredArtifacts = legacyArray;
    source = 'legacy_fallback';
  }

  if (requiredArtifacts.length === 0) {
    return { blocked: false, missingArtifacts: [], source };
  }

  const { data: presentArtifacts, error: artifactsError } = await supabase
    .from('venture_artifacts')
    .select('artifact_type')
    .eq('venture_id', ventureId)
    .eq('is_current', true)
    .in('artifact_type', requiredArtifacts);
  if (artifactsError) {
    return { blocked: false, missingArtifacts: [], source: 'check_error_failopen', error: artifactsError.message };
  }

  const presentSet = new Set((presentArtifacts || []).map((a) => a.artifact_type));
  const notPresent = requiredArtifacts.filter((a) => !presentSet.has(a));

  if (notPresent.length === 0) {
    return { blocked: false, missingArtifacts: [], deviatedArtifacts: [], source };
  }

  const missingArtifacts = [];
  const deviatedArtifacts = [];
  for (const artifactType of notPresent) {
    const deviations = await readDeviations(supabase, { ventureId, artifactRef: artifactType });
    if (deviations.length > 0) {
      deviatedArtifacts.push(artifactType);
    } else {
      missingArtifacts.push(artifactType);
    }
  }

  return { blocked: missingArtifacts.length > 0, missingArtifacts, deviatedArtifacts, source };
}

export default { checkStageArtifactPrecondition };
