import { getSupabaseClient } from '../lib/sub-agent-executor/supabase-client.js';
import { gradeProvenance, HANDOFF_TYPE_TO_PHASE, normalisePhase } from '../lib/sub-agent-executor/evidence-provenance.js';
const supabase = await getSupabaseClient();
const uuid='dfdad20c-bf37-47ef-8588-0ebd82cfb874';
// EXACT select the gate uses
const { data, error } = await supabase.from('sub_agent_execution_results')
  .select('sub_agent_code, created_at, verdict, confidence, critical_issues, warnings, recommendations, detailed_analysis, summary, source, invocation_id, phase, evaluated_commit_sha:metadata->>evaluated_commit_sha, session_id:metadata->>session_id, content_hash:metadata->>content_hash')
  .eq('sd_id', uuid).order('created_at',{ascending:false});
if(error){console.error(error.message);process.exit(1);}
const expectedPhase = HANDOFF_TYPE_TO_PHASE['EXEC-TO-PLAN'];
console.log('handoffType EXEC-TO-PLAN -> expectedPhase =', expectedPhase);
console.log('normalisePhase("EXEC_TO_PLAN") =', normalisePhase('EXEC_TO_PLAN'));
console.log('normalisePhase("EXEC")        =', normalisePhase('EXEC'));
console.log('');
const latest = new Map();
for (const r of data) if(!latest.has(r.sub_agent_code)) latest.set(r.sub_agent_code, r);
for (const code of ['TESTING','SECURITY']) {
  const row = latest.get(code);
  if(!row){ console.log(code,'=> NO ROW'); continue; }
  const g = gradeProvenance(row, { expectedPhase });
  console.log(`${code}: verdict=${row.verdict} phase=${row.phase} source=${row.source}`);
  console.log(`   invocation_id=${row.invocation_id}`);
  console.log(`   session_id=${row.session_id}`);
  console.log(`   content_hash=${String(row.content_hash).slice(0,16)}...`);
  console.log(`   evaluated_commit_sha=${row.evaluated_commit_sha}`);
  console.log(`   gradeProvenance => ${JSON.stringify(g)}`);
  console.log('');
}
