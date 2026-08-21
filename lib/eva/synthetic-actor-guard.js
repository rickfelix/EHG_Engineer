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
 * - Bounded staleness, not indefinite trust: a green step from months ago
 *   does not prove the live site works NOW (external dependencies -- Clerk
 *   JWKS rotation, a downstream API contract change -- can silently break
 *   between deploys with no new run to catch it). The step's own
 *   completed_at (never run-level timing, for the same granularity reason
 *   above) is checked against STALENESS_WINDOW_MS; fail CLOSED if that
 *   timestamp is missing or unparseable (EXEC-TO-PLAN SECURITY/TESTING
 *   round-5 post-PASS finding). deploy.yml's workflow_dispatch trigger makes
 *   the remediation for a staleness block identical to the verification
 *   itself -- dispatching it re-runs the live probe and produces fresh
 *   evidence, not a written excuse.
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
 *   probe. github_repo is cross-checked against venture_resources before
 *   the pull is trusted (round 8, PLAN-phase SECURITY reviewer's
 *   parameterization finding, relayed post-EXEC). ROUND-9 REFINEMENT (the
 *   same reviewer, EXEC-TO-PLAN pass): venture_resources is still a
 *   service-role-writable Postgres table in the same DB -- "independent"
 *   overstates it. The property that actually carries weight is that
 *   venture_resources.resource_identifier is LOAD-BEARING ELSEWHERE (Stage
 *   19's own BINDING gates.exit already requires it; provisioning/deploy
 *   code reads it) -- tampering with it has visible blast radius across the
 *   fleet, unlike the previously-unread synthetic_actor.github_repo, which
 *   had none. That is what raises the cost of forgery, not independence per
 *   se. uat_step_name is validated against ALLOWED_UAT_STEP_NAMES (round 9,
 *   SEC-55) instead of a second table -- it isn't per-venture data (exactly
 *   one venture is opted in today, and venture-hosting-standard.md already
 *   mandates the name fleet-wide), so a code-side allowlist fits it better
 *   than inventing a DB cross-check for a value that's really a platform
 *   convention.
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

// EXEC-TO-PLAN SECURITY/TESTING round-5 finding (post-PASS): FR-6 acceptance_criteria[2]
// requires "the run completed within a defined staleness window" -- pullNamedStepConclusion
// previously read only step.conclusion, so a green run from months ago still read verified
// today. STALENESS_WINDOW_MS bounds the step's own completed_at (not run-level timing --
// reading run-level would reintroduce the job/step granularity mismatch SEC-28 closed).
// PLACEHOLDER, basis correction (SEC-63): FR-6 requires this be a function of the
// chairman-minted Clerk token's measured TTL, which cannot be measured until FR-5 is
// complete -- deploy cadence is the wrong basis (SECURITY's own first-pass suggestion,
// self-corrected against FR-6's actual text). The deploy.yml history below is a sanity
// check that 7 days clears CURRENT PRACTICE, not the calibration basis: 34 completed runs
// on main, 2026-08-17 to 2026-08-21, median inter-run gap 0.01 days, p90 0.38, max 1.76 --
// 7 days is ~4x the observed max, comfortable against today's cadence, but says nothing
// about the actual question (how long can a signed-in session credential be trusted
// unexercised). Revisit once FR-5 lands and the real token TTL is known. LAST_KNOWN_GOOD_TTL_MS's
// 5-minute cache-reuse-on-API-error window is negligible against this bound (a cached result
// is at most 5 minutes stale relative to whatever the underlying check would have found).
const STALENESS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, placeholder pending FR-5 token TTL

// Process-lifetime only -- deliberately NOT persisted to ventures.metadata.
// A persisted "last verified" record would recreate the exact forgery vector
// (a DB-writable freshness claim) round 3 removed. Losing this cache on a
// daemon restart is an accepted tradeoff of that decision.
const lastKnownGood = new Map(); // ventureId -> { verified: boolean, checkedAt: number, reason: string }

const PLACEHOLDER_RE = /^(TODO|FIXME|TBD|PLACEHOLDER|CHANGEME|XXX|N\/A)$/i;

// SEC-55 (EXEC-TO-PLAN SECURITY, round 9): uat_step_name isn't per-venture
// data the way github_repo genuinely is -- venture-hosting-standard.md
// mandates this exact step name fleet-wide, exactly one venture is opted in
// today, and altifyai's own tests/deploy-workflow.test.js already pins
// `- name: post-deploy-signed-in-uat` as a committed, code-reviewed
// assertion. Rather than leave it DB-writable free text with no independent
// source to cross-check (the residual gap named in round 8), it's validated
// against this ALLOWLIST -- a set tested by exclusion would silently permit
// every future step name; an allowlist fails closed on anything unexpected.
// Add a name here ONLY alongside a corresponding change to
// venture-hosting-standard.md's mandated convention -- never to accommodate
// a single venture's drift.
const ALLOWED_UAT_STEP_NAMES = new Set(['post-deploy-signed-in-uat']);

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

  if (!venture) {
    // SEC-51 (EXEC-TO-PLAN SECURITY, round 9): a missing ventures ROW and a
    // missing venture_resources row were taking opposite polarities --
    // resources fails closed, this previously passed open (treated as "not
    // opted in"). A ventureId this guard is asked to fence but that doesn't
    // exist in ventures at all is anomalous, not a legitimate not-opted-in
    // case; fail closed for consistency with every other absent-record path
    // in this function, even though _advanceStage's callers are expected to
    // already operate on a real venture (so this should be unreachable in
    // practice).
    return { applies: true, satisfied: false, reason: `synthetic-actor-guard: no ventures row found for id ${ventureId} (fail-closed)` };
  }
  const meta = venture.metadata || {};
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
  if (!ALLOWED_UAT_STEP_NAMES.has(sa.uat_step_name)) {
    return {
      applies: true,
      satisfied: false,
      reason: `synthetic_actor.uat_step_name (${JSON.stringify(sa.uat_step_name)}) is not in the allowlist of platform-mandated step names (${[...ALLOWED_UAT_STEP_NAMES].join(', ')}) -- refusing to trust a pull against an unrecognized step name`,
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
      const identity = `job=${job.name}, run=${run.id}, head_sha=${run.head_sha}`;
      if (step.conclusion !== 'success') {
        return {
          verified: false,
          reason: `step "${stepName}" conclusion=${step.conclusion} (${identity})`,
          runId: run.id,
          headSha: run.head_sha,
          stepConclusion: step.conclusion,
        };
      }

      // SEC-64 (EXEC-TO-PLAN SECURITY/TESTING round-5, endorsed "(a) AND (c),
      // not either/or"): the staleness window alone leaves a window-length
      // blind spot -- main can advance while deploy.yml is broken, disabled,
      // or failing earlier, and the last successful run keeps reading
      // verified for up to the full window. Comparing against the CURRENT
      // tip of main is a DIFFERENT, non-circular question than the
      // head_sha-vs-deployed-commit comparison AC[2] deliberately excludes
      // (round-7/P-4): that exclusion's own stated rationale is "no second,
      // independent source for the currently deployed commit" -- tip-of-main
      // has exactly one authoritative source (GitHub's own git refs), so
      // this isn't the same circularity. Neither check subsumes the other:
      // this one is blind to Clerk token expiry (nothing else exercises that
      // credential), and the staleness window is blind to "main moved,
      // nothing re-ran" for its entire duration. A long-lived unmerged
      // branch reading "current" because main hasn't moved is correct
      // behaviour, not a compromise -- this guard is about main and the
      // deployed artifact; unmerged work hasn't reached either. Same
      // hardcoded "main" as the runs query above, deliberately (SECURITY:
      // not worth a third call to resolve default_branch just for this).
      const tipUrl = `${GITHUB_API_BASE}/repos/${repo}/git/refs/heads/main`;
      const tipResp = await fetchImpl(tipUrl, { headers });
      if (!tipResp.ok) throw new Error(`GitHub refs/heads/main lookup returned ${tipResp.status}`);
      const tipBody = await tipResp.json();
      const tipSha = tipBody?.object?.sha;
      if (typeof tipSha !== 'string' || tipSha.length === 0) {
        // Fail closed: an absent/malformed tip sha must not silently skip
        // this check, same contract as the staleness timestamp below.
        return {
          verified: false,
          reason: `could not determine main's current tip sha -- fail-closed, cannot confirm the verified run still describes main (${identity})`,
          runId: run.id,
          headSha: run.head_sha,
          stepConclusion: step.conclusion,
        };
      }
      if (tipSha !== run.head_sha) {
        return {
          verified: false,
          reason: `step "${stepName}" passed at ${run.head_sha}, but main has since advanced to ${tipSha} -- dispatch deploy.yml on ${repo} to re-verify against the current tip (${identity})`,
          runId: run.id,
          headSha: run.head_sha,
          tipSha,
          stepConclusion: step.conclusion,
        };
      }

      // Staleness only matters once the step is known to have succeeded --
      // a failing/skipped step is already not-verified regardless of age.
      const completedAtMs = step.completed_at ? Date.parse(step.completed_at) : NaN;
      if (!Number.isFinite(completedAtMs)) {
        // Fail closed: a missing/unparseable timestamp must not silently
        // disable the window (same fail-closed contract as every other
        // absent-record path in this module).
        return {
          verified: false,
          reason: `step "${stepName}" succeeded but has no parseable completed_at timestamp -- cannot confirm the staleness window, fail-closed (${identity})`,
          runId: run.id,
          headSha: run.head_sha,
          stepConclusion: step.conclusion,
        };
      }
      const ageDays = (Date.now() - completedAtMs) / (24 * 60 * 60 * 1000);
      const windowDays = STALENESS_WINDOW_MS / (24 * 60 * 60 * 1000);
      if (ageDays > windowDays) {
        return {
          verified: false,
          reason: `step "${stepName}" passed but completed ${ageDays.toFixed(1)} days ago, beyond the ${windowDays}-day staleness window -- dispatch deploy.yml on ${repo} to refresh (${identity})`,
          runId: run.id,
          headSha: run.head_sha,
          stepConclusion: step.conclusion,
        };
      }
      return {
        verified: true,
        reason: `step "${stepName}" conclusion=${step.conclusion}, completed ${ageDays.toFixed(2)} days ago (within the ${windowDays}-day staleness window) (${identity})`,
        runId: run.id,
        headSha: run.head_sha,
        stepConclusion: step.conclusion,
      };
    }
  }
  return { verified: false, reason: `step "${stepName}" not found in any job of run ${run.id} -- skipped registration, renamed, or removed` };
}
