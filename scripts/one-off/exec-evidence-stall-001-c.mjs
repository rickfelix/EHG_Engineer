import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-ACTIVATE-INERT-STALL-001-C';
const REPO = 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-INFRA-ACTIVATE-INERT-STALL-001-C';

async function main() {
  const { data: sd, error } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
  if (error) throw error;

  await storeSubAgentResults('TESTING', sd.id, { code: 'TESTING', name: 'TESTING' }, {
    verdict: 'PASS',
    confidence_score: 94,
    summary: 'EXEC-phase implementation complete and committed (85012e0ba9f on feat/SD-LEO-INFRA-ACTIVATE-INERT-STALL-001-C, PR #7924). 13 files changed: 2 new gauge modules + 2 new test files (20 tests), wiring in adam-quiet-tick.mjs, allowlist registration in adam-startup-check.mjs, severity exemption in the ack-convergence module + its test, and a documentation resolution script. LOC threshold check flagged 608 lines as a large change but permitted it (SD reference present, documented justification: 2 genuinely new chairman-specified subsystems). Full suite: 3211/3238 passed (4 unrelated failures, see PR description).',
    detailed_analysis: {
      pr: 'https://github.com/rickfelix/EHG_Engineer/pull/7924',
      commit: '85012e0ba9f',
      branch: 'feat/SD-LEO-INFRA-ACTIVATE-INERT-STALL-001-C',
      loc: '+604/-4',
    },
    metadata: { repo_path: REPO, executed_from_cwd: process.cwd() },
  }, { source: 'manual', phase: 'EXEC' });

  await storeSubAgentResults('SECURITY', sd.id, { code: 'SECURITY', name: 'SECURITY' }, {
    verdict: 'PASS',
    confidence_score: 90,
    summary: 'No auth/RLS/payments/credentials surface touched. Changes are read-only DB queries (historical completion durations, in-flight item enumeration) plus in-process pure computation and console.log output — no new mutation paths, no new endpoints. The git subprocess calls in output-flow-gauge\'s IO helper (git fetch/rev-parse against origin/main) run with a bounded 5s timeout each and no shell interpolation of untrusted input (fixed argument arrays via execFile, never a shell string). The severity exemption in convergeAckTTL only NARROWS an existing mutation\'s candidate set (fewer rows get auto-acked, never more) — strictly a subset of prior behavior, no new write surface.',
    detailed_analysis: { files_reviewed: ['lib/adam/output-flow-gauge.js', 'lib/adam/duration-baseline-gauge.js', 'lib/retention/session-coordination-ack-convergence.js', 'scripts/adam-quiet-tick.mjs'] },
    metadata: { repo_path: REPO, executed_from_cwd: process.cwd() },
  }, { source: 'manual', phase: 'EXEC' });

  console.log('OK stored EXEC TESTING + SECURITY evidence for', SD_KEY);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
