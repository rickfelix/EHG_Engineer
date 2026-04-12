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
import { realpathSync, existsSync, readdirSync } from 'fs';
import { execSync } from 'child_process';
import { resolveOwnSession } from './resolve-own-session.js';

// ── Worktree validation helpers (SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-074) ────

/** Module-level cache for isRealWorktree results (2s TTL). */
export const _worktreeCache = new Map();
const WORKTREE_CACHE_TTL_MS = 2000;

/**
 * Check if a path is a registered git worktree by querying `git worktree list --porcelain`.
 * Memoized with 2s TTL to avoid repeated subprocess calls during a single handoff.
 *
 * @param {string} worktreePath - Absolute path to check
 * @returns {boolean} true if path is in git worktree list
 */
export function isRealWorktree(worktreePath) {
  const cached = _worktreeCache.get(worktreePath);
  if (cached && Date.now() - cached.ts < WORKTREE_CACHE_TTL_MS) return cached.val;

  let result = false;
  try {
    const output = execSync('git worktree list --porcelain', {
      timeout: 2000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    // Porcelain format: "worktree /absolute/path\n" lines
    const registeredPaths = output
      .split('\n')
      .filter(l => l.startsWith('worktree '))
      .map(l => {
        try { return realpathSync(l.slice('worktree '.length).trim()); } catch { return null; }
      })
      .filter(Boolean);

    let normalizedInput;
    try { normalizedInput = realpathSync(worktreePath); } catch { normalizedInput = null; }
    result = normalizedInput != null && registeredPaths.includes(normalizedInput);
  } catch {
    // execSync timeout or git error — treat as not a real worktree
    result = false;
  }

  _worktreeCache.set(worktreePath, { val: result, ts: Date.now() });
  return result;
}

/**
 * Attempt to recover a stale worktree_path by scanning .worktrees/<SD-KEY>/.
 * Returns the recovered path or null.
 */
function tryRecoverWorktreePath(sdKey) {
  try {
    // Find git root
    const gitRoot = execSync('git rev-parse --show-toplevel', {
      timeout: 2000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const worktreeDir = path.join(gitRoot, '.worktrees', sdKey);
    if (existsSync(worktreeDir) && isRealWorktree(worktreeDir)) {
      return worktreeDir;
    }
  } catch { /* recovery failed */ }
  return null;
}

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

  // Claimed by another active session → HARD STOP
  if (sd.claiming_session_id !== mySessionId) {
    throw new ClaimIdentityError({
      reason: 'foreign_claim',
      operation, sdKey,
      mySessionId,
      ownerSessionId: sd.claiming_session_id,
      remediation: 'Another Claude Code session owns this claim. Run `/claim list` to see all active claims. If the owning session is legitimately done, run `/claim release` from it. If you believe the claim is stale, wait for TTL expiry (15 min) or have the owner release it.'
    });
  }

  // ── CHECK 3: worktree isolation ────────────────────────────────────────
  // Claim is ours. Enforce that cwd is inside the SD's registered worktree.
  // Exception: sd-start.js with allowMainRepoForAcquisition=true — it creates the worktree.
  if (sd.worktree_path && !allowMainRepoForAcquisition) {
    let effectiveWorktreePath = sd.worktree_path;

    // Step 3a: Validate stored path is a real git worktree (not phantom/stale)
    if (!isRealWorktree(effectiveWorktreePath)) {
      // Attempt auto-recovery: scan .worktrees/<SD-KEY>/
      const recovered = tryRecoverWorktreePath(sdKey);
      if (recovered) {
        // Update DB with recovered path (idempotent — only if different)
        try {
          const resolvedRecovered = realpathSync(recovered);
          if (resolvedRecovered !== sd.worktree_path) {
            await supabase
              .from('strategic_directives_v2')
              .update({ worktree_path: resolvedRecovered })
              .eq('sd_key', sdKey);
          }
          effectiveWorktreePath = resolvedRecovered;
        } catch {
          effectiveWorktreePath = recovered;
        }
      } else {
        // Recovery failed — worktree is truly stale/deleted
        throw new ClaimIdentityError({
          reason: 'stale_worktree',
          operation, sdKey,
          expectedWorktree: sd.worktree_path,
          actualCwd: process.cwd(),
          remediation: `Registered worktree at ${sd.worktree_path} is no longer a valid git worktree (removed or corrupted).\n  Run:  npm run sd:start ${sdKey}\n  This will recreate the worktree and update the database.`
        });
      }
    }

    // Step 3b: Verify cwd is inside the (possibly recovered) worktree
    let expectedWt;
    let actualCwd;
    try {
      expectedWt = realpathSync(effectiveWorktreePath);
      actualCwd = realpathSync(process.cwd());
    } catch (e) {
      throw new ClaimIdentityError({
        reason: 'wrong_worktree',
        operation, sdKey,
        expectedWorktree: effectiveWorktreePath,
        actualCwd: process.cwd(),
        remediation: `Worktree path resolution failed: ${e.message}.\n  Run:  npm run sd:start ${sdKey}\n  This will recreate the worktree.`
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
