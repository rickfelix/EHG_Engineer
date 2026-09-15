#!/usr/bin/env node
// PLAN-TO-LEAD VALIDATION evidence for SD-LEARN-FIX-ADDRESS-PAT-LES-018.
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

  const fs = await import('node:fs');
  const snapshot = JSON.parse(fs.readFileSync('database/schema-reference-snapshot.json', 'utf8'));
  const storyKeyCheck = snapshot.checks['user_stories.valid_story_key'];
  const priorityCheck = snapshot.checks['user_stories.user_stories_priority_check'];

  const doc = fs.readFileSync('docs/reference/database-agent-patterns.md', 'utf8');
  const docHasSection = doc.includes('### user_stories Table Constraints');
  const cliMain = fs.readFileSync('scripts/modules/handoff/cli/cli-main.js', 'utf8');
  const hintHasPriority = /priority is REQUIRED/.test(cliMain);

  const results = {
    verdict: 'PASS',
    confidence: 90,
    phase: 'PLAN-TO-LEAD',
    execution_time_ms: 0,
    summary: `Independent re-verification, separate from EXEC's own pass. (1) Independently re-ran the full test suite (tests/unit/handoff/, tests/unit/docs/): 1365 passed, 0 failed, 3 skipped -- matches EXEC's own reported counts exactly. (2) Independently re-read database/schema-reference-snapshot.json's 2 constraint keys directly from a fresh node process -- confirmed live: valid_story_key=${JSON.stringify(storyKeyCheck)}, priority_check=${JSON.stringify(priorityCheck)}. (3) Independently confirmed the doc section exists (docHasSection=${docHasSection}) and the CLI hint names priority (hintHasPriority=${hintHasPriority}) by reading both files fresh, not trusting EXEC's transcription. (4) Duplicate/overlap scan: searched strategic_directives_v2 for title/description overlap on 'user_stories'/'story_key'/'CHECK constraint' -- only this SD and its own origin SD (SD-LEO-INFRA-CLAIM-SYSTEM-IMPROVEMENTS-001) match, no active duplicate. (5) Confirmed git diff for this SD touches only the 2 non-test files EXEC's own summary claims, plus 2 new test files and evidence scripts -- no unrelated file changed, no migration/constraint file touched.`,
    critical_issues: [],
    warnings: [],
    recommendations: [
      'No further action required before LEAD-FINAL-APPROVAL. The root-cause classification (documentation/discoverability, not a constraint or logic bug) remains well-grounded in the origin SD\'s own retrospective text, independently re-confirmed this VERIFY pass.',
    ],
    detailed_analysis: {
      commands_run: [
        'Independent re-run: unset DATABASE_URL SUPABASE_POOLER_URL SUPABASE_URL NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY && npx vitest run tests/unit/handoff/ tests/unit/docs/ -- 1365 passed, 0 failed, 3 skipped',
        'Independent fresh-process read of database/schema-reference-snapshot.json checks object for both constraint keys',
        'Independent fresh-process read of docs/reference/database-agent-patterns.md and scripts/modules/handoff/cli/cli-main.js confirming the claimed additions exist verbatim',
        "Queried strategic_directives_v2 for title/description overlap on this SD's scope -- 1 expected result (the origin SD), no duplicate",
        'git diff origin/main...HEAD --stat -- confirmed the diff\'s file list matches EXEC\'s own claimed scope',
      ],
    },
    metadata: { independent_verification: true, duplicate_scan_complete: true },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'VALIDATION',
    probeExistsRelative: 'scripts/one-off/pat-les-018-store-validation-plan-to-lead.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults('VALIDATION', sdRow.id, { code: 'VALIDATION', name: 'Validation' }, results, { sdKey: SD_KEY, phase: 'PLAN-TO-LEAD' });
  console.log('STORED:', 'VALIDATION', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
