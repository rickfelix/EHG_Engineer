#!/usr/bin/env node
/**
 * One-off: Explore sub-agent evidence for SD-LEARN-FIX-ADDRESS-PAT-LES-016, LEAD-TO-PLAN phase.
 *
 * Records the discovery work performed before LEAD scope correction: re-verified
 * PAT-LES-2116dd961204's premise ("add-prd-to-database.js creates PRDs in draft status by
 * default") against current main by tracing the live call path (scripts/add-prd-to-database.js
 * -> scripts/prd/index.js addPRDToDatabase() -> scripts/prd/prd-creator.js
 * createPRDWithValidatedContent()), reading every status-setting insert/update site in
 * prd-creator.js, running git log on the file's history, and querying the live
 * product_requirements_v2 table's status distribution. Independently corroborated by an
 * Explore-agent Task-tool run reaching the identical REFUTED conclusion.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PAT-LES-016';

const findings = [
  {
    id: 'premise-refuted-live-path-auto-approves',
    severity: 'INFO',
    summary: 'The only PRD-insert function the live CLI path reaches is createPRDWithValidatedContent() (scripts/prd/prd-creator.js), invoked from scripts/prd/index.js:183/:211, invoked from scripts/add-prd-to-database.js\'s CLI entry point. Its INSERT branch (line 460) sets `status: \'approved\', // Auto-approved: grounding validation passed` unconditionally; its UPDATE-existing branch (line 339) also sets `status: \'approved\'`. Neither ever writes \'draft\' or \'planning\'.',
  },
  {
    id: 'draft-status-path-is-dead-code',
    severity: 'INFO',
    summary: 'The only status=\'planning\' insert site (createPRDEntry(), prd-creator.js:145) is dead code: scripts/prd/index.js:36 explicitly documents "createPRDEntry and updatePRDWithLLMContent are deprecated / We now use createPRDWithValidatedContent (generate-first pattern)". A repo-wide search confirms createPRDEntry is defined, re-exported for backward compatibility, and named in that deprecation comment, but never called from any live function. The literal `status VARCHAR(50) DEFAULT \'draft\'` at line 918 is inert -- a string inside printTableCreationSQL(), printed to console only on first-time table bootstrap, never executed against a live DB.',
  },
  {
    id: 'fix-predates-pattern-by-7-months',
    severity: 'INFO',
    summary: 'git log on scripts/prd/prd-creator.js shows commit 551a0453 (2026-02-02) "refactor(prd): implement generate-first-then-insert pattern", followed 3 days later by commit a09c4e48 (2026-02-05) "feat(prd): add semantic concept mapping and auto-approve workflow" -- the auto-approve-on-creation behavior was an explicit, named design decision. PAT-LES-2116dd961204 was first detected 2026-09-12, over 7 months after the fix shipped -- the same "pattern re-surfaces an already-fixed issue" class this session already closed 3 instances of via SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-151.',
  },
  {
    id: 'empirically-confirmed-zero-draft-rows-live',
    severity: 'INFO',
    summary: 'Live query against product_requirements_v2 (all rows, no filter) returns exactly two distinct status values across the entire table: approved (135 rows) and completed (865 rows). Zero rows carry status=\'draft\' or status=\'planning\' -- direct empirical confirmation that no PRD is stuck in the state the pattern describes, not just a code-reading inference.',
  },
  {
    id: 'genuine-untested-gap-found',
    severity: 'LOW',
    summary: 'Despite the behavior being correct, no existing unit test directly asserts that createPRDWithValidatedContent()\'s fresh-INSERT branch (the existingPRD===null path, prd-creator.js:453-460) sets status=\'approved\'. tests/unit/handoff/prerequisite-preflight-prd-status.test.js tests the DOWNSTREAM gate\'s handling of a given status value; tests/unit/prd/prd-creator-integration-default.test.js only exercises the UPDATE-existing branch (all its makeSupabase() fixtures pre-seed status:\'approved\' on an existingPRD). The upstream write-side invariant -- a fresh PRD insert always lands approved -- is genuinely unguarded against regression.',
  },
  {
    id: 'unrelated-proven-solution-data-quality-defect',
    severity: 'LOW',
    summary: 'issue_patterns row PAT-LES-2116dd961204\'s proven_solutions field contains a completely unrelated entry about an "npm install anti-pattern" (missing @anthropic-ai/sdk module), which has nothing to do with the issue_summary\'s PRD status claim. This is a data-quality mismatch in the pattern record itself, not something this SD\'s narrow fix needs to address -- noted as a completion-flags finding, not a blocking issue.',
  },
];

const warnings = [
  'The originally-filed pattern premise is stale/false against current main -- LEAD should NOT scope EXEC to "fix the draft-to-approved gap" (there is nothing to fix). The genuine, narrow value here is closing the untested-gap finding with a direct regression test, mirroring the prior-session precedent (SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-151) of adding a test for previously-untested-but-already-correct logic rather than cancelling the SD outright.',
];

const recommendations = [
  'PLAN should scope EXEC to exactly 1 new test file: a direct unit test asserting createPRDWithValidatedContent() inserts status=\'approved\' on a fresh (no existingPRD) call. No production code change is needed -- the behavior is already correct.',
  'PLAN should also scope a resolution update to issue_patterns row PAT-LES-2116dd961204 (status=resolved, resolution_notes citing this verification) so /learn stops re-surfacing an already-fixed, already-verified item.',
  'No migration, no schema change, no R1 ceremony -- this is a pure regression-test-coverage SD.',
];

const summary = 'Explore-phase discovery for SD-LEARN-FIX-ADDRESS-PAT-LES-016 re-verified PAT-LES-2116dd961204\'s premise directly against current main (code trace + git history + live DB query) rather than trusting the retrospective-derived pattern text. REFUTED: the described draft-to-approved gap does not exist in the live code path -- createPRDWithValidatedContent() has auto-approved every PRD on creation since 2026-02-05, over 7 months before the pattern was detected. Independently corroborated by an Explore-agent Task-tool run reaching the identical conclusion via the same file:line evidence. One genuine, narrow gap survives: the correct-but-unasserted write-side invariant (fresh insert -> status=approved) has no direct regression test. LEAD scope reduction: add that one test, resolve the stale pattern, no production code change.';

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'Explore',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence_score: 96,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'LEAD_TO_PLAN',
      artifacts_read: [
        'scripts/add-prd-to-database.js',
        'scripts/prd/index.js',
        'scripts/prd/prd-creator.js',
        'scripts/prd/README.md',
        'tests/unit/handoff/prerequisite-preflight-prd-status.test.js',
        'tests/unit/prd/prd-creator-integration-default.test.js',
      ],
      probe_method: 'Live read-only query against product_requirements_v2 (SELECT status, no filter, all rows) to empirically confirm the status distribution; git log on scripts/prd/prd-creator.js to date the auto-approve design decision.',
      corroborated_by: 'Explore agent (Task-tool run, LEAD-phase), independently traced the identical live call path and cited the identical commit (a09c4e48, 2026-02-05 "add semantic concept mapping and auto-approve workflow") and REFUTED verdict.',
    },
    phase: 'LEAD_TO_PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'Explore',
    SD_KEY,
    { name: 'Explore' },
    results,
    { sdKey: SD_KEY, phase: 'LEAD_TO_PLAN', source: 'manual' },
  );

  console.log('EXPLORE EVIDENCE WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  repo_path:', stored.metadata?.repo_path);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
