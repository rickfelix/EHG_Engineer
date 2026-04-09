// lib/execute/coordinator-bootstrap.cjs
//
// SD-MULTISESSION-EXECUTION-TEAM-COMMAND-ORCH-001-D (Phase 4 of /execute)
// Pure helper for checking whether the /coordinator cron loop infrastructure
// is currently running. /execute uses this as a pre-spawn warning — it does
// NOT auto-start cron loops because the chairman opts in explicitly via
// `/coordinator start`.

const fs = require('fs');
const path = require('path');

// Default lock file path used by the existing coordinator cron infrastructure.
// Can be overridden via injection for testing.
const DEFAULT_LOCK_PATH = path.resolve(__dirname, '../../.claude/scheduled_tasks.lock');

// Cron is considered "running" if the lock file was modified within this many
// minutes. The /coordinator cron loops touch the lock file on every iteration,
// so a stale lock (>10 min old) means cron crashed or was never started.
const FRESHNESS_THRESHOLD_MINUTES = 10;

/**
 * Check whether the /coordinator cron loop is running.
 * Pure function: no side effects, no auto-start, no DB writes.
 *
 * @param {string} [lockPath] - Optional override for the lock file path
 * @param {Object} [fsImpl] - Optional injected fs (for tests)
 * @returns {{
 *   running: boolean,
 *   lockPath: string,
 *   lastModified: Date|null,
 *   ageMinutes: number|null,
 *   reason: string
 * }}
 */
function checkCoordinatorRunning(lockPath = DEFAULT_LOCK_PATH, fsImpl = fs) {
  if (!lockPath) {
    return {
      running: false,
      lockPath: null,
      lastModified: null,
      ageMinutes: null,
      reason: 'no_lock_path_provided'
    };
  }

  let exists;
  try {
    exists = fsImpl.existsSync(lockPath);
  } catch (err) {
    return {
      running: false,
      lockPath,
      lastModified: null,
      ageMinutes: null,
      reason: `existsSync_failed: ${err.message}`
    };
  }

  if (!exists) {
    return {
      running: false,
      lockPath,
      lastModified: null,
      ageMinutes: null,
      reason: 'lock_file_missing'
    };
  }

  let stats;
  try {
    stats = fsImpl.statSync(lockPath);
  } catch (err) {
    return {
      running: false,
      lockPath,
      lastModified: null,
      ageMinutes: null,
      reason: `statSync_failed: ${err.message}`
    };
  }

  const lastModified = new Date(stats.mtimeMs);
  const ageMinutes = (Date.now() - stats.mtimeMs) / 60000;

  if (ageMinutes > FRESHNESS_THRESHOLD_MINUTES) {
    return {
      running: false,
      lockPath,
      lastModified,
      ageMinutes,
      reason: `lock_stale_${Math.round(ageMinutes)}min_old`
    };
  }

  return {
    running: true,
    lockPath,
    lastModified,
    ageMinutes,
    reason: 'lock_fresh'
  };
}

/**
 * Build a chairman-friendly warning message when coordinator is not running.
 * @param {Object} checkResult - Output of checkCoordinatorRunning
 * @returns {string} Multi-line warning text
 */
function buildWarningMessage(checkResult) {
  if (checkResult.running) return '';
  return [
    '⚠️  /coordinator cron loops are not running.',
    `   Reason: ${checkResult.reason}`,
    `   Lock path: ${checkResult.lockPath || '(none)'}`,
    '',
    '   /execute will spawn workers, but you will not see automated:',
    '   - Stale session sweep (orphan claim cleanup)',
    '   - Heartbeat refresh from coordinator side',
    '   - Cron-driven /coordinator dashboard updates',
    '',
    '   Recommended: run /coordinator start in a separate session before /execute.',
    '   /execute is proceeding anyway — chairman opt-in policy.'
  ].join('\n');
}

module.exports = {
  checkCoordinatorRunning,
  buildWarningMessage,
  DEFAULT_LOCK_PATH,
  FRESHNESS_THRESHOLD_MINUTES
};
