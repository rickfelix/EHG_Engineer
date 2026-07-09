/**
 * preview(sha, fixture) — the preview/replay primitive (deploy-pipeline-architecture.md §1).
 *
 * SD-LEO-INFRA-VENTURE-DEPLOY-PIPELINE-001-B (FR-1).
 *
 * PREVIEW = deployInstance(v, any_sha, test_mode_overlay, ephemeral_branch(seed)):
 * a no-traffic tagged Cloud Run revision (or native CF preview) of an ALREADY-BUILT
 * image for `sha` (Child A's image-per-SHA discipline), an ephemeral DB expressed as
 * a NEUTRAL db_ref contract (D1-create vs Neon-branch adjudication pending — this
 * module never chooses), a seed-hook step, and a durable row in the
 * `venture_preview_instances` registry with a TTL the reaper enforces.
 *
 * SAFE BY DEFAULT, mirroring publish.js:
 *   - Plan mode is the default: with no injected real adapters the result records
 *     the ordered planned actions and status 'blocked_on_credentials' — no cloud
 *     CLI is ever reached (the chairman bootstrap gate).
 *   - Real execution differs ONLY by adapter injection (deps.adapters +
 *     deps.execute:true); the plan is the contract either way.
 *   - A missing registry table degrades to status 'registry_unavailable' (explicit,
 *     never a silent success and never a crash).
 *
 * @module lib/venture-deploy/preview
 */

import { deployTargetFamily, validateStackDescriptor } from './stack-descriptor.js';
// SD-LEO-INFRA-VENTURE-DEPLOY-PIPELINE-001-D (FR-4): a preview that cannot deploy is a
// FINDING against the venture/pipeline (design §5), routed to the corrective triage.
import { emitDeployUnreproducible } from './promote.js';

export const PREVIEW_STATUSES = Object.freeze(['planned', 'live', 'reaped', 'failed']);
export const DEFAULT_PREVIEW_TTL_MS = 4 * 60 * 60 * 1000; // 4h — preview instances are ephemeral by contract

/**
 * Neutral ephemeral-DB reference: names the candidate adapters WITHOUT selecting one.
 * The Adam/Solomon stakes adjudication picks the adapter; the contract shape is stable.
 */
export function ephemeralDbRef(fixtureId) {
  return Object.freeze({
    kind: 'ephemeral_branch',
    fixture_id: fixtureId ?? null,
    candidates: Object.freeze(['ensureD1', 'ensureNeon']),
    chosen: null,
  });
}

/** Ordered preview actions for a deployment family (plan-first, adapters resolve later). */
export function planPreviewActions(family, sha, fixtureId) {
  const dbRef = ephemeralDbRef(fixtureId);
  const actions = [];
  if (family === 'cloud-run') {
    actions.push({
      adapter: 'deployCloudRun',
      kind: 'no_traffic_revision',
      desc: `gcloud run deploy --no-traffic --tag preview-${sha} (already-built image for ${sha})`,
    });
  } else if (family === 'cloudflare') {
    actions.push({
      adapter: 'deployWorkers',
      kind: 'no_traffic_revision',
      desc: `wrangler versions upload (native version preview URL for ${sha})`,
    });
  } else {
    actions.push({ adapter: null, kind: 'no_traffic_revision', desc: 'replit family — no preview compute path; plan only' });
  }
  actions.push({ adapter: null, kind: 'ephemeral_db', desc: 'ephemeral DB per db_ref (adapter adjudication pending)', db_ref: dbRef });
  actions.push({ adapter: null, kind: 'seed_hook', desc: `apply fixture seed '${fixtureId ?? 'none'}' via the venture's declared seed hook` });
  actions.push({ adapter: null, kind: 'registry_register', desc: 'register instance in venture_preview_instances with TTL' });
  return actions;
}

/**
 * Create (plan) a preview instance for a venture at a given SHA + fixture.
 *
 * @param {string} ventureId
 * @param {string} sha - commit SHA whose image Child A's CI already built
 * @param {string|null} fixture - fixture/seed id for the ephemeral DB
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ adapters?: object, execute?: boolean, now?: () => Date, ttlMs?: number, createdBy?: string }} [deps]
 * @returns {Promise<{instance_id: string|null, url: string|null, planned_actions: object[], status: string, teardown: () => Promise<{reaped: boolean, already?: boolean}>}>}
 */
export async function preview(ventureId, sha, fixture, supabase, deps = {}) {
  if (!ventureId) throw new Error('preview: ventureId is required');
  if (!sha) throw new Error('preview: sha is required');
  if (!supabase) throw new Error('preview: supabase client is required');
  const now = deps.now || (() => new Date());
  const ttlMs = deps.ttlMs ?? DEFAULT_PREVIEW_TTL_MS;
  const hasRealAdapters = !!deps.adapters && deps.execute === true;

  const { data: vRow, error: vErr } = await supabase
    .from('ventures')
    .select('stack_descriptor')
    .eq('id', ventureId)
    .maybeSingle();
  if (vErr) throw new Error(`preview: cannot read ventures.stack_descriptor: ${vErr.message}`);
  const descriptor = vRow?.stack_descriptor;
  const { valid, errors } = validateStackDescriptor(descriptor);
  if (!valid) throw new Error(`preview: invalid/missing stack_descriptor — refusing: ${errors.join('; ')}`);

  const family = deployTargetFamily(descriptor);
  const plannedActions = planPreviewActions(family, sha, fixture ?? null);
  const expiresAt = new Date(now().getTime() + ttlMs).toISOString();

  // Register the instance FIRST — the registry is the SSOT even for plan-mode instances.
  const row = {
    venture_id: ventureId,
    sha,
    fixture_id: fixture ?? null,
    status: 'planned',
    url: null,
    expires_at: expiresAt,
    created_by: deps.createdBy ?? 'preview-primitive',
    metadata: { family, planned_actions: plannedActions.map((a) => a.kind) },
  };
  const { data: inserted, error: insErr } = await supabase
    .from('venture_preview_instances')
    .insert(row)
    .select('id')
    .maybeSingle();
  if (insErr) {
    // Missing table (migration not yet applied) or any insert fault: explicit degradation.
    return {
      instance_id: null,
      url: null,
      planned_actions: plannedActions,
      status: 'registry_unavailable',
      teardown: async () => ({ reaped: false, already: true }),
    };
  }
  const instanceId = inserted?.id ?? null;

  const teardown = async () => {
    const { data: cur, error: curErr } = await supabase
      .from('venture_preview_instances')
      .select('status')
      .eq('id', instanceId)
      .maybeSingle();
    if (curErr || !cur) return { reaped: false, already: true };
    if (cur.status === 'reaped' || cur.status === 'failed') return { reaped: false, already: true };
    const { error: upErr } = await supabase
      .from('venture_preview_instances')
      .update({ status: 'reaped', metadata: { ...row.metadata, reaped_at: now().toISOString() } })
      .eq('id', instanceId);
    return { reaped: !upErr };
  };

  // Plan mode (no credentials/adapters): the ordered plan IS the deliverable.
  if (!hasRealAdapters) {
    return { instance_id: instanceId, url: null, planned_actions: plannedActions, status: 'blocked_on_credentials', teardown };
  }

  // Real execution: same plan, injected adapters. Any adapter fault marks the
  // instance failed (never a false 'live').
  let url = null;
  for (const action of plannedActions) {
    if (!action.adapter || typeof deps.adapters[action.adapter] !== 'function') continue;
    try {
      const result = await deps.adapters[action.adapter]([], { ventureId, sha, fixture: fixture ?? null });
      if (!url && result && typeof result.previewUrl === 'string') url = result.previewUrl;
    } catch (e) {
      await supabase
        .from('venture_preview_instances')
        .update({ status: 'failed', metadata: { ...row.metadata, error: String(e?.message || e) } })
        .eq('id', instanceId);
      // FR-4: fail-soft finding emission — the failed status above is the primary
      // signal and is already durable; the finding routes it into corrective triage.
      await emitDeployUnreproducible(supabase, {
        ventureId, sha, stage: `preview:${action.kind}`, error: e?.message || e, deploymentId: instanceId,
      });
      return { instance_id: instanceId, url: null, planned_actions: plannedActions, status: 'failed', teardown };
    }
  }
  const { error: liveErr } = await supabase
    .from('venture_preview_instances')
    .update({ status: 'live', url })
    .eq('id', instanceId);
  return {
    instance_id: instanceId,
    url,
    planned_actions: plannedActions,
    status: liveErr ? 'registry_unavailable' : 'live',
    teardown,
  };
}

export default { preview, planPreviewActions, ephemeralDbRef, PREVIEW_STATUSES, DEFAULT_PREVIEW_TTL_MS };
