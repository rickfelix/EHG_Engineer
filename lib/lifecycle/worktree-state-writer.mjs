/**
 * Single-owner writer for claude_sessions.worktree_path / worktree_branch.
 *
 * Part of SD-LEO-INFRA-LEO-INFRA-SESSION-001 (FR-2). All writes to the
 * worktree-state columns must route through this module so the per-row
 * (sd_key, worktree_path, worktree_branch) invariant cannot be violated by
 * a hand-rolled UPDATE elsewhere in the codebase.
 *
 * The CHECK constraint (FR-5) is the ultimate runtime guard; this writer is
 * the single development-time choke point that lets us grep-prove no other
 * writer exists.
 */

import { createSupabaseServiceClient } from '../../scripts/lib/supabase-connection.js';

/**
 * Emit the structured audit log line for a writer call.
 * One JSON object per line on stdout — survives log scrapers and is greppable.
 */
function emitAuditLog(event) {
  try {
    process.stdout.write(JSON.stringify(event) + '\n');
  } catch {
    // Audit-log write is best-effort. A failure here must not abort the DB write.
  }
}

/**
 * Write worktree state for a session that is ACTIVELY HOLDING a claim.
 *
 * Caller (typically sd-start.js after createWorktree succeeds) is responsible
 * for ensuring sd_key is already set on the session row. This writer does not
 * mutate sd_key; it only sets worktree_path and worktree_branch.
 *
 * @param {string} sessionId    - claude_sessions.session_id (text PK)
 * @param {string} sdKey        - The SD currently held (passed for audit only;
 *                                this writer does NOT update sd_key)
 * @param {string} worktreePath - Absolute path to the .worktrees/<SD-KEY> dir
 * @param {string} worktreeBranch - feat/<SD-KEY> branch name
 * @param {object} [opts]
 * @param {object} [opts.supabase] - Injectable Supabase client (for tests).
 *                                   When omitted, a service-role client is
 *                                   created via createSupabaseServiceClient().
 * @returns {Promise<{success: boolean, reason: string}>}
 */
export async function writeWorktreeState(sessionId, sdKey, worktreePath, worktreeBranch, opts = {}) {
  if (!sessionId) {
    return { success: false, reason: 'Missing sessionId' };
  }
  if (!worktreePath || !worktreeBranch) {
    return { success: false, reason: 'Missing worktreePath or worktreeBranch (use clearWorktreeState to NULL them)' };
  }

  const supabase = opts.supabase || await createSupabaseServiceClient('engineer');

  try {
    const { data, error } = await supabase
      .from('claude_sessions')
      .update({
        worktree_path: worktreePath,
        worktree_branch: worktreeBranch
      })
      .eq('session_id', sessionId)
      .select('session_id, sd_key, worktree_path, worktree_branch');

    if (error) {
      return { success: false, reason: `DB error: ${error.message}` };
    }

    if (!data || data.length === 0) {
      return { success: false, reason: `Session ${sessionId} not found` };
    }

    emitAuditLog({
      event: 'worktree_state_write',
      session_id: sessionId,
      sd_key: sdKey,
      op: 'write',
      path: worktreePath,
      branch: worktreeBranch,
      ts: new Date().toISOString()
    });

    return { success: true, reason: `Wrote worktree state for ${sessionId}` };
  } catch (err) {
    return { success: false, reason: `Exception: ${err.message}` };
  }
}

/**
 * Clear worktree state for a session that is RELEASING a claim.
 *
 * Sets worktree_path=NULL and worktree_branch=NULL. Does NOT touch sd_key —
 * the caller (claim-swapper.releaseClaim or claim-swapper.swapClaim takeover
 * branch) is responsible for the sd_key transition. Decoupling means a
 * release path that already nulls sd_key elsewhere can call us without
 * needing to repeat that logic.
 *
 * @param {string} sessionId
 * @param {object} [opts]
 * @param {object} [opts.supabase] - Injectable Supabase client.
 * @param {string} [opts.reason]   - Audit-log context (e.g., 'release_claim',
 *                                   'takeover_prior_session', 'rollback').
 * @returns {Promise<{success: boolean, reason: string}>}
 */
export async function clearWorktreeState(sessionId, opts = {}) {
  if (!sessionId) {
    return { success: false, reason: 'Missing sessionId' };
  }

  const supabase = opts.supabase || await createSupabaseServiceClient('engineer');

  try {
    const { data, error } = await supabase
      .from('claude_sessions')
      .update({
        worktree_path: null,
        worktree_branch: null
      })
      .eq('session_id', sessionId)
      .select('session_id, sd_key, worktree_path, worktree_branch');

    if (error) {
      return { success: false, reason: `DB error: ${error.message}` };
    }

    // 0 rows is acceptable — caller may have already deleted the session row,
    // or the session never existed (idempotent clear). Log it but return success.

    emitAuditLog({
      event: 'worktree_state_write',
      session_id: sessionId,
      sd_key: null,
      op: 'clear',
      path: null,
      branch: null,
      reason: opts.reason || null,
      rows_affected: data ? data.length : 0,
      ts: new Date().toISOString()
    });

    return { success: true, reason: `Cleared worktree state for ${sessionId} (${data ? data.length : 0} rows)` };
  } catch (err) {
    return { success: false, reason: `Exception: ${err.message}` };
  }
}
