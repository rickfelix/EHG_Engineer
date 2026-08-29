#!/usr/bin/env node
/**
 * One-off: Explore sub-agent evidence for SD-LEO-FIX-DRIFT-MIGRATIONS-CAST-001, LEAD-TO-PLAN phase.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-FIX-DRIFT-MIGRATIONS-CAST-001';

const findings = [
  {
    id: 'no-other-jsonb-assuming-consumers-found',
    severity: 'INFO',
    summary: 'Repo-wide search found no other code, tests, or docs that reference the two fixed migration filenames or assume a jsonb type for chairman_dashboard_config.hard_gate_stages / lifecycle_phases.stages. All consuming JS (lib/eva/stage-work-sync.js, stage-governance.js, should-open-chairman-gate.js, stage-execution-worker.js) reads both columns via the Supabase client, which deserializes integer[] into a plain JS array identically to jsonb -- no JSON.parse or jsonb-specific call exists on either column anywhere in the repo. Test mocks (tests/unit/eva/stage-work-sync.test.js, tests/lib/eva/stage-governance.test.js) treat the fields as plain JS arrays, type-agnostic.',
  },
];

const summary = 'Explore-phase discovery for SD-LEO-FIX-DRIFT-MIGRATIONS-CAST-001 confirmed the two migration files (plus the DOWN mirror) are the sole SQL artifacts touching this bug, and that no other consuming code assumes the affected columns are jsonb -- the fix is fully scoped to the three .sql files already corrected in this worktree.';

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
    confidence_score: 90,
    findings,
    warnings: [],
    recommendations: [],
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'LEAD_TO_PLAN',
      artifacts_read: [
        'database/migrations/20260828_correct_hard_gate_stages_27_stage_scheme.sql',
        'database/migrations/20260828_correct_hard_gate_stages_27_stage_scheme_DOWN.sql',
        'database/migrations/20260828_correct_lifecycle_phases_27_stage_scheme.sql',
        'lib/eva/stage-work-sync.js',
        'lib/eva/stage-governance.js',
      ],
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
