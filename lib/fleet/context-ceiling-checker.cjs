// SD-FDBK-INFRA-COORDINATION-VOLUME-DEGRADES-001 (FR-1/FR-2/FR-4): enforces the role-aware
// compaction threshold shipped by SD-LEO-INFRA-COORDINATOR-CRON-LIFECYCLE-001
// (.claude/compaction-thresholds.cjs) instead of leaving it classified-but-unread by every
// seat tick loop. Pure, dependency-injected (no direct DB/skill calls) so unit tests never
// touch the real context_usage_log table or invoke a real compaction.
'use strict';

const path = require('path');
const {
  selectThresholds,
  classifyStatus,
  isCompactionThresholdV2Enabled,
} = require(path.join(__dirname, '..', '..', '.claude', 'compaction-thresholds.cjs'));

const DEFAULT_FRESHNESS_WINDOW_MS = 15 * 60 * 1000; // 15 minutes -- see risk note below.

const TRUTHY = new Set(['1', 'true', 'on', 'yes']);

// Enforcement is a SEPARATE flag from COORD_COMPACTION_THRESHOLD_V2 (which only controls
// which threshold PROFILE the statusline classifies with). Default-OFF: flipping this on
// is the only thing that turns classification into an actual compact invocation.
function isEnforcementEnabled(env) {
  const e = env || (typeof process !== 'undefined' ? process.env : {});
  const v = e && e.COORD_CONTEXT_CEILING_ENFORCE_V1;
  if (v == null) return false;
  return TRUTHY.has(String(v).trim().toLowerCase());
}

/**
 * Read the seat's latest context_usage_log row (via deps.readLatestUsageRow), classify it
 * against the role-aware thresholds, and -- only when enforcement is enabled, the row is
 * fresh, and the threshold is crossed -- invoke the compact skill (deps.invokeCompactSkill)
 * and persist a before/after ceiling event (deps.persistCeilingEvent).
 *
 * QF risk note (VALIDATION evidence, LEAD-TO-PLAN): context_usage_log carries an observed
 * ~12-minute staleness lag in production. A row older than `freshnessWindowMs` (default 15
 * minutes) is treated as UNKNOWN rather than a definitive verdict -- never a false ceiling
 * from stale data, and never a silently-missed real ceiling reported as HEALTHY.
 *
 * Never throws -- returns {verdict, ...} in every case, including internal errors.
 * @returns {Promise<{verdict: 'DISABLED'|'UNKNOWN'|'HEALTHY'|'CEILING'|'ERROR', [key: string]: any}>}
 */
async function checkContextCeiling({ role, sessionId, env, deps, freshnessWindowMs } = {}) {
  const freshness = typeof freshnessWindowMs === 'number' ? freshnessWindowMs : DEFAULT_FRESHNESS_WINDOW_MS;
  try {
    if (!isEnforcementEnabled(env)) return { verdict: 'DISABLED' };
    if (!deps || typeof deps.readLatestUsageRow !== 'function') {
      return { verdict: 'ERROR', reason: 'deps.readLatestUsageRow is required' };
    }

    const row = await deps.readLatestUsageRow(sessionId);
    if (!row || typeof row.usage_percent !== 'number') {
      return { verdict: 'UNKNOWN', reason: 'no_row' };
    }

    const ageMs = Date.now() - new Date(row.created_at).getTime();
    if (!(ageMs >= 0) || ageMs > freshness) {
      return { verdict: 'UNKNOWN', reason: 'stale', ageMs, beforePercent: row.usage_percent };
    }

    const flagEnabled = isCompactionThresholdV2Enabled(env);
    const thresholds = selectThresholds(role, flagEnabled);
    const status = classifyStatus(row.usage_percent, thresholds);

    if (status !== 'CRITICAL' && status !== 'EMERGENCY') {
      return { verdict: 'HEALTHY', beforePercent: row.usage_percent, status };
    }

    // eslint-disable-next-line no-console
    console.log(
      `QUIET_TICK_CONTEXT_CEILING role=${role} session=${sessionId} before_percent=${row.usage_percent} status=${status} threshold=${thresholds.critical}`
    );

    let compactError = null;
    if (typeof deps.invokeCompactSkill === 'function') {
      try {
        await deps.invokeCompactSkill();
      } catch (err) {
        compactError = err && err.message ? err.message : String(err);
      }
    } else {
      compactError = 'deps.invokeCompactSkill not provided';
    }

    let afterPercent = null;
    try {
      const after = await deps.readLatestUsageRow(sessionId);
      afterPercent = after && typeof after.usage_percent === 'number' ? after.usage_percent : null;
    } catch (_) {
      // best-effort -- a failed after-read must not mask the ceiling event itself.
    }

    const event = {
      session_id: sessionId,
      role,
      before_percent: row.usage_percent,
      after_percent: afterPercent,
      threshold: thresholds.critical,
      status,
      compact_error: compactError,
      timestamp: new Date().toISOString(),
    };

    if (typeof deps.persistCeilingEvent === 'function') {
      try {
        await deps.persistCeilingEvent(event);
      } catch (_) {
        // best-effort -- a failed persist must not mask the enforcement action already taken.
      }
    }

    return { verdict: 'CEILING', ...event };
  } catch (err) {
    return { verdict: 'ERROR', reason: err && err.message ? err.message : String(err) };
  }
}

module.exports = { checkContextCeiling, isEnforcementEnabled, DEFAULT_FRESHNESS_WINDOW_MS };
