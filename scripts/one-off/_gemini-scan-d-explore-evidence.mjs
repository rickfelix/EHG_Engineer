#!/usr/bin/env node
/**
 * One-off: Explore sub-agent evidence for SD-LEO-ORCH-GEMINI-MODEL-SCAN-001-D, LEAD-TO-PLAN phase.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-ORCH-GEMINI-MODEL-SCAN-001-D';

const findings = [
  {
    id: 'no-other-video-analysis-files-in-scope',
    severity: 'INFO',
    summary: 'lib/testing/vision-qa-agent.js is the only file under lib/testing/ carrying hardcoded gemini- literals. scripts/archive/one-time/generate-vision-visualization.js is archived/dead code, out of scope. scripts/lib/visualization-provider.js and cost/pricing scripts reference gemini strings for pricing/visualization-provider selection, not vision-QA routing -- different sibling SD scope (cost-governor / creative-gen children), not this childs.',
  },
  {
    id: 'no-pre-existing-test-coverage',
    severity: 'INFO',
    summary: 'No test file references VisionQAAgent, autoSelectModel, or vision-qa-agent anywhere in the repo -- no pre-existing coverage to preserve or update.',
  },
  {
    id: 'no-allowlist-conflict',
    severity: 'INFO',
    summary: 'scripts/lint/gemini-pin-allowlist.json has no entries for lib/testing/vision-qa-agent.js; existing entries cover only lib/cost/governor.js, lib/cost/llm-pricing.js, and scripts/cost-waste-ledger.mjs (pricing/fallback-ladder exceptions). No allowlist changes needed for this fix.',
  },
];

const summary = 'Explore-phase discovery for SD-LEO-ORCH-GEMINI-MODEL-SCAN-001-D confirmed lib/testing/vision-qa-agent.js is the sole file in this childs scope (video-analysis Gemini pins), has no pre-existing test coverage, and has no gemini-pin-allowlist.json entries that could conflict with the fix.';

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
        'lib/testing/vision-qa-agent.js',
        'scripts/lint/gemini-pin-allowlist.json',
        'scripts/lib/visualization-provider.js',
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
