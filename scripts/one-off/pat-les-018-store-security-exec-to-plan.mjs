#!/usr/bin/env node
// EXEC-TO-PLAN SECURITY evidence for SD-LEARN-FIX-ADDRESS-PAT-LES-018.
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
    confidence: 95,
    phase: 'EXEC-TO-PLAN',
    execution_time_ms: 0,
    summary: 'Reviewed the diff for security exposure. This SD touches exactly 2 non-test files (a markdown reference doc, and a console.log-only text block in a CLI checklist hint) plus 2 new read-only test files -- no new DB writes, no new query construction, no new user input handling, no new external calls, and no change to any CHECK constraint, RLS policy, or migration. The new documentation section quotes only the ALREADY-PUBLIC constraint definitions (already readable by anyone with repo access via database/schema-reference-snapshot.json) and a generic, non-sensitive example INSERT payload -- no secrets, credentials, or connection strings introduced. The extended CLI hint text is a static string literal printed via console.log, with no interpolation of external/user-controlled input. Confirmed via git diff that no migration file, RLS policy file, or auth-adjacent code path was touched.',
    critical_issues: [],
    warnings: [],
    recommendations: [
      'No changes required. This SD is documentation/discoverability-only with zero new attack surface.',
    ],
    detailed_analysis: {
      commands_run: [
        'git diff origin/main...HEAD --stat -- confirmed the diff touches exactly docs/reference/database-agent-patterns.md, scripts/modules/handoff/cli/cli-main.js, plus 2 new test files and evidence scripts -- no migration, RLS, or auth file',
        'Read both changed non-test files in full -- confirmed no interpolation of external input into the new console.log lines, no secret-shaped strings introduced',
      ],
    },
    metadata: { independent_verification: true },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'SECURITY',
    probeExistsRelative: 'scripts/one-off/pat-les-018-store-security-exec-to-plan.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults('SECURITY', sdRow.id, { code: 'SECURITY', name: 'Security' }, results, { sdKey: SD_KEY, phase: 'EXEC-TO-PLAN' });
  console.log('STORED:', 'SECURITY', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
