#!/usr/bin/env node
/**
 * SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-154 — Explore + Validation evidence at LEAD-TO-PLAN.
 *
 * Records the findings from the real Explore and Validation sub-agent runs (Task/Agent tool)
 * into sub_agent_execution_results, satisfying GATE_SUBAGENT_EVIDENCE -- neither agent has
 * direct DB write access itself.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-154';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: sdRow, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('sd_key', SD_KEY)
    .single();
  if (sdErr) throw sdErr;

  const exploreResults = {
    verdict: 'PASS',
    confidence: 90,
    phase: 'LEAD',
    execution_time_ms: 0,
    summary: "Reviewed the two fixes (lib/eva/utils/assumption-reality-tracker.js's reportWriteFailure() emitFeedback routing for PAT-LES-6d8e6a986931; lib/sub-agents/risk.js's checkRiskAssessmentCompleteness() advisory warning for PAT-LES-0bac630efd73) at their first-draft state, before the DB-tier blocker described below was found. Confirmed: (1) emitFeedback is the established codebase idiom for making an EVA-pipeline fire-and-forget failure durably visible -- lib/eva/gate-failure-recovery.js:255 calls it for the same class of concern (category:'harness_backlog'), so the new call mirrors real precedent, not an invented pattern. (2) The SAME fire-and-forget-with-no-observability gap exists, unfixed, in the sibling lib/eva/utils/token-tracker.js's recordTokenUsage() (lines ~44-101) -- the tracker's own docstring says it was built to match token-tracker.js's design, so this is the same author-acknowledged pattern class, correctly left out of this SD's narrow two-pattern scope and logged as a follow-up (feedback row 1bc70a2c-04e7-4db7-aeb2-718aa2080205). No other lib/eva/utils/ file has the same gap. (3) lib/artifact-contracts/prd-contract.js's risks field spec is orthogonal (shape/itemKeys only, no minItems) -- no conflict with the new count-based advisory check. (4) Both new/modified test files passed (84/84 at the time of this review). (5) Diff was additive and scope-correct: no deletions, no changes to risk.js's existing domain-scoring functions or thresholds, no unrelated refactors.",
    critical_issues: [],
    warnings: [
      {
        id: 'EXP-1',
        severity: 'LOW',
        issue: 'lib/eva/utils/token-tracker.js has the identical fire-and-forget-with-no-observability gap PAT-LES-6d8e6a986931 caught here, unfixed. Correctly out of this SD\'s scope (narrowly the two named pattern IDs); routed to harness_backlog rather than folded in.',
        evidence: 'lib/eva/utils/token-tracker.js recordTokenUsage(), lines ~44-101: fire-and-forget Supabase insert into venture_token_ledger, both .then/.catch branches only logger.warn.',
        location: 'lib/eva/utils/token-tracker.js',
      },
    ],
    recommendations: [
      'File a follow-up QF/SD applying the same emitFeedback(category:harness_backlog) treatment to token-tracker.js\'s recordTokenUsage() (done -- feedback row 1bc70a2c-04e7-4db7-aeb2-718aa2080205).',
      'Proceed to PLAN -- both fixes are on-target and scope-correct at the design level; a DB-tier defect in fix #2\'s original source_type value was subsequently found and fixed by an independent Validation pass (see the VALIDATION row for this phase).',
    ],
    detailed_analysis: {
      commands_run: [
        'npx vitest run tests/unit/eva/assumption-reality-tracker.test.js tests/unit/sub-agents/risk-assessment-completeness.test.js -> 2 files, 84/84 passed',
        'grep for other fire-and-forget Supabase writes across lib/eva/utils/**',
        'git diff --stat on both modified lib files -- confirmed additive-only',
      ],
    },
    metadata: { independent_verification: true },
  };

  const validationResults = {
    verdict: 'PASS',
    confidence: 90,
    phase: 'LEAD',
    execution_time_ms: 0,
    summary: "Independently verified rather than trusting claims, in TWO passes (initial FAIL, then re-verification after remediation). PASS 1 (FAIL): proved via an executed INSERT attempt inside a rolled-back transaction that reportWriteFailure()'s original source_type:'assumption_reality_tracker' is NOT a member of the live feedback_source_type_check CHECK constraint (code 23514) -- emitFeedback throws on every real call, silently swallowed by the fix's own .catch(), reproducing PAT-LES-6d8e6a986931's exact complaint (a fix that is dead by construction and invisible in the same way the pattern it closes describes). Also found the accompanying mocked unit tests could never have caught this (emit-feedback.js fully mocked, source_type never asserted) -- root cause of the escape. Also found (F4) that the origin retrospective for PAT-LES-0bac630efd73 (SD-LEO-FIX-MULTI-VENTURE-ISOLATION-001) measured 'only one risk' against the SD-level risks column (SD.risks=1), not only the PRD's (PRD.risks=2) -- the fix's original prd.risks-only check still fired correctly on that case but read a different artifact than the one actually measured. Also found (F5) the fix's original emitFeedback description embedded the volatile error message, defeating emit-feedback.js's own documented daily dedup_hash scheme (the exact fleet_dormancy/66-row incident class it warns about in its own header). Also confirmed live that lib/eva/gate-failure-recovery.js's existing source_type:'gate_failure_recovery' call (offered as this SD's own precedent) is ITSELF not a live-valid value -- a live query confirmed zero feedback rows have EVER been written with that source_type, meaning that code path has silently dropped every producer-less-artifact-gap escalation since inception. PASS 2 (re-verification, PASS): re-ran the same rolled-back-transaction probe against the corrected source_type:'auto_capture' -- INSERT ACCEPTED. Confirmed the new DB-tier regression test (tests/database/assumption-reality-tracker-source-type.db.test.js) behaves identically to its established precedent (tests/database/feedback-source-type-allowlist-membership.db.test.js) under the same undesignated-DB-ref conditions -- both skip identically, confirming this is pre-existing tier-wide gating behavior (tracked separately as QF-20260818-041), not a defect introduced here. Confirmed checkRiskAssessmentCompleteness now reads Math.max(sd.risks.length, prd.risks.length), reproducing the origin case exactly (SD.risks=1, PRD.risks=0 in the reproduction test). Confirmed the dedup fix (error message moved to metadata.error_message, description held stable) is genuinely applied. Confirmed both issue_patterns rows now carry a populated prevention_checklist. Confirmed the deliberate scope deferral of a shared, hard-throw ALLOWED_SOURCE_TYPES validation in lib/governance/emit-feedback.js is correct and endorsed it: that function has 15+ source_type call sites across lib/**, at least one confirmed (lib/quality/burst-detector.js) to write directly to .from('feedback') and bypass emitFeedback entirely, so a blind app-level throw would be both incomplete and risk breaking unaudited, currently-working callers -- exactly the 'refactoring unrelated code paths' this SD's own OUT OF SCOPE line forbids. Per this session's [MODE: campaign] default (SD-LEARN-FIX-* matches the campaign-mode rule), recommended minting a QF for the one-token gate-failure-recovery.js fix now rather than letting a severity-high, 100%-silently-broken escalation path idle in harness_backlog -- done (QF-20260914-976, unclaimed/queued).",
    critical_issues: [],
    warnings: [
      {
        id: 'VAL-1',
        severity: 'LOW',
        issue: 'results.warnings.length is read by risk.js\'s own determineVerdict() (riskLevel===\'MEDIUM\' && warningCount>2 -> CONDITIONAL_PASS) -- the new advisory warning CAN shift a recorded verdict from PASS to CONDITIONAL_PASS in a narrow, reachable MEDIUM-risk case. This is NOT an OUT-OF-SCOPE violation (no gate threshold or scoring formula was altered; CLI exit is 0 either way; every consuming gate treats CONDITIONAL_PASS as a pass), but the handoff/PR text must state this precisely rather than claim the new warning is fully inert.',
        evidence: 'lib/sub-agents/risk.js determineVerdict(), the warningCount>2 branch.',
        location: 'lib/sub-agents/risk.js',
      },
    ],
    recommendations: [
      'PLAN/EXEC: state precisely (not "cannot affect anything") that the new advisory warning can raise warnings.length and, in a specific reachable case, shift a MEDIUM verdict to CONDITIONAL_PASS -- done in this evidence record and in the completion documentation.',
      'Proceed to PLAN -- both root causes are now genuinely closed with independently-verified, DB-proven fixes; the deliberately deferred systemic ALLOWED_SOURCE_TYPES audit and the gate-failure-recovery.js one-token fix are durably tracked (feedback 4b194485-40f4-4ca1-b3ad-79fc0ecc776c; QF-20260914-976) rather than silently dropped.',
    ],
    detailed_analysis: {
      commands_run: [
        "Rolled-back-transaction INSERT probe (BEGIN/ROLLBACK, zero durable rows left): source_type='assumption_reality_tracker' -> REJECTED code=23514; source_type='auto_capture' -> ACCEPTED",
        "SELECT count(*) FROM feedback WHERE source_type='gate_failure_recovery' -> 0 rows, ever",
        'npx vitest run tests/unit/eva/assumption-reality-tracker.test.js tests/unit/sub-agents/risk-assessment-completeness.test.js -> 87/87 passed after remediation',
        'npx vitest run --project db tests/database/assumption-reality-tracker-source-type.db.test.js and the precedent file under identical undesignated conditions -> same skip/fail-suite behavior, confirming parity',
        'Verified feedback rows 4b194485-40f4-4ca1-b3ad-79fc0ecc776c and 1bc70a2c-04e7-4db7-aeb2-718aa2080205 persisted (not just returned) with correct severity/status',
      ],
      reverified_citations: [
        { claim: "reportWriteFailure() source_type is live-valid", status: 'INITIALLY FALSE (23514), CORRECTED and RE-VERIFIED TRUE' },
        { claim: "lib/eva/gate-failure-recovery.js's source_type is the established, working precedent", status: 'FALSE -- that call site has 0 durable rows ever; itself silently broken since inception, now tracked as QF-20260914-976' },
      ],
    },
    metadata: { independent_verification: true, review_passes: 2 },
  };

  for (const [code, name, results] of [['EXPLORE', 'Explore', exploreResults], ['VALIDATION', 'Validation', validationResults]]) {
    const resolution = await resolveSubAgentRepo({
      sdId: sdRow.id,
      targetApplication: 'EHG_Engineer',
      subAgentCode: code,
      probeExistsRelative: 'scripts/one-off/learn-154-lead-to-plan-evidence.mjs',
      supabase,
    });
    applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
    const stored = await storeSubAgentResults(code, sdRow.id, { code, name }, results, { sdKey: SD_KEY, phase: 'LEAD' });
    console.log('STORED:', code, JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
  }
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
