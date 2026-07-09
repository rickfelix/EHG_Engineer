// ============================================================================
// Role-aware context-compaction thresholds
// SD-LEO-INFRA-COORDINATOR-CRON-LIFECYCLE-001
// ============================================================================
// Pure, dependency-light, require-safe helpers used by .claude/statusline.cjs.
//
// DEFAULT-OFF behind COORD_COMPACTION_THRESHOLD_V2 — when the flag is off, EVERY
// role uses GLOBAL_THRESHOLDS, so behavior is identical to the pre-change status
// line. When on, COORDINATOR sessions (long-lived fleet monitors) are classified
// CRITICAL/EMERGENCY earlier so they are nudged to /compact proactively.
//
// AUTOCOMPACT_PCT is intentionally NOT role-aware: it mirrors the real harness
// auto-compaction trigger (80% of the window). Keeping it fixed keeps last_percent
// accurate against the real trigger for every role.
// ============================================================================
'use strict';

const fs = require('fs');
const path = require('path');

const AUTOCOMPACT_PCT = 80;

// Advisory classification thresholds (percent of usable context).
const GLOBAL_THRESHOLDS = Object.freeze({ warning: 80, critical: 93, emergency: 97 });
// Coordinators nudge ~8 points earlier than the global profile.
const COORDINATOR_THRESHOLDS = Object.freeze({ warning: 80, critical: 85, emergency: 92 });

const TRUTHY = new Set(['1', 'true', 'on', 'yes']);

// Flag parser — OFF unless the value is one of 1/true/on/yes (case-insensitive).
function isCompactionThresholdV2Enabled(env) {
  const e = env || (typeof process !== 'undefined' ? process.env : {});
  const v = e && e.COORD_COMPACTION_THRESHOLD_V2;
  if (v == null) return false;
  return TRUTHY.has(String(v).trim().toLowerCase());
}

// Reuse readCoordFile() from session-role-orient.cjs (PRD FR-2). It is require-safe
// (guarded by require.main === module). Fall back to an inline read of the same
// .claude/active-coordinator.json file if the require fails, so this module never
// hard-depends on the hook being loadable.
let _readCoordFile = null;
try {
  _readCoordFile = require('../scripts/hooks/session-role-orient.cjs').readCoordFile;
} catch (_) { _readCoordFile = null; }

function defaultReadCoordFile() {
  if (typeof _readCoordFile === 'function') return _readCoordFile();
  // Inline fallback — mirrors session-role-orient.cjs readCoordFile (single source of file format).
  try {
    const fp = path.resolve(__dirname, 'active-coordinator.json');
    return fs.existsSync(fp) ? JSON.parse(fs.readFileSync(fp, 'utf8')) : null;
  } catch (_) { return null; }
}

// SD-LEO-INFRA-TOKEN-BURN-AUTOPILOT-001: the Adam role tag source (peer of active-coordinator.json),
// written by scripts/adam-startup-check.mjs writeAdamMarker() at Adam startup. Same file-only,
// fail-safe read discipline — no DB/network in the render hot path.
function defaultReadAdamFile() {
  try {
    const fp = path.resolve(__dirname, 'active-adam.json');
    return fs.existsSync(fp) ? JSON.parse(fs.readFileSync(fp, 'utf8')) : null;
  } catch (_) { return null; }
}

// File-only role detection — NO database, NO network in the render hot path.
// Returns 'coordinator' | 'adam' | 'worker' | 'solo'. Fail-safe to 'worker' (the conservative,
// current-behavior profile) on ANY error. `reader`/`adamReader` are injectable for tests.
// Adam is checked AFTER coordinator (a session somehow tagged both counts as coordinator) and
// only ever widens detection — a missing/mismatched adam marker preserves prior behavior exactly.
function detectRoleFromFile(sessionId, reader, adamReader) {
  const read = typeof reader === 'function' ? reader : defaultReadCoordFile;
  const readAdam = typeof adamReader === 'function' ? adamReader : defaultReadAdamFile;
  let coord = null;
  try { coord = read(); } catch (_) { return 'worker'; }
  if (sessionId && coord && coord.session_id === sessionId) return 'coordinator';
  let adam = null;
  try { adam = readAdam(); } catch (_) { adam = null; }
  if (sessionId && adam && adam.session_id === sessionId) return 'adam';
  if (!coord || !coord.session_id) return 'solo';
  return 'worker';
}

// Select advisory thresholds by role + flag. Flag OFF => GLOBAL for every role.
// SD-LEO-INFRA-TOKEN-BURN-AUTOPILOT-001: 'adam' joins 'coordinator' on the earlier profile —
// both are long-lived role sessions whose burn the earlier CRITICAL/EMERGENCY nudges manage.
function selectThresholds(role, flagEnabled) {
  if (!flagEnabled) return GLOBAL_THRESHOLDS;
  if (role === 'coordinator' || role === 'adam') return COORDINATOR_THRESHOLDS;
  return GLOBAL_THRESHOLDS;
}

// Classify a usage percent against thresholds. Returns 'HEALTHY' | 'CRITICAL' | 'EMERGENCY'.
function classifyStatus(percentUsed, thresholds) {
  const t = thresholds || GLOBAL_THRESHOLDS;
  if (percentUsed >= t.emergency) return 'EMERGENCY';
  if (percentUsed >= t.critical) return 'CRITICAL';
  return 'HEALTHY';
}

module.exports = {
  AUTOCOMPACT_PCT,
  GLOBAL_THRESHOLDS,
  COORDINATOR_THRESHOLDS,
  isCompactionThresholdV2Enabled,
  detectRoleFromFile,
  selectThresholds,
  classifyStatus,
};
