#!/usr/bin/env node
/**
 * One-off: Write RETRO sub-agent evidence row for the PLAN-TO-LEAD
 * GATE_SUBAGENT_EVIDENCE check on SD-LEO-INFRA-HOURLY-DRIVE-SCORE-001.
 *
 * The handoff precheck rejected with SUBAGENT_EVIDENCE_MISSING: RETRO —
 * scripts/modules/handoff/required-subagents.js declares RETRO required for
 * PLAN-TO-LEAD, and no sub_agent_execution_results row with
 * sub_agent_code='RETRO' existed for this SD at all (verified live: 13 rows
 * existed for VALIDATION/RISK/Explore/DESIGN/DATABASE/TESTING/SECURITY/
 * REGRESSION/VISION_FIDELITY, zero for RETRO).
 *
 * Uses the canonical evidence pipeline per CLAUDE.md prologue rule 11 —
 * resolveSubAgentRepo -> applySubAgentRepoVerdict (lib/sub-agents/
 * resolve-repo.js) -> storeSubAgentResults (lib/sub-agent-executor/
 * results-storage.js) — the same mechanism TESTING/SECURITY/VALIDATION/
 * REGRESSION used for their own rows on this SD. Mirrors the structure of
 * scripts/one-off/_sd-leo-infra-correction-delivery-path-001-e_retro-plan-to-lead.mjs,
 * the clearest precedent using this exact canonical-writer pattern for a
 * RETRO/PLAN-TO-LEAD row.
 *
 * phase='PLAN_VERIFICATION' chosen by measuring, not guessing (per task
 * instruction): querying the most recent 300 sub_agent_execution_results
 * rows with sub_agent_code='RETRO' table-wide shows PLAN_VERIFICATION as the
 * dominant convention (152/300, ~51%) — ahead of 'PLAN' (74), 'PLAN-TO-LEAD'
 * (48), 'PLAN_TO_LEAD' (7), 'VERIFY' (12), 'LEAD_FINAL' (3), 'EXEC' (3). It
 * also byte-matches this exact SD's own strategic_directives_v2.current_phase
 * ('PLAN_VERIFICATION') and the phase this SD's own VISION_FIDELITY row used
 * moments after the companion retrospective was created
 * (fc82b09c-2a56-4483-bf41-d423fb0c37da, created 2026-08-13T09:20:44Z).
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = '978649bc-bd14-48c7-a631-4fcac7ed10f8';
const SD_KEY = 'SD-LEO-INFRA-HOURLY-DRIVE-SCORE-001';
const RETRO_ID = '9251db0f-87c6-4d0b-a249-a273e46aff59';
const RETRO_QUALITY_SCORE = 100;
const EXEC_TO_PLAN_RETRO_ID = '43275bdf-8f9e-4dce-a330-4467bce4c2f1';

const findings = [
  {
    id: 'RETRO-sdcompletion-row-published-nonboilerplate',
    severity: 'INFO',
    summary: `Published a retro_type=SD_COMPLETION retrospective (retrospectives.id=${RETRO_ID}, retrospective_type=NULL, status=PUBLISHED, quality_score=${RETRO_QUALITY_SCORE} per the DB's deterministic auto_validate_retrospective_quality trigger, quality_issues=[]) required by the PLAN-TO-LEAD RETROSPECTIVE_QUALITY_GATE, which only recognizes retro_type=SD_COMPLETION rows (getFilteredRetrospective in scripts/modules/handoff/retro-filters.js) — the prior LEAD-TO-PLAN and EXEC-TO-PLAN rows are correctly typed retro_type=HANDOFF and do not satisfy it. Content is not boilerplate: 8 what_went_well, 6 what_needs_improvement, 7 key_learnings, 7 action_items, 4 success_patterns, 2 failure_patterns, 4 verbatim sub-agent citations, and a full arc narrative from chairman SMS origin (2026-08-12T19:16Z) through PR #7013 — carried forward from the companion EXEC_TO_PLAN-stage retrospective (id ${EXEC_TO_PLAN_RETRO_ID}) rather than re-derived, and independently re-verified against git/DB history when that row was first authored this session.`
  },
  {
    id: 'RETRO-companion-rows-left-intact',
    severity: 'INFO',
    summary: `Both prior retrospective rows for this SD remain unmodified: e6486496-ee92-41c8-8c14-196012cbf159 (retro_type=HANDOFF, retrospective_type=LEAD_TO_PLAN, quality_score=70) and ${EXEC_TO_PLAN_RETRO_ID} (retro_type=HANDOFF, retrospective_type=EXEC_TO_PLAN, quality_score=100). The SD_COMPLETION row is additive, not a replacement — each retains its own handoff-stage record.`
  },
  {
    id: 'RETRO-quantitative-claims-independently-verified',
    severity: 'INFO',
    summary: 'Every quantitative claim carried into the SD_COMPLETION retrospective (test_total_count=38675, test_passed_count=38405, test_failed_count=62, test_pass_rate=99.3, bugs_found=8, bugs_resolved=6, tests_added=46, 3 completed handoffs at 96/93/93) traces to a specific prior sub-agent evidence row or sd_phase_handoffs record already persisted on this SD (REGRESSION VERIFY 6c2c83c8 for the full-suite numbers, VALIDATION VERIFY a9618cae for the FR-2 AC-2 finding, TESTING EXEC 47254635 for the 584/584-vs-28/3151 correction) rather than re-asserted from memory.'
  }
];

const warnings = [
  'GATE_SUBAGENT_EVIDENCE resolves the PLAN-TO-LEAD freshness anchor to the most recently accepted handoff INTO phase=PLAN, which for this SD is the EXEC-TO-PLAN acceptance (2026-08-13T08:00:05Z) — later than the RETROSPECTIVE_QUALITY_GATE\'s own cutoff (LEAD-TO-PLAN acceptance, 2026-08-12T20:21:42.859Z). Both this evidence row and the companion retrospective were written after both cutoffs, so neither gate\'s freshness check is at risk, but the two gates do not share one anchor and a future SD with a long PLAN/EXEC gap should not assume they do.'
];

const recommendations = [
  'GO for PLAN-TO-LEAD on the RETRO axis — a genuinely SD-specific, non-boilerplate SD_COMPLETION retrospective is published and this evidence row records it for GATE_SUBAGENT_EVIDENCE.',
  'Re-run the PLAN-TO-LEAD precheck after this row lands to confirm both previously-failing gates (RETROSPECTIVE_QUALITY_GATE, GATE_SUBAGENT_EVIDENCE) now pass, rather than assuming from the write alone.'
];

const summary = `RETRO PASS for ${SD_KEY} PLAN-TO-LEAD handoff. SD_COMPLETION retrospective published (id=${RETRO_ID}, quality_score=${RETRO_QUALITY_SCORE}, status=PUBLISHED, quality_issues=[]) satisfying RETROSPECTIVE_QUALITY_GATE's retro_type=SD_COMPLETION + retrospective_type=NULL requirement, additive alongside the two existing HANDOFF-stage rows (LEAD_TO_PLAN, EXEC_TO_PLAN) which are left unmodified. Content carries forward the full arc narrative (chairman SMS origin through PR #7013, 3 completed handoffs at 96/93/93, 8 distinct sub-agent codes across 12+ prior invocations) with 8 what_went_well, 6 what_needs_improvement, 7 key_learnings, 7 action_items, and 4 verbatim sub-agent citations — all quantitative claims trace to specific prior evidence rows on this SD rather than being re-asserted. GO.`;

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
    confidence_score: 95,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      branch: 'feat/SD-LEO-INFRA-HOURLY-DRIVE-SCORE-001',
      pr_url: 'https://github.com/rickfelix/EHG_Engineer/pull/7013',
      pr_number: 7013,
      go_no_go: 'GO',
      gate_scores: { 'LEAD-TO-PLAN': 96, 'PLAN-TO-EXEC': 93, 'EXEC-TO-PLAN': 93 },
      retro_contribution: {
        retrospective_id: RETRO_ID,
        retro_type: 'SD_COMPLETION',
        retrospective_type: null,
        quality_score: RETRO_QUALITY_SCORE,
        what_went_well_count: 8,
        what_needs_improvement_count: 6,
        key_learnings_count: 7,
        action_items_count: 7,
        success_patterns_count: 4,
        failure_patterns_count: 2,
        verbatim_citations_count: 4,
      },
      companion_handoff_stage_retros: {
        lead_to_plan: 'e6486496-ee92-41c8-8c14-196012cbf159',
        exec_to_plan: EXEC_TO_PLAN_RETRO_ID,
      },
      test_state: {
        full_suite: '38675 tests / 3158 files: 38405 passed, 62 failed (0 attributable to this SD), 206 skipped, 848s',
        this_sd_domain: '705 tests / 54 files, 100% pass',
      },
    },
    retro_contribution: {
      retrospective_id: RETRO_ID,
      quality_score: RETRO_QUALITY_SCORE,
    },
    validation_mode: 'retrospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'RETRO',
    SD_ID,
    { name: 'Continuous Improvement Coach (retro-agent)' },
    results,
    { sdKey: SD_KEY, phase: 'PLAN_VERIFICATION' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
