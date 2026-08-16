import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../../lib/sub-agent-executor/results-storage.js';
dotenv.config({ path: '../../../.env' });
dotenv.config();

const SD_ID = '234928d8-f45b-4998-a1e6-28704e78cf6e';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: sd } = await supabase.from('strategic_directives_v2').select('target_application').eq('id', SD_ID).single();

const results = {
  verdict: 'PASS',
  confidence: 92,
  status: 'complete',
  summary: [
    'RE-VERIFICATION of the four VALIDATION findings after coordinator fixes (commits 85136444f87, 566bddbcb81, 2f284528fa9). Verified by reading the code and executing tests, not by accepting the report.',
    'ALL FOUR CLOSED, plus one self-caught regression (REG-1).',
    'VAL-1 CLOSED: findActiveOverride now returns {override, schemaMissing}; the single call site at pre-plan-critique.js:245 destructures correctly (checked specifically - a missed caller would have made the object always-truthy and auto-bound every override, inverting the security property; it did not happen). The schemaMissing branch pushes a loud named warning that explicitly states it is NOT evidence no override was recorded.',
    'VAL-2 CLOSED: migration COMMENT ON COLUMN line 67 and header line 22 now read "SHA-256 of the FULL, pre-truncation PRD+arch content (not the truncated text sent to the LLM), plus adapter.defaultModel + archLoadStatus + the MAX_CRITIQUE_ANALYSIS_CHARS/SECTION_BUDGETS constants" - accurate, and it correctly picked up the budget-constant component. critique-override.js:15 fixed.',
    'VAL-3 CLOSED: TS-9 is a genuine test, correctly constructed - the matching override is inserted FIRST, then 12 newer noise rows, so a bare created_at-DESC .limit(10) would evict the match. Integration file now registers 5 tests (was 4).',
    'VAL-4 CLOSED: pre-plan-critique.test.js now asserts the actual INSERT payload - supabase._inserted[0].metadata.truncated (literal booleans + side-qualified counts) and metadata.cache_hit / cache_source_id - not just critiquePlanProposal return values.',
    'REG-1 (self-caught, not in my original report as a separate finding but present in my VAL-1 evidence table): critique-override.js was the third schema-missing consumer; it now has its own named PGRST204/42703 branch.',
    'EXECUTED: 74/74 unit tests green across the 4 suites (was 71/71); schema-reference-lint --diff clean (3 files, 0 new violations); integration suite skips cleanly (5 skipped, DB_TIER_BLOCKED, no designated non-prod target).',
    'Verdict upgraded CONDITIONAL_PASS -> PASS. Four LOW residuals remain, all previously classed may-defer.',
  ].join(' '),
  findings: [
    { severity: 'INFO', id: 'VAL-1-CLOSED', title: 'VAL-1 closed and verified - caller seam checked explicitly', evidence: 'findActiveOverride returns {override, schemaMissing} on all 5 return paths incl. the catch. Sole call site pre-plan-critique.js:245 destructures. Loud branch text: "plan_critiques SCHEMA MISSING on override lookup ... this is NOT evidence that no override was ever recorded. Do not treat this block as unoverridable-by-design." ROLLOUT PRECONDITION text in the PRD now enumerates which paths are loud (persistCritique PGRST204, findActiveOverride 42703) vs safely-silent-by-design (lookupCacheHit, justified as a pure optimization whose fallback to a fresh LLM call is always safe). That justification is correct.', location: 'pre-plan-critique.js:245,258-266,384-412', fix: 'None - closed.' },
    { severity: 'INFO', id: 'VAL-2-CLOSED', title: 'VAL-2 closed in code artifacts; one stale copy remains in the PRD (see VAL-7-RESIDUAL)', evidence: 'Migration COMMENT + header + critique-override.js all corrected to "FULL, pre-truncation". PRD FR-4 AC-1 still reads "SHA-256 of the exact post-truncation/chunking prdText+archText" - the shipped COMMENT now contradicts the PRD acceptance criterion it implements.', location: 'migration:22,67; critique-override.js:15; PRD FR-4 AC-1 (still stale)', fix: 'Amend PRD FR-4 AC-1 to match the shipped, corrected behaviour.' },
    { severity: 'INFO', id: 'VAL-3-CLOSED', title: 'VAL-3 closed - TS-9 test is genuine and correctly ordered', evidence: 'Test inserts the matching override first, then 12 newer non-matching blocking rows, then asserts the content_hash-filtered query returns exactly 1 row. Ordering is what makes it a real burst test rather than a tautology. HONEST RESIDUAL (unchanged from my original report): this file has never actually executed anywhere - it requires the staged columns AND a designated non-prod ref. Its correctness is established by reading it, not by running it.', location: 'tests/integration/eva/pre-plan-critique-content-hash.integration.test.js:128-156', fix: 'Run post-ceremony-N+1 against a designated non-prod ref.' },
    { severity: 'INFO', id: 'VAL-4-CLOSED', title: 'VAL-4 closed - real INSERT-payload assertions', evidence: 'Two new gate tests assert supabase._inserted[0].metadata.truncated equals the exact literal-boolean + side-qualified shape, and metadata.cache_hit===true / cache_source_id==="cached-row-xyz". These assert the gate WRITE, which was the gap.', location: 'pre-plan-critique.test.js:244-271', fix: 'None - closed.' },
    { severity: 'LOW', id: 'VAL-5-OPEN', title: 'TS-10 budget-boundary test still absent', evidence: 'Unchanged. Behaviour correct by inspection (buildBudgetedPrdText:694 "if (rawTotal <= MAX)").', location: 'tests/unit/eva/devils-advocate-critique-truncation.test.js', fix: 'Add the N vs N+1 case.' },
    { severity: 'LOW', id: 'VAL-6-OPEN', title: 'TR-8 fixture still only partially materialized', evidence: 'Unchanged - used as a measurement source, no fixture file for TS-1/TS-2.', location: 'TR-8', fix: 'Materialize or record the reduction.' },
    { severity: 'LOW', id: 'VAL-7-RESIDUAL', title: 'PRD self-contradictions still unamended, now including FR-4 AC-1', evidence: 'Re-read live 2026-08-16T18:21Z: TR-3 title still "database/migrations/, NOT chairman-gated"; top-level acceptance_criteria[4] still "the audited override mechanism [is] never weakened or altered by this SD"; acceptance_criteria[2] still names MAX_ANALYSIS_CHARS; FR-4 AC-1 still says "post-truncation". The implementation_approach ROLLOUT text WAS amended, so the PRD is partially updated - which makes the remaining stale clauses read as current rather than as known-stale.', location: 'PRD TR-3 title; acceptance_criteria[2],[4]; FR-4 AC-1', fix: 'Amend the four clauses, or annotate them as superseded.' },
    { severity: 'LOW', id: 'VAL-8-OPEN', title: 'FR-3 AC-2 population-derivation half still missing', evidence: 'Unchanged - the constant comment documents the context-window derivation, not the 4340-PRD population figures AC-2 enumerates.', location: 'lib/eva/devils-advocate.js:31-48', fix: 'Append the population measurement and 48000-rejection rationale.' },
    { severity: 'INFO', id: 'VAL-10', title: 'Self-check: implementation_approach shape is NOT a regression', evidence: 'implementation_approach is typeof string (JSON-encoded), so a consumer doing .steps[] gets undefined. Verified against my own first-pass dump that this predates the fixes: the original dump had compact JSON separators, which JSON.stringify(v, null, 2) could not have produced, so the column was already a string. My probe script was wrong, not the data. Not filed as a finding.', location: 'product_requirements_v2.implementation_approach', fix: 'None.' },
  ],
  recommendations: [
    'Verdict upgraded to PASS. All four findings closed and independently verified by code read + test execution; the caller seam on the findActiveOverride signature change was checked specifically and is clean.',
    'Clear to proceed to PLAN-TO-LEAD.',
    'Carry the four LOW residuals (VAL-5, VAL-6, VAL-7, VAL-8) as recorded follow-ups. VAL-7 is the one worth doing soon: the PRD was partially amended, so its remaining stale clauses now read as current rather than as known-stale - notably FR-4 AC-1, which the shipped migration COMMENT now directly contradicts.',
    'Post-ceremony-N+1, run the acceptance script and then actually execute the integration suite against a designated non-prod ref - TS-5/6/8/9 have still never run anywhere.',
  ],
  detailed_analysis: [
    'RE-VERIFICATION SCOPE: targeted confirmation of the four fixes, not a fresh full pass, per the coordinator request.',
    'HIGHEST-VALUE CHECK: the VAL-1 fix changed findActiveOverride from returning a row to returning {override, schemaMissing}. That is precisely the seam where a half-applied fix inverts a security property - a missed caller doing "if (override)" against the new always-truthy object would auto-downgrade every block. Verified there is exactly one call site and it destructures correctly. Also verified all five return paths (early-return, error, empty, match, catch) return the object shape consistently, so no path leaks a bare row or undefined.',
    'The coordinator reported two commits; the branch has three. The third (2f284528fa9) closes REG-1, critique-override.js as the third schema-missing consumer - which appeared in my original VAL-1 evidence table as the misleading "No blocking critique found" rendering. Self-caught and correctly fixed.',
    'EXECUTED: 74/74 unit tests across the four suites (up from 71/71 - the three new tests are the two VAL-4 gate assertions plus one more). schema-reference-lint --diff: 3 files, 0 new violations. Integration suite: 5 tests registered (up from 4, confirming TS-9 is wired), all skipping cleanly via DB_TIER_BLOCKED with no designated non-prod target.',
    'The corrected ROLLOUT PRECONDITION text is accurate and I agree with its reasoning, including the judgement that lookupCacheHit 42703 should stay silent - falling through to a fresh LLM call is always safe, so surfacing it would be noise, not signal. That is the right distinction to draw and it is now drawn explicitly rather than assumed.',
  ].join(' '),
  execution_time_ms: 0,
  metadata: {
    sd_key: 'SD-LEO-INFRA-PRE-PLAN-CRITIQUE-PRD-TRUNCATION-001',
    prd_id: 'PRD-SD-LEO-INFRA-PRE-PLAN-CRITIQUE-PRD-TRUNCATION-001',
    branch: 'feat/SD-LEO-INFRA-PRE-PLAN-CRITIQUE-PRD-TRUNCATION-001',
    supersedes_evidence_row: '3b4f0055-7bbd-4796-bdd3-665060bddf20',
    fix_commits_verified: ['85136444f87', '566bddbcb81', '2f284528fa9'],
    tests_executed: '74/74 unit passed (4 suites); integration 5 skipped cleanly (DB_TIER_BLOCKED)',
    schema_lint: 'schema-reference-lint --diff: 3 files, 0 new violations',
    findings_closed: ['VAL-1', 'VAL-2 (code artifacts)', 'VAL-3', 'VAL-4', 'REG-1'],
    findings_open_low: ['VAL-5', 'VAL-6', 'VAL-7 (incl. PRD FR-4 AC-1 stale)', 'VAL-8'],
    verdict_transition: 'CONDITIONAL_PASS(88) -> PASS(92)',
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  targetApplication: sd?.target_application,
  subAgentCode: 'VALIDATION',
  fallback: 'EHG_Engineer',
  supabase,
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults(
  'VALIDATION',
  SD_ID,
  { id: null, name: 'Principal Systems Analyst' },
  results,
  { phase: 'PLAN_VERIFICATION', sdKey: 'SD-LEO-INFRA-PRE-PLAN-CRITIQUE-PRD-TRUNCATION-001' }
);
console.log('STORED:', stored?.id, '| verdict:', stored?.verdict, '| confidence:', stored?.confidence);
