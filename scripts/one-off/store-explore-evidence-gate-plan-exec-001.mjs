#!/usr/bin/env node
// LEAD-phase Explore evidence for SD-LEO-FIX-GATE-PLAN-EXEC-001.
// This captures (as durable sub_agent_execution_results evidence) the discovery pass an Explore
// sub-agent already ran this session -- confirming the claimed defect mechanism at
// gate-1-plan-to-exec.js:25, prd-quality-validation.js, and validator-registry/core.js, and
// searching for other call sites / existing tests. The Explore agent type has no Write/Bash-DB
// access, so a general script persists its findings, per this repo's established convention
// (see scripts/one-off/store-explore-evidence-*.mjs).
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_UUID = '37ec760d-256a-4ad3-bf4d-6d59be31b8da';
const SD_KEY = 'SD-LEO-FIX-GATE-PLAN-EXEC-001';

async function run() {
  const supabase = createSupabaseServiceClient();

  let results = {
    sub_agent_name: 'Explore (mechanism discovery + call-site survey)',
    verdict: 'PASS',
    confidence: 95,
    critical_issues: [],
    warnings: [],
    recommendations: [
      'Findings independently cross-verified by validation-agent (sub_agent_execution_results c84eda3c-0670-406e-80a6-d7c42b650f02), which additionally found the literal proposed fix is not zero-regression -- see that row for the corrected design constraints LEAD folded into this SD scope.',
    ],
    detailed_analysis:
      'MEASURED against the live repo (this worktree). CONFIRMED: gate-1-plan-to-exec.js registers prdQualityValidation ' +
      '(line 18) and calls validatePRDQuality(prd, mergedOptions) directly at line 25 -- validatePRDForHandoff is never ' +
      'imported or referenced anywhere in that file. CONFIRMED: validatePRDHeuristic (prd-quality-validation.js:159) ' +
      'computes passed = score >= 50 && issues.length === 0 at line 249 -- any nonzero issues fails regardless of score. ' +
      'CONFIRMED: validatePRDForHandoff (line 381, minimumScore default 70 at line 383) reclassifies issues into ' +
      'warnings when qualityResult.score >= minimumScore (lines 413-424). CONFIRMED: ValidatorRegistry.normalizeResult ' +
      '(validator-registry/core.js:126) computes passed = result.passed ?? result.pass ?? (score >= max_score), and ' +
      'since every validatePRDQuality return path already sets an explicit passed field, this fallback chain never ' +
      'actually exercises the score>=max_score branch for gate-1 as currently wired -- the "hard-fail on any issue" ' +
      'behavior originates entirely from validatePRDHeuristic, not from normalizeResult. CALL-SITE SURVEY: grepped all ' +
      'five other validator-registry gate files (gate-2-implementation-fidelity.js, gate-3-traceability.js, ' +
      'gate-4-strategic-value.js, gate-l-sd-creation.js, gate-q-quality.js) for validatePRDQuality|validatePRDForHandoff ' +
      '-- zero matches; gate-1-plan-to-exec.js is the only registry file touching either function, and the only place ' +
      '`prdQualityValidation` is registered. FOUND A SEPARATE LIVE CODE PATH: ' +
      'scripts/modules/handoff/verifiers/plan-to-exec/PlanToExecVerifier.js:339-344 already calls validatePRDForHandoff ' +
      'for the SAME PLAN-TO-EXEC handoff (a PRD_BOILERPLATE check), wired live via ' +
      'executors/plan-to-exec/index.js:389-392 (not dead/deprecated code) -- so two independent PRD-quality checks ' +
      'currently run per handoff and can disagree on the same PRD. ALSO FOUND: the DB migration ' +
      'database/migrations/20260112_validation_rules_complete.sql:155-168 sets prdQualityValidation criteria.min_score=65, ' +
      'but ValidationOrchestrator.js never spreads rule.criteria into the validator context (only onto gate.meta), so ' +
      'that configured value is inert/never read by gate-1s validator function -- a related but out-of-scope-for-this-SD ' +
      'observation. TEST SURVEY: no test file exists anywhere under ' +
      'scripts/modules/handoff/validation/validator-registry/, and no test named gate-1-plan-to-exec*.test.js or ' +
      'prd-quality-validation.test.js exists. The only test referencing the literal string "prdQualityValidation" ' +
      '(HandoffOrchestrator.precheck-policy.test.js:99-123) only asserts the PRD is loaded into the gate context for a ' +
      'DIFFERENT handoff type (PLAN-TO-LEAD) -- it never exercises this gates pass/fail logic. No test currently pins ' +
      'this gates behavior either way, so there is no existing regression-test dependency on the current strict semantics.',
    execution_time: 0,
    validation_mode: 'prospective',
    justification:
      'Discovery pass confirming the SDs claimed mechanism against the live codebase before formal VALIDATION ran. ' +
      'Every quoted line/behavior in the SD/QF description was independently re-derived from the actual files, not ' +
      'assumed from the description. Surfaced two additional live-system facts (the parallel PlanToExecVerifier ' +
      'leniency check, and the inert DB min_score config) that materially inform the PRD design PLAN will author.',
  };

  const resolution = await resolveSubAgentRepo({
    sdId: SD_UUID,
    subAgentCode: 'EXPLORE',
    targetApplication: 'EHG_Engineer',
  });
  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'EXPLORE',
    SD_UUID,
    { name: 'Explore (mechanism discovery + call-site survey)' },
    results,
    { sdKey: SD_KEY, phase: 'LEAD' }
  );

  console.log('\nEvidence row written:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  repo_path:', stored.metadata?.repo_path);
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
