/**
 * Exit-gate verifier map for the Stage 19→20 enforcer.
 *
 * SD-LEO-FEAT-STAGE-BUILD-REPLIT-001 / FR-2 / TR-2
 *
 * Each verifier resolves a free-text gate string declared in
 * lifecycle_stage_config.metadata.gates.exit (author-specified prose) into a
 * structured "satisfied yes/no" check against runtime DB state.
 *
 * v1 ships with the two S19 verifiers required for the Replit registration
 * flow. New stages register additional verifiers by appending to GATE_VERIFIERS
 * and providing a substring-matched key.
 *
 * @module lib/eva/lifecycle/exit-gate-verifiers
 */

// SD-LEO-INFRA-RECONCILE-VENTURE-BUILD-001 FR-4: reuse the canonical pure
// completion normalizer rather than re-rolling the parse (DRY — same shape the
// register-deployment route and resolveRepoReadiness produce/consume).
import { normalizeBuildTaskCompletion } from '../bridge/repo-readiness.js';
// SD-EHG-FEAT-AUTOMATED-RESILIENT-VENTURE-001-C FR-2: the 8 canonical spend-guardrail names.
import { GUARDRAIL_NAMES } from '../../venture-deploy/spend-guardrails.js';
// SD-EHG-FEAT-AUTOMATED-RESILIENT-VENTURE-001-B FR-3: stack-descriptor validation.
import { validateStackDescriptor } from '../../venture-deploy/stack-descriptor.js';
// SD-EHG-FEAT-AUTOMATED-RESILIENT-VENTURE-001-D FR-3: post-publish verifiers read
// the publish record written by lib/venture-deploy/publish.js into
// ventures.stack_descriptor.publish. (No extra import needed — read inline.)

/**
 * @typedef {Object} VerifierResult
 * @property {boolean} satisfied
 * @property {string} reason — human-readable explanation if !satisfied
 */

/**
 * @typedef {Object} VerifierContext
 * @property {import('@supabase/supabase-js').SupabaseClient} supabase
 * @property {string} ventureId
 * @property {number} fromStage
 */

/**
 * Verifier: build_mvp_build artifact present AND is_current=true.
 * Backs the gate string "Application deployed".
 *
 * @param {VerifierContext} ctx
 * @returns {Promise<VerifierResult>}
 */
async function verifyBuildMvpBuildPresent({ supabase, ventureId }) {
  const { data, error } = await supabase
    .from('venture_artifacts')
    .select('id, artifact_data, content')
    .eq('venture_id', ventureId)
    .eq('artifact_type', 'build_mvp_build')
    .eq('is_current', true)
    .limit(1)
    .maybeSingle();
  if (error) {
    return { satisfied: false, reason: `venture_artifacts query failed: ${error.message}` };
  }
  if (!data) {
    return { satisfied: false, reason: 'build_mvp_build artifact missing or not is_current' };
  }

  // SD-LEO-INFRA-RECONCILE-VENTURE-BUILD-001 FR-4 (SECURITY VB-4): evidence-based, not asserted.
  // When the artifact carries build-task completion (build_tasks_total > 0), the build is "done"
  // for the purpose of advancing S19->S20 ONLY if complete >= total. This closes the free-pass
  // where a bare register-deployment (a registered URL with no verified completion) advanced the
  // venture on an unverified N/N assertion. Artifacts that carry no completion fields (e.g. the
  // Replit-reentry advisory artifact) retain prior existence-only semantics — this gate hardens
  // the register-deployment path without breaking other emitters.
  const completion = normalizeBuildTaskCompletion(data.artifact_data);
  if (completion && completion.total > 0 && completion.complete < completion.total) {
    return {
      satisfied: false,
      reason: `build incomplete: ${completion.complete}/${completion.total} build tasks verified complete. `
        + 'S19->S20 requires evidence-based completion (a registered deployment URL alone does not '
        + `prove the build is done). Supply a verified build_tasks_complete >= ${completion.total}.`,
    };
  }

  // SD-LEO-INFRA-HARDEN-S19-S20-001 (FR-4): reject a PRESENT failing build verdict. The
  // build_mvp_build emitter writes artifact_data.verdict='FAIL' (mirrored in content) when build/
  // repo verification failed (e.g. DataDistill's clone was refused on a bare-slug repo_url). But
  // normalizeBuildTaskCompletion exposes no verdict/checks_run, so the completion check above is a
  // NO-OP for such an artifact and the venture advanced past S19 with verdict=FAIL (RCA 7610876f).
  // Reject ONLY a present verdict==='FAIL'; an advisory/reentry artifact with no verdict field
  // (v===undefined) is NOT rejected — preserving existence-only semantics for those emitters.
  let parsedContent = null;
  if (typeof data.content === 'string') {
    try { parsedContent = JSON.parse(data.content); } catch { /* non-JSON content → ignore */ }
  } else if (data.content && typeof data.content === 'object') {
    parsedContent = data.content;
  }
  const verdict = (data.artifact_data && data.artifact_data.verdict) ?? (parsedContent && parsedContent.verdict);
  if (typeof verdict === 'string' && verdict.toUpperCase() === 'FAIL') {
    return {
      satisfied: false,
      reason: 'build_mvp_build verdict=FAIL — repo/build verification did not pass (presence is not '
        + 'sufficiency). Resolve the build failure and re-run verification until verdict is not FAIL.',
    };
  }
  return { satisfied: true, reason: '' };
}

/**
 * Verifier: ventures.repo_url AND ventures.deployment_url populated.
 * Backs the gate string "GitHub repo URL stored in venture_resources" (gate-
 * string text retained for backward compatibility with existing
 * lifecycle_stage_config entries; data source corrected by
 * SD-LEO-INFRA-FAIL-CLOSED-VENTURE-001-A PA-2).
 *
 * Why ventures, not venture_resources:
 *   The 20260503_venture_resources_add_replit_urls.sql migration that added
 *   repo_url + deployment_url columns to venture_resources was never applied
 *   to live (verified 2026-05-05 — ERROR 42703 on those columns). The
 *   canonical Replit registration data lives on the ventures table directly
 *   (ventures.repo_url, ventures.deployment_url, ventures.deployment_target).
 *   Per database-agent review for SD-LEO-INFRA-FAIL-CLOSED-VENTURE-001-A.
 *
 * @param {VerifierContext} ctx
 * @returns {Promise<VerifierResult>}
 */
async function verifyVentureResourceUrlsPopulated({ supabase, ventureId }) {
  const { data, error } = await supabase
    .from('ventures')
    .select('repo_url, deployment_url')
    .eq('id', ventureId)
    .not('repo_url', 'is', null)
    .not('deployment_url', 'is', null)
    .limit(1)
    .maybeSingle();
  if (error) {
    return { satisfied: false, reason: `ventures query failed: ${error.message}` };
  }
  return data
    ? { satisfied: true, reason: '' }
    : { satisfied: false, reason: 'ventures.repo_url and/or ventures.deployment_url not populated' };
}

/**
 * SD-LEO-FEAT-STAGE-LIVE-ANNOUNCE-001 FR-5: Stage 24 (Go Live) exit-gate verifiers.
 *
 * lifecycle_stage_config row 24 metadata.gates.exit declares prose strings
 * "Launch triggered" and "All channels activated". These verifiers resolve those
 * strings to runtime DB checks against venture_artifacts(launch_metrics).
 *
 * Backward compat: artifact_type IN ('launch_metrics','launch_launch_metrics')
 * — legacy alias remains accepted until typo deprecation finalizes.
 *
 * RPC wiring (advance_venture_stage RPC integration with exit-gate-enforcer)
 * is OUT OF SCOPE here — deferred per parent retro ee12e373 follow-up.
 *
 * @param {VerifierContext} ctx
 * @returns {Promise<VerifierResult>}
 */
async function verifyLaunchTriggered({ supabase, ventureId }) {
  const { data, error } = await supabase
    .from('venture_artifacts')
    .select('id, artifact_type')
    .eq('venture_id', ventureId)
    .in('artifact_type', ['launch_metrics', 'launch_launch_metrics'])
    .eq('is_current', true)
    .limit(1)
    .maybeSingle();
  if (error) {
    return { satisfied: false, reason: `venture_artifacts query failed: ${error.message}` };
  }
  return data
    ? { satisfied: true, reason: '' }
    : { satisfied: false, reason: 'launch_metrics artifact missing or not is_current' };
}

/**
 * Verifier: launch_metrics row's artifact_data.channels[].every(c => c.status === 'activated').
 * Backs the gate string "All channels activated".
 *
 * artifact_data is the canonical JSONB payload column (per
 * lib/eva/artifact-persistence-service.js writeArtifact dual-write pattern).
 * Backward compat: also reads legacy artifact_type 'launch_launch_metrics'.
 *
 * @param {VerifierContext} ctx
 * @returns {Promise<VerifierResult>}
 */
async function verifyAllChannelsActivated({ supabase, ventureId }) {
  const { data, error } = await supabase
    .from('venture_artifacts')
    .select('artifact_data, artifact_type')
    .eq('venture_id', ventureId)
    .in('artifact_type', ['launch_metrics', 'launch_launch_metrics'])
    .eq('is_current', true)
    .limit(1)
    .maybeSingle();
  if (error) {
    return { satisfied: false, reason: `venture_artifacts query failed: ${error.message}` };
  }
  if (!data) {
    return { satisfied: false, reason: 'launch_metrics artifact missing or not is_current' };
  }
  const channels = data.artifact_data?.channels;
  if (!Array.isArray(channels) || channels.length === 0) {
    return { satisfied: false, reason: 'launch_metrics.artifact_data.channels missing or empty' };
  }
  const notActivated = channels.filter(c => c?.status !== 'activated');
  if (notActivated.length > 0) {
    return {
      satisfied: false,
      reason: `${notActivated.length}/${channels.length} channels not activated (statuses: ${notActivated.map(c => c?.status ?? 'undefined').join(', ')})`,
    };
  }
  return { satisfied: true, reason: '' };
}

/**
 * SD-LEO-FEAT-STAGE-GROWTH-PLAYBOOK-001 FR-6: Stage 26 (Growth Playbook,
 * lifecycle terminal stage) exit-gate verifiers.
 *
 * lifecycle_stage_config row 26 metadata.gates.exit (populated by the
 * 20260509_growth_optimization_roadmap_terminal_gates.sql migration) declares
 * the two artifact-name strings 'growth_playbook' and
 * 'growth_optimization_roadmap'. These verifiers resolve those strings to
 * runtime DB checks against venture_artifacts.
 *
 * Terminal-stage semantics: the "advance" being gated here is the
 * workflow_status flip to 'completed' on stage_number=26 (not a
 * current_lifecycle_stage increment — Stage 26 is terminal). The Stage 26
 * worker calls checkExitGates(fromStage=26) before flipping
 * ventures.workflow_status.
 *
 * Backward compat: growth_optimization_roadmap verifier ALSO accepts
 * 'launch_optimization_roadmap' (deprecated alias retained for one release
 * per FR-2 — live row count was 0 at apply time but the alias avoids breaking
 * any in-flight legacy reads).
 *
 * @param {VerifierContext} ctx
 * @returns {Promise<VerifierResult>}
 */
async function verifyGrowthPlaybookPresent({ supabase, ventureId }) {
  const { data, error } = await supabase
    .from('venture_artifacts')
    .select('id')
    .eq('venture_id', ventureId)
    .eq('artifact_type', 'growth_playbook')
    .eq('is_current', true)
    .limit(1)
    .maybeSingle();
  if (error) {
    return { satisfied: false, reason: `venture_artifacts query failed: ${error.message}` };
  }
  return data
    ? { satisfied: true, reason: '' }
    : { satisfied: false, reason: 'growth_playbook artifact missing or not is_current' };
}

async function verifyGrowthOptimizationRoadmapPresent({ supabase, ventureId }) {
  const { data, error } = await supabase
    .from('venture_artifacts')
    .select('id, artifact_type')
    .eq('venture_id', ventureId)
    .in('artifact_type', ['growth_optimization_roadmap', 'launch_optimization_roadmap'])
    .eq('is_current', true)
    .limit(1)
    .maybeSingle();
  if (error) {
    return { satisfied: false, reason: `venture_artifacts query failed: ${error.message}` };
  }
  return data
    ? { satisfied: true, reason: '' }
    : { satisfied: false, reason: 'growth_optimization_roadmap artifact missing or not is_current (alias launch_optimization_roadmap also checked)' };
}

/**
 * SD-EHG-FEAT-AUTOMATED-RESILIENT-VENTURE-001-C FR-2: spend-guardrail readiness.
 *
 * FAIL-CLOSED. Reads the per-venture venture_guardrail_state rows (written by
 * the deploy flow via persistGuardrailDecisions). The gate is satisfied ONLY
 * when a row exists for every one of the 8 guardrails AND each row's
 * decision === 'allow' AND its kill-switch is not open. Any of: query error,
 * a missing table, fewer rows than guardrails, a 'block' decision, or an open
 * kill-switch → satisfied:false. There is no allow-on-missing branch — being a
 * REGISTERED verifier (vs an unregistered gate, which resolveVerifier skip-
 * allows) is what makes this gate fail-closed.
 *
 * The gate-string match 'spend guardrails ready' is intentionally distinct from
 * the strings used by sibling children B and D.
 *
 * @param {VerifierContext} ctx
 * @returns {Promise<VerifierResult>}
 */
async function verifySpendGuardrailsReady({ supabase, ventureId }) {
  const { data, error } = await supabase
    .from('venture_guardrail_state')
    .select('guardrail, decision, killswitch_open')
    .eq('venture_id', ventureId);
  if (error) {
    return { satisfied: false, reason: `venture_guardrail_state query failed: ${error.message} (fail-closed)` };
  }
  const rows = data || [];
  const recorded = new Set(rows.map((r) => r.guardrail));
  const missing = GUARDRAIL_NAMES.filter((n) => !recorded.has(n));
  if (missing.length > 0) {
    return { satisfied: false, reason: `spend guardrails not recorded for this venture (missing: ${missing.join(', ')}) → fail-closed` };
  }
  const bad = rows.filter((r) => r.decision !== 'allow' || r.killswitch_open === true);
  if (bad.length > 0) {
    return {
      satisfied: false,
      reason: `unmet/halted spend guardrails: ${bad.map((r) => `${r.guardrail}(${r.killswitch_open ? 'kill-switch-open' : r.decision})`).join(', ')}`,
    };
  }
  return { satisfied: true, reason: '' };
}

/**
 * SD-EHG-FEAT-AUTOMATED-RESILIENT-VENTURE-001-B FR-3: stack-descriptor + provisioning gates.
 *
 * Both FAIL-CLOSED — a query error, missing venture row, missing descriptor, or
 * (for the provisioning gate) a missing connection yields satisfied:false. Gate
 * strings are intentionally distinct from child C ('spend guardrails ready') and D.
 */

/**
 * Verifier: ventures.stack_descriptor is present AND passes validateStackDescriptor.
 * Backs the gate string 'stack descriptor valid'.
 *
 * @param {VerifierContext} ctx
 * @returns {Promise<VerifierResult>}
 */
async function verifyStackDescriptorValid({ supabase, ventureId }) {
  const { data, error } = await supabase
    .from('ventures')
    .select('stack_descriptor')
    .eq('id', ventureId)
    .maybeSingle();
  if (error) {
    return { satisfied: false, reason: `ventures query failed: ${error.message} (fail-closed)` };
  }
  const descriptor = data?.stack_descriptor;
  if (!descriptor) {
    return { satisfied: false, reason: 'ventures.stack_descriptor is missing → fail-closed' };
  }
  const { valid, errors } = validateStackDescriptor(descriptor);
  if (!valid) {
    return { satisfied: false, reason: `stack_descriptor invalid: ${errors.join('; ')}` };
  }
  return { satisfied: true, reason: '' };
}

/**
 * Verifier: the routed DB connection has been provisioned, i.e.
 * stack_descriptor.connection is populated with a provider + secret_ref.
 * Backs the gate string 'deployment target provisioned'.
 *
 * @param {VerifierContext} ctx
 * @returns {Promise<VerifierResult>}
 */
async function verifyDeploymentTargetProvisioned({ supabase, ventureId }) {
  const { data, error } = await supabase
    .from('ventures')
    .select('stack_descriptor')
    .eq('id', ventureId)
    .maybeSingle();
  if (error) {
    return { satisfied: false, reason: `ventures query failed: ${error.message} (fail-closed)` };
  }
  const conn = data?.stack_descriptor?.connection;
  if (!conn || typeof conn !== 'object' || !conn.provider || !conn.secret_ref) {
    return {
      satisfied: false,
      reason: 'stack_descriptor.connection not provisioned (missing provider/secret_ref) → fail-closed',
    };
  }
  return { satisfied: true, reason: '' };
}

/**
 * SD-EHG-FEAT-AUTOMATED-RESILIENT-VENTURE-001-D FR-3: fail-closed post-publish gates.
 *
 * All read ventures.stack_descriptor.publish (written by publish() on a real
 * 'published' run). FAIL-CLOSED — query error, missing venture row, or missing
 * publish record yields satisfied:false. Gate strings are distinct from B/C.
 */

/**
 * SD-LEO-INFRA-VENTURE-DEPLOY-PIPELINE-001-D (FR-3): DUAL-READ transition.
 * The canonical deploy record is now venture_deployments (written by promote(),
 * design R3/R4/R5 binding rule); the legacy stack_descriptor.publish read is the
 * transition path for ventures whose deploys predate the table.
 * RETIREMENT CRITERION (DORMANT-EXIT-001 discipline): retire the legacy read only
 * after >=25 verifier evaluations over 48h with ZERO false-rejects on the
 * record-only path, flipped by a named operator — until then both paths satisfy.
 */
async function latestRoutedDeployment(supabase, ventureId) {
  // Missing table (migration not yet applied), query fault, or a client that
  // cannot express this query: report null so the caller falls through to the
  // legacy read — the dual-read transition exists exactly for these cases.
  try {
    const { data, error } = await supabase
      .from('venture_deployments')
      .select('id, url, sha')
      .eq('venture_id', ventureId)
      .eq('status', 'routed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return null;
    return data ?? null;
  } catch {
    return null;
  }
}

/** Live HTTP probe (design R3 rule: PagesUrlLive must LIVE-PROBE, never trust the
 * row alone). Short timeout + one retry; final 2xx/3xx-free — a recorded URL that
 * does not actually serve is fail-closed. Injectable via ctx.fetchImpl for tests. */
async function probeUrlAlive(url, fetchImpl = fetch, timeoutMs = 5000, retries = 1) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { signal: ctrl.signal, redirect: 'follow' });
      if (res.status >= 200 && res.status < 300) return { alive: true };
      lastErr = `HTTP ${res.status}`;
    } catch (e) {
      lastErr = e?.name === 'AbortError' ? `timeout>${timeoutMs}ms` : String(e?.message || e);
    } finally {
      clearTimeout(timer);
    }
  }
  return { alive: false, reason: lastErr };
}

/** Verifier: a deployment URL is recorded AND live-probes successfully.
 * Backs 'pages url live'. Dual-read: venture_deployments routed row (canonical)
 * OR legacy publish record; EITHER way the URL must actually serve (R3). */
async function verifyPagesUrlLive({ supabase, ventureId, fetchImpl }) {
  const routed = await latestRoutedDeployment(supabase, ventureId);
  let url = routed?.url;
  if (!url) {
    const { data, error } = await supabase
      .from('ventures').select('stack_descriptor').eq('id', ventureId).maybeSingle();
    if (error) return { satisfied: false, reason: `ventures query failed: ${error.message} (fail-closed)` };
    url = data?.stack_descriptor?.publish?.deploymentUrl;
  }
  if (typeof url !== 'string' || url.length === 0) {
    return { satisfied: false, reason: 'no deployment URL recorded (venture_deployments or publish()) → fail-closed' };
  }
  const probe = await probeUrlAlive(url, fetchImpl);
  if (!probe.alive) {
    return { satisfied: false, reason: `deployment URL recorded but not serving (${probe.reason}) → fail-closed (R3: never trust the row alone)` };
  }
  return { satisfied: true, reason: '' };
}

/** Verifier: a production deploy is recorded. Backs 'compute deployed'.
 * Dual-read: venture_deployments status='routed' (canonical, written by promote())
 * OR legacy publish() status 'published' (transition — see retirement criterion above). */
async function verifyComputeDeployed({ supabase, ventureId }) {
  const routed = await latestRoutedDeployment(supabase, ventureId);
  if (routed) return { satisfied: true, reason: '' };
  const { data, error } = await supabase
    .from('ventures').select('stack_descriptor').eq('id', ventureId).maybeSingle();
  if (error) return { satisfied: false, reason: `ventures query failed: ${error.message} (fail-closed)` };
  const status = data?.stack_descriptor?.publish?.status;
  if (status !== 'published') {
    return { satisfied: false, reason: `no routed venture_deployments row and publish status is '${status ?? 'none'}' → fail-closed` };
  }
  return { satisfied: true, reason: '' };
}

/** Verifier: a publish evidence record exists. Backs 'publish evidence recorded'. */
async function verifyPublishEvidenceRecorded({ supabase, ventureId }) {
  const { data, error } = await supabase
    .from('ventures').select('stack_descriptor').eq('id', ventureId).maybeSingle();
  if (error) return { satisfied: false, reason: `ventures query failed: ${error.message} (fail-closed)` };
  const evidence = data?.stack_descriptor?.publish?.evidence;
  if (!evidence || !Array.isArray(evidence.plannedActions) || evidence.plannedActions.length === 0) {
    return { satisfied: false, reason: 'no publish evidence (plannedActions) recorded → fail-closed' };
  }
  return { satisfied: true, reason: '' };
}

/**
 * Verifier registry: gate-string-substring → verifier function.
 * Lookup is case-insensitive substring match (gate strings are author-prose so
 * exact-string equality is too brittle).
 *
 * Order matters when multiple keys match the same gate string — the first
 * match wins. Keep the most-specific keys first.
 */
export const GATE_VERIFIERS = Object.freeze([
  { match: 'application deployed', verifier: verifyBuildMvpBuildPresent },
  { match: 'github repo url', verifier: verifyVentureResourceUrlsPopulated },
  // SD-LEO-FEAT-STAGE-LIVE-ANNOUNCE-001 FR-5
  { match: 'launch triggered', verifier: verifyLaunchTriggered },
  { match: 'all channels activated', verifier: verifyAllChannelsActivated },
  // SD-LEO-FEAT-STAGE-GROWTH-PLAYBOOK-001 FR-6 — Stage 26 terminal gates.
  // growth_optimization_roadmap MUST be ordered before growth_playbook
  // because 'growth_playbook' is NOT a substring of
  // 'growth_optimization_roadmap', so order doesn't actually disambiguate
  // here, but we keep the more specific (longer) match first for clarity
  // and consistency with the rest of the registry.
  { match: 'growth_optimization_roadmap', verifier: verifyGrowthOptimizationRoadmapPresent },
  { match: 'growth_playbook', verifier: verifyGrowthPlaybookPresent },
  // SD-EHG-FEAT-AUTOMATED-RESILIENT-VENTURE-001-C FR-2 — fail-closed spend-guardrail readiness.
  { match: 'spend guardrails ready', verifier: verifySpendGuardrailsReady },
  // SD-EHG-FEAT-AUTOMATED-RESILIENT-VENTURE-001-B FR-3 — fail-closed descriptor + provisioning gates.
  { match: 'stack descriptor valid', verifier: verifyStackDescriptorValid },
  { match: 'deployment target provisioned', verifier: verifyDeploymentTargetProvisioned },
  // SD-EHG-FEAT-AUTOMATED-RESILIENT-VENTURE-001-D FR-3 — fail-closed post-publish gates.
  { match: 'pages url live', verifier: verifyPagesUrlLive },
  { match: 'compute deployed', verifier: verifyComputeDeployed },
  { match: 'publish evidence recorded', verifier: verifyPublishEvidenceRecorded },
]);

/**
 * Resolve a free-text gate string to a verifier function, or null if no
 * verifier is registered. Caller treats null as "unknown gate, allow with WARN".
 *
 * @param {string} gateString
 * @returns {((ctx: VerifierContext) => Promise<VerifierResult>) | null}
 */
export function resolveVerifier(gateString) {
  if (typeof gateString !== 'string') return null;
  const lc = gateString.toLowerCase();
  for (const { match, verifier } of GATE_VERIFIERS) {
    if (lc.includes(match)) return verifier;
  }
  return null;
}
