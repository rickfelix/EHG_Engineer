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
    .select('id')
    .eq('venture_id', ventureId)
    .eq('artifact_type', 'build_mvp_build')
    .eq('is_current', true)
    .limit(1)
    .maybeSingle();
  if (error) {
    return { satisfied: false, reason: `venture_artifacts query failed: ${error.message}` };
  }
  return data
    ? { satisfied: true, reason: '' }
    : { satisfied: false, reason: 'build_mvp_build artifact missing or not is_current' };
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
