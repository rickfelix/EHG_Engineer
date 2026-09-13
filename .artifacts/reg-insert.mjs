import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('sub_agent_execution_results').insert({
  sd_id: '79975086-927e-4c35-a6f6-4a47ed972a2a',
  sub_agent_code: 'REGRESSION',
  sub_agent_name: 'Regression Validation Specialist',
  verdict: 'CONDITIONAL_PASS',
  confidence: 40,
  critical_issues: [], warnings: ['PROVISIONAL row: regression validation not yet complete at write time (crash-insurance per SD-FDBK-ENH-REGRESSION-SUB-AGENT-001).'], recommendations: ['Await UPDATE of this row with the final verdict.'],
  execution_time: 0,
  justification: 'PROVISIONAL crash-insurance row per SD-FDBK-ENH-REGRESSION-SUB-AGENT-001: the regression agent previously crashed mid-chain and emitted no evidence row at all, silently failing the downstream SUBAGENT_EVIDENCE_MISSING check. This row is written before the validation chain begins and will be UPDATEd in place with the final verdict, confidence and findings.',
  conditions: ['Final verdict pending: this row is provisional crash-insurance and must be UPDATEd with the completed regression comparison.'],
  metadata: {
    phase: 'PLAN',
    provisional: true,
    note: 'PARTIAL crash-insurance row written before validation chain. Will be UPDATEd to final verdict.',
    repo_path: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer',
    executed_from_cwd: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-I',
    repo_resolved: true,
    branch: 'feat/SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-I',
    head_commit: 'b41994adeda',
    session_id: '689a1237-33b7-406f-9772-668958b289d6'
  }
}).select('id').single();
console.log('INSERTED:', data?.id, 'err:', error?.message);
