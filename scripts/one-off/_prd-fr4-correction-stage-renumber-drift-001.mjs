import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: prd, error: e1 } = await supabase
  .from('product_requirements_v2')
  .select('id,functional_requirements')
  .eq('id', 'PRD-SD-LEO-INFRA-STAGE-RENUMBER-DRIFT-001')
  .single();
if (e1) throw e1;

const frs = [...prd.functional_requirements];
const fr4 = frs.find(f => f.id === 'FR-4');
fr4.description = "CORRECTED during EXEC (2026-08-28) after reading the LIVE lifecycle_phases table rather than trusting an unverified RISK-sub-agent inference: measured spans are phase 1=[1-5], 2=[6-9], 3=[10-12], 4=[13-16], 5=[17-22], 6=[23-26] -- phases 1-5 cover stages 1-22 and are entirely UNTOUCHED by the renumbering (only stage 23+ shifted). Only phase 6 needs correction, from [23,24,25,26] to [23,24,25,26,27] (the new dedicated_venture_uat gate at 23 plus the same 4 shifted stages -- Launch Readiness/Go Live/Post-Launch Review/Growth Playbook, now at 24-27). Implemented as database/migrations/20260828_correct_lifecycle_phases_27_stage_scheme.sql.";
fr4.acceptance_criteria = [
  'All 27 stages have exactly one lifecycle_phases membership, no orphan stage',
  'Phases 1-5 (stages 1-22) are byte-identical to their pre-fix values -- only phase 6 changes',
  'Phase 6 = [23,24,25,26,27]'
];

const { error: e2 } = await supabase
  .from('product_requirements_v2')
  .update({ functional_requirements: frs })
  .eq('id', 'PRD-SD-LEO-INFRA-STAGE-RENUMBER-DRIFT-001');
if (e2) throw e2;
console.log('FR-4 corrected in PRD');
