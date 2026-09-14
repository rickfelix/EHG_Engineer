#!/usr/bin/env node
/**
 * Persist EXPLORE evidence for SD-LEARN-FIX-ADDRESS-PAT-LES-010's LEAD-TO-PLAN handoff.
 * The exploration itself was run via the Explore Task-tool agent (read-only codebase
 * search); this script persists its findings to sub_agent_execution_results per
 * CLAUDE_LEAD.md's canonical-writer convention (storeSubAgentResults, source='manual').
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PAT-LES-010';

const summary = 'CONFIRMED: the issue_patterns row PAT-LES-a7862f7339c4 describes a defect (a fragile ' +
  'stage22Data.promotion_gate.pass positional-param check in the OLD lib/eva/stage-templates/stage-23.js, ' +
  'added by SD-EVA-FIX-KILL-GATES-001 / PR #1279 / commit 7fe5370, Feb 2026) that no longer exists in ' +
  'current main. Repo-wide grep for "stage22Data.promotion_gate" and "evaluateKillGate(" found zero live ' +
  'hits matching the described shape -- every remaining evaluateKillGate( call site (stage-05.js, ' +
  'stage-03.js, stage-13.js, lib/agents/modules/venture-state-machine/stage-gates.js) uses a different, ' +
  'unrelated signature with no stage22Data param. The literal string "stage22_not_complete" (the reason ' +
  'type the old check emitted) appears only in historical audit/planning docs, never in live code. Both ' +
  'current stage-23.js (now "Dedicated Venture UAT") and stage-24.js (the renumbered home of "Launch ' +
  'Readiness Kill Gate", per SD-LEO-INFRA-STAGE-TEMPLATE-DISPATCH-REMAINDER-001) were read in full and ' +
  'contain no trace of the old check. The replacement mechanism -- preflightUpstream() / ' +
  'UPSTREAM_REQUIREMENTS in lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js -- checks ' +
  'canonical venture_artifacts rows by artifact_type with is_current=true, a structurally different ' +
  '(and strictly safer) model with no boolean-coercion failure mode. No test in tests/ exercises the old ' +
  'evaluateKillGate/stage22Data shape either; several test files explicitly comment that positional ' +
  'stageNData params are "no longer read at runtime."';

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
      'Close this SD via a permanent regression guard (source-text test asserting the fragile shape never reappears in the 4 relevant stage-23/24 files) rather than reimplementing a check that no longer applies -- already done, see tests/unit/eva/stage-templates/stage-23-launch-readiness-fr1-4-6.test.js.',
    ],
    summary,
    justification: summary,
    critical_issues: [],
    metadata: {
      review_type: 'LEAD_TO_PLAN_EXPLORE',
      files_reviewed: [
        'lib/eva/stage-templates/stage-23.js',
        'lib/eva/stage-templates/stage-24.js',
        'lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js',
        'lib/eva/stage-templates/analysis-steps/stage-23-dedicated-venture-uat.js',
      ],
      model: 'Sonnet 5',
      model_id: 'claude-sonnet-5',
      invoked_at: new Date().toISOString(),
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      worktree: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEARN-FIX-ADDRESS-PAT-LES-010',
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
