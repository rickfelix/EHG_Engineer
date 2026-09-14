#!/usr/bin/env node
/**
 * Persist EXPLORE evidence for SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-151's LEAD-TO-PLAN handoff.
 * The exploration itself was run via the Explore Task-tool agent (read-only codebase search +
 * DB queries + git log); this script persists its findings to sub_agent_execution_results per
 * CLAUDE_LEAD.md's canonical-writer convention (storeSubAgentResults, source='manual').
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-151';

const summary = 'CONFIRMED (independently, via own git log/show, file reads, and DB queries): all 3 ' +
  '/learn-reported patterns are stale. (1) PAT-LES-1a22954978cc: commit d228da9dac7e1d1 ' +
  '(2026-02-27, ancestor of HEAD) fixed the sdObjectivesDefined zero-issues-check bug in both ' +
  'gate-l-sd-creation.js and sd-objectives-validator.js (passed: issues.length===0 -> passed: ' +
  'score>=30); current gate-l-sd-creation.js:22-48 matches exactly, including the PAT-AUTO-b6e88bcc ' +
  'comment. (2) PAT-LES-7fd10bfaf89a: commit 0dd7e2735dde622 (2026-02-15, ancestor of HEAD, ' +
  'SD-EVA-R2-FIX-LOGGING-001) added structured logging to all 25 EVA analysis-step + 25 stage ' +
  'template files; verified live logger.log/logger.warn calls with entry/exit/duration timing in ' +
  'stage-01-hydration.js and stage-03-hybrid-scoring.js. (3) PAT-LES-e72314a404ae: commit ' +
  'd5f3ab7d22b0b9f (2026-02-15, ancestor of HEAD) added the security object requirement to stage ' +
  '14; current lib/eva/stage-templates/stage-14.js requires and validates authStrategy, ' +
  'dataClassification, complianceRequirements, hard-failing validate() without them. Re-ran the new ' +
  'test file (tests/unit/handoff/validation/validator-registry/gate-l-sd-creation.test.js) plus its ' +
  'sibling (sd-objectives-validator.test.js): 2 files, 17/17 tests pass. Confirmed the new test ' +
  'genuinely exercises the LIVE validator (ValidatorRegistry + registerGateLValidators, no ' +
  'reimplementation), and that validator-registry/index.js:38 wires it into the real registry -- ' +
  'not the orphaned sibling. The boundary-case test (0 objectives + metrics, score=30) correctly ' +
  'encodes the one input shape where issues.length===0 and score>=30 diverge, so it is not ' +
  'tautological. Independently verified the duplicate-consolidation state: SD-LEARN-FIX-ADDRESS-' +
  'PATTERN-LEARN-152 status=cancelled with a documented cancellation_reason; all 3 shared ' +
  'issue_patterns rows carry assigned_sd_id=SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-151.';

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
      { id: 'EX1-all-3-patterns-superseded-confirmed', severity: 'INFO', summary },
    ],
    warnings: [],
    recommendations: [
      'Close this SD via a genuine, narrow regression guard for the one previously-untested link (the live sdObjectivesDefined validator in gate-l-sd-creation.js) rather than reimplementing 3 already-fixed mechanisms -- already done, see tests/unit/handoff/validation/validator-registry/gate-l-sd-creation.test.js.',
    ],
    summary,
    justification: summary,
    critical_issues: [],
    metadata: {
      review_type: 'LEAD_TO_PLAN_EXPLORE',
      files_reviewed: [
        'scripts/modules/handoff/validation/validator-registry/gates/gate-l-sd-creation.js',
        'scripts/modules/handoff/validation/validator-registry/index.js',
        'scripts/modules/handoff/validators/sd-objectives-validator.js',
        'lib/eva/stage-templates/stage-14.js',
        'lib/eva/stage-templates/analysis-steps/stage-01-hydration.js',
        'lib/eva/stage-templates/analysis-steps/stage-03-hybrid-scoring.js',
        'tests/unit/handoff/validation/validator-registry/gate-l-sd-creation.test.js',
        'tests/unit/handoff/validators/sd-objectives-validator.test.js',
      ],
      model: 'Sonnet 5',
      model_id: 'claude-sonnet-5',
      invoked_at: new Date().toISOString(),
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      worktree: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-151',
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
