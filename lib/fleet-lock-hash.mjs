/**
 * Fleet-safe lockfile-hash helpers for sd-start.js install decision.
 *
 * SD-LEO-INFRA-FLEET-SAFE-NODE-001
 *
 * Moves the "should we run npm install?" decision from a single-module
 * presence probe to a lockfile-hash proof of validity.  When
 * sha256(package-lock.json)[:12] matches the marker written by the last
 * successful install AND the canary module is still present, we skip
 * install entirely.  Otherwise we fall through to the existing
 * lock-coordinated install path shipped by SD-MAN-INFRA-FLEET-NPM-INSTALL-001,
 * and on exit we emit `session_identity_fracture_node_modules_install_race`
 * into any peer session that was released during the install window.
 *
 * SD-LEO-INFRA-FLEET-LOCK-HASH-001 (this SD): adds the .staging contention
 * guard (FR-1). Mirrors the BASE check from scripts/hooks/pre-tool-enforce.cjs
 * ENFORCEMENT 12 (existsSync + readdirSync.length>0). Adds NEW behaviors
 * beyond rule-12 strict parity: fresh-defers (≤60s) and stale-auto-clean (>60s).
 * Closes 14th-witness PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 by giving
 * the sd-start --install consumer the same .staging guard rule 12 already
 * enforces on the Bash-tool path.
 */

import { createHash } from 'node:crypto';
import { promises as fsp, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { safeRecursiveRm } from './worktree-manager.js';

export const MARKER_FILENAME = '.fleet-lock-hash';
export const FRACTURE_CODE = 'session_identity_fracture_node_modules_install_race';
const PEER_HEARTBEAT_WINDOW_MS = 5 * 60 * 1000;
export const STAGING_DIRNAME = '.staging';
const STAGING_FRESHNESS_MS = (() => {
  const raw = process.env.LEO_FLEET_STAGING_FRESHNESS_MS;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 60_000;
})();

function markerPath(repoRoot) {
  return path.join(repoRoot, 'node_modules', MARKER_FILENAME);
}

/**
 * Compute sha256(package-lock.json)[:12].
 * Returns null if the lockfile is missing (callers treat as "no hash").
 */
export async function computeLockHash(repoRoot) {
  const lockPath = path.join(repoRoot, 'package-lock.json');
  if (!existsSync(lockPath)) return null;
  const buf = await fsp.readFile(lockPath);
  return createHash('sha256').update(buf).digest('hex').slice(0, 12);
}

/**
 * Read the first line (hash) of node_modules/.fleet-lock-hash.
 * Returns null if the marker is missing or unreadable.
 */
export async function readMarker(repoRoot) {
  const p = markerPath(repoRoot);
  if (!existsSync(p)) return null;
  try {
    const content = await fsp.readFile(p, 'utf8');
    const first = content.split(/\r?\n/, 1)[0]?.trim() ?? '';
    return /^[0-9a-f]{12}$/.test(first) ? first : null;
  } catch {
    return null;
  }
}

/**
 * Atomic-ish write of the marker.  Writes to .tmp then renames.  Silently
 * skips if node_modules/ itself does not exist (a mid-run prune) to avoid
 * crashing the install path.
 */
export async function writeMarker(repoRoot, sessionId, hash) {
  const nmDir = path.join(repoRoot, 'node_modules');
  if (!existsSync(nmDir)) return { written: false, reason: 'node_modules_missing' };
  if (!/^[0-9a-f]{12}$/.test(hash || '')) {
    return { written: false, reason: 'invalid_hash' };
  }
  const p = markerPath(repoRoot);
  const tmp = `${p}.tmp`;
  const body = `${hash}\n${new Date().toISOString()}\n${sessionId || 'unknown'}\n`;
  await fsp.writeFile(tmp, body, 'utf8');
  await fsp.rename(tmp, p);
  return { written: true, path: p };
}

/**
 * Pure decision function.  Given current state, returns what sd-start should do.
 *
 *   { skip: true, reason: "install skipped: lockfile hash match (<hash>)" }
 *   { skip: false, reason: "install required: <why>" }
 */
export function composeInstallDecision({
  currentHash,
  storedHash,
  canaryPresent,
  forceInstall = false
}) {
  if (forceInstall) {
    return { skip: false, reason: 'install required: --force-install flag present' };
  }
  if (!storedHash) {
    return { skip: false, reason: 'install required: no hash marker' };
  }
  if (currentHash && storedHash !== currentHash) {
    return {
      skip: false,
      reason: `install required: hash drift ${storedHash} -> ${currentHash}`
    };
  }
  if (!canaryPresent) {
    return {
      skip: false,
      reason: 'install required: canary module missing despite hash match'
    };
  }
  return {
    skip: true,
    reason: `install skipped: lockfile hash match (${currentHash})`
  };
}

/**
 * Snapshot peer sessions — sessions other than self that are still active
 * (released_at IS NULL and heartbeat_at within the configured window).
 *
 * Returns a Set of session_id strings (empty on query failure — we do NOT
 * block install on a snapshot error).
 */
export async function peerSessionSnapshot(supabase, selfSessionId) {
  try {
    const cutoff = new Date(Date.now() - PEER_HEARTBEAT_WINDOW_MS).toISOString();
    const { data, error } = await supabase
      .from('claude_sessions')
      .select('session_id')
      .is('released_at', null)
      .gt('heartbeat_at', cutoff);
    if (error) return new Set();
    const out = new Set();
    for (const row of data || []) {
      if (row.session_id && row.session_id !== selfSessionId) out.add(row.session_id);
    }
    return out;
  } catch {
    return new Set();
  }
}

/**
 * For each session in `before` that is not in `after`, write the fracture
 * code into claude_sessions.released_reason.  Only updates rows whose
 * released_reason is still NULL (or looks auto-released) — we do not
 * overwrite specific reasons already set by claim-guard.
 *
 * Best-effort: returns a count and an array of failures but never throws.
 */
export async function emitFractureForDiff(supabase, before, after) {
  const fractured = [];
  for (const sid of before) if (!after.has(sid)) fractured.push(sid);
  if (fractured.length === 0) return { emitted: 0, failures: [] };

  const failures = [];
  for (const sid of fractured) {
    try {
      const { error } = await supabase
        .from('claude_sessions')
        .update({ released_reason: FRACTURE_CODE })
        .eq('session_id', sid)
        .is('released_reason', null);
      if (error) failures.push({ sid, error: error.message });
    } catch (e) {
      failures.push({ sid, error: e?.message || String(e) });
    }
  }
  return { emitted: fractured.length - failures.length, failures, fractured };
}

/**
 * Inspect node_modules/.staging — npm's tarball-extraction staging dir —
 * and decide whether install should be deferred or whether to auto-clean
 * a stale orphan.
 *
 * SD-LEO-INFRA-FLEET-LOCK-HASH-001 FR-1 (a/b/c/d/e).
 *
 * Mirrors the BASE check from scripts/hooks/pre-tool-enforce.cjs ENF-12
 * (existsSync + readdirSync.length>0) so that empty .staging is NOT treated
 * as contention. Goes BEYOND rule-12 strict parity by adding:
 *   - fresh (mtime ≤ STAGING_FRESHNESS_MS) → defer (return 'fresh')
 *   - stale (mtime > STAGING_FRESHNESS_MS) → auto-clean via safeRecursiveRm
 *
 * @param {string} repoRoot - Absolute path to the npm-install root
 * @returns {{
 *   state: 'absent' | 'fresh' | 'stale_cleaned' | 'stale_clean_failed',
 *   stagingPath: string,
 *   mtimeAgeMs?: number,
 *   error?: string
 * }}
 */
export function checkStagingState(repoRoot, now = Date.now()) {
  const stagingPath = path.join(repoRoot, 'node_modules', STAGING_DIRNAME);

  if (!existsSync(stagingPath)) return { state: 'absent', stagingPath };

  let entries;
  try {
    entries = readdirSync(stagingPath);
  } catch {
    // FR-1(e): unreadable signal — fail OPEN (treat as absent / no contention)
    return { state: 'absent', stagingPath };
  }
  if (entries.length === 0) return { state: 'absent', stagingPath };

  let mtimeMs;
  try {
    mtimeMs = statSync(stagingPath).mtimeMs;
  } catch {
    return { state: 'absent', stagingPath };
  }
  // QF-20260523-824 (closes feedback 414fdace): `now` is injectable (default
  // Date.now()) so the FRESHNESS_MS boundary test is deterministic instead of
  // racing on wall-clock time elapsed between setting mtime and this read.
  const mtimeAgeMs = now - mtimeMs;

  if (mtimeAgeMs <= STAGING_FRESHNESS_MS) {
    // FR-1(b): fresh — peer is mid-extract, defer.
    return { state: 'fresh', stagingPath, mtimeAgeMs };
  }

  // FR-1(c): stale — auto-clean.
  try {
    safeRecursiveRm(stagingPath, { force: true });
    process.stderr.write(
      JSON.stringify({
        event: 'staging_orphan_cleaned',
        stagingPath,
        mtimeAgeMs,
        timestamp: new Date().toISOString()
      }) + '\n'
    );
    return { state: 'stale_cleaned', stagingPath, mtimeAgeMs };
  } catch (err) {
    const message = err?.message || String(err);
    process.stderr.write(
      JSON.stringify({
        event: 'staging_orphan_clean_failed',
        stagingPath,
        mtimeAgeMs,
        error: message,
        timestamp: new Date().toISOString()
      }) + '\n'
    );
    return { state: 'stale_clean_failed', stagingPath, mtimeAgeMs, error: message };
  }
}

/**
 * Convenience composer used by sd-start.js.  Reads current state and
 * returns the install decision plus the canary path it checked.
 *
 * SD-LEO-INFRA-FLEET-LOCK-HASH-001 (FR-1): consults checkStagingState
 * BEFORE the existing hash/canary logic. New return-shape keys:
 *   - retry_after_seconds (when reason='staging_active')
 *   - staging_path (when reason='staging_active' or 'staging_orphan_clean_failed')
 *
 * Existing keys (skip, reason, currentHash, storedHash, canaryPresent)
 * preserved unchanged.
 */
export async function evaluateInstallDecision({
  repoRoot,
  canaryRelativePath = path.join('node_modules', '@supabase', 'supabase-js'),
  forceInstall = false,
  now = Date.now()
}) {
  // FR-1: .staging contention guard.  Runs BEFORE the existing hash/canary
  // logic so we never even compute the hash when a peer is mid-extract.
  // Exception: forceInstall takes precedence (FR-1 TS-10) — explicit user
  // override semantics — but we still emit a warning when overridden.
  const staging = checkStagingState(repoRoot, now);
  if (staging.state === 'fresh' && !forceInstall) {
    return {
      skip: true,
      reason: 'staging_active',
      retry_after_seconds: Math.ceil(STAGING_FRESHNESS_MS / 1000),
      staging_path: staging.stagingPath,
      currentHash: null,
      storedHash: null,
      canaryPresent: false
    };
  }
  if (staging.state === 'stale_clean_failed' && !forceInstall) {
    return {
      skip: true,
      reason: 'staging_orphan_clean_failed',
      staging_path: staging.stagingPath,
      currentHash: null,
      storedHash: null,
      canaryPresent: false
    };
  }
  if (staging.state === 'fresh' && forceInstall) {
    process.stderr.write(
      JSON.stringify({
        event: 'staging_contention_overridden_by_force',
        stagingPath: staging.stagingPath,
        timestamp: new Date().toISOString()
      }) + '\n'
    );
  }

  const [currentHash, storedHash] = await Promise.all([
    computeLockHash(repoRoot),
    readMarker(repoRoot)
  ]);
  const canaryPresent = existsSync(path.join(repoRoot, canaryRelativePath));
  const decision = composeInstallDecision({
    currentHash,
    storedHash,
    canaryPresent,
    forceInstall
  });
  return { ...decision, currentHash, storedHash, canaryPresent };
}
