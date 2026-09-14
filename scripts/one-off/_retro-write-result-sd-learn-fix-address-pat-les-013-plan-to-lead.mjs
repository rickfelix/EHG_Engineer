#!/usr/bin/env node
/**
 * Persist RETRO sub-agent evidence for SD-LEARN-FIX-ADDRESS-PAT-LES-013's PLAN-TO-LEAD handoff.
 * The retrospective itself was already generated and stored in the `retrospectives` table
 * (row 7fe0f690-764e-4acb-bc75-64dd5d8d8c9f, quality_score 100) via the canonical
 * generate-comprehensive-retrospective.js pipeline. The GATE_SUBAGENT_EVIDENCE gate at
 * PLAN-TO-LEAD separately requires a RETRO-coded row in sub_agent_execution_results, which is
 * a distinct table from `retrospectives` -- this script persists that evidence row, per
 * CLAUDE_LEAD.md's canonical-writer convention.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PAT-LES-013';
const RETRO_ROW_ID = '7fe0f690-764e-4acb-bc75-64dd5d8d8c9f';

const summary = `Retrospective generated and stored in the retrospectives table (row ${RETRO_ROW_ID}, ` +
  'quality_score 100) via the canonical generate-comprehensive-retrospective.js pipeline. ' +
  'Captures: (1) PAT-LES-f04ca2cf73c6 verified stale, superseded by 3 already-completed SDs ' +
  '(SD-LEO-INFRA-RETROSPECTIVE-GATES-FAIL-001, SD-LEO-INFRA-WIRE-EXISTING-RETROSPECTIVEQUALITYRUBRIC-001, ' +
  'SD-LEO-INFRA-PLAN-LEAD-RETRO-001) and 38 pre-existing passing tests, avoiding a redundant ' +
  'reimplementation; (2) one genuine, narrow gap closed -- the boilerplate-penalty blend inside ' +
  'RetrospectiveQualityRubric.validateRetrospectiveQuality() had zero direct test coverage; ' +
  '(3) the new regression guard was independently mutation-tested by the primary session, ' +
  'TESTING (twice, PLAN_TO_EXEC and EXEC_TO_PLAN), VALIDATION, and REGRESSION sub-agents, all ' +
  'reproducing the identical kill (2 of 3 tests fail when the penalty subtraction is disabled); ' +
  '(4) a merge-timing race (same class as the same-day SD-LEARN-FIX-ADDRESS-PAT-LES-010 incident) ' +
  'stranded a follow-up evidence commit outside PR #8942\'s merge -- closed via postfix PR #8945, ' +
  'and fixed a self-referential secret-scanner false positive (the SECURITY sub-agent\'s own ' +
  'connection-string detection pattern literally matched the pre-commit hook\'s secret regex) by ' +
  'splitting the string constant, not touching the scanner; (5) the recurring, already-signaled ' +
  'background class-escalation NOT NULL rationale bug fired again on every handoff.js call ' +
  '(worker-signal 4baf7073, no new signal needed).';

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'RETRO',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence: 95,
    findings: [
      { id: 'RETRO1-retrospective-stored', severity: 'INFO', summary },
    ],
    warnings: [],
    recommendations: [],
    summary,
    justification: summary,
    critical_issues: [],
    metadata: {
      review_type: 'PLAN_TO_LEAD_RETROSPECTIVE',
      retrospective_row_id: RETRO_ROW_ID,
      retrospective_quality_score: 100,
      model: 'Sonnet 5',
      model_id: 'claude-sonnet-5',
      invoked_at: new Date().toISOString(),
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      worktree: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEARN-FIX-ADDRESS-PAT-LES-013',
    },
    phase: 'PLAN_TO_LEAD',
    validation_mode: 'retrospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'RETRO',
    SD_KEY,
    { name: 'Retrospective Generator (retro-agent)' },
    results,
    { sdKey: SD_KEY, phase: 'PLAN_TO_LEAD' }
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
