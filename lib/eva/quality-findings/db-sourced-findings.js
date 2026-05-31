/**
 * Stage-20 DB-sourced + environment-based finding producers.
 *
 * SD: SD-LEO-INFRA-STAGE-ANALYZER-ADD-001
 *
 * The repo-scannable Stage-20 categories (npm_audit, secrets, lint, test_suite,
 * unit_test, e2e_test, feedback_widget_present, error_capture_wired) are produced
 * by cloning the venture repo (see stage-20-code-quality.js). The four canonical
 * categories below are NOT repo-scannable — they read venture UAT/bug DB records or
 * probe the runtime environment — and were deferred from
 * SD-LEO-INFRA-STAGE-CODE-QUALITY-001:
 *
 *   - uat_test    : a non-passing uat_test_results row on the venture's latest UAT run
 *   - uat_signoff : the latest UAT run did not earn a GREEN signoff (RED < 93% / YELLOW)
 *   - bug_report  : a chairman/user-filed feedback row (feedback_type='user_bug')
 *   - capability  : a missing runtime capability (gh CLI, sandbox runtime, ...)
 *
 * Each producer emits LEGACY-shaped findings ({check, title, severity, detail}) so
 * they flow through the existing adaptLegacyBatch -> persistAnalyzerFindings path
 * unchanged (LEGACY_CHECK_MAP maps each check identity-wise to its canonical
 * finding_category).
 *
 * DESIGN: every read is BEST-EFFORT. A DB/env error in any producer degrades that
 * producer to zero findings and is logged — it must never throw out of the Stage-20
 * analyzer (mirrors persistAnalyzerFindings). Live data is sparse and often unlinked
 * (feedback.venture_id is NULL for all rows; uat_test_runs.sd_id holds the text
 * sd_key), so producers resolve the venture->SD identifiers first and filter on those.
 *
 * @module lib/eva/quality-findings/db-sourced-findings
 */

import { evaluateCapabilities } from './capability-gate.js';

// Mirror result-recorder.js completeSession() thresholds (GREEN/YELLOW/RED):
//   GREEN: 0 failures AND pass_rate >= 93
//   YELLOW: has failures BUT pass_rate >= 93
//   RED: pass_rate < 93
const QUALITY_GATE_PASS_RATE = 93;
const VALID_SEVERITIES = new Set(['critical', 'high', 'medium', 'low']);
const PASS_STATUSES = new Set(['pass', 'passed', 'skip', 'skipped']);
// Bound the number of per-row findings so one pathological run/venture cannot
// flood the finding set (and the verdict). Surplus is summarized, not emitted.
const MAX_PER_SOURCE = 25;

/**
 * Resolve the SD identifiers (UUID ids + text sd_keys) for a venture. UAT runs key
 * on the text sd_key while feedback may link by UUID; we collect both shapes.
 * Best-effort: returns empty arrays on any error or when nothing is linked.
 *
 * @returns {Promise<{uuids: string[], keys: string[], all: string[]}>}
 */
export async function resolveVentureSdIdentifiers(supabase, ventureId, logger = console) {
  const empty = { uuids: [], keys: [], all: [] };
  if (!supabase || !ventureId) return empty;
  try {
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key')
      .eq('venture_id', ventureId);
    if (error) throw error;
    const uuids = [...new Set((data || []).map((r) => r.id).filter(Boolean))];
    const keys = [...new Set((data || []).map((r) => r.sd_key).filter(Boolean))];
    return { uuids, keys, all: [...new Set([...keys, ...uuids])] };
  } catch (err) {
    logger.warn?.(`[S20-nonRepo] resolveVentureSdIdentifiers failed: ${err?.message || err}`);
    return empty;
  }
}

function normalizeSeverity(sev, fallback = 'medium') {
  return VALID_SEVERITIES.has(sev) ? sev : fallback;
}

/**
 * Fetch the latest UAT run per linked sd_id for the venture (best-effort).
 * @returns {Promise<Array<{run_id, sd_id, status, failed_tests, pass_rate, total_tests, metadata}>>}
 */
async function fetchLatestUatRuns(supabase, ids, logger) {
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from('uat_test_runs')
    .select('run_id, sd_id, status, failed_tests, pass_rate, total_tests, metadata, created_at')
    .in('sd_id', ids)
    .order('created_at', { ascending: false });
  if (error) throw error;
  // Keep only the most recent run per sd_id (rows are already newest-first).
  const latestBySd = new Map();
  for (const run of data || []) {
    if (!latestBySd.has(run.sd_id)) latestBySd.set(run.sd_id, run);
  }
  return [...latestBySd.values()];
}

/**
 * uat_test: one finding per non-passing uat_test_results row on each venture SD's
 * latest UAT run.
 */
export async function produceUatTestFindings(supabase, ids, logger = console) {
  try {
    const runs = await fetchLatestUatRuns(supabase, ids, logger);
    const findings = [];
    for (const run of runs) {
      if (!run.run_id) continue;
      const { data: results, error } = await supabase
        .from('uat_test_results')
        .select('test_case_id, status, failure_category, error_message')
        .eq('run_id', run.run_id)
        .limit(200);
      if (error) throw error;
      const failed = (results || []).filter((r) => !PASS_STATUSES.has(String(r.status || '').toLowerCase()));
      for (const r of failed.slice(0, MAX_PER_SOURCE)) {
        const tc = r.test_case_id || 'unknown-case';
        findings.push({
          check: 'uat_test',
          title: `UAT failure (${run.sd_id}): ${tc} [${r.status}]`,
          severity: String(r.status).toLowerCase() === 'fail' ? 'high' : 'medium',
          detail: `${r.failure_category ? r.failure_category + ' — ' : ''}${(r.error_message || 'no error message').slice(0, 200)}`,
        });
      }
      if (failed.length > MAX_PER_SOURCE) {
        findings.push({
          check: 'uat_test',
          title: `UAT failures truncated (${run.sd_id}): ${failed.length} total`,
          severity: 'medium',
          detail: `Showing first ${MAX_PER_SOURCE} of ${failed.length} non-passing test results for run ${run.run_id}.`,
        });
      }
    }
    return findings;
  } catch (err) {
    logger.warn?.(`[S20-nonRepo] produceUatTestFindings failed: ${err?.message || err}`);
    return [];
  }
}

/**
 * uat_signoff: a finding when a venture SD's latest UAT run did not earn a GREEN
 * signoff. Derived from pass_rate/failed_tests using the result-recorder thresholds;
 * prefers an explicit metadata.quality_gate when present (forward-compat).
 */
export async function produceUatSignoffFindings(supabase, ids, logger = console) {
  try {
    const runs = await fetchLatestUatRuns(supabase, ids, logger);
    const findings = [];
    for (const run of runs) {
      const explicit = run.metadata?.quality_gate; // forward-compat if ever persisted
      const passRate = typeof run.pass_rate === 'number' ? run.pass_rate : null;
      const failed = typeof run.failed_tests === 'number' ? run.failed_tests : 0;
      let gate = explicit || null;
      if (!gate && passRate !== null) {
        if (passRate < QUALITY_GATE_PASS_RATE) gate = 'RED';
        else if (failed > 0) gate = 'YELLOW';
        else gate = 'GREEN';
      }
      if (gate === 'RED' || gate === 'YELLOW') {
        findings.push({
          check: 'uat_signoff',
          title: `UAT signoff not granted (${run.sd_id}): ${gate}`,
          severity: gate === 'RED' ? 'high' : 'medium',
          detail: `Latest UAT run ${run.run_id || ''} pass_rate=${passRate ?? 'n/a'} failed_tests=${failed} (GREEN requires 0 failures and pass_rate >= ${QUALITY_GATE_PASS_RATE}).`,
        });
      }
    }
    return findings;
  } catch (err) {
    logger.warn?.(`[S20-nonRepo] produceUatSignoffFindings failed: ${err?.message || err}`);
    return [];
  }
}

/**
 * bug_report: one finding per chairman/user-filed feedback row (feedback_type='user_bug')
 * linked to the venture. feedback.venture_id is NULL for all rows today, so we also
 * match on the venture's SD UUIDs (strategic_directive_id) and sd_keys/ids (sd_id).
 */
export async function produceBugReportFindings(supabase, ventureId, idents, logger = console) {
  try {
    const orParts = [`venture_id.eq.${ventureId}`];
    if (idents.uuids.length) orParts.push(`strategic_directive_id.in.(${idents.uuids.join(',')})`);
    if (idents.all.length) orParts.push(`sd_id.in.(${idents.all.join(',')})`);

    const { data, error } = await supabase
      .from('feedback')
      .select('id, title, description, severity, sd_id, strategic_directive_id, venture_id')
      .eq('feedback_type', 'user_bug')
      .or(orParts.join(','))
      .limit(MAX_PER_SOURCE + 1);
    if (error) throw error;

    const rows = data || [];
    const findings = rows.slice(0, MAX_PER_SOURCE).map((f) => ({
      check: 'bug_report',
      title: `User-filed bug: ${(f.title || 'untitled').slice(0, 120)}`,
      severity: normalizeSeverity(f.severity),
      detail: `feedback:${f.id} — ${(f.description || '').slice(0, 200)}`,
    }));
    if (rows.length > MAX_PER_SOURCE) {
      findings.push({
        check: 'bug_report',
        title: `User-filed bugs truncated: more than ${MAX_PER_SOURCE}`,
        severity: 'medium',
        detail: `Showing first ${MAX_PER_SOURCE} user_bug feedback rows for this venture.`,
      });
    }
    return findings;
  } catch (err) {
    logger.warn?.(`[S20-nonRepo] produceBugReportFindings failed: ${err?.message || err}`);
    return [];
  }
}

/**
 * capability: one finding per missing runtime capability. Env-based (no DB) — wraps
 * the existing capability gate's evaluateCapabilities() probe. Required-capability
 * gaps are high severity; optional gaps are low.
 */
export function produceCapabilityFindings(capabilityOpts = {}, logger = console) {
  try {
    const { missing_required = [], missing_optional = [] } = evaluateCapabilities(capabilityOpts) || {};
    const findings = [];
    for (const c of missing_required) {
      findings.push({
        check: 'capability',
        title: `Missing required capability: ${c.name}`,
        severity: 'high',
        detail: c.error || 'required capability unavailable in this environment',
      });
    }
    for (const c of missing_optional) {
      findings.push({
        check: 'capability',
        title: `Missing optional capability: ${c.name}`,
        severity: 'low',
        detail: c.error || 'optional capability unavailable in this environment',
      });
    }
    return findings;
  } catch (err) {
    logger.warn?.(`[S20-nonRepo] produceCapabilityFindings failed: ${err?.message || err}`);
    return [];
  }
}

/**
 * Orchestrate all four non-repo producers. Each is independently best-effort, so a
 * failure in one does not suppress the others. Returns a flat array of LEGACY-shaped
 * findings ready to concat onto the analyzer's allFindings.
 *
 * @param {Object} params
 * @param {Object|null} params.supabase
 * @param {string|null} params.ventureId
 * @param {Object} [params.capabilityOpts] - forwarded to evaluateCapabilities (test skip list)
 * @param {Object} [params.logger]
 * @returns {Promise<Array<{check, title, severity, detail}>>}
 */
export async function collectNonRepoFindings(params = {}) {
  const { supabase, ventureId, capabilityOpts = {}, logger = console } = params;

  // capability is env-based and runs even without supabase/ventureId.
  const capabilityFindings = produceCapabilityFindings(capabilityOpts, logger);

  if (!supabase || !ventureId) return capabilityFindings;

  const idents = await resolveVentureSdIdentifiers(supabase, ventureId, logger);

  const [uat, signoff, bugs] = await Promise.all([
    produceUatTestFindings(supabase, idents.all, logger),
    produceUatSignoffFindings(supabase, idents.all, logger),
    produceBugReportFindings(supabase, ventureId, idents, logger),
  ]);

  return [...uat, ...signoff, ...bugs, ...capabilityFindings];
}

export { QUALITY_GATE_PASS_RATE };
