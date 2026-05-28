/**
 * Unified Gate-Skip Detection
 * SD-LEO-INFRA-CONSOLIDATE-DUAL-DETECTION-001 FR-4
 *
 * Per LEAD VALIDATION C4, the Cluster C semantic audit (Phase 1 audit deliverable)
 * confirmed gate-skip decisions split into TWO distinct shapes:
 *   1. Type-based skip — "this gate doesn't apply to sd_type=X"
 *   2. Status/phase-based skip — "this gate doesn't apply when SD is in status=Y"
 *
 * Rather than collapse them into a single shouldSkipGate(), this helper exposes
 * BOTH shapes as separate predicates. Mixing them in one API would conflate two
 * orthogonal decisions (type vs lifecycle state).
 *
 * Each predicate returns `{ skip: boolean, reason: string }` so call sites can
 * log a structured skip rationale at the same time as making the decision.
 *
 * Delegates SD-type classification to the Cluster A helper
 * (lib/sd/type-detection.js classifySDType) so the type signal is consistent
 * across detection clusters.
 */

import { classifySDType } from '../sd/type-detection.js';

/**
 * Decide whether a gate should be skipped because the SD type doesn't apply.
 *
 * @param {Object} sd
 * @param {string[]|Set<string>} applicableTypes - sd_types this gate applies to
 * @param {Object} [options]
 * @param {string} [options.gateName] - included in skip reason
 * @returns {{ skip: boolean, reason: string }}
 */
export function shouldSkipForType(sd, applicableTypes, options = {}) {
  const gateName = options.gateName || 'gate';
  if (!sd) return { skip: true, reason: `${gateName}: sd is null` };

  const sdType = classifySDType(sd) || sd.sd_type;
  const allowed = applicableTypes instanceof Set ? applicableTypes : new Set(applicableTypes || []);

  if (!sdType) {
    return { skip: false, reason: `${gateName}: sd_type unset; no skip applied (default-include)` };
  }
  if (allowed.size === 0) {
    return { skip: false, reason: `${gateName}: no applicableTypes specified; default-include` };
  }
  if (allowed.has(sdType)) {
    return { skip: false, reason: `${gateName}: sd_type='${sdType}' is in applicable set` };
  }
  return {
    skip: true,
    reason: `${gateName}: sd_type='${sdType}' is not in applicable types [${[...allowed].join(', ')}]`,
  };
}

/**
 * Decide whether a gate should be skipped because the SD's status/phase doesn't apply.
 *
 * @param {Object} sd
 * @param {string[]|Set<string>} applicableStatuses
 * @param {Object} [options]
 * @param {string} [options.gateName]
 * @returns {{ skip: boolean, reason: string }}
 */
export function shouldSkipForStatus(sd, applicableStatuses, options = {}) {
  const gateName = options.gateName || 'gate';
  if (!sd) return { skip: true, reason: `${gateName}: sd is null` };

  const status = sd.status;
  const allowed = applicableStatuses instanceof Set ? applicableStatuses : new Set(applicableStatuses || []);

  if (!status) {
    return { skip: false, reason: `${gateName}: status unset; no skip applied (default-include)` };
  }
  if (allowed.size === 0) {
    return { skip: false, reason: `${gateName}: no applicableStatuses specified; default-include` };
  }
  if (allowed.has(status)) {
    return { skip: false, reason: `${gateName}: status='${status}' is in applicable set` };
  }
  return {
    skip: true,
    reason: `${gateName}: status='${status}' is not in applicable statuses [${[...allowed].join(', ')}]`,
  };
}

/**
 * Test helper.
 */
export function _clearCache() {
  // No cache for this helper.
}
