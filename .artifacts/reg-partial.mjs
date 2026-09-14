import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const repo = process.cwd();
const { data, error } = await sb.from('sub_agent_execution_results').insert({
  sub_agent_code: 'REGRESSION',
  sub_agent_name: 'Regression Validator Sub-Agent',
  sd_id: 'db7ec4de-4328-4220-9faf-d89df9c0667c',
  verdict: 'CONDITIONAL_PASS',
  confidence: 40,
  phase: 'PLAN_VERIFY',
  summary: 'PARTIAL/provisional row written up-front as crash insurance. Full regression validation in progress.',
  detailed_analysis: 'PROVISIONAL - validation in progress, this row will be UPDATED with the final verdict.',
  critical_issues: [], warnings: [], recommendations: [],
  conditions: ['PROVISIONAL: full test-suite comparison must complete and this row must be updated with the final verdict before this evidence is relied on.'],
  source: 'regression-agent',
  justification: 'Provisional crash-insurance row per SD-FDBK-ENH-REGRESSION-SUB-AGENT-001: emitted before the long validation chain so a mid-run crash is non-silent. Low confidence (40) reflects that no tests have been compared yet.',
  executed_from_cwd: repo,
  metadata: { repo_path: repo, executed_from_cwd: repo, partial: true, sd_key: 'SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-G' }
}).select('id').single();
if (error) { console.error('ERR', JSON.stringify(error)); process.exit(1); }
console.log('PARTIAL_ROW_ID=' + data.id);
