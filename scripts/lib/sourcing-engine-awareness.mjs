/**
 * sourcing-engine-awareness.mjs — pure helpers so the coordinator's capacity forecaster
 * (and any belt-low decision path) can surface the SOURCING ENGINE state at the moment it
 * would otherwise hand-ask Adam for manual backfill.
 *
 * SD-LEO-INFRA-COORDINATOR-SOURCING-ENGINE-AWARENESS-001 (FR-2): a DEFICIT ping must read
 * "engine OFF, N unpromoted -> activate/distill" instead of only "source N candidates", so the
 * FIRST remediation on belt-low is checking engine activation-flag state + unpromoted roadmap
 * depth — NOT perpetual manual sourcing (the anti-pattern).
 *
 * Pure (no DB / no env mutation): the caller reads the flags + queries the unpromoted count and
 * passes them in. The flag-name registry lives here so it is the single place to extend when a
 * new sourcing-engine flag ships.
 */

// SD-LEO-INFRA-SOURCING-ENGINE-CONSUMPTION-001 (FR-1): resolveGitHubRepo, not a hardcoded
// 'owner/repo' literal -- lint-repo-resolution-drift.mjs (Category C in
// docs/architecture/canonical-repo-resolution-census.md) exists specifically to catch this.
import { resolveGitHubRepo } from '../../lib/repo-paths.js';

// The canonical sourcing-engine activation flags (mirrors the per-module isXxxFlagEnabled helpers:
// lib/sourcing-engine/gauge-gap-miner.js, lib/sourcing-engine/deferred-watcher.js). Add new
// sourcing-engine flags here as they ship so the forecaster surfaces them automatically.
// SD-LEO-INFRA-SOURCING-FLAG-STATE-FROM-DEPLOYMENT-001 (FR-2): all THREE live sourcing arms.
// `label` is also the primary key (`arm`) in sourcing_engine_activation_state.
export const SOURCING_ENGINE_FLAGS = Object.freeze([
  Object.freeze({ env: 'SOURCING_GAUGE_GAP_MINER_V1', label: 'gauge-gap-miner' }),
  Object.freeze({ env: 'SOURCING_DEFERRED_WATCHER_V1', label: 'deferred-watcher' }),
  Object.freeze({ env: 'SOURCING_AUTO_REFILL_V1', label: 'auto-refill' }),
]);

// SD-LEO-INFRA-SOURCING-FLAG-STATE-FROM-DEPLOYMENT-001 (FR-1): the DB source-of-truth table.
export const SOURCING_ACTIVATION_TABLE = 'sourcing_engine_activation_state';

// Same truthiness convention the per-module helpers use: 'on' | '1' | 'true' (case-insensitive).
export function isSourcingFlagOn(value) {
  const v = String(value == null ? 'off' : value).toLowerCase();
  return v === 'on' || v === '1' || v === 'true';
}

// Read the canonical flags from an env-like object → [{ env, label, enabled }].
export function readSourcingEngineFlags(env = process.env) {
  const e = env || {};
  return SOURCING_ENGINE_FLAGS.map((f) => ({ env: f.env, label: f.label, enabled: isSourcingFlagOn(e[f.env]) }));
}

/**
 * SD-LEO-INFRA-SOURCING-FLAG-STATE-FROM-DEPLOYMENT-001 (FR-1): derive each arm's on/off from the DB
 * activation-state row (the actual deployment) instead of the coordinator's LOCAL process.env — which
 * is blind to the GitHub-Actions JOB-scoped sourcing flags and falsely read every arm OFF.
 *
 * Returns the SAME [{ env, label, enabled }] shape as readSourcingEngineFlags (FR-4 contract). An arm
 * with no row reads enabled=false. FAIL-OPEN: on any query error (incl. the table not existing yet,
 * pre-migration), fall back to the env-based reader so shipping this before the governed prod-apply
 * degrades to today's behavior rather than throwing in the forecaster.
 *
 * @param {object} supabase - service-role client
 * @param {object} [env=process.env] - fallback env-like object
 * @returns {Promise<Array<{env:string,label:string,enabled:boolean}>>}
 */
export async function readSourcingEngineFlagsFromDb(supabase, env = process.env) {
  try {
    const { data, error } = await supabase.from(SOURCING_ACTIVATION_TABLE).select('arm, enabled');
    if (error) throw new Error(error.message);
    const byArm = new Map((data || []).map((r) => [r.arm, r.enabled === true]));
    return SOURCING_ENGINE_FLAGS.map((f) => ({ env: f.env, label: f.label, enabled: byArm.get(f.label) === true }));
  } catch (e) {
    if (typeof process !== 'undefined' && process.stderr) {
      process.stderr.write(`[sourcing-awareness] DB flag read failed (${e.message}); falling back to env.\n`);
    }
    return readSourcingEngineFlags(env);
  }
}

/**
 * SD-LEO-INFRA-SOURCING-FLAG-STATE-FROM-DEPLOYMENT-001 (FR-3): idempotent reconcile — upsert the
 * given arm→enabled state so the DB re-derives from the actual deployment. Pass the live arms on
 * activation/deactivation. Best-effort; returns the count upserted (0 on error).
 *
 * @param {object} supabase - service-role client
 * @param {Record<string,boolean>} stateByArm - e.g. {'gauge-gap-miner':true,'auto-refill':true}
 * @param {string} [updatedBy='reconcile']
 * @returns {Promise<number>}
 */
export async function reconcileSourcingArmState(supabase, stateByArm = {}, updatedBy = 'reconcile') {
  const rows = Object.entries(stateByArm || {}).map(([arm, enabled]) => ({
    arm, enabled: enabled === true, updated_at: new Date().toISOString(), updated_by: updatedBy,
  }));
  if (!rows.length) return 0;
  try {
    const { data, error } = await supabase.from(SOURCING_ACTIVATION_TABLE).upsert(rows, { onConflict: 'arm' }).select('arm');
    if (error) throw new Error(error.message);
    return (data || []).length;
  } catch (e) {
    if (typeof process !== 'undefined' && process.stderr) {
      process.stderr.write(`[sourcing-awareness] reconcile upsert failed (${e.message}).\n`);
    }
    return 0;
  }
}

// SD-LEO-INFRA-SOURCING-ENGINE-CONSUMPTION-001 (FR-1): workflow filename per arm, so the
// activation-state DB row can be cross-checked against the GitHub Actions API's own /workflows
// endpoint (which accepts a workflow filename as `workflow_id` per the GitHub REST API docs).
const SOURCING_ARM_WORKFLOW_FILE = Object.freeze({
  'gauge-gap-miner': 'sourcing-gauge-gap-miner-cron.yml',
  'deferred-watcher': 'sourcing-deferred-watcher-cron.yml',
  'auto-refill': 'sourcing-auto-refill-cron.yml',
});

const GITHUB_API_BASE = 'https://api.github.com';

// TR-1: interval-cached, never a live API call on every invocation (the migration's own
// preamble documents why -- workflow-YAML presence != enabled, and gh-run-state is rate-limited).
const DIFF_CACHE_TTL_MS = 15 * 60 * 1000;
let _diffCache = null; // { key, result, fetchedAt }

/**
 * IO: fetch a single workflow's live `state` field ('active' | 'disabled_manually' |
 * 'disabled_inactivity' | ...) from the GitHub Actions API. Deliberately per-workflow (not the
 * list-all endpoint) so one arm's network failure never blinds the diff to the other two arms
 * (TESTING sub-agent finding C3/C8, evidence 80e4d285).
 *
 * @param {string} repo - "owner/name"
 * @param {string} workflowFilename - e.g. "sourcing-auto-refill-cron.yml"
 * @param {string} token - GitHub token (Bearer auth)
 * @param {{fetchImpl?: typeof fetch}} [opts]
 * @returns {Promise<string>} the workflow's `state` field
 */
export async function fetchWorkflowState(repo, workflowFilename, token, opts = {}) {
  const { fetchImpl = fetch, timeoutMs = 10_000 } = opts;
  // SECURITY sub-agent finding LOW-1 (evidence cdb7974c): this function is exported, so a future
  // caller passing non-constant input could otherwise inject path segments; today's only caller
  // passes fixed constants (GITHUB_API_BASE is a non-overridable module const; repo/workflowFilename
  // both trace to frozen constants), but the encoding + shape assert make that safety survive the
  // next caller rather than depend on today's callers staying disciplined.
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error(`fetchWorkflowState: invalid repo shape: ${repo}`);
  const url = `${GITHUB_API_BASE}/repos/${repo}/actions/workflows/${encodeURIComponent(workflowFilename)}`;
  // AbortSignal.timeout (SECURITY finding LOW-3 / TESTING finding P7, evidence cdb7974c/3004beaa):
  // undici's connect/header defaults (~10s/300s) mean an unresponsive GitHub API could otherwise
  // hang this startup-check probe far longer than any caller expects across 3 sequential arms.
  const resp = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!resp.ok) {
    throw new Error(`GitHub API error fetching ${workflowFilename}: ${resp.status} ${resp.statusText}`);
  }
  const data = await resp.json();
  return data.state;
}

/**
 * SD-LEO-INFRA-SOURCING-ENGINE-CONSUMPTION-001 (FR-1): read-only diff between
 * sourcing_engine_activation_state (the DB row LEAD-phase VALIDATION found seeded enabled=true
 * for all 3 arms at migration time, with its one write helper -- reconcileSourcingArmState()
 * above -- having ZERO production callers) and each arm's ACTUAL GitHub Actions workflow state.
 *
 * Deliberately NOT named "reconcile*" (TESTING sub-agent finding C7, evidence 80e4d285): that
 * prefix already belongs to the unused writer above, and a shared name invites exactly the kind
 * of confusion that let it ship uncalled and unnoticed. This function is READ-ONLY -- it never
 * calls reconcileSourcingArmState or writes to sourcing_engine_activation_state (TR-2).
 *
 * THREE-STATE, not boolean (TESTING finding C4): db_state is `true | false | 'no_row'` -- a
 * missing row and a row saying false are different facts (mirrors the existing badge convention
 * at adam-startup-check.mjs's own SOURCING SSOT STATE probe). deployment_state is
 * `'active' | 'disabled_manually' | 'disabled_inactivity' | 'unknown'` -- 'unknown' carries a
 * distinct per-arm deployment_error (network failure vs 404 are different facts, TESTING finding
 * C8) and is never silently treated as a clean match: mismatched is `null` (not `false`) whenever
 * deployment_state is 'unknown', so a caller can never read an unresolvable arm as verified-agree.
 *
 * @param {object} supabase - service-role client (read-only: only .select() is called)
 * @param {{repo?: string, token?: string, fetchImpl?: typeof fetch, now?: () => number, forceRefresh?: boolean}} [opts]
 * @returns {Promise<Array<{arm: string, db_state: (true|false|'no_row'), deployment_state: string, deployment_error: (string|null), mismatched: (boolean|null)}>>}
 */
export async function diffSourcingArmStateVsDeployment(supabase, opts = {}) {
  const {
    repo = resolveGitHubRepo('EHG_Engineer'),
    // No process.env.GITHUB_TOKEN fallback here (TESTING finding P5, evidence 3004beaa): a caller
    // passing an explicit controlled opts object (e.g. a test with a deliberately-scoped env) had
    // `token` silently fall through to ambient process.env whenever it passed undefined, defeating
    // dependency injection. adam-startup-check.mjs's fetchSourcingState is the one call site that
    // should read ambient env, and it already does so explicitly via `{ token: env.GITHUB_TOKEN }`.
    token = null,
    fetchImpl = fetch,
    now = () => Date.now(),
    forceRefresh = false,
  } = opts;

  // Cache keyed on repo + token-presence (TESTING finding P6 / SECURITY finding LOW-4, evidence
  // 3004beaa/cdb7974c): a single global slot could otherwise serve a stale no-token result to a
  // later token-bearing call within the same process (e.g. env.GITHUB_TOKEN becomes available
  // mid-session), which reads as `deployment_state: 'unknown'` sticking around long after the
  // condition that caused it cleared.
  const cacheKey = `${repo}|${token ? 'tok' : 'notok'}`;
  if (!forceRefresh && _diffCache && _diffCache.key === cacheKey && (now() - _diffCache.fetchedAt) < DIFF_CACHE_TTL_MS) {
    return _diffCache.result;
  }

  // Fail-loud, not fail-open (TESTING finding C8, citing the deliberate split already documented
  // at adam-startup-check.mjs:666-674): fail-open is correct for the forecaster deciding what
  // ACTION to take on a degraded read; fail-loud is correct here, a badge reporting what current
  // state IS must never silently substitute a clean-looking default.
  // .limit(100): the table holds exactly 3 rows (one per SOURCING_ENGINE_FLAGS entry) and is
  // semantically free to bound -- explicit per this repo's count-truncation discipline
  // (count-truncation-diff-lint), which flags every unbounded .select( on a changed line.
  const { data: dbRows, error: dbError } = await supabase.from(SOURCING_ACTIVATION_TABLE).select('arm, enabled').limit(100);
  if (dbError) throw new Error(`diffSourcingArmStateVsDeployment: DB read failed: ${dbError.message}`);
  const byArm = new Map((dbRows || []).map((r) => [r.arm, r.enabled === true]));

  const result = [];
  for (const f of SOURCING_ENGINE_FLAGS) {
    const filename = SOURCING_ARM_WORKFLOW_FILE[f.label];
    const db_state = byArm.has(f.label) ? byArm.get(f.label) : 'no_row';
    let deployment_state = 'unknown';
    let deployment_error = null;
    if (!token) {
      deployment_error = 'no_token';
    } else {
      try {
        const rawState = await fetchWorkflowState(repo, filename, token, { fetchImpl });
        deployment_state = rawState || 'unknown';
      } catch (e) {
        deployment_error = e.message;
      }
    }
    const dbBool = db_state === true;
    const deployBool = deployment_state === 'active';
    const mismatched = deployment_state === 'unknown' ? null : dbBool !== deployBool;
    result.push({ arm: f.label, db_state, deployment_state, deployment_error, mismatched });
  }

  _diffCache = { key: cacheKey, result, fetchedAt: now() };
  return result;
}

/**
 * Test-hygiene helper (TESTING finding P6, evidence 3004beaa): resets the module-scope diff cache
 * so one test's cached result can never leak into a sibling test that omits `forceRefresh`.
 */
export function resetSourcingArmDiffCache() {
  _diffCache = null;
}

/**
 * Build the human-readable awareness line + a remediation recommendation.
 * @param {{flags?: Array<{label:string, enabled:boolean}>, unpromotedCount?: number|null}} input
 * @returns {{ line:string, recommendation:string, anyOn:boolean, allOn:boolean, flagStr:string, countStr:string }}
 */
export function formatSourcingAwareness({ flags = [], unpromotedCount = null } = {}) {
  const anyOn = flags.some((f) => f.enabled);
  const allOn = flags.length > 0 && flags.every((f) => f.enabled);
  const flagStr = flags.length ? flags.map((f) => `${f.label}=${f.enabled ? 'on' : 'off'}`).join(', ') : 'none';
  const known = typeof unpromotedCount === 'number' && Number.isFinite(unpromotedCount);
  const countStr = known ? String(unpromotedCount) : 'unknown';
  const hasBacklog = !known || unpromotedCount > 0; // unknown → assume there may be backlog (safer)

  let recommendation;
  if (!anyOn && hasBacklog) {
    // The core anti-pattern guard: dormant engine + rich backlog → activate/distill, do NOT hand-ask.
    recommendation = `engine DORMANT with ${countStr} unpromoted roadmap item(s) → FIRST remediation is to ACTIVATE the engine (flip the SOURCING_* flags + apply the dormant migrations) and/or Wave-0 distillation, escalating to the chairman — perpetual manual backfill is the anti-pattern`;
  } else if (!anyOn && !hasBacklog) {
    recommendation = `engine OFF and 0 unpromoted roadmap items → backlog is genuinely empty; manual sourcing / Wave-0 distillation is appropriate`;
  } else if (hasBacklog) {
    recommendation = `engine partially/fully ON with ${countStr} unpromoted item(s) → let the engine promote/distill the roadmap before any manual hand-ask`;
  } else {
    recommendation = `engine ON, 0 unpromoted → belt-low is real worker demand, not a sourcing gap`;
  }

  return {
    line: `Sourcing engine: ${flagStr} | unpromoted roadmap_wave_items: ${countStr}. ${recommendation}`,
    recommendation,
    anyOn,
    allOn,
    flagStr,
    countStr,
  };
}

/**
 * SD-LEO-INFRA-FORECASTER-DISTILL-GATE-AWARENESS-001 (FR-1/FR-2): when the auto-refill arm is
 * INTENTIONALLY OFF and a belt-low DEFICIT is attributable to an intentionally-unpromoted corpus
 * (unpromotedCount > 0), the deficit is NOT fillable — a corpus-thin belt is the CORRECT state, not a
 * deficit to distill away (the unpromoted corpus is not claimable supply; promotion is gated to /distill).
 * Downgrade the verdict to 'OK-CORPUS-GATED' (so the forecaster's deficit-driven Adam reach-out, gated on
 * verdict.startsWith('DEFICIT'), does not stale-re-fire) and reframe the recommendation so it advises
 * NEITHER distillation NOR activation. A genuine non-corpus shortfall (no unpromoted corpus, OR auto-refill
 * ON) is returned unchanged — only that remains a real DEFICIT. PURE/TOTAL.
 * @param {{verdict?:string, autoRefillOn?:boolean, unpromotedCount?:(number|null), baseRecommendation?:string}} [input]
 * @returns {{ corpusGated:boolean, verdict:string, recommendation:string }}
 */
export function classifyCorpusGatedDeficit({ verdict, autoRefillOn, unpromotedCount, baseRecommendation } = {}) {
  const isDeficit = typeof verdict === 'string' && verdict.startsWith('DEFICIT');
  const corpusThin = autoRefillOn !== true && typeof unpromotedCount === 'number' && unpromotedCount > 0;
  if (isDeficit && corpusThin) {
    return {
      corpusGated: true,
      verdict: 'OK-CORPUS-GATED',
      recommendation: `auto-refill intentionally OFF - corpus-thin belt is EXPECTED; the ${unpromotedCount} unpromoted corpus item(s) are NOT claimable supply (promotion is intentionally gated off). This is NOT a fillable deficit; only a genuine non-corpus claimable shortfall is a deficit - accept brief idle, never corpus promotion.`,
    };
  }
  return { corpusGated: false, verdict, recommendation: baseRecommendation };
}
