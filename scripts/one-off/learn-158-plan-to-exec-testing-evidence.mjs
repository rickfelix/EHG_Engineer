#!/usr/bin/env node
/**
 * SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-158 — TESTING evidence at PLAN-TO-EXEC.
 *
 * A testing-agent sub-agent reviewed the PRD's test strategy pre-implementation. It measured
 * the actual site data of the 4 motivating patterns and found the originally-drafted FR-1
 * predicate (parent_sd_id + recording-proximity window) would have fixed ZERO of the four
 * patterns it was filed for (7-8 distinct parent_sd_id values, 5-minute-to-22-hour windows).
 * It also found the drafted FR-1/FR-2 were destructively coupled (FR-2 rewrites the only
 * timestamp field FR-1's proximity check could read), TR-3's window was unspecified, wrong
 * function names were cited, and several regression/error-handling gaps. The PRD was corrected
 * in response (generalized checkSingleSDClosedSource to an all-distinct-SDs-closed predicate,
 * which the data DOES support cleanly, and which has no timestamp dependency at all -- resolving
 * the coupling by construction) before this evidence was recorded.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { buildTestExecution } from '../../lib/sub-agents/testing/test-execution-record.js';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-158';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: sdRow, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('sd_key', SD_KEY)
    .single();
  if (sdErr) throw sdErr;

  const testingResults = {
    verdict: 'PASS',
    confidence: 90,
    phase: 'PLAN',
    execution_time_ms: 0,
    summary: "PLAN-phase test-strategy review (pre-implementation, no code exists yet). Ran the candidate regression net directly against the current codebase to establish a real baseline: npx vitest run --project unit tests/learn/ tests/unit/learning/{class-escalation,issue-knowledge-base-quarantine-guard,issue-knowledge-base-proven-solutions-guard,batch-resilience}.test.js -> 8 files/125 tests green; plus the RCA trio (tests/unit/rca-skip-governance.test.js, tests/unit/rca-trigger-quick-wire.test.js, tests/unit/rca-orchestrator-noise.test.js) -> 3 files/30 tests green. Resolved every one of the 4 motivating patterns' real metadata.sites[] sd_ids against strategic_directives_v2 directly: PAT-LES-752e6a374f67 (20 sites, 20 resolved, 8 distinct parent_sd_id values, max cluster 5, ~2min span), PAT-LES-8fb5175dce26 (20 sites, 8 parents, 370.7min span), PAT-LES-15c6ed980a2e (21 sites, 8 parents, 1323.2min span), PAT-LES-e02af6e8e18d (19 sites, 7 parents, 5.0min span). This DIRECTLY REFUTED the originally-drafted FR-1 predicate (shared parent_sd_id + narrow recording-proximity window): no pattern has one shared parent, and windows range from 5 minutes to 22 hours, not seconds/minutes. An implementation faithful to the original FR-1 would reject zero of the four patterns it was filed to fix -- a green test suite over an unfixed defect. Found the clean, data-supported alternative directly in the same query: 100% of resolved sites across all 4 patterns are status=completed, and all 4 patterns are severity=medium (not shielded by the existing SINGLE_SD_SEVERITY_BYPASS). Also found FR-1 (as drafted) and FR-2 were destructively coupled: mergeSite stores exactly one timestamp per site (first_seen), and FR-2 rewrites it to the retro's historical created_at -- so FR-1's proximity window, if implemented, would read a field FR-2 is simultaneously scrambling, working for legacy rows and never firing for new ones. Found TR-3 (bounded window) had no concrete number/option/env-var, unlike every other tunable in the module (e.g. DEFAULT_STALE_OPEN_AGE_DAYS=7). Found FR-2 cited the wrong function name (extractPatternsFromRetrospective, a DB-fetching wrapper) instead of the actual call site (extractPatternsFromImprovements, declared ~line 197, recordOccurrence call ~line 245) and missed a second write path (kb.createPattern, ~line 271, used for brand-new patterns) that has the identical defect. Found the 3 single-SD guard functions are module-private (not exported) -- tests must route through the exported filterPatternsForLearning, matching the existing tests/learn/filter-single-sd-noise.test.js pattern. Found no test scenario covered malformed/missing created_at, which would reach mergeSite's unguarded now.toISOString() as an Invalid Date and throw (silently swallowed by the caller's catch, dropping the site write). Found TS-5/FR-5's RCA regression net was hollow: the two real-time call sites live in module-private upsertIssuePattern, reachable only via exported processTriggerEvent, and neither existing test file exercises that function -- though confirmed both call sites pass exactly 3 positional arguments with no opts object, so an additive opts.now cannot affect them without an active code change to that file. Found a mixed sd_id key-form hazard: one pattern's first_seen_sd_id is a text key (SD-LEARN-FIX-ADDRESS-PAT-AUTO-033) while last_seen_sd_id is a UUID; the existing fetchPatternSourceSDStatuses .in('id', ...) shape works for both since strategic_directives_v2.id itself is varchar, but a new fixture must exercise a text-key row to prove the extended resolver doesn't silently special-case UUIDs. All findings were incorporated into a corrected PRD (FR-1 retargeted to an all-distinct-SDs-closed predicate that reads no timestamps at all, resolving the coupling by construction; FR-2 corrected to the real function names and extended to the createPattern branch with an explicit malformed-input fallback; FR-3/FR-4/FR-5 and their test scenarios updated to match) before this evidence was recorded.",
    critical_issues: [],
    warnings: [
      {
        id: 'TEST-1',
        severity: 'LOW',
        issue: "vitest.config.js's coverage include list (lib/**/*.{js,mjs}, scripts/**/*.js) does not match scripts/modules/learning/filter.mjs (a .mjs file under scripts/), so the primary changed file reports zero coverage under any coverage gate. Pre-existing gap, not introduced by this SD; recorded as TR-3 in the corrected PRD as informational, not blocking.",
      },
    ],
    recommendations: [
      "EXEC should implement FR-2 (timestamp threading) first since it is fully independent of FR-1 and lower-risk, then FR-1 (the closed-source generalization) on top -- exactly the sequencing the corrected PRD's implementation_approach now specifies.",
      "EXEC should verify the FR-5 RCA-path claim (3 positional args, no opts, hence unaffected) is still true at the moment of implementation, in case an intervening change added a 4th argument.",
    ],
    detailed_analysis: {
      commands_run: [
        'npx vitest run --project unit tests/learn/ tests/unit/learning/{class-escalation,issue-knowledge-base-quarantine-guard,issue-knowledge-base-proven-solutions-guard,batch-resilience}.test.js -> 8 files/125 tests green',
        'npx vitest run --project unit tests/unit/rca-skip-governance.test.js tests/unit/rca-trigger-quick-wire.test.js tests/unit/rca-orchestrator-noise.test.js -> 3 files/30 tests green',
        'Direct DB resolution of all 4 patterns\' metadata.sites[] sd_ids against strategic_directives_v2.parent_sd_id and .status',
        'Read scripts/modules/learning/filter.mjs in full (export list, checkSingleSDClosedSource/StaleOpenSource/RetroLikeCategory, fetchPatternSourceSDStatuses, filterPatternsForLearning) and lib/rca/rca-orchestrator.js\'s two call sites',
        'Confirmed exported vs module-private functions in scripts/modules/learning/filter.mjs against its export statement',
      ],
    },
    metadata: {
      independent_verification: true,
      blocking_findings_resolved: true,
      // PLAN-phase baseline established by directly re-running the pre-existing touched-area
      // suites (no fix code exists yet, so this is a regression baseline, not a verdict on new
      // code): 8 files/125 tests + 3 files/30 tests, all green, 0 failed.
      test_execution: buildTestExecution({
        executed: 155,
        passed: 155,
        failed: 0,
        skipped: 0,
        runner: 'vitest',
        source: 'fresh',
      }),
    },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'TESTING',
    probeExistsRelative: 'scripts/one-off/learn-158-plan-to-exec-testing-evidence.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(testingResults, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults('TESTING', sdRow.id, { code: 'TESTING', name: 'Testing' }, testingResults, { sdKey: SD_KEY, phase: 'PLAN' });
  console.log('STORED:', 'TESTING', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
