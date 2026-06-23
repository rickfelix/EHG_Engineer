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
import { createRequire } from 'module';
import { resolveOwnSession } from './resolve-own-session.js';
import sessionIdentitySot from './session-identity-sot.js';

// SD-REFILL-00C7GXJS: host-local PID-liveness is lazy-required (not a top-level import) so this
// FAIL-CLOSED gate can never fail to load on a transitive cc-pid-liveness issue; the consumer
// isOwnerProcessAlive() is fully fail-open.
const _require = createRequire(import.meta.url);
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

/**
 * SD-LEO-INFRA-SESSION-IDENTITY-RECONCILIATION-001 (FR-2 helper):
 * Apply IDENTITY_DRIFT_OVERRIDE iff used <3 times in the last 24h by some actor
 * (we use sdKey as the rate-limit key since session id is the very thing in drift).
 * Writes audit_log row. Returns true if override is allowed and audit landed,
 * false if rate-limit blocks. Errors propagate (fail-closed: override is auditable-or-nothing).
 *
 * @param {object} supabase
 * @param {{sdKey: string, operation: string, overrideReason: string, conflicts: Array}} ctx
 * @returns {Promise<boolean>}
 */
async function applyIdentityDriftOverride(supabase, { sdKey, operation, overrideReason, conflicts }) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: countErr } = await supabase
    .from('audit_log')
    // SD-REFILL-00EOAPP9: the live audit_log has NO `action` column (only event_type + a metadata
    // jsonb), so the prior .eq('action', ...) filter errored at runtime and the override THREW here
    // before it could ever run. Match on the real event_type column instead (mirrors the insert below).
    .select('id', { count: 'exact', head: true })
    .eq('event_type', 'identity_drift_override')
    .gte('created_at', since);
  if (countErr) {
    // Fail-closed: cannot verify rate-limit → deny override
    throw new Error(`audit_log rate-limit query failed: ${countErr.message}`);
  }
  if ((count ?? 0) >= 3) {
    return false;
  }

  // Audit row insert; identity-drift conflicts captured as JSON for forensics.
  // SD-REFILL-00EOAPP9 (the latent-bug follow-up flagged by SD-FDBK-FIX-SELF-ONLY-AUTHORIZATION-001):
  // the live audit_log table has only event_type + a `metadata` jsonb (NO action/details columns), so
  // the prior insert of {action, details} errored at runtime and threw below, breaking every override.
  // Map onto the real schema: event_type = the action, and the forensic detail goes into metadata jsonb.
  const { error: insErr } = await supabase
    .from('audit_log')
    .insert({
      event_type: 'identity_drift_override',
      entity_type: 'strategic_directive',
      entity_id: sdKey,
      severity: 'warning',
      metadata: {
        action: 'identity_drift_override',
        sd_key: sdKey,
        operation,
        reason: overrideReason,
        conflicts,
        applied_at: new Date().toISOString(),
      },
    });
  if (insErr) {
    // Fail-closed: cannot audit → deny override
    throw new Error(`audit_log insert failed: ${insErr.message}`);
  }

  // Telemetry breadcrumb to stderr; structured log
  process.stderr.write(
    `[claim-validity-gate] identity.override.applied sd_key=${sdKey} op=${operation} reason="${overrideReason.slice(0, 80)}" remaining=${Math.max(0, 3 - (count ?? 0) - 1)}\n`
  );
  return true;
}

// SD-FDBK-FIX-SELF-ONLY-AUTHORIZATION-001: the build-forbidden predicate lives in
// a shared CJS module so the ESM gate (handoff-time tripwire, CHECK 1.5) and the
// CJS worker self-claim path (worker-checkin.cjs acquisition guard) consume ONE
// source — not duplicated (see SD-PAT-FIX-WRITER-CONSUMER-ASYMMETRY-001).
// Re-exported here for back-compat with existing importers/tests.
import { isBuildForbiddenSession } from './claim/build-forbidden-session.cjs';
export { isBuildForbiddenSession };
// SD-LEO-INFRA-CLAIM-SILENCE-CONSUME-VERIFY-001 (SEAM 1): the shared CONSUME-side silence
// predicate — a within-cap armed silence window means the holder is legitimately quiet, NOT dead.
import { isWithinArmedSilenceWindow } from './fleet/silence-cap.cjs';

// ── Liveness predicate (SD-LEO-INFRA-CLAIM-VALIDITY-ISALIVE-LAG-001 FR-1) ─────
// claude_sessions.is_alive LAGS heartbeat_at: a live, actively-heartbeating /loop
// worker can transiently read is_alive=false, and the old predicate reaped its claim
// on that ALONE — causing claim/release thrash on the same SD. heartbeat_at is the
// liveness source of truth: an is_alive===false owner is DEAD only once its heartbeat
// has ALSO gone stale beyond the claim TTL.
/** Documented claim_sd TTL (~15 min) — see the foreign_claim remediation text below. */
export const CLAIM_TTL_MS = 900_000;

/**
 * @param {string|number|Date|null|undefined} heartbeatAt
 * @param {number} nowMs
 * @param {number} [ttlMs=CLAIM_TTL_MS]
 * @returns {boolean} true when the heartbeat is missing/unparseable or older than ttlMs.
 *   FAIL-OPEN: a missing/invalid heartbeat is treated as STALE so an is_alive=false owner
 *   with no heartbeat is still reaped (genuinely dead). A non-finite nowMs cannot judge
 *   staleness, so it returns false (not stale) rather than false-reap a live-looking owner.
 */
export function isHeartbeatStale(heartbeatAt, nowMs, ttlMs = CLAIM_TTL_MS) {
  if (heartbeatAt == null) return true;
  const ts = heartbeatAt instanceof Date ? heartbeatAt.getTime() : new Date(heartbeatAt).getTime();
  if (!Number.isFinite(ts)) return true;
  if (!Number.isFinite(nowMs)) return false;
  return (nowMs - ts) > ttlMs;
}

/**
 * Pure liveness verdict for a claim-owner row (SD-LEO-INFRA-CLAIM-VALIDITY-ISALIVE-LAG-001 FR-1).
 * DEAD when: owner is missing, status is 'stale'/'released', OR is_alive===false AND the
 * heartbeat is stale beyond ttlMs. A live-but-lagging owner (is_alive===false but a FRESH
 * heartbeat) is NOT dead — this is what stops the thrash. Preserves the prior fail-open
 * behavior for the missing-owner and explicit-lifecycle-status cases.
 * @param {{status?:string, is_alive?:boolean, heartbeat_at?:any}|null|undefined} owner
 * @param {number} nowMs
 * @param {number} [ttlMs=CLAIM_TTL_MS]
 * @returns {boolean}
 */
export function ownerIsDeadByLiveness(owner, nowMs, ttlMs = CLAIM_TTL_MS) {
  if (!owner) return true;
  if (owner.status === 'stale' || owner.status === 'released') return true;
  if (owner.is_alive === false) return isHeartbeatStale(owner.heartbeat_at, nowMs, ttlMs);
  return false;
}

/**
 * SD-REFILL-00C7GXJS: pure release decision for a peer that finds a FOREIGN claim. A worker running a
 * long Task()/Agent sub-agent review (e.g. 2 parallel reviews ~15min) emits NO heartbeat — sub-agents
 * don't heartbeat — so within the ~15min claim TTL its heartbeat goes stale AND a sweep may flip
 * is_alive=false, making a LIVE worker look dead (ownerIsDead=true). Reaping its claim mid-build caused
 * GATE_CLAIM_VALIDITY_FAILED + deconfliction churn (hit 2x this session). The PID-ALIVE escape fixes it:
 * if the owner's PROCESS is verifiably running (host-local marker), it is NOT reaped regardless of the
 * heartbeat/is_alive lag — process liveness is the strongest signal. sd_key DRIFT is orthogonal (a real
 * release signal) and always releases. Armed-silence and PID-alive only ADD protection; an unresolvable
 * PID (cross-host / no marker) → ownerPidAlive=false → today's behavior (fail-open, no regression).
 * @param {{ownerHasSdKeyDrifted?:boolean, ownerIsDead?:boolean, ownerIsSilenced?:boolean, ownerPidAlive?:boolean}} args
 * @returns {boolean} true ⇒ release/reclaim the foreign claim; false ⇒ yield (owner keeps it).
 */
export function shouldReleaseStaleOwner({ ownerHasSdKeyDrifted, ownerIsDead, ownerIsSilenced, ownerPidAlive } = {}) {
  if (ownerHasSdKeyDrifted) return true;                       // sd_key moved away — a real release signal
  return Boolean(ownerIsDead) && !ownerIsSilenced && !ownerPidAlive;
}

/** Host-local: is the owner session's Claude Code PROCESS still running? Best-effort / fail-open
 *  (any error, an unknown session, or a cross-host owner → false → no added protection). */
function isOwnerProcessAlive(ownerSessionId) {
  if (!ownerSessionId) return false;
  try {
    const { getMarkerSessionIds } = _require('./fleet/cc-pid-liveness.cjs');
    const map = getMarkerSessionIds();
    const entry = map && map[ownerSessionId];
    return Boolean(entry && entry.alive);
  } catch { return false; }
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
    case 'non_fleet_build_forbidden':
      return 'This session is marked non_fleet / role=adam (propose-only per CONST-002) and may not hold a BUILD claim. Adam proposes work via the decision queue; only fleet worker sessions build SDs. If this is a genuine fleet worker, clear metadata.non_fleet / metadata.role on claude_sessions for this session_id.';
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
      // SD-LEO-INFRA-SESSION-IDENTITY-RECONCILIATION-001 (FR-2): IDENTITY_DRIFT_OVERRIDE
      // narrow audited escape hatch for genuine session-identity disagreement only —
      // does NOT bypass foreign_claim, sd_not_found, or wrong_worktree (those flow through
      // separate paths below this branch). Per-session 3-uses/24h rate limit forces operator
      // to either fix the drift or escalate within 1 day. Bypass-validation does NOT apply
      // because identity drift is a data-integrity invariant, not a quality threshold.
      const overrideReason = process.env.IDENTITY_DRIFT_OVERRIDE;
      if (overrideReason && overrideReason.trim().length > 0
          && sotResult.agreement?.reason === 'disagreement') {
        const overrideOk = await applyIdentityDriftOverride(supabase, {
          sdKey, operation, overrideReason: overrideReason.trim(),
          conflicts: sotResult.agreement?.conflicts || [],
        });
        if (overrideOk) {
          // Override applied + audited; fall through to CHECK 2 (claim ownership)
          // so foreign_claim/wrong_worktree continue to be enforced.
        } else {
          throw new ClaimIdentityError({
            reason: 'identity_drift_override_rate_limited',
            operation,
            sdKey,
            remediation: 'IDENTITY_DRIFT_OVERRIDE has been used 3+ times in the last 24h for this session. Resolve the underlying identity drift (run reconcileAtBoot or restart the SessionStart hook) before further overrides.',
          });
        }
      } else {
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

  // ── CHECK 1.5: non_fleet / role=adam build-claim rejection ─────────────
  // SD-FDBK-FIX-SELF-ONLY-AUTHORIZATION-001 (feedback a159d1ec): Adam and other
  // non_fleet sessions are propose-only (CONST-002) and must NEVER hold a build
  // claim. The gate previously had no such guard, so an Adam session
  // (metadata.role=adam, non_fleet=true) held claiming_session_id on a build
  // child. Reject here — between identity and ownership — so every handoff and
  // sd-start path is covered. Fail-safe: only an EXPLICIT non_fleet=true /
  // role=adam triggers rejection; missing metadata is treated as a normal fleet
  // session (never broadens rejection to legitimate workers). Metadata comes
  // from the already-resolved session row (resolveOwnSession selects metadata) —
  // no extra DB round trip.
  if (isBuildForbiddenSession(resolved.data.metadata)) {
    throw new ClaimIdentityError({
      reason: 'non_fleet_build_forbidden',
      operation,
      sdKey,
      remediation: explainRemediation('non_fleet_build_forbidden'),
    });
  }

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
      .select('status, is_alive, sd_key, expected_silence_until, heartbeat_at')
      .eq('session_id', sd.claiming_session_id)
      .maybeSingle();

    // SD-LEO-INFRA-CLAIM-VALIDITY-ISALIVE-LAG-001 FR-1: trust heartbeat_at over the lagging
    // is_alive column — an is_alive===false owner is dead ONLY when its heartbeat is ALSO
    // stale (> CLAIM_TTL_MS); a live-but-lagging owner is NOT reaped (stops the thrash).
    // Missing owner + status stale/released still mark dead (fail-open via ownerIsDeadByLiveness).
    const ownerIsDead = ownerIsDeadByLiveness(owner, Date.now());
    // SD-LEO-INFRA-CLAIM-SILENCE-CONSUME-VERIFY-001 (SEAM 1, PRIMARY): a parked /loop worker
    // arms expected_silence_until and lets its heartbeat lapse legitimately — appearing "dead"
    // here. Honor a within-cap armed silence window exactly as the sweep does (ALIVE_SOURCE_SIDE):
    // suppress the dead-owner auto-release and fall through to the foreign_claim yield below, so a
    // peer never clears a LIVE claim mid-silence. sd_key DRIFT is orthogonal (a genuine release
    // signal) and is NOT suppressed. Fail-open: an absent/expired/beyond-cap window => not silenced
    // => today's release behavior (the guard only ADDS protection).
    const ownerIsSilenced = isWithinArmedSilenceWindow(owner?.expected_silence_until, Date.now());
    // SD-REFILL-00C7GXJS: PID-ALIVE escape — a worker mid long Task()/Agent sub-agent review emits no
    // heartbeat (sub-agents don't heartbeat) so its claim can look dead within the ~15min TTL, but its
    // PROCESS is still running. If the owner's process is verifiably alive (host-local marker), do NOT
    // reap its claim — this stops the recurring mid-build reclaim + deconfliction churn. Fail-open: an
    // unresolvable/cross-host owner → false → today's behavior.
    const ownerPidAlive = isOwnerProcessAlive(sd.claiming_session_id);
    // SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001 FR-2: sd_key drift fallthrough — when
    // owner's sd_key has drifted away from sdKey (or is null), treat as same-class
    // as ownerIsDead. detectSdKeyDrift returns 'drift'|'aligned'|'unknown'.
    const sdKeyDriftVerdict = detectSdKeyDrift(owner, sdKey);
    const ownerHasSdKeyDrifted = sdKeyDriftVerdict === 'drift';

    // SEAM 1: drift always releases; a dead-looking owner releases ONLY if not within an armed
    // silence window (a within-cap silenced holder yields to foreign_claim instead of being reaped).
    if (shouldReleaseStaleOwner({ ownerHasSdKeyDrifted, ownerIsDead, ownerIsSilenced, ownerPidAlive })) {
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
