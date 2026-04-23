/**
 * Session Identity Single Source of Truth (SOT)
 *
 * Implements SD-LEO-PROTOCOL-INFRASTRUCTURE-RELATIONSHIPAWARE-ORCH-001-B.
 *
 * Three identity sources exist in the system:
 *   1. Canonical marker: .claude/session-identity/<sid>.json  (SOT)
 *   2. Derived env var:  process.env.CLAUDE_SESSION_ID
 *   3. Derived pointer:  .claude/session-identity/current
 *
 * This module centralizes reading them, reconciling them atomically at boot,
 * and checking agreement when the claim-validity-gate runs. All new behavior
 * is gated by the SESSION_IDENTITY_SOT_ENABLED feature flag (default OFF).
 *
 * Design invariants:
 *  - Canonical marker file is WRITE-ONCE per session; it is the source of truth.
 *  - Env var + /current pointer are DERIVED and may be rewritten by sd-start
 *    as part of reconciliation.
 *  - All filesystem writes use tmp + fsync + rename for crash safety (TR-1).
 *  - Reconciliation acquires .lock to prevent concurrent writers (TR-2).
 *  - checkAgreement() returns PASS if all *present* sources agree or if only
 *    one source is present. It returns FAIL only when two or more sources are
 *    present and disagree (FR-2, FR-3).
 *
 * @module session-identity-sot
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// ── Paths ────────────────────────────────────────────────────────────────────

export const FLAG_NAME = 'SESSION_IDENTITY_SOT_ENABLED';
const LOCK_FILENAME = '.lock';
const CURRENT_POINTER_FILENAME = 'current';
const LOCK_STALE_MS = 30 * 1000;  // any lock older than 30s is considered dead
const LOCK_ACQUIRE_TIMEOUT_MS = 5000;
const LOCK_RETRY_MS = 50;

/**
 * Resolve the absolute path of .claude/session-identity/ for a given repo root.
 * When called without args, walks up from cwd to find the nearest .claude/.
 *
 * @param {string} [repoRoot] - Optional repo root override
 * @returns {string} Absolute path to the session-identity directory
 */
export function getIdentityDir(repoRoot) {
  if (repoRoot) {
    return path.resolve(repoRoot, '.claude', 'session-identity');
  }
  // Walk up from cwd to find .claude/
  let dir = process.cwd();
  const { root } = path.parse(dir);
  while (dir && dir !== root) {
    const candidate = path.join(dir, '.claude', 'session-identity');
    if (fs.existsSync(path.join(dir, '.claude'))) {
      return candidate;
    }
    dir = path.dirname(dir);
  }
  // Last-resort fallback: assume main repo convention
  return path.resolve(process.cwd(), '.claude', 'session-identity');
}

/**
 * Feature flag accessor.
 *
 * @param {object} [env=process.env] - Environment override (for tests)
 * @returns {boolean} true when SESSION_IDENTITY_SOT_ENABLED is set to a truthy value
 */
export function isEnabled(env = process.env) {
  const v = env[FLAG_NAME];
  if (!v) return false;
  return v === '1' || v === 'true' || v === 'TRUE' || v === 'yes' || v === 'on';
}

// ── Atomic write primitives (TR-1) ───────────────────────────────────────────

/**
 * Write a file atomically: write to <path>.tmp, fsync, rename.
 * On Windows, rename into an existing file is atomic for files on the same volume.
 *
 * @param {string} targetPath - Final file path
 * @param {string} content - UTF-8 content to write
 * @throws {Error} on unrecoverable failure (tmp file is cleaned up on throw)
 */
export function atomicWrite(targetPath, content) {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = `${targetPath}.tmp.${process.pid}.${Date.now()}`;
  let fd = null;
  try {
    fd = fs.openSync(tmpPath, 'w');
    fs.writeSync(fd, content, 0, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tmpPath, targetPath);
  } catch (err) {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch { /* ignore */ }
    }
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    throw err;
  }
}

// ── File lock (TR-2) ─────────────────────────────────────────────────────────

/**
 * Acquire .claude/session-identity/.lock. Creates the lock file with O_EXCL.
 * Breaks stale locks older than LOCK_STALE_MS. Retries with small backoff
 * until LOCK_ACQUIRE_TIMEOUT_MS is reached.
 *
 * @param {string} identityDir - Absolute path to session-identity directory
 * @returns {{release: Function, pid: number, path: string}} lock handle
 * @throws {Error} when unable to acquire within timeout
 */
export function acquireLock(identityDir) {
  if (!fs.existsSync(identityDir)) {
    fs.mkdirSync(identityDir, { recursive: true });
  }
  const lockPath = path.join(identityDir, LOCK_FILENAME);
  const body = JSON.stringify({ pid: process.pid, at: new Date().toISOString() });
  const deadline = Date.now() + LOCK_ACQUIRE_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeSync(fd, body, 0, 'utf8');
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      const release = () => {
        try { fs.unlinkSync(lockPath); } catch { /* already gone */ }
      };
      return { release, pid: process.pid, path: lockPath };
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      // Lock file exists — check if stale
      try {
        const stat = fs.statSync(lockPath);
        if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
          try { fs.unlinkSync(lockPath); } catch { /* raced */ }
          continue;
        }
      } catch { /* lock vanished while checking */ }
      // Busy — back off briefly
      const end = Date.now() + LOCK_RETRY_MS;
      while (Date.now() < end) { /* spin */ }
    }
  }
  throw new Error(`session-identity: unable to acquire lock at ${lockPath} within ${LOCK_ACQUIRE_TIMEOUT_MS}ms`);
}

// ── Source readers ───────────────────────────────────────────────────────────

/**
 * Read the canonical marker file for a given session id.
 *
 * @param {string} sessionId - UUID
 * @param {string} [repoRoot] - Optional repo root override
 * @returns {string|null} Session id extracted from the file, or null if file missing / malformed
 */
export function readCanonical(sessionId, repoRoot) {
  if (!sessionId) return null;
  const markerPath = path.join(getIdentityDir(repoRoot), `${sessionId}.json`);
  try {
    const raw = fs.readFileSync(markerPath, 'utf8');
    const obj = JSON.parse(raw);
    return obj && typeof obj.session_id === 'string' ? obj.session_id : null;
  } catch {
    return null;
  }
}

/**
 * Read the /current pointer file.
 *
 * @param {string} [repoRoot] - Optional repo root override
 * @returns {string|null} Session id stored in the pointer, or null if missing / malformed
 */
export function readCurrentPointer(repoRoot) {
  const pointerPath = path.join(getIdentityDir(repoRoot), CURRENT_POINTER_FILENAME);
  try {
    const raw = fs.readFileSync(pointerPath, 'utf8').trim();
    if (!raw) return null;
    // Pointer may be plain UUID or JSON — accept both
    if (raw.startsWith('{')) {
      const obj = JSON.parse(raw);
      return obj && typeof obj.session_id === 'string' ? obj.session_id : null;
    }
    return raw;
  } catch {
    return null;
  }
}

/**
 * Read the CLAUDE_SESSION_ID env var.
 *
 * @param {object} [env=process.env] - Environment override (for tests)
 * @returns {string|null} Session id from env, or null if unset / empty
 */
export function readEnvVar(env = process.env) {
  const v = env.CLAUDE_SESSION_ID;
  return v && v.trim() ? v.trim() : null;
}

/**
 * Scan the identity directory for the most recently written canonical marker
 * (`<uuid>.json` files, excluding `pid-*.json`, `current`, and `.lock`). Returns
 * the session_id extracted from that file, or null when no markers exist.
 *
 * Used by readAllSources() as the last-resort canonical discovery path so the
 * agreement check can surface disagreements where the env var points to a
 * session id whose marker was never written (FR-3 TS-3 semantics).
 *
 * @param {string} [repoRoot]
 * @returns {string|null}
 */
export function scanCanonicalFromDir(repoRoot) {
  const dir = getIdentityDir(repoRoot);
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return null;
  }
  const candidates = entries
    .filter(name => name.endsWith('.json') && !name.startsWith('pid-'))
    .map(name => {
      try {
        const full = path.join(dir, name);
        const stat = fs.statSync(full);
        return { name, full, mtime: stat.mtimeMs };
      } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => b.mtime - a.mtime);
  for (const entry of candidates) {
    try {
      const obj = JSON.parse(fs.readFileSync(entry.full, 'utf8'));
      if (obj && typeof obj.session_id === 'string') {
        return obj.session_id;
      }
    } catch { /* malformed — keep scanning */ }
  }
  return null;
}

/**
 * Read all three identity sources. When `sessionId` hint is not provided, the
 * env var and pointer are used as hints to locate the canonical marker; if the
 * hinted marker doesn't exist, the directory is scanned for the most recent
 * canonical marker so disagreements surface rather than collapsing to a
 * single-source pass.
 *
 * @param {object} [options]
 * @param {string} [options.sessionId] - Optional session id hint
 * @param {string} [options.repoRoot] - Optional repo root override
 * @param {object} [options.env] - Optional env override (for tests)
 * @returns {{canonical: string|null, envVar: string|null, pointer: string|null}}
 */
export function readAllSources(options = {}) {
  const { repoRoot, env = process.env } = options;
  const envVar = readEnvVar(env);
  const pointer = readCurrentPointer(repoRoot);
  // Canonical marker is keyed by session id, so we must know the id to read it.
  // Hint precedence: explicit sessionId → envVar → pointer.
  const hint = options.sessionId || envVar || pointer;
  let canonical = hint ? readCanonical(hint, repoRoot) : null;
  if (!canonical) {
    // Fall back to directory scan. If the most-recent marker's session_id
    // disagrees with envVar/pointer, checkAgreement() will surface it as a
    // disagreement (TS-3). If no markers exist at all, canonical stays null.
    canonical = scanCanonicalFromDir(repoRoot);
  }
  return { canonical, envVar, pointer };
}

// ── Agreement check (FR-2, FR-3) ─────────────────────────────────────────────

/**
 * Compare the three identity sources and decide whether they agree.
 *
 * Rules (FR-2, FR-3):
 *   - All present sources agree → { agree: true, sessionId, presentSources }
 *   - Only one source present   → { agree: true, sessionId, presentSources }
 *   - No sources present        → { agree: false, reason: 'no_sources', presentSources: [] }
 *   - Two or more present and disagree → { agree: false, reason: 'disagreement',
 *                                           conflicts: [{source, value}, ...] }
 *
 * @param {{canonical: string|null, envVar: string|null, pointer: string|null}} sources
 * @returns {{agree: boolean, sessionId: string|null, presentSources: string[],
 *            reason?: string, conflicts?: Array<{source: string, value: string}>}}
 */
export function checkAgreement(sources) {
  const entries = [
    { source: 'canonical', value: sources.canonical },
    { source: 'envVar',    value: sources.envVar    },
    { source: 'pointer',   value: sources.pointer   },
  ];
  const present = entries.filter(e => typeof e.value === 'string' && e.value.length > 0);

  if (present.length === 0) {
    return { agree: false, sessionId: null, presentSources: [], reason: 'no_sources' };
  }

  const first = present[0].value;
  const allAgree = present.every(e => e.value === first);
  if (allAgree) {
    return {
      agree: true,
      sessionId: first,
      presentSources: present.map(e => e.source),
    };
  }

  return {
    agree: false,
    sessionId: null,
    presentSources: present.map(e => e.source),
    reason: 'disagreement',
    conflicts: present.map(e => ({ source: e.source, value: e.value })),
  };
}

/**
 * Format a human-readable remediation string for a disagreement result.
 * Used by claim-validity-gate banner and sd-start error messages (FR-3).
 *
 * @param {{conflicts: Array<{source: string, value: string}>}} disagreement
 * @returns {string} Multi-line remediation text
 */
export function formatDisagreementRemediation(disagreement) {
  const lines = [
    'Session identity sources disagree. Present sources:',
  ];
  for (const c of (disagreement.conflicts || [])) {
    lines.push(`  - ${c.source}: ${c.value}`);
  }
  lines.push('');
  lines.push('Resolve by picking the canonical source as truth:');
  lines.push('  1. Identify the true session id (usually the canonical marker file).');
  lines.push('  2. Set CLAUDE_SESSION_ID to that id: export CLAUDE_SESSION_ID=<id>');
  lines.push('  3. Re-run sd-start.js which will atomically rewrite the /current pointer.');
  lines.push('  4. If unsure, restart Claude Code so SessionStart writes a fresh canonical marker.');
  return lines.join('\n');
}

// ── Reconciliation (FR-1) ────────────────────────────────────────────────────

/**
 * Reconcile the three identity sources at sd-start boot time.
 *
 * When enabled (SESSION_IDENTITY_SOT_ENABLED=true):
 *   - Reads canonical marker for the given session id.
 *   - Atomically rewrites the /current pointer to match.
 *   - Updates the CLAUDE_SESSION_ID env var in the current process (and, when
 *     CLAUDE_ENV_FILE is set, appends an `export` line so subsequent subshells
 *     see it).
 *   - Uses a file lock to serialize concurrent reconciliations (TR-2).
 *
 * When disabled: returns { applied: false } immediately.
 *
 * @param {string} sessionId - The session id to reconcile to
 * @param {object} [options]
 * @param {string} [options.repoRoot] - Optional repo root override
 * @param {object} [options.env=process.env] - Env to mutate (tests override)
 * @param {object} [options.envFilePath] - Explicit CLAUDE_ENV_FILE path override
 * @returns {{applied: boolean, reason?: string, canonical?: string|null,
 *            wrotePointer?: boolean, wroteEnvFile?: boolean}}
 */
export function reconcileAtBoot(sessionId, options = {}) {
  const { repoRoot, env = process.env } = options;

  if (!isEnabled(env)) {
    return { applied: false, reason: 'flag_disabled' };
  }
  if (!sessionId) {
    return { applied: false, reason: 'no_session_id' };
  }

  const identityDir = getIdentityDir(repoRoot);
  const lock = acquireLock(identityDir);
  try {
    const canonical = readCanonical(sessionId, repoRoot);

    // If canonical marker doesn't exist yet, reconciliation can still update
    // the derived sources to the provided session id — but flag it so the
    // caller knows the marker must be written by the SessionStart hook first.
    const pointerPath = path.join(identityDir, CURRENT_POINTER_FILENAME);
    atomicWrite(pointerPath, sessionId);

    // Mutate env in the current process so downstream code sees it immediately.
    env.CLAUDE_SESSION_ID = sessionId;

    // When CLAUDE_ENV_FILE is available, append the export so future Bash-tool
    // invocations in this conversation inherit the value.
    let wroteEnvFile = false;
    const envFilePath = options.envFilePath || env.CLAUDE_ENV_FILE;
    if (envFilePath) {
      try {
        fs.appendFileSync(envFilePath, `export CLAUDE_SESSION_ID=${sessionId}\n`);
        wroteEnvFile = true;
      } catch {
        wroteEnvFile = false;
      }
    }

    return {
      applied: true,
      canonical,
      wrotePointer: true,
      wroteEnvFile,
    };
  } finally {
    lock.release();
  }
}

/**
 * Write a fresh canonical marker. Used by the SessionStart hook when migrating
 * to the SOT model (FR-4 ordering — marker BEFORE env var).
 *
 * @param {string} sessionId - UUID
 * @param {object} markerBody - Remaining fields (cc_pid, source, model, etc.)
 * @param {object} [options]
 * @param {string} [options.repoRoot]
 * @returns {{written: boolean, path: string}}
 */
export function writeCanonicalMarker(sessionId, markerBody, options = {}) {
  const { repoRoot } = options;
  const identityDir = getIdentityDir(repoRoot);
  if (!fs.existsSync(identityDir)) {
    fs.mkdirSync(identityDir, { recursive: true });
  }
  const markerPath = path.join(identityDir, `${sessionId}.json`);
  const body = {
    session_id: sessionId,
    ...markerBody,
    captured_at: markerBody?.captured_at || new Date().toISOString(),
  };
  atomicWrite(markerPath, JSON.stringify(body, null, 2));
  return { written: true, path: markerPath };
}

// ── High-level helper for claim-validity-gate (FR-2, FR-3) ───────────────────

/**
 * End-to-end check used by the claim-validity-gate when the feature flag is on.
 * Reads all three sources and applies the agreement rules.
 *
 * @param {object} [options]
 * @param {string} [options.sessionId] - Optional explicit session id hint
 * @param {string} [options.repoRoot]
 * @param {object} [options.env=process.env]
 * @returns {{ok: boolean, sessionId: string|null, sources: object,
 *            agreement: object, remediation?: string}}
 */
export function validateSourcesAgree(options = {}) {
  const { repoRoot, env = process.env, sessionId } = options;
  const sources = readAllSources({ sessionId, repoRoot, env });
  const agreement = checkAgreement(sources);
  if (agreement.agree) {
    return { ok: true, sessionId: agreement.sessionId, sources, agreement };
  }
  return {
    ok: false,
    sessionId: null,
    sources,
    agreement,
    remediation: formatDisagreementRemediation(agreement),
  };
}

// ── Utilities ────────────────────────────────────────────────────────────────

/**
 * Best-effort discovery of the main repo root. Used when callers don't pass one.
 * Mirrors the worktree-aware logic in scripts/resolve-sd-workdir.js::getRepoRoot.
 *
 * @returns {string|null}
 */
export function discoverRepoRoot() {
  try {
    let toplevel = execSync('git rev-parse --show-toplevel', {
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const normalized = toplevel.replace(/\\/g, '/');
    const wtIdx = normalized.indexOf('/.worktrees/');
    if (wtIdx >= 0) {
      toplevel = toplevel.substring(0, wtIdx);
    }
    return toplevel || null;
  } catch {
    return null;
  }
}

export default {
  FLAG_NAME,
  getIdentityDir,
  isEnabled,
  atomicWrite,
  acquireLock,
  readCanonical,
  readCurrentPointer,
  readEnvVar,
  readAllSources,
  scanCanonicalFromDir,
  checkAgreement,
  formatDisagreementRemediation,
  reconcileAtBoot,
  writeCanonicalMarker,
  validateSourcesAgree,
  discoverRepoRoot,
};
