/**
 * Fenced synthetic-actor guard: refuses to advance a venture past the stage
 * where a live signed-in UAT check is configured, unless the venture's
 * exclusion-predicate wiring is genuinely present AND the wired CI step has
 * itself verified PASS.
 *
 * SD-LEO-INFRA-ALTIFYAI-TEST-IDENTITY-001 (FR-6)
 *
 * Design constraints carried over from PLAN-phase adversarial review:
 * - PULL, never push: this module reads GitHub's Actions API directly. It
 *   never trusts a DB-stored verified_at/verified flag written FROM the
 *   venture's own repo, which would be forgeable by anyone holding a
 *   service-role key (round 3 finding).
 * - Step-granularity, not job-granularity: a job can conclude "success"
 *   while its UAT step was skipped (false `if:`), soft-failed
 *   (`continue-on-error: true`), or renamed/deleted. This module reads the
 *   NAMED step's own conclusion (round 5 finding).
 * - Independent, bespoke check: NOT routed through checkStageArtifactPrecondition
 *   (venture_stages.required_artifacts is keyed on stage_number only --
 *   fleet-wide per stage, structurally wrong for per-venture opt-in fencing
 *   -- round 4 finding) and NOT routed through the general checkExitGates()
 *   dispatch (would newly subject _advanceStage()'s 7+ callers to 3 unrelated
 *   existing binding gates).
 * - Fail CLOSED on its own DB read error or an unrecoverable GitHub API
 *   error -- this guard does not inherit checkStageArtifactPrecondition's
 *   fail-open contract. A short-TTL last-known-good cache absorbs a
 *   transient GitHub outage without either fail-open-forever or
 *   block-forever.
 * - No deviation-ledger escape valve: that valve "only enforces non-empty,
 *   defers reason-quality to a scoring rubric, not a gate" (SECURITY SEC-24)
 *   -- exactly the class of bypass this SD exists to close.
 * - The QUESTION, not just the ANSWER, must be independently sourced: the
 *   GitHub pull itself is unforgeable, but sa.github_repo/workflow_file/
 *   uat_step_name are hand-writable fields on the SAME ventures.metadata
 *   block this guard fences -- a service-role write could repoint
 *   github_repo at an always-green unrelated repo and get a genuine,
 *   GitHub-sourced verified:true for a venture that never ran a real UAT
 *   probe. github_repo is cross-checked against venture_resources (a
 *   different table, populated at provisioning, independent of this SD's
 *   own config write) before the pull is trusted (round 8, PLAN-phase
 *   SECURITY reviewer's parameterization finding, relayed post-EXEC).
 *   uat_step_name has NO independent source anywhere in this schema to
 *   cross-check against -- an acknowledged, residual gap, not silently
 *   left implied-covered.
 *
 * Known simplification (documented, not silently dropped): "most recent
 * completed run on the workflow's default branch" is treated as the run
 * corresponding to what's currently deployed. A genuine head_sha cross-check
 * against the venture's own recorded deployed commit is not implemented --
 * deploy.yml triggers on every push to main with no other merge path, so
 * this holds in practice, but a manual workflow_dispatch replay theoretically
 * could not be distinguished from a normal deploy by this module alone.
 *
 * @module lib/eva/synthetic-actor-guard
 */

const GITHUB_API_BASE = 'https://api.github.com';
const LAST_KNOWN_GOOD_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Process-lifetime only -- deliberately NOT persisted to ventures.metadata.
// A persisted "last verified" record would recreate the exact forgery vector
// (a DB-writable freshness claim) round 3 removed. Losing this cache on a
// daemon restart is an accepted tradeoff of that decision.
const lastKnownGood = new Map(); // ventureId -> { verified: boolean, checkedAt: number, reason: string }

const PLACEHOLDER_RE = /^(TODO|FIXME|TBD|PLACEHOLDER|CHANGEME|XXX|N\/A)$/i;

function isPlaceholder(value) {
  if (typeof value !== 'string') return true;
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;
  return PLACEHOLDER_RE.test(trimmed);
}

/**
 * @typedef {Object} SyntheticActorCheckResult
 * @property {boolean} applies - false if the venture has not opted in (fleet safety: always passes)
 * @property {boolean} satisfied - true if the guard's condition is met (safe to advance)
 * @property {string} reason - human-readable explanation
 * @property {Object} [details] - GitHub pull details when applicable
 */

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} ventureId
 * @param {{githubToken?: string, fetchImpl?: typeof fetch}} [opts]
 * @returns {Promise<SyntheticActorCheckResult>}
 */
export async function checkSyntheticActorFencing(supabase, ventureId, opts = {}) {
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const githubToken = opts.githubToken ?? process.env.LEO_ALTIFYAI_UAT_READ_TOKEN;

  let venture;
  try {
    const { data, error } = await supabase
      .from('ventures')
      .select('metadata')
      .eq('id', ventureId)
      .maybeSingle();
    if (error) throw error;
    venture = data;
  } catch (e) {
    // Fail CLOSED on DB read error -- deliberate, does not mirror
    // checkStageArtifactPrecondition's fail-open contract.
    return { applies: true, satisfied: false, reason: `synthetic-actor-guard DB read error (fail-closed): ${e.message}` };
  }

  const meta = venture?.metadata || {};
  if (meta.uat_probe_required !== true) {
    // Not opted in. This is the fleet-safety short-circuit: every venture
    // without a live signed-in UAT check configured always passes, with zero
    // GitHub calls. uat_probe_required is a durable, independent opt-in flag
    // -- separate from synthetic_actor itself, so a hollow/absent
    // synthetic_actor block on an OPTED-IN venture is distinguishable from a
    // venture that was never asked to have one.
    return { applies: false, satisfied: true, reason: 'venture has not opted into a live signed-in UAT check (metadata.uat_probe_required !== true)' };
  }

  const sa = meta.synthetic_actor;
  if (!sa || typeof sa !== 'object') {
    return { applies: true, satisfied: false, reason: 'ventures.metadata.synthetic_actor is absent despite uat_probe_required=true' };
  }
  if (isPlaceholder(sa.exclusion_predicate_ref)) {
    return { applies: true, satisfied: false, reason: `synthetic_actor.exclusion_predicate_ref is missing or a placeholder (${JSON.stringify(sa.exclusion_predicate_ref)})` };
  }
  if (isPlaceholder(sa.github_repo) || isPlaceholder(sa.workflow_file) || isPlaceholder(sa.uat_step_name)) {
    return {
      applies: true,
      satisfied: false,
      reason: `synthetic_actor config incomplete -- github_repo (${JSON.stringify(sa.github_repo)}), workflow_file (${JSON.stringify(sa.workflow_file)}), and uat_step_name (${JSON.stringify(sa.uat_step_name)}) are all required`,
    };
  }

  // Independent-source cross-check (round-8 addition, PLAN-phase SECURITY
  // reviewer's parameterization finding, relayed post-EXEC): the GitHub pull
  // ITSELF is unforgeable, but sa.github_repo is a hand-writable field on the
  // SAME JSONB block this guard is fencing -- a service-role write could
  // repoint it at an always-green repo/step and the guard would return a
  // genuine, GitHub-sourced verified:true for a venture that never ran a
  // real UAT probe. venture_resources is an INDEPENDENT source (a different
  // table, populated by venture provisioning, not this SD's own config
  // write) -- cross-check github_repo against it before trusting the pull.
  // This closes the repo-repointing half of the attack; the step-NAME
  // half (repointing uat_step_name at an unrelated always-green step
  // within the SAME correct repo) has no independent source to check
  // against anywhere in this schema and is an acknowledged residual gap,
  // not silently left implied-covered.
  let registeredRepo;
  try {
    const { data: resource, error: resourceError } = await supabase
      .from('venture_resources')
      .select('resource_identifier')
      .eq('venture_id', ventureId)
      .eq('resource_type', 'github_repo')
      .maybeSingle();
    if (resourceError) throw resourceError;
    registeredRepo = resource?.resource_identifier ?? null;
  } catch (e) {
    return { applies: true, satisfied: false, reason: `venture_resources cross-check DB read error (fail-closed): ${e.message}` };
  }
  if (!registeredRepo) {
    return { applies: true, satisfied: false, reason: 'no venture_resources github_repo record exists to cross-check synthetic_actor.github_repo against (fail-closed -- cannot confirm the configured repo is the venture\'s actual, independently-registered repo)' };
  }
  if (registeredRepo !== sa.github_repo) {
    return { applies: true, satisfied: false, reason: `synthetic_actor.github_repo ("${sa.github_repo}") does not match the venture's independently-registered repo in venture_resources ("${registeredRepo}") -- refusing to trust a GitHub pull against an unverified repo` };
  }

  try {
    const result = await pullNamedStepConclusion(fetchImpl, githubToken, sa.github_repo, sa.workflow_file, sa.uat_step_name);
    lastKnownGood.set(ventureId, { verified: result.verified, checkedAt: Date.now(), reason: result.reason });
    return {
      applies: true,
      satisfied: result.verified,
      reason: result.verified ? `live signed-in UAT step verified PASS (${result.reason})` : `UAT step not verified: ${result.reason}`,
      details: result,
    };
  } catch (e) {
    const cached = lastKnownGood.get(ventureId);
    if (cached && (Date.now() - cached.checkedAt) < LAST_KNOWN_GOOD_TTL_MS) {
      return {
        applies: true,
        satisfied: cached.verified,
        reason: `GitHub API error (${e.message}) -- using cached result from ${new Date(cached.checkedAt).toISOString()} (${cached.reason}, TTL ${LAST_KNOWN_GOOD_TTL_MS / 1000}s)`,
      };
    }
    return { applies: true, satisfied: false, reason: `GitHub API error and no fresh cached result (fail-closed): ${e.message}` };
  }
}

/**
 * Pull the most recent completed run of `workflowFile` on the repo's default
 * branch (main), then read the NAMED step's own conclusion from that run's
 * jobs -- never the job's coarser conclusion (a job can be "success" while
 * the named step was skipped, soft-failed via continue-on-error, or no
 * longer exists).
 */
async function pullNamedStepConclusion(fetchImpl, token, repo, workflowFile, stepName) {
  if (!token) {
    throw new Error('no GitHub read token configured (LEO_ALTIFYAI_UAT_READ_TOKEN) -- required to read a private repo\'s Actions API');
  }
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  const runsUrl = `${GITHUB_API_BASE}/repos/${repo}/actions/workflows/${encodeURIComponent(workflowFile)}/runs?branch=main&status=completed&per_page=1`;
  const runsResp = await fetchImpl(runsUrl, { headers });
  if (!runsResp.ok) throw new Error(`GitHub workflow runs list returned ${runsResp.status}`);
  const runsBody = await runsResp.json();
  const run = runsBody.workflow_runs?.[0];
  if (!run) return { verified: false, reason: `no completed run of ${workflowFile} found on main` };

  const jobsUrl = `${GITHUB_API_BASE}/repos/${repo}/actions/runs/${run.id}/jobs`;
  const jobsResp = await fetchImpl(jobsUrl, { headers });
  if (!jobsResp.ok) throw new Error(`GitHub run jobs list returned ${jobsResp.status}`);
  const jobsBody = await jobsResp.json();

  for (const job of jobsBody.jobs || []) {
    const step = (job.steps || []).find((s) => s.name === stepName);
    if (step) {
      return {
        verified: step.conclusion === 'success',
        reason: `step "${stepName}" conclusion=${step.conclusion} (job=${job.name}, run=${run.id}, head_sha=${run.head_sha})`,
        runId: run.id,
        headSha: run.head_sha,
        stepConclusion: step.conclusion,
      };
    }
  }
  return { verified: false, reason: `step "${stepName}" not found in any job of run ${run.id} -- skipped registration, renamed, or removed` };
}
