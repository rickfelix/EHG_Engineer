/**
 * Shared provenance grading for venture_artifacts readers.
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-G (FR-5, FR-6).
 *
 * Generalizes the chairman-ratified gate-evidence-provenance principle (ratification 6c263823)
 * to venture_artifacts, mirroring lib/sub-agent-executor/evidence-provenance.js's gradeProvenance
 * MODEL (cutover-boundary shape, absent-not-weak grading, hash re-derivation) -- NOT its
 * PRODUCER_ALLOWLIST, which is scoped to sub_agent_execution_results producers
 * ('sub_agent_executor', 'task_hook') and would 100%-false-refuse every venture_artifacts row,
 * since the 54 live venture_artifacts.source values are stage-producer labels, not producer
 * identities (measured at scripts/modules/handoff/executors/lead-final-approval/gates/
 * acceptance-artifact-gate.js:26-31). venture_artifacts has no producer allowlist: any non-empty
 * producer string is accepted, because the stamp's purpose here is "who/what/when", not "was this
 * an authorized producer" -- a narrower, different question this SD does not answer.
 *
 * Every reader wired by this SD (reality-gates.js, stage-23-launch-readiness.js,
 * exit-gate-verifiers.js, stage-artifact-precondition.js, artifact-integrity-checker.js,
 * acceptance-artifact-gate.js) calls gradeVentureArtifactProvenance() instead of hand-rolling its
 * own predicate, so a future reader has one place to import rather than a fifth or sixth copy.
 */

import { VENTURE_ARTIFACT_PROVENANCE_CUTOVER_AT, buildMachineProvenance } from './artifact-persistence-service.js';
import { computeContentHash } from './artifact-content-hash.js';

export { VENTURE_ARTIFACT_PROVENANCE_CUTOVER_AT };

/**
 * Grade one venture_artifacts row for machine provenance.
 *
 * @param {object} row - must carry created_at, metadata, content, artifact_data (as read via the
 *   reader's own SELECT -- widen to include these four if not already present).
 * @returns {{absent: boolean, preCutover: boolean, missingField?: string}}
 */
export function gradeVentureArtifactProvenance(row) {
  const createdAt = row?.created_at ? Date.parse(row.created_at) : NaN;
  const isPreCutover = Number.isFinite(createdAt) && createdAt < Date.parse(VENTURE_ARTIFACT_PROVENANCE_CUTOVER_AT);
  if (isPreCutover) return { absent: false, preCutover: true };

  const stamp = row?.metadata?.machine_provenance;
  if (!stamp || typeof stamp !== 'object') {
    return { absent: true, preCutover: false, missingField: 'machine_provenance' };
  }
  if (!stamp.producer) return { absent: true, preCutover: false, missingField: 'machine_provenance.producer' };
  if (!stamp.run_id) return { absent: true, preCutover: false, missingField: 'machine_provenance.run_id' };
  if (!stamp.content_hash) return { absent: true, preCutover: false, missingField: 'machine_provenance.content_hash' };
  if (stamp.hash_source !== 'content' && stamp.hash_source !== 'artifact_data') {
    return { absent: true, preCutover: false, missingField: 'machine_provenance.hash_source' };
  }

  const hashInput = stamp.hash_source === 'content' ? row.content : row.artifact_data;
  const recomputed = computeContentHash(hashInput);
  if (recomputed !== stamp.content_hash) {
    return { absent: true, preCutover: false, missingField: 'content_hash_mismatch' };
  }

  return { absent: false, preCutover: false };
}

/**
 * Convenience boolean for call sites that just need a pass/fail, not the detail. A pre-cutover
 * row (or a row that verifies) passes; a post-cutover row missing/mismatching its stamp does not.
 *
 * @param {object} row
 * @returns {boolean}
 */
export function hasVentureArtifactProvenance(row) {
  return !gradeVentureArtifactProvenance(row).absent;
}

// Re-exported so a caller building a fixture row (tests, or a call site stamping ad hoc) does not
// need to import both this module and artifact-persistence-service.js.
export { buildMachineProvenance };

/**
 * Verify a launch_uat_report artifact's hash-link to its producing uat_test_runs row (FR-6).
 *
 * The link is the stamp's own run_id (stage-23-dedicated-venture-uat.js passes the REAL
 * uat_test_runs.id as writeArtifact()'s runId, not a generated UUID -- see that file and
 * writeArtifactBatch()'s art.runId threading). This verifies the linked row genuinely exists,
 * rather than trusting the stamped run_id at face value.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} artifactRow - a launch_uat_report venture_artifacts row (must carry metadata)
 * @returns {Promise<{linked: boolean, reason: string, runId?: string|null}>}
 */
export async function verifyLaunchUatReportLink(supabase, artifactRow) {
  const runId = artifactRow?.metadata?.machine_provenance?.run_id ?? artifactRow?.metadata?.uat_test_run_id ?? null;
  if (!runId) return { linked: false, reason: 'no run_id stamped on this artifact', runId: null };

  const { data, error } = await supabase
    .from('uat_test_runs')
    .select('id')
    .eq('id', runId)
    .maybeSingle();
  if (error) return { linked: false, reason: `uat_test_runs lookup error: ${error.message}`, runId };
  if (!data) return { linked: false, reason: `no uat_test_runs row found for run_id ${runId}`, runId };
  return { linked: true, reason: 'linked uat_test_runs row exists', runId };
}
