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
// SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001 FR-2: sd_key drift fallthrough mirrors
// the same-host stale-heartbeat auto-release pattern at this file's lines 250-277.
import { detectSdKeyDrift } from './claim-lifecycle-release.mjs';

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
    // SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-126 (PAT-RETRO/HF-EXECTOPLAN-0bda95fe):
    // If resolveOwnSession reports demotedMatches, surface the specific remediation
    // inline — the generic 'no_deterministic_identity' guidance omits the fact that
    // a partial match existed and was deliberately ignored.
    let remediation = explainRemediation(resolved.source);
    if (Array.isArray(resolved.demotedMatches) && resolved.demotedMatches.length > 0) {
      const dm = resolved.demotedMatches[0];
      remediation =
        `terminal_id matched session ${dm.session_id} but was demoted (reason: ${dm.reason}).\n` +
        `  Specific remediation: ${dm.remediation}\n` +
        `  Generic context: ${remediation}`;
    }
    throw new ClaimIdentityError({
      reason: resolved.source,
      operation,
      sdKey,
      conflicts: resolved.conflicts || [],
      demotedMatches: resolved.demotedMatches || [],
      remediation
    });
  }

  const mySessionId = resolved.data.session_id;

  // ── CHECK 2: SD claim ownership ────────────────────────────────────────
  const { data: sd, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, claiming_session_id, worktree_path, current_phase, status, cancellation_reason')
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

  // SD-LEO-INFRA-BLOCK-CLAIMS-CANCELLED-001 FR-2: cancelled SDs cannot have
  // their claim validated. Three-layer defense (layer 2 of 3); claim-guard
  // pre-acquire (FR-1) and the BEFORE-UPDATE PG trigger (FR-5) are the other
  // layers. Throws BEFORE worktree validation since a cancelled SD's worktree
  // status is irrelevant to the refusal.
  if (sd.status === 'cancelled') {
    throw new ClaimIdentityError({
      reason: 'sd_cancelled',
      operation, sdKey,
      remediation: `SD has been cancelled (reason: ${sd.cancellation_reason || 'not recorded'}). Pick a different SD or restore the SD before claiming.`
    });
  }

  // Unclaimed → caller (sd-start) may acquire. Skip worktree check (no worktree yet).
  if (!sd.claiming_session_id) {
    return { resolved, sd, ownership: 'unclaimed' };
  }

  // Claimed by another session — check if owner is alive before throwing.
  // QF-20260509-711: Layer 2 of writer/consumer asymmetry RCA (PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001).
  // PG-side release functions miss claiming_session_id; if the owner is stale/released/missing, the claim is
  // an orphan and we auto-release it idempotently (mirrors self-heal pattern at lines 287, 312, 333).
  if (sd.claiming_session_id !== mySessionId) {
    // SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001 FR-2: also fetch owner.sd_key to detect
    // sd_key tag drift (peer's sd_key has moved away from this SD — peer is no longer
    // working it). sd_key is the source-of-truth, NOT claiming_session_id.
    const { data: owner } = await supabase
      .from('claude_sessions')
      .select('status, is_alive, sd_key')
      .eq('session_id', sd.claiming_session_id)
      .maybeSingle();

    const ownerIsDead = !owner || owner.status === 'stale' || owner.status === 'released' || owner.is_alive === false;
    // SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001 FR-2: sd_key drift fallthrough — when
    // owner's sd_key has drifted away from sdKey (or is null), treat as same-class
    // as ownerIsDead. detectSdKeyDrift returns 'drift'|'aligned'|'unknown'.
    const sdKeyDriftVerdict = detectSdKeyDrift(owner, sdKey);
    const ownerHasSdKeyDrifted = sdKeyDriftVerdict === 'drift';

    if (ownerIsDead || ownerHasSdKeyDrifted) {
      // Idempotent canonical claim-release — WHERE-clause restricts to the orphan pair so a fresh claim
      // acquired between detection and write cannot be overwritten.
      await supabase
        .from('strategic_directives_v2')
        .update({ claiming_session_id: null, is_working_on: false, active_session_id: null })
        .eq('sd_key', sdKey)
        .eq('claiming_session_id', sd.claiming_session_id);
      // SD-LEO-INFRA-CROSS-HOST-CONCURRENT-001 (FR-5): SIBLING RELEASE SITE 2/4 —
      // co-clear file_claim_locks alongside the claiming_session_id clear above.
      try {
        const { releaseClaimsByHolder } = await import('../scripts/hooks/lib/file-claim-guard.cjs');
        await releaseClaimsByHolder({ holderSessionId: sd.claiming_session_id });
      } catch { /* fail-open */ }
      // SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001 FR-2 (AC-2.2): distinct telemetry —
      // 'sd_key_drift' reason channel separate from stale/released/missing.
      const releaseReason = ownerIsDead
        ? (owner?.status ?? 'missing')
        : 'sd_key_drift';
      console.warn(
        `[claim-validity-gate] Auto-released orphaned claim on ${sdKey}: owner ${sd.claiming_session_id} ` +
        `(reason=${releaseReason}, sd_key_drift=${sdKeyDriftVerdict}, owner.sd_key=${owner?.sd_key ?? 'null'}, ` +
        `is_alive=${owner?.is_alive ?? 'n/a'}). Proceeding as unclaimed.`
      );
      // SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001 FR-2 (AC-2.6): expanded return shape
      // for sd_key drift case so callers can distinguish drift from staleness.
      return {
        resolved,
        sd: { ...sd, claiming_session_id: null },
        ownership: 'unclaimed',
        reason: releaseReason,
        released_owner_session: sd.claiming_session_id,
        released_owner_sd_key: owner?.sd_key ?? null,
      };
    }

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
              'Tip: cd to the worktree before running handoff to avoid this warning.'
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
