/**
 * Claim Validity Gate - Fail-Closed Enforcement for Claimed SDs
 *
 * Three-check gate invoked before any operation that could modify a claimed SD:
 *   1. Deterministic identity — resolveOwnSession must return env_var or marker_file source
 *   2. Claim ownership — SD's claiming_session_id must match the resolved session
 *   3. Worktree isolation — process.cwd() must be inside the SD's registered worktree_path
 *
 * Used by:
 *   - scripts/sd-start.js (with allowMainRepoForAcquisition=true — sd-start creates the worktree)
 *   - scripts/modules/handoff/executors/BaseExecutor.js (no flag — handoffs must run from worktree)
 *
 * Added by SD-LEO-INFRA-FAIL-CLOSED-CLAIM-001 to close the session-identity loop.
 * See ~/.claude/plans/fluffy-crunching-sunset.md for full rationale.
 *
 * @module claim-validity-gate
 */

import path from 'path';
import { realpathSync } from 'fs';
import { execSync } from 'child_process';
import { resolveOwnSession } from './resolve-own-session.js';
import { analyzeClaimRelationship } from '../scripts/modules/sd-next/claim-analysis.js';

/**
 * Structured error for claim validity failures. Carries discriminant `reason`
 * and reason-specific fields so callers can render a human-readable banner.
 */
export class ClaimIdentityError extends Error {
  constructor({ reason, operation, sdKey, ...fields }) {
    const msg = `[claim-validity-gate] ${reason} (op=${operation}, sd=${sdKey})`;
    super(msg);
    this.name = 'ClaimIdentityError';
    this.reason = reason;
    this.operation = operation;
    this.sdKey = sdKey;
    Object.assign(this, fields);
  }

  /**
   * Render a multi-line banner suitable for printing to stderr/stdout.
   */
  toBanner() {
    const lines = [
      '',
      '═══════════════════════════════════════════════════════════════════',
      `🚫 CLAIM VALIDITY GATE BLOCKED — ${this.reason}`,
      '═══════════════════════════════════════════════════════════════════',
      `  Operation: ${this.operation}`,
      `  SD:        ${this.sdKey}`,
    ];
    if (this.mySessionId) lines.push(`  My session: ${this.mySessionId}`);
    if (this.ownerSessionId) lines.push(`  Owner session: ${this.ownerSessionId}`);
    if (this.conflicts && this.conflicts.length) {
      lines.push(`  Conflicts (${this.conflicts.length}):`);
      this.conflicts.forEach(c => {
        lines.push(`    - session_id=${c.session_id} cc_pid=${c.cc_pid || '?'} heartbeat=${c.heartbeat_at || '?'}`);
      });
    }
    if (this.expectedWorktree) {
      lines.push(`  Expected worktree: ${this.expectedWorktree}`);
      lines.push(`  Actual cwd:        ${this.actualCwd}`);
    }
    if (this.remediation) {
      lines.push('');
      lines.push('  Remediation:');
      this.remediation.split('\n').forEach(l => lines.push(`    ${l}`));
    }
    lines.push('═══════════════════════════════════════════════════════════════════');
    lines.push('');
    return lines.join('\n');
  }
}

function explainRemediation(reason) {
  switch (reason) {
    case 'ambiguous':
      return 'Multiple sessions share this terminal_id. Run `/claim list` to see all active sessions. This usually means two Claude Code instances are running on the same host without unique CLAUDE_SESSION_ID env vars.';
    case 'no_deterministic_identity':
      return 'CLAUDE_SESSION_ID env var is not set and no matching marker file was found. Restart Claude Code so the SessionStart hook can populate .claude/session-identity/. Do NOT fall back to heartbeat guessing.';
    case 'soft_block':
      return 'Claim is stale but cannot be safely auto-released. The owning process may still be alive on another host or the PID is still running. Wait for TTL expiry or manually release.';
    case 'error':
      return 'Identity resolution query failed. Check Supabase connectivity and SUPABASE_URL env var.';
    default:
      return 'Check `/claim status` and `/claim list` for current claim state.';
  }
}

/**
 * Assert that the current session has a valid claim (or permission to acquire one) for the given SD.
 *
 * @param {object} supabase - Supabase client
 * @param {string} sdKey - SD human key (e.g. SD-LEO-INFRA-FAIL-CLOSED-CLAIM-001)
 * @param {object} options
 * @param {string} options.operation - Operation label for error messages (e.g. 'sd_start', 'handoff_LEAD-TO-PLAN')
 * @param {boolean} [options.allowMainRepoForAcquisition=false] - When true, bypass the worktree isolation
 *   check. Only sd-start.js should pass this because it creates the worktree.
 * @returns {Promise<{resolved, sd, ownership: 'unclaimed'|'self'}>}
 * @throws {ClaimIdentityError}
 */
export async function assertValidClaim(supabase, sdKey, { operation, allowMainRepoForAcquisition = false } = {}) {
  if (!operation) throw new Error('assertValidClaim: operation is required');
  if (!sdKey) throw new ClaimIdentityError({ reason: 'sd_not_found', operation, sdKey: '<missing>' });

  // ── CHECK 1: deterministic identity ────────────────────────────────────
  const resolved = await resolveOwnSession(supabase, { requireDeterministic: true, warnOnFallback: false });

  if (!resolved.data) {
    throw new ClaimIdentityError({
      reason: resolved.source,
      operation,
      sdKey,
      conflicts: resolved.conflicts || [],
      remediation: explainRemediation(resolved.source)
    });
  }

  const mySessionId = resolved.data.session_id;

  // ── CHECK 2: SD claim ownership ────────────────────────────────────────
  const { data: sd, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, claiming_session_id, worktree_path, current_phase')
    .eq('sd_key', sdKey)
    .maybeSingle();

  if (sdErr) {
    throw new ClaimIdentityError({
      reason: 'error',
      operation, sdKey,
      remediation: `DB lookup failed: ${sdErr.message}`
    });
  }
  if (!sd) {
    throw new ClaimIdentityError({
      reason: 'sd_not_found',
      operation, sdKey,
      remediation: `No SD with sd_key=${sdKey} exists. Check spelling or create it first.`
    });
  }

  // Unclaimed → caller (sd-start) may acquire. Skip worktree check (no worktree yet).
  if (!sd.claiming_session_id) {
    return { resolved, sd, ownership: 'unclaimed' };
  }

  // Claimed by different session — classify relationship before deciding
  if (sd.claiming_session_id !== mySessionId) {
    const { data: ownerSession } = await supabase
      .from('v_active_sessions')
      .select('*')
      .eq('session_id', sd.claiming_session_id)
      .maybeSingle();

    const classification = analyzeClaimRelationship({
      claimingSessionId: sd.claiming_session_id,
      claimingSession: ownerSession || { heartbeat_age_seconds: 99999 },
      currentSession: resolved.data,
    });

    // FR-5: other_active → hard foreign_claim (unchanged)
    if (classification.relationship === 'other_active') {
      throw new ClaimIdentityError({
        reason: 'foreign_claim',
        operation, sdKey,
        mySessionId,
        ownerSessionId: sd.claiming_session_id,
        remediation: 'Another active Claude Code session owns this claim. Run `/claim list` to see all active claims.'
      });
    }

    // FR-4: stale_alive or stale_remote → soft block with enriched context
    if (classification.relationship === 'stale_alive' || classification.relationship === 'stale_remote') {
      throw new ClaimIdentityError({
        reason: 'soft_block',
        operation, sdKey,
        mySessionId,
        ownerSessionId: sd.claiming_session_id,
        remediation: `Claim is stale (${classification.displayLabel}, heartbeat age ${Math.round(ownerSession?.heartbeat_age_seconds || 0)}s) but cannot safely auto-release (${classification.relationship}). Wait for TTL expiry or manually release.`
      });
    }

    // FR-8: git activity grace — check for recent commits from owner
    if (classification.relationship === 'stale_dead') {
      try {
        const recentCommit = execSync('git log --oneline -1 --since="5 minutes ago" 2>/dev/null', { encoding: 'utf8', timeout: 3000 }).trim();
        if (recentCommit) {
          throw new ClaimIdentityError({
            reason: 'soft_block',
            operation, sdKey,
            mySessionId,
            ownerSessionId: sd.claiming_session_id,
            remediation: `Claim is stale_dead but recent git activity detected ("${recentCommit.slice(0, 60)}"). Grace period active — retry in 5 minutes.`
          });
        }
      } catch (e) {
        if (e instanceof ClaimIdentityError) throw e;
        // git check failed — proceed with auto-release
      }
    }

    // FR-3: stale_dead + canAutoRelease → atomic conditional UPDATE
    if (classification.canAutoRelease) {
      // FR-6: structured audit log
      const auditEntry = {
        event: 'claim_auto_release',
        releasing_session_id: mySessionId,
        prior_owner_session_id: sd.claiming_session_id,
        sd_key: sdKey,
        reason: classification.relationship,
        timestamp: new Date().toISOString(),
        pid_verified: classification.pid !== null,
      };
      console.log(JSON.stringify(auditEntry));

      const { data: released, error: releaseErr } = await supabase
        .from('strategic_directives_v2')
        .update({ claiming_session_id: mySessionId })
        .eq('sd_key', sdKey)
        .eq('claiming_session_id', sd.claiming_session_id)
        .select('sd_key')
        .maybeSingle();

      if (releaseErr || !released) {
        throw new ClaimIdentityError({
          reason: 'foreign_claim',
          operation, sdKey,
          mySessionId,
          ownerSessionId: sd.claiming_session_id,
          remediation: releaseErr ? `Auto-release failed: ${releaseErr.message}` : 'Race condition — another session claimed it first.'
        });
      }

      return { resolved, sd: { ...sd, claiming_session_id: mySessionId }, ownership: 'self' };
    }

    // Fallback: unclassified stale → foreign_claim
    throw new ClaimIdentityError({
      reason: 'foreign_claim',
      operation, sdKey,
      mySessionId,
      ownerSessionId: sd.claiming_session_id,
      remediation: `Claim relationship: ${classification.relationship}. Cannot auto-release. Run \`/claim list\` to investigate.`
    });
  }

  // ── CHECK 3: worktree isolation ────────────────────────────────────────
  // Claim is ours. Enforce that cwd is inside the SD's registered worktree.
  // Exception: sd-start.js with allowMainRepoForAcquisition=true — it creates the worktree.
  if (sd.worktree_path && !allowMainRepoForAcquisition) {
    let expectedWt;
    let actualCwd;
    try {
      expectedWt = realpathSync(sd.worktree_path);
      actualCwd = realpathSync(process.cwd());
    } catch (e) {
      // Path doesn't resolve (worktree deleted?). Fail closed with diagnostic.
      throw new ClaimIdentityError({
        reason: 'wrong_worktree',
        operation, sdKey,
        expectedWorktree: sd.worktree_path,
        actualCwd: process.cwd(),
        remediation: `Worktree path resolution failed: ${e.message}. The worktree may have been deleted. Run: npm run sd:start ${sdKey} to recreate it.`
      });
    }

    const insideWorktree = actualCwd === expectedWt || actualCwd.startsWith(expectedWt + path.sep);
    if (!insideWorktree) {
      throw new ClaimIdentityError({
        reason: 'wrong_worktree',
        operation, sdKey,
        expectedWorktree: expectedWt,
        actualCwd,
        remediation: `This SD is claimed and has a registered worktree. All work must run from inside it.\n  Run:  cd "${expectedWt}"\n  Then re-run your command.`
      });
    }
  }

  return { resolved, sd, ownership: 'self' };
}

export default { assertValidClaim, ClaimIdentityError };
