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
 */

import { createHash } from 'node:crypto';
import { promises as fsp, existsSync } from 'node:fs';
import path from 'node:path';

export const MARKER_FILENAME = '.fleet-lock-hash';
export const FRACTURE_CODE = 'session_identity_fracture_node_modules_install_race';
const PEER_HEARTBEAT_WINDOW_MS = 5 * 60 * 1000;

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
 * Convenience composer used by sd-start.js.  Reads current state and
 * returns the install decision plus the canary path it checked.
 */
export async function evaluateInstallDecision({
  repoRoot,
  canaryRelativePath = path.join('node_modules', '@supabase', 'supabase-js'),
  forceInstall = false
}) {
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
