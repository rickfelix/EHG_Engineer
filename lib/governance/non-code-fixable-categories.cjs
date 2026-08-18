'use strict';
// SD-LEO-INFRA-EXCLUDE-MONITORING-TELEMETRY-001
//
// @wire-check-exempt: reached exclusively via lib/quality/assist-engine.js, which is
// itself invoked only through the /leo assist markdown slash-command
// (.claude/commands/assist.md and .claude/skills/assist.md, via require()) -- no
// static JS/CJS/MJS entry point reaches this file. Same architectural shape as the
// lib/eva-support/ / lib/ship/ KNOWN_DYNAMIC_PATTERNS exemptions in wire-check-gate.js
// (markdown-invoked, no static reachability from the current entry-point set).
//
// Non-code-fixable feedback categories: rows in any of these are automated
// monitoring/governance OUTPUT (gauge findings, comms-framing flags, cross-SD
// verification-ledger records, Adam behavioral-drift telemetry, chairman decision
// captures) -- there is no single-row code fix for "a gauge fired" or "a chairman
// ruling was captured". /leo assist Phase 1's autonomous-fix loop has no business
// attempting a code fix against this population (measured 2026-08-11: 6465 of 6787
// unlinked type='issue' rows fell into these categories). Scoped to the issues
// stream (Phase 1) only -- the enhancements stream (Phase 2) is a less-autonomous,
// human-reviewed consumer with a different risk profile and is NOT touched here.
//
// QF-20260818-390: category taxonomy drifted past this Set -- live measurement
// 2026-08-18 found 8 of 10 Phase 1 issue rows were governance/decision-capture
// records under category values this Set didn't recognize (3 independent
// log-harness-bug.js reports since 2026-08-15, feedback fc56336c/91d31e73/
// 9bb4e17f, none previously fixed). Added chairman_decision_capture (the live
// category the chairman-verbal-decision-capture pipeline actually writes --
// distinct from the pre-existing chairman_ruling), solomon_adherence_drift
// (distinct from the pre-existing adam_adherence_drift/adam_solomon_health --
// Solomon conduct rubric findings, not Adam's), and g2_apply_evidence (gate-2
// apply-evidence records).
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
  'chairman_decision_capture',
  'solomon_adherence_drift',
  'g2_apply_evidence',
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
