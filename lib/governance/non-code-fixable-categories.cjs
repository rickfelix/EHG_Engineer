'use strict';
// SD-LEO-INFRA-EXCLUDE-MONITORING-TELEMETRY-001
//
// Non-code-fixable feedback categories: rows in any of these are automated
// monitoring/governance OUTPUT (gauge findings, comms-framing flags, cross-SD
// verification-ledger records, Adam behavioral-drift telemetry, chairman decision
// captures) -- there is no single-row code fix for "a gauge fired" or "a chairman
// ruling was captured". /leo assist Phase 1's autonomous-fix loop has no business
// attempting a code fix against this population (measured 2026-08-11: 6465 of 6787
// unlinked type='issue' rows fell into these 11 categories). Scoped to the issues
// stream (Phase 1) only -- the enhancements stream (Phase 2) is a less-autonomous,
// human-reviewed consumer with a different risk profile and is NOT touched here.

const NON_CODE_FIXABLE_CATEGORIES = new Set([
  'invariant_gauge_finding',
  'comms_quality',
  'verification_ledger',
  'adam_adherence_drift',
  'adam_doc_drift',
  'adam_solomon_health',
  'adam_morning_brief',
  'chairman_ruling',
  'feedback_sla_breach',
  'relay_drop',
  'sms_relay',
]);

/**
 * Exclude non-code-fixable categories from the issues stream ONLY (type==='issue').
 * The type gate is enforced here, not left to caller discipline, so the Phase 2
 * enhancements stream is structurally untouched regardless of call-site context.
 *
 * @param {Array<object>} enriched - Sensemaking-enriched feedback rows
 * @returns {{issues: Array<object>, skippedNonCodeFixable: number}}
 */
function filterIssuesExcludingNonCodeFixable(enriched) {
  const all = (enriched || []).filter((i) => i.type === 'issue');
  const issues = all.filter((i) => !NON_CODE_FIXABLE_CATEGORIES.has(i.category));
  const skippedNonCodeFixable = all.length - issues.length;
  return { issues, skippedNonCodeFixable };
}

module.exports = { NON_CODE_FIXABLE_CATEGORIES, filterIssuesExcludingNonCodeFixable };
