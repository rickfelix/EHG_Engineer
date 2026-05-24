'use strict';

/**
 * Canonical session-state path resolver — SD-FDBK-ENH-SESSION-STATE-SCOPING-001.
 *
 * Single source of truth for the unified-session-state file path, so that
 * lib/context/unified-state-manager.js and the three former hardcoders
 * (scripts/hooks/protocol-file-tracker.cjs, scripts/modules/sd-key-generator.js,
 * scripts/modules/handoff/gates/protocol-file-read-gate.js) all resolve the SAME
 * file and stop the cross-session split-brain.
 *
 * Mechanism is extracted VERBATIM from unified-state-manager.js's original
 * getSessionScopedStateFileName / getSessionIdForSync (~/.claude-sessions registry,
 * process.ppid||pid match → data.session_id, legacy fallback) so unified-state-manager
 * stays byte-identical. Adopting the more-robust lib/hooks/session-id.cjs::resolveSessionId
 * cascade (stdin/env/marker) is a deliberate FOLLOW-ON — it keys a different registry and
 * would change the resolved filename for every session, so it is intentionally out of scope
 * here (per LEAD decision 2026-05-24).
 *
 * Static module.exports literal so ESM consumers can use named imports
 * (proven pattern: lib/coordinator/signal-router.cjs, scripts/worker-signal.cjs).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const LEGACY_STATE_FILE_NAME = 'unified-session-state.json';
const STATE_DIR = '.claude';

// CLAUDE_SESSIONS_DIR_OVERRIDE: hermetic-test override so tests never touch the
// real ~/.claude-sessions. Unset in production → identical to the original logic.
function getSessionsDir() {
  return process.env.CLAUDE_SESSIONS_DIR_OVERRIDE || path.join(os.homedir(), '.claude-sessions');
}

function getProjectDir(projectDir) {
  return projectDir || process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

/**
 * Resolve the current session id from the ~/.claude-sessions registry by PID match.
 * Verbatim from unified-state-manager.js::getSessionIdForSync (consolidated).
 * @returns {string|null}
 */
function getSessionIdForSync() {
  try {
    const sessionDir = getSessionsDir();
    if (!fs.existsSync(sessionDir)) return null;
    const pid = process.ppid || process.pid;
    const files = fs.readdirSync(sessionDir).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(sessionDir, file), 'utf8'));
        if (data.pid === pid && data.session_id) return data.session_id;
      } catch { /* skip unreadable */ }
    }
  } catch { /* fall back to legacy */ }
  return null;
}

/**
 * Session-scoped state filename, or the legacy shared filename when no session resolves.
 * @returns {string}
 */
function getSessionScopedStateFileName() {
  const sid = getSessionIdForSync();
  return sid ? `unified-session-state.${sid}.json` : LEGACY_STATE_FILE_NAME;
}

/** Absolute path to the (scoped-or-legacy) state file. */
function getSessionStateFilePath(projectDir) {
  return path.join(getProjectDir(projectDir), STATE_DIR, getSessionScopedStateFileName());
}

/** Absolute path to the legacy shared state file. */
function getLegacyStateFilePath(projectDir) {
  return path.join(getProjectDir(projectDir), STATE_DIR, LEGACY_STATE_FILE_NAME);
}

/**
 * Read-fallback path: the scoped file when it exists on disk, else the legacy file.
 * Keeps readers non-regressive for a fresh session whose scoped file isn't written yet.
 * @returns {string}
 */
function resolveStateReadPath(projectDir) {
  const scoped = getSessionStateFilePath(projectDir);
  try {
    if (scoped !== getLegacyStateFilePath(projectDir) && fs.existsSync(scoped)) return scoped;
  } catch { /* fall through to legacy */ }
  return getLegacyStateFilePath(projectDir);
}

module.exports = {
  LEGACY_STATE_FILE_NAME,
  STATE_DIR,
  getSessionIdForSync,
  getSessionScopedStateFileName,
  getSessionStateFilePath,
  getLegacyStateFilePath,
  resolveStateReadPath,
};
