import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const r = await s.from('sub_agent_execution_results')
  .select('id, sub_agent_code, verdict, phase, created_at, confidence, metadata')
  .eq('sd_id','aaf65001-7031-46aa-882f-9f51281dc572').eq('sub_agent_code','TESTING')
  .order('created_at',{ascending:false}).limit(2);
if (r.error) { console.log('SELECT ERROR:', r.error.message); process.exit(1); }
console.log('TESTING rows found:', r.data.length);
for (const row of r.data) {
  console.log('---');
  console.log('id', row.id, '| verdict', row.verdict, '| phase', row.phase, '| created_at', row.created_at, '| confidence', row.confidence);
  console.log('  metadata.repo_path         =', row.metadata?.repo_path);
  console.log('  metadata.executed_from_cwd =', row.metadata?.executed_from_cwd);
  console.log('  metadata.repo_resolved     =', row.metadata?.repo_resolved);
  console.log('  metadata.gaps_material     =', row.metadata?.gaps_material);
}
const v = await s.from('v_sub_agent_repo_compliance').select('sub_agent_code,phase,compliance_status,metadata_repo_path')
  .eq('sd_id','aaf65001-7031-46aa-882f-9f51281dc572').eq('sub_agent_code','TESTING');
console.log('\nTESTING compliance:', v.error? 'ERR '+v.error.message : JSON.stringify(v.data));
