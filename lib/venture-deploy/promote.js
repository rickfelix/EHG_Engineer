/**
 * promote(venture, sha) — the production deploy path (deploy-pipeline-architecture.md §3).
 *
 * SD-LEO-INFRA-VENTURE-DEPLOY-PIPELINE-001-D (FR-1).
 *
 * PRODUCTION = deployInstance(v, main_sha, prod_config, main_db), realized as:
 *   1. Fail-closed preconditions (stack-compliance clean, spend guardrails ready,
 *      venture CI green on `sha`) — abort BEFORE any adapter call.
 *   2. Register a venture_deployments row status='planned' FIRST (registry-first
 *      SSOT, same discipline as preview.js / venture_preview_instances).
 *   3. Deploy `sha`'s already-built image as a NO-TRAFFIC revision.
 *   4. PRE-ROUTE HEALTH GATE against the tagged revision URL (health endpoint
 *      probe + minimal smoke: key routes respond, no boot errors). A bad revision
 *      never serves a customer — rollback-after-the-fact is the backstop, not
 *      the plan.
 *   5. Only on gate pass: route 100% traffic, stamp ventures.deployment_url +
 *      deployment_target, finalize the row status='routed'.
 *   6. Any failure: no traffic routed, row status='failed', and a
 *      DEPLOY_UNREPRODUCIBLE corrective finding is emitted (fail-soft — the
 *      original error always surfaces regardless of recorder outcome).
 *
 * SAFE BY DEFAULT, mirroring preview.js/publish.js: plan mode is the default —
 * with no injected adapters (deps.adapters + deps.execute:true) the result is the
 * ordered plan + a 'planned' registry row; no cloud CLI is ever reached.
 *
 * @module lib/venture-deploy/promote
 */

import { deployTargetFamily, validateStackDescriptor } from './stack-descriptor.js';
import { recordCorrectiveFinding } from '../eva/corrective-finding-recorder.js';

export const PROMOTE_STATUSES = Object.freeze([
  'planned', 'deployed_no_traffic', 'routed', 'failed', 'rolled_back',
]);

/** Health-gate probe defaults: short timeout + one retry, so a fail-closed gate
 * distinguishes real boot failures from a single network blip without hanging S19. */
export const HEALTH_PROBE_TIMEOUT_MS = 5000;
export const HEALTH_PROBE_RETRIES = 1;
/** Minimal smoke per design §3: health endpoint + root route must respond 2xx/3xx. */
export const HEALTH_GATE_PATHS = Object.freeze(['/health', '/']);

/** Ordered promote actions for a deployment family (plan-first, adapters resolve later). */
export function planPromoteActions(family, sha) {
  const actions = [];
  if (family === 'cloud-run') {
    actions.push({
      adapter: 'deployCloudRun',
      kind: 'no_traffic_revision',
      desc: `gcloud run deploy --no-traffic --tag promote-${sha} (already-built image for ${sha})`,
    });
    actions.push({ adapter: null, kind: 'health_gate', desc: `pre-route health gate against the tagged URL (${HEALTH_GATE_PATHS.join(', ')} respond, no boot errors)` });
    actions.push({
      adapter: 'deployCloudRun',
      kind: 'route_traffic',
      desc: 'gcloud run services update-traffic --to-latest (only after the health gate passes)',
    });
  } else if (family === 'cloudflare') {
    actions.push({
      adapter: 'deployWorkers',
      kind: 'no_traffic_revision',
      desc: `wrangler versions upload for ${sha} (version preview URL doubles as the pre-route gate target)`,
    });
    actions.push({ adapter: null, kind: 'health_gate', desc: 'pre-route health gate against the version URL' });
    actions.push({
      adapter: 'deployWorkers',
      kind: 'route_traffic',
      desc: 'wrangler versions deploy (promote the verified version to 100%)',
    });
  } else {
    actions.push({ adapter: null, kind: 'no_traffic_revision', desc: `${family} family — no promote compute path; plan only` });
    actions.push({ adapter: null, kind: 'health_gate', desc: 'pre-route health gate (plan only)' });
  }
  actions.push({ adapter: null, kind: 'record_stamp', desc: 'stamp ventures.deployment_url/deployment_target + finalize venture_deployments row' });
  return actions;
}

/**
 * Emit a DEPLOY_UNREPRODUCIBLE corrective finding into the canonical triage
 * channel (design §5: a deploy failure is a FINDING against the venture/pipeline,
 * never scoping burden). FAIL-SOFT: a recorder fault never masks the pipeline
 * error — but it is LOUD (NC-7: a zero-row write is an integrity failure, not a
 * debug line).
 *
 * corrective_class reuses the existing 'cli_validation' enum value (the recorder's
 * known classes carry no deploy class yet); the canonical discriminator is
 * metadata.finding_type = 'DEPLOY_UNREPRODUCIBLE'.
 *
 * @param {object} supabase
 * @param {{ ventureId: string, sha: string, stage: string, error: string, deploymentId?: string|null }} ctx
 * @returns {Promise<{recorded: boolean, feedbackId?: string}>}
 */
export async function emitDeployUnreproducible(supabase, { ventureId, sha, stage, error, deploymentId = null }) {
  try {
    const result = await recordCorrectiveFinding(supabase, {
      source_sd_id: null,
      source_gate: 'deploy_pipeline',
      gate_run_id: deploymentId,
      corrective_class: 'cli_validation',
      dimensions: [],
      tier: 'gap-closure',
      score: null,
      title: `DEPLOY_UNREPRODUCIBLE: ${stage} failed for venture ${ventureId} @ ${String(sha).slice(0, 12)}`,
      description: String(error).slice(0, 2000),
      metadata: { finding_type: 'DEPLOY_UNREPRODUCIBLE', venture_id: ventureId, sha, stage },
    });
    return { recorded: result.recorded !== false, feedbackId: result.feedbackId };
  } catch (e) {
    // Loud, never masking: the caller's pipeline error is the primary signal.
    console.error(`[promote] DEPLOY_UNREPRODUCIBLE finding FAILED TO RECORD (integrity failure, NC-7): ${e?.message || e}`);
    return { recorded: false };
  }
}

/**
 * Pre-route health gate: probe the tagged (no-traffic) revision URL before any
 * traffic is routed. Injectable via deps.healthProbe for tests; the default
 * implementation GETs each HEALTH_GATE_PATHS with a short timeout + one retry.
 *
 * @param {string} baseUrl - tagged revision URL
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number, retries?: number }} [opts]
 * @returns {Promise<{ok: boolean, failures: string[]}>}
 */
export async function runHealthGate(baseUrl, opts = {}) {
  const fetchImpl = opts.fetchImpl || fetch;
  const timeoutMs = opts.timeoutMs ?? HEALTH_PROBE_TIMEOUT_MS;
  const retries = opts.retries ?? HEALTH_PROBE_RETRIES;
  const failures = [];
  for (const path of HEALTH_GATE_PATHS) {
    const url = String(baseUrl).replace(/\/$/, '') + path;
    let passed = false;
    let lastErr = null;
    for (let attempt = 0; attempt <= retries && !passed; attempt++) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        const res = await fetchImpl(url, { signal: ctrl.signal, redirect: 'manual' });
        clearTimeout(timer);
        // 2xx/3xx = alive; 4xx on '/health' tolerated only for the root-path smoke
        // when the venture has no /health route (404 there is not a boot error).
        if (res.status < 400 || (path === '/health' && res.status === 404)) passed = true;
        else lastErr = `HTTP ${res.status}`;
      } catch (e) {
        lastErr = e?.name === 'AbortError' ? `timeout>${timeoutMs}ms` : String(e?.message || e);
      }
    }
    if (!passed) failures.push(`${path}: ${lastErr}`);
  }
  return { ok: failures.length === 0, failures };
}

/**
 * Promote a venture's `sha` to production traffic behind the pre-route health gate.
 *
 * @param {string} ventureId
 * @param {string} sha - commit SHA whose image Child A's CI already built
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{
 *   adapters?: object, execute?: boolean, actor?: string, now?: () => Date,
 *   verifyPreconditions?: (ctx: {ventureId: string, sha: string, supabase: object}) => Promise<{ok: boolean, reasons: string[]}>,
 *   healthProbe?: (url: string) => Promise<{ok: boolean, failures: string[]}>,
 * }} [deps]
 * @returns {Promise<{deployment_id: string|null, url: string|null, status: string, planned_actions: object[], reasons?: string[]}>}
 */
export async function promote(ventureId, sha, supabase, deps = {}) {
  if (!ventureId) throw new Error('promote: ventureId is required');
  if (!sha) throw new Error('promote: sha is required');
  if (!supabase) throw new Error('promote: supabase client is required');
  const now = deps.now || (() => new Date());
  const actor = deps.actor || 'promote-primitive';
  const hasRealAdapters = !!deps.adapters && deps.execute === true;

  const { data: vRow, error: vErr } = await supabase
    .from('ventures')
    .select('stack_descriptor')
    .eq('id', ventureId)
    .maybeSingle();
  if (vErr) throw new Error(`promote: cannot read ventures.stack_descriptor: ${vErr.message}`);
  const descriptor = vRow?.stack_descriptor;
  const { valid, errors } = validateStackDescriptor(descriptor);
  if (!valid) throw new Error(`promote: invalid/missing stack_descriptor — refusing: ${errors.join('; ')}`);

  const family = deployTargetFamily(descriptor);
  const plannedActions = planPromoteActions(family, sha);

  // FAIL-CLOSED preconditions in EXECUTE mode, before any adapter call and before
  // the registry row (an aborted precondition is not a deploy attempt). Execute
  // mode with no injected checker fails closed — "we did not verify" is a NO.
  // Plan mode records the requirement in the plan instead of blocking.
  if (hasRealAdapters) {
    if (typeof deps.verifyPreconditions !== 'function') {
      return {
        deployment_id: null, url: null, status: 'failed', planned_actions: plannedActions,
        reasons: ['preconditions_unverifiable: no verifyPreconditions injected (fail-closed — S19 scan + spend guardrails + CI-green must be checked)'],
      };
    }
    const pre = await deps.verifyPreconditions({ ventureId, sha, supabase });
    if (!pre || pre.ok !== true) {
      return {
        deployment_id: null, url: null, status: 'failed', planned_actions: plannedActions,
        reasons: (pre && pre.reasons) || ['preconditions_failed'],
      };
    }
  }

  // Registry-first: the row is the SSOT even for plan-mode promotes.
  const row = {
    venture_id: ventureId,
    sha,
    actor,
    status: 'planned',
    metadata: { family, planned_actions: plannedActions.map((a) => a.kind) },
  };
  const { data: inserted, error: insErr } = await supabase
    .from('venture_deployments')
    .insert(row)
    .select('id')
    .maybeSingle();
  if (insErr) {
    // Missing table (migration not applied) or insert fault: explicit degradation,
    // never a silent success and never a crash.
    return { deployment_id: null, url: null, status: 'registry_unavailable', planned_actions: plannedActions };
  }
  const deploymentId = inserted?.id ?? null;

  if (!hasRealAdapters) {
    return { deployment_id: deploymentId, url: null, status: 'planned', planned_actions: plannedActions };
  }

  const fail = async (stage, error) => {
    await supabase.from('venture_deployments')
      .update({ status: 'failed', error: String(error).slice(0, 2000), metadata: { ...row.metadata, failed_stage: stage } })
      .eq('id', deploymentId);
    await emitDeployUnreproducible(supabase, { ventureId, sha, stage, error, deploymentId });
    return { deployment_id: deploymentId, url: null, status: 'failed', planned_actions: plannedActions, reasons: [`${stage}: ${error}`] };
  };

  // 1. No-traffic revision.
  const deployAction = plannedActions.find((a) => a.kind === 'no_traffic_revision' && a.adapter);
  if (!deployAction || typeof deps.adapters[deployAction.adapter] !== 'function') {
    return fail('no_traffic_revision', `no deploy adapter for family '${family}'`);
  }
  let taggedUrl = null;
  try {
    const result = await deps.adapters[deployAction.adapter]([], { ventureId, sha, mode: 'no_traffic' });
    taggedUrl = result && typeof result.taggedUrl === 'string' ? result.taggedUrl : null;
  } catch (e) {
    return fail('no_traffic_revision', e?.message || e);
  }
  if (!taggedUrl) return fail('no_traffic_revision', 'adapter returned no taggedUrl for the revision');
  await supabase.from('venture_deployments')
    .update({ status: 'deployed_no_traffic', revision: taggedUrl, url: null })
    .eq('id', deploymentId);

  // 2. PRE-ROUTE HEALTH GATE — the only path to traffic.
  const probe = deps.healthProbe || ((url) => runHealthGate(url));
  let gate;
  try {
    gate = await probe(taggedUrl);
  } catch (e) {
    return fail('health_gate', e?.message || e);
  }
  if (!gate || gate.ok !== true) {
    return fail('health_gate', `pre-route health gate failed: ${(gate && gate.failures || ['no result']).join('; ')}`);
  }

  // 3. Route traffic (the single production mutation; rollback = re-route prior revision).
  const routeAction = plannedActions.find((a) => a.kind === 'route_traffic' && a.adapter);
  let liveUrl = taggedUrl;
  try {
    const result = await deps.adapters[routeAction.adapter]([], { ventureId, sha, mode: 'route_traffic' });
    if (result && typeof result.serviceUrl === 'string') liveUrl = result.serviceUrl;
  } catch (e) {
    return fail('route_traffic', e?.message || e);
  }

  // 4. Stamp + finalize.
  await supabase.from('ventures')
    .update({ deployment_url: liveUrl, deployment_target: descriptor.deployment_target })
    .eq('id', ventureId);
  await supabase.from('venture_deployments')
    .update({ status: 'routed', url: liveUrl, metadata: { ...row.metadata, routed_at: now().toISOString() } })
    .eq('id', deploymentId);

  return { deployment_id: deploymentId, url: liveUrl, status: 'routed', planned_actions: plannedActions };
}

/**
 * Roll back: re-route traffic to the prior revision and record the event.
 * The adapter call is injected (deps.adapters.deployCloudRun / deployWorkers with
 * mode 'rollback'); the record is written even in plan mode so intent is durable.
 */
export async function rollback(ventureId, supabase, deps = {}) {
  if (!ventureId) throw new Error('rollback: ventureId is required');
  if (!supabase) throw new Error('rollback: supabase client is required');
  const actor = deps.actor || 'promote-primitive';
  const hasRealAdapters = !!deps.adapters && deps.execute === true;

  const { data: last } = await supabase
    .from('venture_deployments')
    .select('id, sha, revision, url')
    .eq('venture_id', ventureId)
    .eq('status', 'routed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (hasRealAdapters && typeof deps.adapters.deployCloudRun === 'function') {
    await deps.adapters.deployCloudRun([], { ventureId, mode: 'rollback' });
  }
  const { data: inserted } = await supabase
    .from('venture_deployments')
    .insert({
      venture_id: ventureId,
      sha: last?.sha ?? 'unknown',
      actor,
      status: 'rolled_back',
      metadata: { rolled_back_from: last?.id ?? null, executed: hasRealAdapters },
    })
    .select('id')
    .maybeSingle();
  return { deployment_id: inserted?.id ?? null, status: 'rolled_back' };
}

export default { promote, rollback, planPromoteActions, runHealthGate, emitDeployUnreproducible, PROMOTE_STATUSES };
