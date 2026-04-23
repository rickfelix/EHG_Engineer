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
import sessionIdentitySot from './session-identity-sot.js';

// ── Worktree validation helpers (SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-074) ────

/** Module-level cache for isRealWorktree results (10s TTL). */
export const _worktreeCache = new Map();
const WORKTREE_CACHE_TTL_MS = 10000;

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
      timeout: 5000,
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
      timeout: 5000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
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
      return 'CLAUDE_SESSION_ID env var is not set and no matching marker file was found.\n  Quick fix: prefix all handoff.js calls with the session ID from sd-start output:\n    CLAUDE_SESSION_ID=<uuid-from-sd-start> node scripts/handoff.js execute <PHASE> <SD-ID>\n  Permanent fix: Restart Claude Code so the SessionStart hook can populate .claude/session-identity/. Do NOT fall back to heartbeat guessing.';
    case 'wrong_worktree':
      return 'Handoff is running from the wrong directory. Fix:\n  1. cd to the SD\'s worktree: cd .worktrees/<SD-KEY>  (path shown in "Expected worktree" above)\n  2. Re-run the handoff from there: CLAUDE_SESSION_ID=<uuid> node scripts/handoff.js execute <PHASE> <SD-ID>\n  In fleet execution, each child SD must run from its own worktree — never from the parent orchestrator\'s worktree.';
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
  // SD-LEO-PROTOCOL-INFRASTRUCTURE-RELATIONSHIPAWARE-ORCH-001-B (FR-2, FR-3):
  // When SESSION_IDENTITY_SOT_ENABLED is set, additionally require that all three
  // identity sources (canonical marker, env var, /current pointer) agree.
  // Single-source-present is treated as valid (FR-2). Two-or-more-present-and-disagree
  // fails closed with a clear remediation (FR-3). When the flag is off, behavior is
  // unchanged — we only consult resolveOwnSession as before.
  if (sessionIdentitySot.isEnabled()) {
    const repoRoot = sessionIdentitySot.discoverRepoRoot() || undefined;
    const sotResult = sessionIdentitySot.validateSourcesAgree({ repoRoot });
    if (!sotResult.ok) {
      throw new ClaimIdentityError({
        reason: 'no_deterministic_identity',
        operation,
        sdKey,
        conflicts: (sotResult.agreement?.conflicts || []).map(c => ({
          session_id: c.value, cc_pid: null, heartbeat_at: null, source: c.source,
        })),
        remediation: sotResult.remediation || explainRemediation('no_deterministic_identity'),
      });
    }
  }

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
    let worktreeCleared = false;

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
        // SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-094: Self-heal stale worktree paths.
        // Instead of blocking the handoff, clear the stale path from DB and proceed.
        // The worktree was already cleaned up (auto-cleanup for no-change worktrees),
        // so requiring it to exist blocks all subsequent handoffs unnecessarily.
        console.warn(
          `[claim-validity-gate] Stale worktree cleared for ${sdKey}: ${sd.worktree_path} no longer exists. Proceeding without worktree isolation.`
        );
        try {
          await supabase
            .from('strategic_directives_v2')
            .update({ worktree_path: null })
            .eq('sd_key', sdKey);
        } catch { /* non-fatal — DB update best-effort */ }
        worktreeCleared = true;
      }
    }

    // Step 3b: Verify cwd is inside the (possibly recovered) worktree
    // Skip if worktree was cleared (stale path self-healed above)
    if (!worktreeCleared) {
      // Step 3b only when worktree is still valid (not self-healed)
      let expectedWt;
      let actualCwd;
      try {
        expectedWt = realpathSync(effectiveWorktreePath);
        actualCwd = realpathSync(process.cwd());
      } catch (e) {
        // SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-096: Self-heal on path resolution failure.
        // Worktree directory was deleted (merge/cleanup). Clear path and proceed.
        console.warn(`[claim-validity-gate] Worktree path resolution failed for ${sdKey}: ${e.message}. Clearing stale path.`);
        try {
          await supabase.from('strategic_directives_v2').update({ worktree_path: null }).eq('sd_key', sdKey);
        } catch { /* non-fatal */ }
        worktreeCleared = true;
      }

      // Only check path when worktree is still valid (not self-healed)
      if (!worktreeCleared && expectedWt && actualCwd) {
        // Normalize paths to lowercase on Windows (case-insensitive filesystem) and
        // ensure consistent separators before comparison to prevent false wrong_worktree errors.
        const normalize = (p) => process.platform === 'win32' ? p.replace(/\//g, '\\').toLowerCase() : p;
        const normalExpected = normalize(expectedWt);
        const normalActual = normalize(actualCwd);
        const insideWorktree = normalActual === normalExpected || normalActual.startsWith(normalExpected + path.sep);
        if (!insideWorktree) {
          // SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-121: Auto-resolve worktree instead of blocking.
          // The worktree is confirmed to exist (isRealWorktree passed at step 3a).
          // chdir to the correct worktree so downstream operations target the right branch.
          try {
            process.chdir(expectedWt);
            console.warn(
              `[claim-validity-gate] ⚠️  Auto-resolved worktree for ${sdKey}: ` +
              `was in ${actualCwd}, now in ${expectedWt}. ` +
              `Tip: cd to the worktree before running handoff to avoid this warning.`
            );
          } catch (cdErr) {
            // chdir failed — fall back to original blocking behavior
            throw new ClaimIdentityError({
              reason: 'wrong_worktree',
              operation, sdKey,
              expectedWorktree: expectedWt,
              actualCwd,
              remediation: `This SD is claimed and has a registered worktree. All work must run from inside it.\n  Run:  cd "${expectedWt}"\n  Then re-run your handoff command with the session prefix:\n    CLAUDE_SESSION_ID=<uuid> node scripts/handoff.js execute <PHASE> ${sdKey}\n  Fleet note: in parallel execution each child SD must run from its OWN worktree,\n  not from the parent orchestrator's worktree or the main repo root.`
            });
          }
        }
      }
    }
  }

  return { resolved, sd, ownership: 'self' };
}

export default { assertValidClaim, ClaimIdentityError };
