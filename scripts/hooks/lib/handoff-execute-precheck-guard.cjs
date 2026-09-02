// ENF-18 pure command-parsing seam (QF-20260902-542). No top-level side effects — safe to
// require directly from tests, unlike pre-tool-enforce.cjs (blocks on its own stdin read).

/**
 * Does `command` invoke `handoff.js execute TYPE SD-ID`? Requires the literal word
 * "execute" so `handoff.js precheck ...` (this guard's remediation target) never matches.
 * @returns {{handoffType: string, sdId: string}|null}
 */
function parseHandoffExecuteCall(command) {
  const m = String(command || '').match(/handoff\.js\s+execute\s+(\S+)\s+(\S+)/);
  return m ? { handoffType: m[1].toUpperCase(), sdId: m[2] } : null;
}

/**
 * Decide whether to refuse a `handoff.js execute` call. Async dependencies are injected
 * (rather than dynamically imported here) so this is directly unit-testable with mocks --
 * VALIDATION sub-agent finding (SD-LEO-FIX-KPI-COUNTS-CHEAP-001 LEAD phase): the original
 * inline version passed the raw CLI token (often the SD KEY) straight into
 * validateSubagentEvidence, which matches sub_agent_execution_results.sd_id -- the
 * strategic_directives_v2.id column, NOT always the same string as the key. That silently
 * matched zero evidence rows and refused essentially every real execute call. Resolving via
 * resolveSdInputOrNull first (mirrors prerequisite-preflight.js's lookupSdIdForFk) fixes both
 * that and the WAIT-verdict race window, which depends on the SAME resolved `sd` row to
 * compute phase-start.
 *
 * @param {{handoffType: string, rawSdId: string, supabase: Object}} params
 * @param {{resolveSdInputOrNull: Function, validateSubagentEvidence: Function}} deps
 * @returns {Promise<{refuse: boolean, missing?: string[], resolvedSdId?: string}>}
 */
async function evaluateHandoffExecutePrecheck({ handoffType, rawSdId, supabase }, { resolveSdInputOrNull, validateSubagentEvidence }) {
  const { sd } = await resolveSdInputOrNull(rawSdId, supabase);
  if (!sd) return { refuse: false }; // unresolvable identifier -- fail open, real gate still enforces later

  const evidenceResult = await validateSubagentEvidence({ sd, handoffType, sdId: sd.id, supabase }, supabase);
  // MISSING_CONTEXT/DB_ERROR carry no `wait` field but are infra failures, not a real
  // absence of evidence -- must fail open here, same as an unresolvable identifier above.
  const infraFailure = ['MISSING_CONTEXT', 'DB_ERROR'].includes(evidenceResult.details?.reason);
  if (evidenceResult.passed === false && !evidenceResult.wait && !infraFailure) {
    return { refuse: true, missing: evidenceResult.details?.missing || [], resolvedSdId: sd.id };
  }
  return { refuse: false };
}

module.exports = { parseHandoffExecuteCall, evaluateHandoffExecutePrecheck };
