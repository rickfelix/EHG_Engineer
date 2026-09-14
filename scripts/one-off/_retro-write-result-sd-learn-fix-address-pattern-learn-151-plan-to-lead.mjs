#!/usr/bin/env node
/**
 * Persist RETRO sub-agent evidence for SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-151's PLAN-TO-LEAD
 * handoff. The retrospective itself was already generated and stored in the `retrospectives`
 * table (row c825d344-fa22-45db-a0c4-3e9488e46262, quality_score 100) via the canonical
 * generate-comprehensive-retrospective.js pipeline. GATE_SUBAGENT_EVIDENCE at PLAN-TO-LEAD
 * separately requires a RETRO-coded row in sub_agent_execution_results.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-151';
const RETRO_ROW_ID = 'c825d344-fa22-45db-a0c4-3e9488e46262';

const summary = `Retrospective generated and stored in the retrospectives table (row ${RETRO_ROW_ID}, ` +
  'quality_score 100) via the canonical generate-comprehensive-retrospective.js pipeline. ' +
  'Captures: (1) all 3 /learn-reported patterns verified stale, each traced to a specific prior ' +
  'fixing commit (d228da9dac7, 0dd7e2735dd, d5f3ab7d) landed 24-48h to weeks after the underlying ' +
  'retrospective, 7 months before /learn re-surfaced them with a fresh timestamp -- signaled as a ' +
  'systemic /learn stale-retrospective-extraction defect (this is the 3rd such SD this session: ' +
  'PAT-LES-010, PAT-LES-013, and 2 of 3 patterns here); (2) one genuine, narrow gap closed -- the ' +
  'LIVE sdObjectivesDefined validator (gate-l-sd-creation.js, actually wired into the validator ' +
  'registry) had zero direct test coverage, unlike its untested-in-isolation sibling file; ' +
  '(3) the new regression guard was independently mutation-tested by the primary session, TESTING ' +
  '(twice), VALIDATION, and REGRESSION sub-agents, all reproducing the identical single-test kill; ' +
  '(4) a confirmed-duplicate sibling SD (SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-152, identical source_' +
  'items, minted 1 minute apart by a /learn race) was cancelled and its 3 patterns reassigned to ' +
  'this SD, per an explicit coordinator delegation of that LEAD-phase decision and the established ' +
  'Alpha-2 fleet precedent; (5) a genuine near-miss was caught by a VALIDATION sub-agent: the ' +
  'entire SD deliverable existed only as untracked files for several handoffs (one git worktree ' +
  'reap away from total loss) before being committed -- corrected immediately upon discovery; ' +
  '(6) a REGRESSION sub-agent independently corrected its own scanner defects mid-run rather than ' +
  'reporting a false "no shared registry exists" conclusion, discovering (and disclosing as a non-' +
  'blocking pre-existing risk) an eager singleton ValidatorRegistry export unrelated to this SD.';

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
    warnings: [
      'This SD required committing local-only work discovered by a VALIDATION sub-agent to have never been git-committed across multiple prior handoffs -- worth a standing reminder to commit immediately after each EXEC-phase deliverable, not just before pushing.',
    ],
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
      worktree: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-151',
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
