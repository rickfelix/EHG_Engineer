/**
 * SD-LEO-FIX-ALTIFYAI-STAGE-WALK-001.
 *
 * Assembles a REAL controlPackEvidence pack for AltifyAI's stage-23 UAT walk, so
 * lib/uat/result-recorder.js's completeSession() can evaluate fence_two_sidedness and
 * live_deployment_binding for real (instead of leaving them not_attempted). Every sub-fact
 * is DERIVED from a live source (GitHub Actions API, a live signed-in HTTP round-trip, or the
 * DB) -- never hardcoded -- matching this codebase's own documented anti-fabrication standard
 * (lib/eva/uat-control-pack.js's S4 finding).
 *
 * Deliberately fail-LOUD (throws), never fail-soft-to-false: if a derivation cannot complete
 * (a GitHub API pull errors, the live round-trip fails, a required secret is missing), the
 * caller must refuse to produce a run at all rather than report a guessed/defaulted value.
 * This is FR-4's fail-closed contract -- see the CLI wrapper in
 * scripts/one-off/rerun-stage23-walk-control-pack-001.mjs.
 *
 * canary_mutation_control is NOT built here -- per coordinator ruling (relaying Solomon verdict
 * 83de7b45, 2026-09-13, superseding an earlier waiver-based plan), it is a walker-mutation-test
 * step, not a fence/binding fact about AltifyAI itself, and needs no seeded venture journey or
 * waiver. See lib/apa/altifyai-canary-step.mjs for that control's construction; it is wired
 * into the walk via journey-walk-orchestrator.js's deps.canaryStep seam, not this module.
 */
import { checkSyntheticActorFencing } from '../eva/synthetic-actor-guard.js';
import { generateProbeNonce } from '../eva/uat-control-pack.js';
import { mintUatSessionToken } from './altifyai-uat-session-token.mjs';

const GITHUB_API_BASE = 'https://api.github.com';
const ALTIFYAI_REPO = 'rickfelix/altifyai';
const CI_WORKFLOW_FILE = 'ci.yml';
const CI_TEST_STEP_NAME = 'npm test';
const NONCE_PATH_PREFIX = '/uat-nonce-';

function isPlaceholder(value) {
  if (value == null || value === '') return true;
  const s = String(value).trim().toUpperCase();
  return s === 'TBD' || s === 'PLACEHOLDER' || s === 'N/A' || s === 'PENDING';
}

/**
 * Pulls the NAMED step's conclusion from the most recent completed run of `workflowFile` on
 * main -- step-granularity, not job-granularity (mirrors lib/eva/synthetic-actor-guard.js's own
 * documented design discipline: a job can conclude "success" while a specific step inside it
 * was skipped or soft-failed).
 * @returns {Promise<{success: boolean, runId: number, headSha: string}>}
 */
async function pullStepConclusion({ repo, workflowFile, stepName, githubToken, fetchImpl }) {
  const headers = {
    Authorization: `Bearer ${githubToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const runsUrl = `${GITHUB_API_BASE}/repos/${repo}/actions/workflows/${encodeURIComponent(workflowFile)}/runs?branch=main&status=completed&per_page=1`;
  const runsRes = await fetchImpl(runsUrl, { headers });
  if (!runsRes.ok) throw new Error(`pullStepConclusion: workflow runs list for ${workflowFile} returned HTTP ${runsRes.status}`);
  const runsBody = await runsRes.json();
  const run = runsBody.workflow_runs?.[0];
  if (!run) throw new Error(`pullStepConclusion: no completed run of ${workflowFile} found on main`);

  const jobsUrl = `${GITHUB_API_BASE}/repos/${repo}/actions/runs/${run.id}/jobs`;
  const jobsRes = await fetchImpl(jobsUrl, { headers });
  if (!jobsRes.ok) throw new Error(`pullStepConclusion: run jobs list for run ${run.id} returned HTTP ${jobsRes.status}`);
  const jobsBody = await jobsRes.json();

  for (const job of jobsBody.jobs || []) {
    const step = (job.steps || []).find((s) => s.name === stepName);
    if (step) {
      return { success: step.conclusion === 'success', runId: run.id, headSha: run.head_sha };
    }
  }
  throw new Error(`pullStepConclusion: step "${stepName}" not found in any job of run ${run.id} (${workflowFile})`);
}

/**
 * FR-1: real fence_two_sidedness evidence. Throws (fail-loud) rather than returning a guessed
 * boolean if any derivation cannot complete.
 * @param {{supabase: object, ventureId: string, githubToken: string, fetchImpl?: typeof fetch}} params
 * @returns {Promise<{canExerciseApp: boolean, exclusionPredicateDeclared: boolean, exclusionPredicateAssertedInVentureCi: boolean, evidenceSources: object}>}
 */
export async function buildFenceEvidence({ supabase, ventureId, githubToken, fetchImpl = fetch }) {
  if (!githubToken) throw new Error('buildFenceEvidence: githubToken is required (no LEO_ALTIFYAI_UAT_READ_TOKEN provisioned -- pass one explicitly, e.g. from `gh auth token`)');

  const fencing = await checkSyntheticActorFencing(supabase, ventureId, { githubToken, fetchImpl });
  const canExerciseApp = fencing.satisfied === true;

  const { data: venture, error } = await supabase.from('ventures').select('metadata').eq('id', ventureId).maybeSingle();
  if (error) throw new Error(`buildFenceEvidence: ventures read failed: ${error.message}`);
  const exclusionRef = venture?.metadata?.synthetic_actor?.exclusion_predicate_ref;
  const exclusionPredicateDeclared = !isPlaceholder(exclusionRef);

  const ciResult = await pullStepConclusion({
    repo: ALTIFYAI_REPO,
    workflowFile: CI_WORKFLOW_FILE,
    stepName: CI_TEST_STEP_NAME,
    githubToken,
    fetchImpl,
  });

  return {
    canExerciseApp,
    exclusionPredicateDeclared,
    exclusionPredicateAssertedInVentureCi: ciResult.success,
    evidenceSources: {
      deployStepPull: fencing.reason,
      ciRunId: ciResult.runId,
      ciHeadSha: ciResult.headSha,
      exclusionPredicateRef: exclusionRef,
    },
  };
}

/**
 * FR-2: real live_deployment_binding evidence via an actual signed-in nonce write+readback
 * round-trip against the live AltifyAI deploy. Throws (fail-loud) on any step failure --
 * never returns a self-consistent-but-fabricated {outcome:'ok'} the way a naive caller could.
 * @param {{secretKey: string, deployedOrigin: string, fapiOrigin: string, deploymentSha: string, fetchImpl?: typeof fetch}} params
 * @returns {Promise<{nonceWriteResult: {outcome: string, echoedNonce: string|null}, expectedNonce: string, deploymentSha: string}>}
 */
export async function buildLiveDeploymentBindingEvidence({ secretKey, deployedOrigin, fapiOrigin, deploymentSha, fetchImpl = fetch }) {
  if (!secretKey) throw new Error('buildLiveDeploymentBindingEvidence: secretKey is required');
  if (!deployedOrigin) throw new Error('buildLiveDeploymentBindingEvidence: deployedOrigin is required');
  if (!deploymentSha) throw new Error('buildLiveDeploymentBindingEvidence: deploymentSha is required');

  const nonce = generateProbeNonce();
  const token = await mintUatSessionToken({ fetchImpl, secretKey, deployedOrigin, fapiOrigin });

  const writeRes = await fetchImpl(`${deployedOrigin}/api/events`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ eventType: 'page_view', eventName: 'page_view', properties: { path: `${NONCE_PATH_PREFIX}${nonce}` } }),
  });
  if (!writeRes.ok) {
    throw new Error(`buildLiveDeploymentBindingEvidence: nonce write POST /api/events returned HTTP ${writeRes.status}`);
  }

  const readRes = await fetchImpl(`${deployedOrigin}/api/events`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!readRes.ok) {
    throw new Error(`buildLiveDeploymentBindingEvidence: readback GET /api/events returned HTTP ${readRes.status}`);
  }
  const readBody = await readRes.json();
  const match = (readBody.events || []).find((e) => e.properties?.path === `${NONCE_PATH_PREFIX}${nonce}`);

  return {
    nonceWriteResult: { outcome: match ? 'ok' : 'error', echoedNonce: match ? nonce : null },
    expectedNonce: nonce,
    deploymentSha,
  };
}

/**
 * Resolves the current live deploy's commit sha from the most recent successful run of
 * altifyai's deploy.yml on main -- never a placeholder, per assertLiveDeploymentBinding's own
 * "refusing to bind evidence to an unverified deployment" contract.
 * @param {{githubToken: string, fetchImpl?: typeof fetch}} params
 * @returns {Promise<string>}
 */
export async function resolveLiveDeploymentSha({ githubToken, fetchImpl = fetch }) {
  const headers = {
    Authorization: `Bearer ${githubToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const url = `${GITHUB_API_BASE}/repos/${ALTIFYAI_REPO}/actions/workflows/deploy.yml/runs?branch=main&status=success&per_page=1`;
  const res = await fetchImpl(url, { headers });
  if (!res.ok) throw new Error(`resolveLiveDeploymentSha: deploy.yml runs list returned HTTP ${res.status}`);
  const body = await res.json();
  const sha = body.workflow_runs?.[0]?.head_sha;
  if (!sha) throw new Error('resolveLiveDeploymentSha: no successful deploy.yml run found on main');
  return sha;
}
