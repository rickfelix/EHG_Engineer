import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_ID = '37ec760d-256a-4ad3-bf4d-6d59be31b8da';
const SD_KEY = 'SD-LEO-FIX-GATE-PLAN-EXEC-001';
const RETRO_ID = 'f1920442-3b87-472f-aebb-3850c743c209';
const PHASE = 'PLAN_VERIFICATION'; // matches sibling RETRO row 4e7b5ef7 for this SD and the
                                    // dominant convention (297/~450 RETRO rows repo-wide use this
                                    // value) for a RETRO pass run ahead of the PLAN-TO-LEAD handoff.

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'RETRO',
  supabase,
});

const results = {
  sd_id: SD_ID,
  sub_agent_code: 'RETRO',
  sub_agent_name: 'Continuous Improvement Coach',
  verdict: 'PASS',
  confidence: 95,
  critical_issues: [],
  warnings: [],
  recommendations: [
    `Retrospective enriched (evidence-verified, second pass): ${RETRO_ID}`,
    'Verified against sub_agent_execution_results rows c84eda3c-0670-406e-80a6-d7c42b650f02 (LEAD VALIDATION), d4676393-9dc8-4ecd-9065-cbea28dc2c23 (PLAN_PRD TESTING), e45e5976-e0cf-443e-81ac-c394faa9c73b (EXEC_TO_PLAN TESTING), c4ada0e0-ab70-49b4-b15d-0be4d33c391f (EXEC_TO_PLAN SECURITY) - all four independently caught real, distinct defects across the lifecycle before/during/after implementation.',
    'Confirmed final measured outcome from EXEC_TO_PLAN TESTING: 0 regressions, 0 AI-path verdict changes across 4678 live PRDs, 76 newly-passing PRDs.',
    'Confirmed originating QF-20260903-239 estimated 15 LOC; actual core-fix+test diff was ~339 LOC, full branch diff (incl. verification tooling) was 1308 LOC across 11 files.',
    'Action items filed on the retrospective row target QF triage return-shape tracing, PLAN-phase test-plan review continuity, EXEC pre-handoff CI-status checks, and PRD population-figure re-measurement.',
  ],
  detailed_analysis: JSON.stringify({
    summary: 'Second RETRO pass: enriched the SD_COMPLETION retrospective (previously template-generated boilerplate with generic FR/success-metric restatements) with genuine, DB-verified narrative content ahead of the PLAN-TO-LEAD handoff.',
    prior_retro_state: 'Row f1920442-3b87-472f-aebb-3850c743c209 (generated_by=MANUAL, but content was auto-templated boilerplate: generic FR counts, no reference to the QF-escalation defect chain or the four sub-agent findings that shaped this SD).',
    enrichment: 'Replaced what_went_well / what_needs_improvement / key_learnings / action_items / success_patterns / failure_patterns with content citing specific sub_agent_execution_results row IDs, verdicts, and quoted findings, cross-checked against the live DB rows and git history (commits 6f25879da8b, 84ac4fe2099, fa93c757ac8; PR #8263) rather than the task-provided narrative.',
    verification_method: 'Read strategic_directives_v2 metadata (QF escalation body + mechanism_verifications), all 10 sub_agent_execution_results rows for this SD, sd_phase_handoffs, and `git diff --shortstat` against merge-base with main, to independently confirm every substantive claim before writing it into the retrospective.',
    correction_vs_prompt: 'The task-provided context estimated the final population at "4679 PRDs measured" and characterized the LOC miss as "~50x" - DB evidence shows 4678 (not 4679, EXEC_TO_PLAN TESTING row) and the LOC ratio is ~20x for core-fix+test or ~87x for the full branch diff depending on what is counted; both corrections are reflected in the stored retrospective rather than the prompt figures.',
  }),
  execution_time: 1,
  metadata: {
    phase: PHASE,
    options: {
      mode: 'enrichment',
      sdKey: SD_KEY,
      sdUUID: SD_ID,
      target_application: 'EHG_Engineer',
    },
    retrospective_id: RETRO_ID,
    retrospective_action: 'enriched_existing_sd_completion_row',
    prior_retrospective_rows_found: [
      { id: '6490732c-552c-4615-bfc6-cbc12e1abefc', retro_type: 'HANDOFF', note: 'per-handoff auto-retro for LEAD-TO-PLAN; left unmodified, different purpose/type' },
      { id: 'f1920442-3b87-472f-aebb-3850c743c209', retro_type: 'SD_COMPLETION', note: 'enriched in place with evidence-verified content (this row)' },
    ],
    source_sub_agent_evidence: [
      'c84eda3c-0670-406e-80a6-d7c42b650f02',
      'd4676393-9dc8-4ecd-9065-cbea28dc2c23',
      'e45e5976-e0cf-443e-81ac-c394faa9c73b',
      'c4ada0e0-ab70-49b4-b15d-0be4d33c391f',
    ],
  },
  phase: PHASE,
  source: 'sub_agent_executor',
};

applySubAgentRepoVerdict(results, resolution);

const { data, error } = await supabase
  .from('sub_agent_execution_results')
  .insert(results)
  .select('id, sub_agent_code, phase, verdict, metadata')
  .single();

console.log('INSERT RESULT:', JSON.stringify(data, null, 2));
if (error) console.log('ERROR:', error);
