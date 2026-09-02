/**
 * Bypass stamping — pure core, SD-LEO-FIX-EXEC-PLAN-ACCEPTED-001 (FR-1/FR-2).
 *
 * A bypassed handoff (handoff.js execute <TYPE> <SD> --bypass-validation over a failing
 * required gate) used to be byte-identical, on every row downstream gates/roles read, to a
 * genuinely validated one: BaseExecutor.js logged a warning and fell through to the SAME
 * success return, and HandoffRecorder.js hardcoded validation_passed=true regardless.
 *
 * This module is the shared, pure logic both files call so the stamp/persist behavior lives
 * in exactly one place, testable without mocking either class's heavy DB/telemetry surface.
 */

/**
 * Build the bypassInfo record for one bypass fall-through site.
 * @param {{source: string, reason: string|null, gate: string, gates?: string[], issues?: string[], patternId?: string|null, followupSdKey?: string|null}} params
 * @returns {object}
 */
export function buildBypassStamp({ source, reason = null, gate, gates, issues = [], patternId = null, followupSdKey = null }) {
  if (!source) throw new Error('buildBypassStamp: source is required');
  if (!gate) throw new Error('buildBypassStamp: gate is required');
  return {
    source,
    reason: reason || null,
    gate,
    gates: gates && gates.length ? gates : [gate],
    issues,
    patternId: patternId || null,
    followupSdKey: followupSdKey || null,
  };
}

/**
 * Merge a bypassInfo stamp into an executor's success-return result. Absent (bypassInfo ===
 * null) leaves baseResult untouched — including any bypassed:true an executor already
 * self-stamped (e.g. plan-to-exec/index.js), which this function must never clobber.
 *
 * @param {object} baseResult - the result object as built so far (post ...executionResult spread)
 * @param {object|null} bypassInfo - from buildBypassStamp, or null when no bypass fired
 * @returns {object} a NEW object — never mutates baseResult
 */
export function applyBypassToResult(baseResult, bypassInfo) {
  if (!bypassInfo) return { ...baseResult };
  return {
    ...baseResult,
    bypassed: true,
    bypassReason: bypassInfo.reason,
    bypassedGates: bypassInfo.gates,
    bypassSource: bypassInfo.source,
    bypassPatternId: bypassInfo.patternId,
    bypassFollowupSdKey: bypassInfo.followupSdKey,
  };
}

/**
 * Derive how HandoffRecorder should record a result: whether it counts as bypassed, and
 * what score_source value to persist. A bypassed result is NEVER validation_passed=true and
 * NEVER score_source='measured', regardless of what score it carried.
 *
 * @param {object} result - an executor's returned result (result.bypassed set by
 *   applyBypassToResult above, OR self-stamped by an executor directly)
 * @param {string} baselineScoreSource - the score_source HandoffRecorder had already computed
 *   from the score-presence logic, before bypass-awareness is applied
 * @returns {{ isBypassed: boolean, scoreSource: string, validationPassed: boolean }}
 */
export function deriveBypassAwareRecordFields(result, baselineScoreSource = 'measured') {
  const isBypassed = result?.bypassed === true;
  return {
    isBypassed,
    scoreSource: isBypassed ? 'bypassed' : baselineScoreSource,
    // The single invariant this whole module exists to enforce: bypassed is never "passed".
    validationPassed: !isBypassed,
  };
}

/**
 * Build the bypass sub-object persisted at sd_phase_handoffs.metadata.bypass /
 * leo_handoff_executions.validation_details.bypass. Never fabricated — call only when
 * deriveBypassAwareRecordFields(...).isBypassed is true.
 *
 * @param {object} result - carries bypassReason/bypassedGates/bypassPatternId/bypassFollowupSdKey
 * @param {{ actor: string, nowIso?: string }} params
 * @returns {object}
 */
export function buildPersistedBypassMetadata(result, { actor, nowIso } = {}) {
  return {
    reason: result?.bypassReason || null,
    actor: actor || null,
    gates: result?.bypassedGates || null,
    bypassed_at: nowIso || new Date().toISOString(),
    pattern_id: result?.bypassPatternId || null,
    followup_sd_key: result?.bypassFollowupSdKey || null,
  };
}

/**
 * Is a phase-chain bypass record resolved (has a linked follow-up)? Pure predicate shared by
 * FR-4's LEAD-FINAL-APPROVAL gate check and any future reader of the same shape.
 * @param {{pattern_id?: string|null, followup_sd_key?: string|null}} bypassMeta
 * @returns {boolean}
 */
export function isBypassResolved(bypassMeta) {
  return !!(bypassMeta?.pattern_id || bypassMeta?.followup_sd_key);
}
