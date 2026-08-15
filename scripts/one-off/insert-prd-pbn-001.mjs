// Inserts the LEAD/PLAN-authored PRD for SD-LEO-FEAT-PROVEN-BETTER-NEW-001 into
// product_requirements_v2, per CLAUDE_PLAN.md's inline-mode PRD creation workflow.
// system_architecture/implementation_approach are TEXT columns (confirmed by reading
// a real stored PRD, PRD-SD-LEO-FIX-CLOSE-ANON-VENTURE-001) -- stored as JSON.stringify'd text,
// matching the established convention. All other structured fields are native jsonb columns.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const prd = JSON.parse(readFileSync(process.argv[2], 'utf8'));

const SD_KEY = 'SD-LEO-FEAT-PROVEN-BETTER-NEW-001';
const SD_UUID = 'de5377a7-fa39-486e-ac39-2fa3b0383232';

const row = {
  id: `PRD-${SD_KEY}`,
  sd_id: SD_UUID,
  title: 'Proven/Better/New (PBN) validation gate at nursery -> Stage-0 promotion',
  status: 'approved',
  category: 'venture-validation',
  priority: 'medium',
  phase: 'PLAN_PRD',
  executive_summary: prd.executive_summary,
  functional_requirements: prd.functional_requirements,
  technical_requirements: prd.technical_requirements,
  system_architecture: JSON.stringify(prd.system_architecture),
  implementation_approach: JSON.stringify(prd.implementation_approach),
  test_scenarios: prd.test_scenarios,
  acceptance_criteria: prd.acceptance_criteria,
  risks: prd.risks,
  integration_operationalization: prd.integration_operationalization,
  exploration_summary: prd.exploration_summary,
  created_by: 'Alpha (worker session 642532a6)',
};

const { data, error } = await supabase.from('product_requirements_v2').insert(row).select('id, sd_id, status, title').maybeSingle();
if (error) { console.error('INSERT_ERROR:', JSON.stringify(error, null, 2)); process.exit(1); }
console.log('INSERTED:', JSON.stringify(data));
