import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';

const KEY='SD-LEO-INFRA-LANE-HYGIENE-MACHINE-WRITERS-001';
const sb=createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const {data:sd,error:e1}=await sb.from('strategic_directives_v2').select('id,sd_key,target_application,status,current_phase').eq('sd_key',KEY).maybeSingle();
if(e1||!sd){console.error('SD lookup fail',e1);process.exit(1);}
console.log('SD uuid',sd.id,'app',sd.target_application,'phase',sd.current_phase);

const resolution=await resolveSubAgentRepo({subAgentCode:'REGRESSION',targetApplication:sd.target_application,checkProbe:false});
const results={verdict:'CONDITIONAL_PASS',confidence:40,metadata:{provisional:true,note:'PARTIAL evidence row written before validation chain (crash insurance, SD-FDBK-ENH-REGRESSION-SUB-AGENT-001). Will be UPDATED with final verdict.',worktree_path:process.cwd()}};
applySubAgentRepoVerdict(results,resolution,{skipVerdictAdjust:true});
results.metadata.repo_path=results.metadata.repo_path||process.cwd();

const row={sd_id:sd.id, sub_agent_code:'REGRESSION', phase:'PLAN', verdict:'CONDITIONAL_PASS', confidence:40,
 results:{status:'IN_PROGRESS', summary:'Provisional row; regression validation running.'},
 metadata:results.metadata, created_at:new Date().toISOString()};
const {data,error}=await sb.from('sub_agent_execution_results').insert(row).select('id').single();
if(error){console.error('INSERT FAIL',error);process.exit(1);}
console.log('PROVISIONAL_ROW_ID='+data.id);
