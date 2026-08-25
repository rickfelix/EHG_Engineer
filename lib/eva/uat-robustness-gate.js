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
 * SECURITY sub-agent finding S2 (EXEC-TO-PLAN evidence): the ORIGINAL version of this function
 * gated `applies` on the STAGE marker alone -- fleet-wide-per-stage, not per-venture opt-in.
 * synthetic-actor-guard.js's own header (round-4 finding) explicitly rejected exactly this
 * design ("venture_stages.required_artifacts is fleet-wide per stage, structurally wrong for
 * per-venture opt-in fencing"). Fixed: `applies` now ALSO requires
 * ventures.metadata.uat_robustness_probe_required === true -- a NEW, distinctly-named flag
 * (deliberately NOT reusing uat_probe_required, which is stage-19-specific and single-flat-
 * block per validation-agent's earlier M3 finding on synthetic_actor's own lack of per-stage
 * keying -- reusing it here would repeat that exact mistake for a different stage).
 *
 * SECURITY finding S3: an ANOMALOUS missing venture_stages row (stage_number outside the valid
 * 1-26 range) now fails CLOSED (indeterminate), distinct from a PRESENT row with the marker
 * simply false (a legitimate, common not-applicable case, which still passes through).
 * synthetic-actor-guard.js's own round-9 fix (SEC-51) established this exact polarity
 * distinction; this gate now matches it instead of re-introducing the bug SEC-51 closed.
 *
 * Return shape mirrors synthetic-actor-guard.js's checkSyntheticActorFencing() ({applies,
 * satisfied, indeterminate?, reason}) so stage-execution-worker.js's caller can compose both
 * with identical handling.
 *
 * Deliberately fromStage-only, no toStage parameter: this is an EXIT gate on the marked stage
 * (you must pass UAT before leaving it, to any destination) -- matching lib/eva/lifecycle/
 * exit-gate-enforcer.js's checkExitGates({supabase, ventureId, fromStage}), which has no
 * toStage parameter either. TESTING sub-agent finding (EXEC-TO-PLAN evidence row 66749208)
 * flagged this as "ignores toStage, gates all outbound transitions" -- correct as observed, but
 * that IS the established exit-gate semantic in this codebase, not a gap specific to this gate.
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

  // S3: an ABSENT stage row is anomalous (every valid stage_number 1-26 has a row) -- fail
  // closed/indeterminate, distinct from a PRESENT row whose marker is simply false.
  if (!stageRow) {
    return { applies: true, satisfied: false, indeterminate: true, reason: `uat-robustness-gate: no venture_stages row found for stage_number=${fromStage} (fail-closed -- anomalous, every valid stage has a row)` };
  }

  if (!stageRow.metadata?.gates?.uat_robustness_required) {
    return { applies: false, satisfied: true, reason: 'stage not marked for the UAT robustness gate (venture_stages.metadata.gates.uat_robustness_required !== true)' };
  }

  // S2: per-venture opt-in, mirroring synthetic-actor-guard.js's fleet-safety short-circuit --
  // a venture that never opted in always passes with zero further reads.
  let ventureRow;
  try {
    const { data, error } = await supabase
      .from('ventures')
      .select('metadata')
      .eq('id', ventureId)
      .maybeSingle();
    if (error) throw error;
    ventureRow = data;
  } catch (e) {
    return { applies: true, satisfied: false, indeterminate: true, reason: `uat-robustness-gate: ventures read error (fail-closed): ${e.message}` };
  }
  if (!ventureRow?.metadata?.uat_robustness_probe_required) {
    return { applies: false, satisfied: true, reason: 'venture has not opted into the UAT robustness gate (ventures.metadata.uat_robustness_probe_required !== true)' };
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
