#!/usr/bin/env node
/**
 * Persist EXPLORE evidence for SD-LEARN-FIX-ADDRESS-PAT-LES-013's LEAD-TO-PLAN handoff.
 * The exploration itself was run via the Explore Task-tool agent (read-only codebase
 * search + DB queries); this script persists its findings to sub_agent_execution_results
 * per CLAUDE_LEAD.md's canonical-writer convention (storeSubAgentResults, source='manual').
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PAT-LES-013';

const summary = 'CONFIRMED (independently, via own DB queries and file reads): the issue_patterns ' +
  'row PAT-LES-f04ca2cf73c6 (claiming auto-generated retrospectives produce boilerplate blocking ' +
  'PLAN-TO-LEAD gates) is stale. All 3 cited-as-fixing SDs verified status=completed: ' +
  'SD-LEO-INFRA-RETROSPECTIVE-GATES-FAIL-001 (2026-04-24), ' +
  'SD-LEO-INFRA-WIRE-EXISTING-RETROSPECTIVEQUALITYRUBRIC-001 (2026-08-10), ' +
  'SD-LEO-INFRA-PLAN-LEAD-RETRO-001 (2026-08-23) -- all after the pattern\'s first_seen_sd_id ' +
  '(SD-EVA-FIX-KILL-GATES-001, Feb 2026). Verified retrospective-quality-rubric.js\'s ' +
  'detectBoilerplate() (lines 183-228) and its penalty-blend into validateRetrospectiveQuality() ' +
  '(lines 499-508) exist exactly as claimed, with BOILERPLATE_PATTERNS containing the anchored ' +
  'fleet-wide template phrases (e.g. "SD was clear and well-defined", "handoff validation passed ' +
  'all gates"), each attributed via comment to SD-LEO-INFRA-WIRE-EXISTING-RETROSPECTIVEQUALITYRUBRIC-001. ' +
  'Verified retrospective-quality.js\'s getFilteredRetrospective (retro-filters.js) enforces ' +
  'retro_type=SD_COMPLETION + post-LEAD-TO-PLAN-acceptance freshness. Git log confirms the ' +
  '"INFRASTRUCTURE FAST-PATH" auto-pass arm was added in d3110bfb70d and deleted in 0987756643a, ' +
  'matching the tombstone comment in the current file. Queried retrospectives table for ' +
  'quality_score=34: 0 rows anywhere. Independently ran the new regression test ' +
  '(tests/unit/retrospective-quality-rubric-boilerplate-blend.test.js) plus 3 pre-existing related ' +
  'suites: 4 files, 41/41 tests pass -- confirmed it genuinely instantiates the real ' +
  'RetrospectiveQualityRubric class (no mock of that module), only stubbing the network-calling ' +
  'AIQualityEvaluator.evaluate(), and that the load-bearing assertion (deterministic penalty ' +
  'flips passed true->false on a template retro the AI judge alone would pass, 68->43 vs ' +
  'threshold 55) is genuinely exercised, not vacuous.';

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'EXPLORE',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence: 95,
    findings: [
      {
        id: 'EX1-defect-superseded-confirmed',
        severity: 'INFO',
        summary,
      },
    ],
    warnings: [],
    recommendations: [
      'Close this SD via a genuine, narrow regression guard for the one previously-untested link in the already-fixed chain (the boilerplate-penalty blend inside RetrospectiveQualityRubric.validateRetrospectiveQuality()) rather than reimplementing a fix that already exists -- already done, see tests/unit/retrospective-quality-rubric-boilerplate-blend.test.js.',
    ],
    summary,
    justification: summary,
    critical_issues: [],
    metadata: {
      review_type: 'LEAD_TO_PLAN_EXPLORE',
      files_reviewed: [
        'scripts/modules/rubrics/retrospective-quality-rubric.js',
        'scripts/modules/handoff/executors/plan-to-lead/gates/retrospective-quality.js',
        'scripts/modules/handoff/retro-filters.js',
        'scripts/modules/handoff/retrospective-enricher.js',
        'scripts/modules/handoff/executors/plan-to-lead/index.js',
        'scripts/modules/sd-quality-validation.js',
        'tests/unit/retro-boilerplate-template-corpus.test.js',
        'tests/unit/retrospective-enricher.test.js',
        'tests/unit/handoff/executors/retro-whatwentwell-real-context.test.js',
        'tests/unit/sd-completion-readiness-passed-contract.test.js',
      ],
      model: 'Sonnet 5',
      model_id: 'claude-sonnet-5',
      invoked_at: new Date().toISOString(),
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      worktree: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEARN-FIX-ADDRESS-PAT-LES-013',
    },
    phase: 'LEAD_TO_PLAN',
    validation_mode: 'retrospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'EXPLORE',
    SD_KEY,
    { name: 'Explore (codebase discovery agent)' },
    results,
    { sdKey: SD_KEY, phase: 'LEAD_TO_PLAN' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  repo_path:', stored.metadata?.repo_path);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
}
