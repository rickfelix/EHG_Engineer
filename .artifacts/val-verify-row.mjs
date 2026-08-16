import { createClient } from '@supabase/supabase-js'; import dotenv from 'dotenv'; dotenv.config();
const s=createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data:r, error } = await s.from('sub_agent_execution_results').select('*').eq('id','36887768-6c1d-43b6-8eb4-f1c9b0ae43f9').single();
if(error){console.log('ERR',JSON.stringify(error));process.exit(1);}
console.log('sub_agent_code=',r.sub_agent_code,'| phase=',r.phase,'| verdict=',r.verdict,'| conf=',r.confidence);
console.log('sd_id=',r.sd_id);
const m=r.metadata||{};
console.log('metadata.repo_path      =',m.repo_path);
console.log('metadata.executed_from_cwd=',m.executed_from_cwd);
console.log('metadata.repo_resolved  =',m.repo_resolved);
console.log('findings count          =',Array.isArray(m.findings)?m.findings.length:typeof m.findings);
console.log('recommendations         =',Array.isArray(m.recommendations)?m.recommendations.length:(Array.isArray(r.recommendations)?r.recommendations.length:'n/a'));
console.log('ANALYSIS KEYS PRESENT   =',['duplicate_check','premise_assessment','blocking_conditions','advisory_findings','tooling_recommendation','live_measurement','gate_1_lead_pre_approval','validation_metrics','lead_recommendation'].filter(k=>m[k]!==undefined).join(', '));
console.log('blocking_conditions ids =',(m.blocking_conditions||[]).map(c=>c.id).join(','));
console.log('premise verdict         =',m.premise_assessment?.verdict);
console.log('tooling verdict         =',m.tooling_recommendation?.audit_rpc_execute_grants_mjs);
console.log('backlog_items_found     =',m.backlog_items_found);
// repo compliance view
const { data:v } = await s.from('v_sub_agent_repo_compliance').select('*').eq('id','36887768-6c1d-43b6-8eb4-f1c9b0ae43f9').maybeSingle();
console.log('repo compliance view    =', v?JSON.stringify(v).slice(0,260):'(no row / view unavailable)');
