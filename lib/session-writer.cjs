/**
 * lib/session-writer.cjs — Unified helper for code paths that UPDATE
 * public.claude_sessions.
 *
 * Part of SD-LEO-INFRA-SESSION-CURRENT-BRANCH-001.
 *
 * Motivation: the claude_sessions table has 11 writer call sites across the
 * codebase. Today only lib/session-manager.mjs::updateHeartbeat() resolves
 * current_branch from git. All other writers either omit the column
 * (leaving NULL) or actively filter it out via a column whitelist
 * (scripts/hooks/lib/session-telemetry-writer.cjs). The downstream
 * branch-aware concurrency filter in
 * scripts/hooks/concurrent-session-worktree.cjs:164-169 depends on
 * current_branch being populated — when it is NULL the filter silently
 * treats the session as concurrent even when it is not.
 *
 * Contract: if the caller is running inside a git working tree, stamp the
 * current branch onto the payload. If we cannot resolve a branch (no git,
 * detached HEAD, timeout), leave the payload unchanged. Never throw — a
 * failed branch resolve must not break a heartbeat or registration write.
 *
 * Intentionally CJS so the hook scripts (.cjs) can require it with zero
 * dynamic-import ceremony. ESM callers can import named exports directly
 * on Node 18+.
 */

'use strict';

const { execSync } = require('child_process');

const BRANCH_RESOLUTION_TIMEOUT_MS = 3000;

/**
 * Resolve the current git branch via `git rev-parse --abbrev-ref HEAD`.
 *
 * Returns the branch name, or null if:
 *   - not a git working tree
 *   - git binary missing
 *   - command times out
 *   - HEAD is detached (value would be 'HEAD' — we return null to avoid
 *     persisting the literal string 'HEAD' into current_branch)
 *
 * @param {string} [cwd] — Optional working directory. Defaults to process.cwd().
 * @returns {string | null}
 */
function resolveCurrentBranch(cwd) {
  try {
    const opts = {
      timeout: BRANCH_RESOLUTION_TIMEOUT_MS,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    };
    if (cwd) opts.cwd = cwd;
    const branch = execSync('git rev-parse --abbrev-ref HEAD', opts).trim();
    if (!branch || branch === 'HEAD') return null;
    return branch;
  } catch {
    return null;
  }
}

/**
 * Return a copy of `payload` with `current_branch` set, if it can be
 * resolved and the caller has not already provided it explicitly.
 *
 * - If the payload already has a non-null current_branch, preserve it.
 * - If the payload has current_branch=null explicitly and resolution
 *   succeeds, fill it in (the null was an omission, not an assertion).
 * - If resolution fails, leave the payload unchanged.
 *
 * Pure function: does not mutate the input.
 *
 * @param {Object | null | undefined} payload
 * @param {string} [cwd]
 * @returns {Object}
 */
function stampBranch(payload, cwd) {
  const base = payload && typeof payload === 'object' ? { ...payload } : {};
  if (base.current_branch) return base;
  const branch = resolveCurrentBranch(cwd);
  if (branch) base.current_branch = branch;
  return base;
}

/**
 * markSessionNonFleet — canonical, merge-preserving write path for marking a
 * claude_sessions row non_fleet (propose-only / cannot hold a build claim).
 *
 * SD-LEO-INFRA-FIX-SESSION-REGISTER-001: prior ad-hoc remediation of rows
 * judged to be phantom/duplicate entries has full-REPLACED the metadata
 * column (`.update({ metadata: { non_fleet: true, released_reason: '...' } })`),
 * destroying unrelated fields (fleet_identity, tier_rank, auto_proceed,
 * chain_orchestrators) with no trace. This helper reads the existing
 * metadata, merges in `non_fleet: true`, and writes the human-readable
 * reason to the top-level released_reason COLUMN (not inside metadata) —
 * every other field on the row survives.
 *
 * Throws on Supabase errors rather than swallowing them: this is the
 * canonical write path, so a failure here should be visible to the caller
 * rather than silently producing a no-op remediation.
 *
 * @param {string} sessionId
 * @param {string} [reason] — human-readable note, stored in released_reason
 * @param {object} [supabaseClient] — injectable client (tests); defaults to
 *   createSupabaseServiceClient()
 * @returns {Promise<{sessionId: string, metadata: object, released_reason: string|null}>}
 */
async function markSessionNonFleet(sessionId, reason, supabaseClient) {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('markSessionNonFleet: sessionId is required');
  }

  let supabase = supabaseClient;
  if (!supabase) {
    const { createSupabaseServiceClient } = require('./supabase-client.cjs');
    supabase = createSupabaseServiceClient();
  }

  const { data: existing, error: fetchError } = await supabase
    .from('claude_sessions')
    .select('metadata')
    .eq('session_id', sessionId)
    .maybeSingle();
  if (fetchError) throw fetchError;

  const priorMetadata = existing?.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata)
    ? existing.metadata
    : {};
  const mergedMetadata = { ...priorMetadata, non_fleet: true };

  const { error: updateError } = await supabase
    .from('claude_sessions')
    .update({ metadata: mergedMetadata, released_reason: reason || null })
    .eq('session_id', sessionId);
  if (updateError) throw updateError;

  return { sessionId, metadata: mergedMetadata, released_reason: reason || null };
}

module.exports = {
  resolveCurrentBranch,
  stampBranch,
  markSessionNonFleet,
  BRANCH_RESOLUTION_TIMEOUT_MS,
};
