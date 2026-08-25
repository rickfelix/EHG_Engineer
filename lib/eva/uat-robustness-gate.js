/**
 * UAT robustness stage-advancement gate — SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-C (FR-1).
 *
 * Stage-agnostic by design (TR-1): child B (stage-key SSOT migration, dependency-isolated
 * from this child) determines the FINAL stage number for the dedicated UAT stage. This gate
 * looks up whether the CALLER's fromStage is marked with a declarative gate marker
 * (venture_stages.metadata.gates.uat_robustness_required === true) rather than hardcoding a
 * stage number — until child B lands that marker on the new stage row, `applies` is always
 * false, a safe no-op, mirroring the fleet-safety short-circuit in synthetic-actor-guard.js.
 *
 * Return shape mirrors synthetic-actor-guard.js's checkSyntheticActorFencing() ({applies,
 * satisfied, indeterminate?, reason}) so stage-execution-worker.js's caller can compose both
 * with identical handling.
 */

/**
 * @param {Object} supabase
 * @param {string} ventureId
 * @param {number} fromStage
 * @returns {Promise<{applies: boolean, satisfied: boolean, indeterminate?: boolean, reason: string}>}
 */
export async function checkUatRobustnessGate(supabase, ventureId, fromStage) {
  let stageRow;
  try {
    const { data, error } = await supabase
      .from('venture_stages')
      .select('metadata')
      .eq('stage_number', fromStage)
      .maybeSingle();
    if (error) throw error;
    stageRow = data;
  } catch (e) {
    return { applies: true, satisfied: false, indeterminate: true, reason: `uat-robustness-gate: venture_stages read error (fail-closed): ${e.message}` };
  }

  if (!stageRow?.metadata?.gates?.uat_robustness_required) {
    return { applies: false, satisfied: true, reason: 'stage not marked for the UAT robustness gate (venture_stages.metadata.gates.uat_robustness_required !== true)' };
  }

  let run;
  try {
    const { data, error } = await supabase
      .from('uat_test_runs')
      .select('id, status, metadata')
      .eq('metadata->>venture_id', ventureId)
      .eq('metadata->>stage_number', String(fromStage))
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    run = data;
  } catch (e) {
    return { applies: true, satisfied: false, indeterminate: true, reason: `uat-robustness-gate: uat_test_runs read error (fail-closed): ${e.message}` };
  }

  if (!run) {
    return { applies: true, satisfied: false, reason: `no UAT run recorded for venture ${ventureId} at stage ${fromStage}` };
  }
  if (run.status !== 'completed') {
    return { applies: true, satisfied: false, reason: `latest UAT run (${run.id}) has not completed (status=${run.status})` };
  }

  const qualityGate = run.metadata?.quality_gate;
  if (qualityGate !== 'GREEN') {
    const failures = run.metadata?.control_pack_failures;
    const failureDetail = Array.isArray(failures) && failures.length > 0
      ? failures.map((f) => `${f.control}: ${f.reason || JSON.stringify(f.failures)}`).join(' | ')
      : null;
    return {
      applies: true,
      satisfied: false,
      reason: failureDetail
        ? `latest UAT run (${run.id}) quality_gate=${qualityGate || 'unknown'} -- ${failureDetail}`
        : `latest UAT run (${run.id}) quality_gate=${qualityGate || 'unknown'}, not GREEN`,
    };
  }

  return { applies: true, satisfied: true, reason: `latest UAT run (${run.id}) is GREEN` };
}

export default { checkUatRobustnessGate };
