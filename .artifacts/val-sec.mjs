import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ids = ['3ed447ec-de8c-4798-9fdc-5a0c814623a5','9b8602a9-76bb-4b2c-b36f-01f4625b720c'];
const { data, error } = await s.from('sub_agent_execution_results').select('*').in('id', ids);
if (error) { console.error('ERR', error); process.exit(1); }
console.log('COLS:', Object.keys(data[0]||{}).join(', '));
for (const r of data) {
  console.log('\n\n########## ROW', r.id, '| agent:', r.sub_agent_code || r.sub_agent_id, '| verdict:', r.verdict, '| phase:', r.phase || r.metadata?.phase, '| created:', r.created_at);
  console.log('--- results/findings ---');
  console.log(JSON.stringify(r.results ?? r.findings ?? null, null, 2).slice(0, 14000));
  console.log('--- metadata ---');
  console.log(JSON.stringify(r.metadata, null, 2).slice(0, 6000));
}
