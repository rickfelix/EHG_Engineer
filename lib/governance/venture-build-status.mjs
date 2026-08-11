/**
 * Venture build-status derivation — SD-LEO-INFRA-VENTURE-STATUS-LANGUAGE-001.
 *
 * THE INCIDENT: the Image Alt Text Generator venture (id 50763b6a-1fad-4e1e-b2fc-296a1d66ebf9)
 * read as "built and waiting" in chairman-facing prose while measured factory state said
 * workflow_status='pending', workflow_started_at=null, deployment_url=null, launch_mode='simulated'
 * — no real build ever started. Stale prose reached the chairman and his family before
 * measurement caught it.
 *
 * *** MEASURED, NOT ASSUMED: venture_stage_work ROW-COUNT IS THE WRONG SIGNAL. *** The witnessed
 * venture has 7 completed venture_stage_work rows (stages 1-7, work_type='artifact_only',
 * 2026-07-13 through 2026-08-05) despite never having a real build — that table measures
 * planning/artifact-stage progress, a DIFFERENT axis from build/deploy execution. Conflating them
 * would reproduce the incident's confusion one level down, which is why deriveVentureBuildStatus
 * below never reads venture_stage_work or current_lifecycle_stage.
 *
 * deriveVentureBuildStatus is PURE (data-in / verdict-out), mirroring
 * lib/governance/real-build-discriminator.mjs's own style, and composes that module's
 * isRealBuildStarted() rather than re-deriving equivalent evidence logic. The IO (fetching the
 * venture + venture_deployments rows) lives in fetchVentureBuildStatus/fetchVentureBuildStatusBatch
 * below, so callers that already have the venture row (e.g. a batched fetch) can call the pure
 * function directly with zero extra DB round-trips.
 */

import { isRealBuildStarted } from './real-build-discriminator.mjs';

/** The status vocabulary this module can return. Never anything outside this set. */
export const BUILD_STATUS = Object.freeze({
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  BUILT_NOT_DEPLOYED: 'built_not_deployed',
  DEPLOYED_SIMULATED: 'deployed_simulated',
  LIVE: 'live',
  UNKNOWN: 'unknown',
});

/**
 * Derive an honest build-status word from measured venture state. PURE: no DB, no IO.
 *
 * `!real_build_started` is checked FIRST and wins over everything else, including
 * workflow_status='completed' — absence of build evidence stays absence regardless of what a
 * workflow label claims (FR-1/FR-2: prose/labels may describe intent, never assert build state
 * beyond what evidence supports).
 *
 * @param {{workflow_status?:string|null, workflow_started_at?:string|null,
 *          deployment_url?:string|null, repo_url?:string|null, launch_mode?:string|null}|null} ventureRow
 * @param {{hasRoutedDeployment?:boolean}} [opts] - from venture_deployments (status='routed')
 * @returns {{status:string, evidence:object, measured_at:string}}
 */
export function deriveVentureBuildStatus(ventureRow, { hasRoutedDeployment = false } = {}) {
  const measured_at = new Date().toISOString();

  if (!ventureRow) {
    return {
      status: BUILD_STATUS.UNKNOWN,
      evidence: { reason: 'no_venture_row' },
      measured_at,
    };
  }

  const real_build_started = isRealBuildStarted(ventureRow);
  const workflow_status = ventureRow.workflow_status ?? null;
  const launch_mode = ventureRow.launch_mode ?? null;

  const evidence = {
    workflow_status,
    workflow_started_at: ventureRow.workflow_started_at ?? null,
    deployment_url: ventureRow.deployment_url ?? null,
    repo_url: ventureRow.repo_url ?? null,
    launch_mode,
    real_build_started,
    has_routed_deployment: Boolean(hasRoutedDeployment),
  };

  let status;
  if (!real_build_started) {
    // No build evidence at all -- never asserted built regardless of workflow_status's label.
    status = BUILD_STATUS.NOT_STARTED;
  } else if (launch_mode === 'live' && hasRoutedDeployment) {
    status = BUILD_STATUS.LIVE;
  } else if (hasRoutedDeployment) {
    status = BUILD_STATUS.DEPLOYED_SIMULATED;
  } else if (workflow_status === 'in_progress' || workflow_status === 'paused') {
    status = BUILD_STATUS.IN_PROGRESS;
  } else {
    // Real-build evidence exists (repo/deployment_url/workflow_started_at) but no routed deploy.
    status = BUILD_STATUS.BUILT_NOT_DEPLOYED;
  }

  return { status, evidence, measured_at };
}

/** Build-status words that assert a real build or deployment happened -- for word-matching in callers. */
export const ASSERTS_BUILT = new Set([
  BUILD_STATUS.BUILT_NOT_DEPLOYED,
  BUILD_STATUS.DEPLOYED_SIMULATED,
  BUILD_STATUS.LIVE,
]);

/**
 * Fetch a venture row + its routed-deployment evidence and derive its build status.
 * Fail-soft to status:'unknown' on ANY read error -- FR-2: could-not-measure is a first-class
 * outcome, never defaulted to built or not-built.
 * @param {object} supabase
 * @param {string} ventureId
 * @returns {Promise<{status:string, evidence:object, measured_at:string}>}
 */
export async function fetchVentureBuildStatus(supabase, ventureId) {
  if (!supabase || !ventureId) {
    return { status: BUILD_STATUS.UNKNOWN, evidence: { reason: 'missing_supabase_or_venture' }, measured_at: new Date().toISOString() };
  }
  try {
    const { data: ventureRow, error } = await supabase
      .from('ventures')
      .select('workflow_status, workflow_started_at, deployment_url, repo_url, launch_mode')
      .eq('id', ventureId)
      .maybeSingle();
    if (error || !ventureRow) {
      return { status: BUILD_STATUS.UNKNOWN, evidence: { reason: error ? error.message : 'venture_not_found' }, measured_at: new Date().toISOString() };
    }
    let hasRoutedDeployment = false;
    try {
      const { data: dep, error: depErr } = await supabase
        .from('venture_deployments')
        .select('id')
        .eq('venture_id', ventureId)
        .eq('status', 'routed')
        .limit(1)
        .maybeSingle();
      hasRoutedDeployment = !depErr && Boolean(dep);
    } catch {
      // venture_deployments read failure is NOT a whole-status failure -- deployment
      // evidence degrades to "not confirmed" (the safe, never-over-claims default),
      // not to an overall unknown (the ventures row itself DID read successfully).
      hasRoutedDeployment = false;
    }
    return deriveVentureBuildStatus(ventureRow, { hasRoutedDeployment });
  } catch (e) {
    return { status: BUILD_STATUS.UNKNOWN, evidence: { reason: (e && e.message) || String(e) }, measured_at: new Date().toISOString() };
  }
}

/**
 * Batched variant for callers rendering many rows at once (e.g. the chairman exec-summary /
 * decision-email IO shells) -- ONE ventures query + ONE venture_deployments query for the whole
 * set, mirroring the existing batched dead-venture-ids pattern in scripts/adam-exec-summary.mjs
 * rather than one query per row.
 * @param {object} supabase
 * @param {string[]} ventureIds
 * @returns {Promise<Map<string, {status:string, evidence:object, measured_at:string}>>}
 */
export async function fetchVentureBuildStatusBatch(supabase, ventureIds) {
  const ids = [...new Set((ventureIds || []).filter(Boolean))];
  const result = new Map();
  if (!supabase || !ids.length) return result;

  let ventureRows = [];
  let ventureReadFailed = false;
  try {
    const { data, error } = await supabase
      .from('ventures')
      .select('id, workflow_status, workflow_started_at, deployment_url, repo_url, launch_mode')
      .in('id', ids);
    if (error) throw error;
    ventureRows = data || [];
  } catch {
    ventureReadFailed = true;
  }

  let routedDeploymentIds = new Set();
  try {
    const { data, error } = await supabase
      .from('venture_deployments')
      .select('venture_id')
      .in('venture_id', ids)
      .eq('status', 'routed');
    if (!error) routedDeploymentIds = new Set((data || []).map((d) => d.venture_id));
  } catch {
    // fail-soft: deployment evidence degrades to "not confirmed" per-venture, not a batch failure.
  }

  const byId = new Map(ventureRows.map((v) => [v.id, v]));
  for (const id of ids) {
    if (ventureReadFailed || !byId.has(id)) {
      result.set(id, { status: BUILD_STATUS.UNKNOWN, evidence: { reason: ventureReadFailed ? 'ventures_batch_read_failed' : 'venture_not_found' }, measured_at: new Date().toISOString() });
      continue;
    }
    result.set(id, deriveVentureBuildStatus(byId.get(id), { hasRoutedDeployment: routedDeploymentIds.has(id) }));
  }
  return result;
}
