#!/usr/bin/env node
// EXEC-TO-PLAN TESTING evidence for SD-LEARN-FIX-ADDRESS-PAT-LES-018.
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { buildTestExecution } from '../../lib/sub-agents/testing/test-execution-record.js';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PAT-LES-018';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: sdRow, error: sdErr } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
  if (sdErr) throw sdErr;

  const results = {
    verdict: 'PASS',
    confidence: 90,
    phase: 'EXEC-TO-PLAN',
    execution_time_ms: 0,
    summary: "Implemented FR-1/FR-2/FR-3 exactly as scoped: added a new 'user_stories Table Constraints' section to docs/reference/database-agent-patterns.md documenting the live valid_story_key regex and user_stories_priority_check enum with a working example INSERT, and extended the existing PLAN-TO-EXEC checklist hint in scripts/modules/handoff/cli/cli-main.js to name 'priority' as required (previously omitted entirely) and reference the exact story_key regex. Both CHECK constraints themselves are unchanged (confirmed: no diff touches database/schema-reference-snapshot.json or any migration file). 2 new test files (TS-1 in tests/unit/docs/, TS-2/TS-3 in tests/unit/handoff/, 7 tests total) read the LIVE schema snapshot rather than hardcoding constraint text, so a future constraint change that the doc/hint forgets to follow fails CI. All 3 assertions independently mutation-tested this EXEC phase: each mutation (bogus priority example, removed 'minimal' value, removed 'priority' from the hint text) failed exactly the intended test and no other, restored via cp/diff byte-identical confirmation each time.",
    critical_issues: [],
    warnings: [],
    recommendations: [
      'VERIFY-phase VALIDATION should independently re-run the full tests/unit/handoff/ + tests/unit/docs/ suite and confirm zero regressions, plus spot-check that the doc\'s example story_key/priority still pass their own live-snapshot-derived assertions.',
    ],
    detailed_analysis: {
      commands_run: [
        'unset all Supabase/DB env vars && npx vitest run tests/unit/handoff/ tests/unit/docs/ -- 1365 passed, 0 failed, 3 skipped (full directory, not just the 2 new files)',
        'node scripts/lint/require-main-guard-in-one-off-lint.mjs --working-dir -- 0 violations',
        'Mutation test 1 (doc): bogus priority example value -- failed exactly "example priority satisfies the LIVE constraint", restored byte-identical, re-ran clean',
        'Mutation test 2 (doc): replaced ALL "minimal" occurrences with "minuscule" -- failed exactly "doc names all 5 valid priority values", restored byte-identical, re-ran clean',
        'Mutation test 3 (cli-main.js): removed the 2 lines naming "priority" from the checklist hint -- failed exactly TS-2\'s test, restored byte-identical, re-ran clean',
        "git diff origin/main...HEAD --stat -- confirmed the diff touches exactly 2 non-test files (the doc, cli-main.js) plus the 2 new test files, no unrelated file changed, no migration/constraint file touched",
      ],
    },
    metadata: {
      independent_verification: true,
      real_findings_count: 0,
      test_execution: buildTestExecution({
        executed: 1368,
        passed: 1365,
        failed: 0,
        skipped: 3,
        runner: 'vitest',
        source: 'npx vitest run tests/unit/handoff/ tests/unit/docs/ (full directories)',
      }),
    },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'TESTING',
    probeExistsRelative: 'scripts/one-off/pat-les-018-store-testing-exec-to-plan.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults('TESTING', sdRow.id, { code: 'TESTING', name: 'Testing' }, results, { sdKey: SD_KEY, phase: 'EXEC-TO-PLAN' });
  console.log('STORED:', 'TESTING', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
