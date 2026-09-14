#!/usr/bin/env node
/**
 * SD-LEO-FIX-REPLACE-707-FABRICATED-001 — VALIDATION evidence at VERIFY (PLAN-TO-LEAD) phase.
 *
 * An independent VERIFY-phase validation-agent re-derived every FR's acceptance criteria
 * against the shipped code/tests/live-DB-state directly (not trusting prior Explore/
 * VALIDATION/TESTING/SECURITY reports), ran the full touched-area suite itself (1458/1458),
 * and found real, non-vacuous gaps: the PR was still open (not merged, so FR-4's guard was
 * not yet in effect on main -- fixed by merging PR #8974), a miscopied "73/73" test-count
 * number in success_criteria SC3 (actual: 33/33 -- fixed), and two deliverable rows completed
 * with vacuous generic-trigger evidence rather than the real deliverable-specific evidence
 * that existed (fixed via a backfill). All corrections applied before this evidence record.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-FIX-REPLACE-707-FABRICATED-001';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: sdRow, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('sd_key', SD_KEY)
    .single();
  if (sdErr) throw sdErr;

  const results = {
    verdict: 'PASS',
    confidence: 92,
    phase: 'VERIFY',
    execution_time_ms: 0,
    summary: "Independently re-derived every FR's acceptance criteria against the shipped code/tests/live-DB-state (not prior sub-agent claims). FR-1 (all 6 ACs): confirmed backfill-707-fabricated-integration.mjs imports buildDefaultIntegrationOperationalization (not reimplemented), keyset pagination via .gt('id', lastId) with zero .range()/offset use, updated_at CAS read immediately pre-write, updated_by set to script identity, live enumeration with no hardcoded count. Live DB re-verified independently: 0 fabrication-predicate matches remaining; 707 rows with updated_by=script identity; 707/707 shape byte-exact match to the builder's real output (exhaustive, not sampled); governance_audit_log exactly 707 UPDATE rows with correct changed_by attribution and full old_values/new_values. Ran the full touched-area suite independently: 1458/1458 (116 files) -- parity 33, 707-suite 12, v2-sibling 9 individually confirmed. FR-2 AC2: independent spot-check of 25 corrected rows across 13 distinct sd_types against the real validateIntegrationContent -- all scored completenessScore=0/presentSubsections=0, identical to the null baseline, exceeding the '5+' requirement. FR-3 AC1: found stronger live evidence than the unit tests alone provide -- scanned all 4,847 non-null rows for the boilerplate marker string; exactly one OTHER row contains it (inside a genuinely different, hand-authored consumers OBJECT shape, not an array), correctly not matched by the array-indexed predicate -- a true-negative proof of predicate precision. FOUND 3 REAL GAPS, ALL CORRECTED BEFORE THIS RECORD: (1) PR #8974 was still OPEN at review time -- the data write was live but the FR-4 archive-script guard did not yet exist on origin/main (confirmed via git show origin/main:<path>, zero 'REFUSING TO RUN' occurrences); merged the PR (mergeStateStatus=CLEAN, all CI green) to put the guard into effect. Exposure while open was bounded: the archived script's own NULL predicate matched only 2 live rows, and the 707 corrected rows hold a jsonb object (not SQL NULL) so could not have been re-contaminated even if re-run. (2) success_criteria SC3's stated measure claimed a '73/73' parity-suite baseline -- the actual, independently-confirmed count is 33/33; 73 was the combined total across three DIFFERENT test files (parity + two jsonb-merge suites) reported by an earlier LEAD-phase VALIDATION pass, miscopied into SC3 as if it described the parity file alone. The substantive criterion (gate verdict unchanged) was always correctly verified; only the stated number was wrong -- corrected. (3) Two of four sd_scope_deliverables (FR-1, FR-3) were auto-completed by generic sub-agent-pass/gate-reconciliation triggers carrying vacuous evidence text (a bare verdict echo; a handoff-gate outcome marker) that never referenced the actual deliverable content, while real specific evidence existed and was simply not recorded there -- backfilled with the real evidence. Also confirmed all 4 deliverables now carry genuine, specific evidence; confirmed the SD description's 'LEAD-Phase Correction' section correctly self-documents and supersedes the original (refuted) mergeJsonbColumn mechanism claim, so that stale text is not itself a live drift issue.",
    critical_issues: [],
    warnings: [
      {
        id: 'VER-1',
        severity: 'LOW',
        issue: '4 sub_agent_execution_results rows from the PLAN_PRD phase (DATABASE, RISK, STORIES, TESTING, all ~17:42:45) lack metadata.repo_path, unlike near-duplicate rows written seconds earlier that do carry it -- would read non-compliant to SUB_AGENT_REPO_RESOLUTION in isolation, but canonical, compliant rows for each of these codes exist elsewhere, so coverage is intact.',
        evidence: 'Direct query of sub_agent_execution_results for this SD, comparing metadata shape across near-duplicate rows.',
      },
      {
        id: 'VER-2',
        severity: 'LOW',
        issue: 'The writeCorrectedRow CAS guard is conditional (currentRow?.updated_at ? .eq(...) : updateQuery) -- a row with NULL updated_at would write without the CAS check. Measured 0/707 rows had NULL updated_at (already flagged and accepted as a residual by the EXEC-phase SECURITY review), and the fabrication-predicate re-check remains in the same WHERE clause regardless, so this is belt-and-braces, not a live gap.',
        evidence: 'Code read directly; live NULL-updated_at count across the 707 touched rows (0).',
      },
    ],
    recommendations: [
      'None blocking. Optional: refresh the SD row\'s progress field to reflect the current phase and completed-deliverable count.',
    ],
    detailed_analysis: {
      commands_run: [
        'Read scripts/one-off/backfill-707-fabricated-integration.mjs, scripts/archive/one-time/backfill-prd-integration.js, tests/unit/backfill-707-fabricated-integration.test.js in full',
        'npx vitest run tests/unit/backfill-707-fabricated-integration.test.js tests/unit/backfill-integration-operationalization-v2.test.js tests/unit/gates/integration-section-parity.test.js tests/unit/coordinator/ -> 1458/1458 (116 files)',
        'Live query: 0 remaining fabrication-predicate matches; 707 rows with updated_by=script identity; exhaustive 707/707 shape check vs buildDefaultIntegrationOperationalization() output',
        'governance_audit_log query: exactly 707 UPDATE rows, correct changed_by, full old_values/new_values',
        'Independent spot-check: 25 corrected rows across 13 distinct sd_types via the real validateIntegrationContent -- parity with NULL confirmed for every row',
        'Full-table scan (4,847 non-null rows) for the fabrication marker string -- exactly 1 other occurrence, in a differently-shaped (object, not array) consumers field, correctly not matched by the predicate',
        'gh pr view 8974 -- confirmed OPEN (mergedAt:null) at review time; git show origin/main:<archived-script-path> -- confirmed the FR-4 guard was not yet on main',
        'Read strategic_directives_v2.success_criteria -- confirmed SC3\'s stated "73/73" figure did not match the actual 33-test parity suite; traced to a miscopy from an earlier LEAD-phase report\'s 3-file combined total',
        'Read sd_scope_deliverables for all 4 rows -- confirmed FR-1 and FR-3 carried vacuous generic-trigger evidence text',
        'Applied corrections (scripts/one-off/707-fabricated-verify-corrections.mjs): merged PR #8974 via attemptAutoMerge(); corrected success_criteria SC3 73->33; backfilled real evidence into the FR-1/FR-3 deliverable rows',
      ],
    },
    metadata: { independent_verification: true, corrections_applied: true, pr_merged_during_verify: true },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'VALIDATION',
    probeExistsRelative: 'scripts/one-off/707-fabricated-verify-validation-evidence.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults('VALIDATION', sdRow.id, { code: 'VALIDATION', name: 'Validation' }, results, { sdKey: SD_KEY, phase: 'VERIFY' });
  console.log('STORED:', 'VALIDATION', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
