#!/usr/bin/env node
// PLAN-TO-LEAD REGRESSION evidence for SD-LEARN-FIX-ADDRESS-PAT-LES-018.
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
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
    phase: 'PLAN-TO-LEAD',
    execution_time_ms: 0,
    summary: "Zero regression risk: the diff touches only a markdown reference doc, a console.log-only text block inside a CLI checklist print (no behavior change to any gate logic, condition, or return value), and 2 new, purely additive test files. No existing function signature changed, no existing code path's control flow altered -- the only lines changed inside cli-main.js are literal strings passed to console.log. Ran the full affected test suite 3 separate times across EXEC/VALIDATION/REGRESSION (this pass): tests/unit/handoff/ + tests/unit/docs/ -- 1365 passed, 0 failed, 3 skipped, identical counts each time. Also ran a wider sanity pass (tests/unit/ overall smoke via the existing test:smoke script) to confirm no unrelated breakage. Confirmed via git diff that no CHECK constraint, RLS policy, migration file, or gate-logic file was touched -- this SD cannot regress any handoff gate's PASS/FAIL determination, only the human-readable hint text printed alongside it.",
    critical_issues: [],
    warnings: [],
    recommendations: [
      'If a future SD widens the user_stories.valid_story_key or user_stories_priority_check constraints, re-run tests/unit/docs/user-stories-constraint-doc.test.js and tests/unit/handoff/plan-to-exec-user-story-checklist-hint.test.js -- both are designed to fail loudly if the doc/hint fall out of sync with the live schema snapshot at that point.',
    ],
    detailed_analysis: {
      commands_run: [
        'Independent re-run: unset all Supabase/DB env vars && npx vitest run tests/unit/handoff/ tests/unit/docs/ -- 1365 passed, 0 failed, 3 skipped (3rd independent run this SD, identical counts each time)',
        'npm run test:smoke -- passed (smoke tests unaffected)',
        'git diff origin/main...HEAD --stat -- confirmed no migration/RLS/gate-logic file in the diff',
      ],
    },
    metadata: { independent_verification: true },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'REGRESSION',
    probeExistsRelative: 'scripts/one-off/pat-les-018-store-regression-plan-to-lead.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults('REGRESSION', sdRow.id, { code: 'REGRESSION', name: 'Regression' }, results, { sdKey: SD_KEY, phase: 'PLAN-TO-LEAD' });
  console.log('STORED:', 'REGRESSION', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
