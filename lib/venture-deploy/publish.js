/**
 * Single venture publish() orchestration — the integration capstone.
 *
 * SD-EHG-FEAT-AUTOMATED-RESILIENT-VENTURE-001-D (FR-1).
 *
 * Ties children A (stack descriptor), B (DB provisioning/routing) and C
 * (spend-guardrails) into ONE action that plans — and, only when explicitly told
 * AND every readiness check passes, executes — the Cloudflare Pages/Workers or
 * Cloud Run deploy + D1/Neon + R2 + production migrations.
 *
 * SAFE BY DEFAULT:
 *   - DRY-RUN is the default (deployCfg.dryRun !== false). A dry-run executes NO
 *     real adapter side-effects; it only records the ordered planned actions in
 *     `evidence` so an operator can review exactly what a real publish would do.
 *   - A real run (dryRun:false) REFUSES (status 'blocked') unless the venture's
 *     spend guardrails (C) are active AND its DB connection (B) is provisioned.
 *   - All external CLIs go through injected, mockable adapters (FR-2) — real
 *     adapters are never reached in dry-run or in tests.
 *
 * @module lib/venture-deploy/publish
 */

import { deployTargetFamily, validateStackDescriptor } from './stack-descriptor.js';
import { isGuardrailsActive as readGuardrailsActive } from './spend-guardrails.js';
import { realAdapters } from './cli-adapters.js';

/**
 * @typedef {Object} PublishResult
 * @property {'planned'|'published'|'blocked'} status
 * @property {string|null} deploymentUrl
 * @property {boolean} databaseReady
 * @property {boolean} guardrailsActive
 * @property {{plannedActions: object[], adapterCalls: object[], blockedReason?: string}} evidence
 */

/** Build the ordered list of planned deploy actions for a venture's deployment family. */
function planActions(family, descriptor) {
  const actions = [];
  const dbProvider = descriptor?.connection?.provider || descriptor?.db_provider || 'unknown';
  if (family === 'cloudflare') {
    actions.push({ adapter: 'deployPages', desc: 'wrangler pages deploy (Cloudflare Pages frontend)' });
    actions.push({ adapter: 'deployWorkers', desc: 'wrangler deploy (Cloudflare Workers compute)' });
    if (dbProvider === 'd1') actions.push({ adapter: 'ensureD1', desc: 'wrangler d1 (provision/verify D1)' });
    if (dbProvider === 'neon') actions.push({ adapter: 'ensureNeon', desc: 'neonctl (provision/verify Neon)' });
    actions.push({ adapter: 'ensureR2', desc: 'wrangler r2 (object storage)' });
  } else if (family === 'cloud-run') {
    actions.push({ adapter: 'deployPages', desc: 'wrangler pages deploy (Cloudflare Pages frontend)' });
    actions.push({ adapter: 'deployCloudRun', desc: 'gcloud run deploy (Cloud Run compute)' });
    actions.push({ adapter: 'ensureNeon', desc: 'neonctl (provision/verify Neon)' });
    actions.push({ adapter: 'ensureR2', desc: 'wrangler r2 (object storage)' });
  } else {
    // replit family — the legacy path is hosted on Replit; publish() plans no cloud steps.
    actions.push({ adapter: null, desc: 'Replit hosting (autoscale) — no cloud publish steps' });
  }
  actions.push({ adapter: 'runMigrations', desc: 'apply production migrations (chairman-gated for prod-deploy)' });
  return actions;
}

/**
 * Orchestrate a venture publish.
 *
 * @param {string} ventureId
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ dryRun?: boolean }} [deployCfg] — dryRun defaults to TRUE (safe)
 * @param {{ adapters?: object }} [deps] — inject fake adapters for testing
 * @returns {Promise<PublishResult>}
 */
export async function publish(ventureId, supabase, deployCfg = {}, deps = {}) {
  if (!ventureId) throw new Error('publish: ventureId is required');
  if (!supabase) throw new Error('publish: supabase client is required');
  const dryRun = deployCfg.dryRun !== false; // DEFAULT TRUE (safe)
  const adapters = deps.adapters || realAdapters;

  // Read the venture's stack descriptor (A) + resolved connection (B).
  const { data: vRow, error: vErr } = await supabase
    .from('ventures')
    .select('stack_descriptor')
    .eq('id', ventureId)
    .maybeSingle();
  if (vErr) throw new Error(`publish: cannot read ventures.stack_descriptor: ${vErr.message}`);
  const descriptor = vRow?.stack_descriptor;
  const { valid, errors } = validateStackDescriptor(descriptor);
  if (!valid) {
    // fail-loud: never silently no-op a publish on a bad descriptor.
    throw new Error(`publish: invalid/missing stack_descriptor — refusing: ${errors.join('; ')}`);
  }

  const family = deployTargetFamily(descriptor);
  const connection = descriptor.connection || null;
  const databaseReady = !!(connection && connection.provider && connection.secret_ref);
  const guard = await readGuardrailsActive(supabase, ventureId);
  const guardrailsActive = guard.active;

  const plannedActions = planActions(family, descriptor);
  const evidence = { plannedActions, adapterCalls: [] };

  // DRY-RUN (default): plan only, execute NOTHING.
  if (dryRun) {
    return {
      status: 'planned',
      deploymentUrl: null,
      databaseReady,
      guardrailsActive,
      evidence,
    };
  }

  // REAL RUN: refuse unless every readiness check passes (fail-safe, no partial deploy).
  if (!guardrailsActive || !databaseReady) {
    const blockedReason = !guardrailsActive
      ? `spend guardrails not active: ${guard.reason}`
      : 'database connection not provisioned (stack_descriptor.connection missing provider/secret_ref)';
    return {
      status: 'blocked',
      deploymentUrl: null,
      databaseReady,
      guardrailsActive,
      evidence: { ...evidence, blockedReason },
    };
  }

  // Execute each planned action through the (injected) adapters.
  let deploymentUrl = null;
  for (const action of plannedActions) {
    if (!action.adapter || typeof adapters[action.adapter] !== 'function') {
      evidence.adapterCalls.push({ adapter: action.adapter, skipped: true, desc: action.desc });
      continue;
    }
    const result = await adapters[action.adapter]([], { ventureId });
    evidence.adapterCalls.push({ adapter: action.adapter, desc: action.desc, ran: true });
    // First Pages/Workers/Cloud-Run deploy result that yields a URL becomes the deploymentUrl.
    if (!deploymentUrl && result && typeof result.deploymentUrl === 'string') {
      deploymentUrl = result.deploymentUrl;
    }
  }

  // Persist the publish record so the fail-closed post-publish verifiers (FR-3)
  // have evidence to read. Written under stack_descriptor.publish (additive;
  // never touches B's connection or A's descriptor fields). Fail-loud on write error.
  const publishRecord = {
    status: 'published',
    deploymentUrl,
    family,
    publishedAt: new Date().toISOString(),
    evidence: { plannedActions: evidence.plannedActions, adapterCalls: evidence.adapterCalls },
  };
  const { error: upErr } = await supabase
    .from('ventures')
    .update({ stack_descriptor: { ...descriptor, publish: publishRecord } })
    .eq('id', ventureId);
  if (upErr) throw new Error(`publish: failed to record publish evidence: ${upErr.message}`);

  return {
    status: 'published',
    deploymentUrl,
    databaseReady,
    guardrailsActive,
    evidence,
  };
}

export default { publish };
