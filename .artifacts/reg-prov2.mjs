import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
const sb=createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_ID='7e67cfe7-d71d-48d4-8d84-fbc500ff4240';
const resolution=await resolveSubAgentRepo({subAgentCode:'REGRESSION',targetApplication:'EHG_Engineer',checkProbe:false});
const results={verdict:'CONDITIONAL_PASS',confidence:40,metadata:{provisional:true,sd_key:'SD-LEO-INFRA-LANE-HYGIENE-MACHINE-WRITERS-001',note:'PARTIAL row (crash insurance, SD-FDBK-ENH-REGRESSION-SUB-AGENT-001) — to be UPDATED with final verdict',worktree_path:process.cwd()}};
applySubAgentRepoVerdict(results,resolution,{skipVerdictAdjust:true});
const {data,error}=await sb.from('sub_agent_execution_results').insert({
 sd_id:SD_ID, sub_agent_code:'REGRESSION', sub_agent_name:'Regression Validation Specialist',
 phase:'PLAN', verdict:'CONDITIONAL_PASS', confidence:40,
 summary:'PROVISIONAL — regression validation in progress (API signature / export / baseline test / migration-inertness checks).',
 justification:'Provisional crash-insurance row per SD-FDBK-ENH-REGRESSION-SUB-AGENT-001; validation chain not yet complete so no final verdict can be asserted.', conditions:['PROVISIONAL: final verdict pending completion of the regression validation chain'], metadata:results.metadata, executed_from_cwd:process.cwd(), source:'regression-agent'
}).select('id').single();
if(error){console.error('FAIL',error);process.exit(1);}
console.log('PROVISIONAL_ROW_ID='+data.id);
console.log('repo_path='+results.metadata.repo_path);
