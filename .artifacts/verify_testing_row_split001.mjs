import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await s
  .from('sub_agent_execution_results')
  .select('id, sub_agent_code, sd_id, verdict, confidence, created_at, metadata')
  .eq('id', 'f8676b9b-736f-4c2c-b7a3-5015b3625145');
if (error) { console.error('ERR', error.message); process.exit(1); }
if (!data || data.length === 0) { console.error('ROW NOT FOUND'); process.exit(1); }
const r = data[0];
console.log('READ-BACK CONFIRMED');
console.log('  id             :', r.id);
console.log('  sub_agent_code :', r.sub_agent_code);
console.log('  sd_id          :', r.sd_id);
console.log('  verdict        :', r.verdict);
console.log('  confidence     :', r.confidence);
console.log('  created_at     :', r.created_at);
console.log('  meta.phase     :', r.metadata?.phase, '| execution_phase:', r.metadata?.execution_phase);
console.log('  meta.repo_path :', r.metadata?.repo_path);
console.log('  meta.cwd       :', r.metadata?.executed_from_cwd);
console.log('  meta.measured  :', r.metadata?.measured, '| applicability_rule:', r.metadata?.applicability_rule);
console.log('  test_execution :', JSON.stringify(r.metadata?.test_execution));
console.log('  gaps           :', (r.metadata?.gaps || []).length);
// confirm it is discoverable the way the gate looks for it
const { data: byPhase } = await s
  .from('sub_agent_execution_results')
  .select('id, verdict, created_at, metadata')
  .eq('sd_id', '170637e5-c8e1-4d44-ab4e-206bf39c8c50')
  .eq('sub_agent_code', 'TESTING')
  .order('created_at', { ascending: false })
  .limit(5);
console.log('\nTESTING rows for this SD (newest 5):');
(byPhase || []).forEach(x => console.log('  ', x.id.slice(0, 8), x.verdict, x.created_at, 'phase=' + (x.metadata?.phase || x.metadata?.execution_phase || 'n/a')));
