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
    .select('id, artifact_data')
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
        + `S19->S20 requires evidence-based completion (a registered deployment URL alone does not `
        + `prove the build is done). Supply a verified build_tasks_complete >= ${completion.total}.`,
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
