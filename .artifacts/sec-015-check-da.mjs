import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data } = await sb
  .from('sub_agent_execution_results')
  .select('detailed_analysis, warnings, recommendations, metadata')
  .eq('id', '91602645-d80c-4739-a21e-dcc1bc88e69a');
const r = data[0];

console.log('--- detailed_analysis type/shape ---');
const da = r.detailed_analysis;
console.log(typeof da, Array.isArray(da) ? 'array' : '');
console.log(JSON.stringify(da, null, 1).slice(0, 1200));

console.log('\n--- warnings (the 2 non-INFO findings) ---');
for (const w of r.warnings || []) console.log(` [${w.severity}] ${w.area}`);

console.log('\n--- recommendations ---');
for (const x of r.recommendations || []) console.log(' -', String(x).slice(0, 110));

console.log('\n--- metadata strip markers ---');
console.log('_findings_stripped:', r.metadata?._findings_stripped, '| _findings_had_keys:', JSON.stringify(r.metadata?._findings_had_keys)?.slice(0, 200));
console.log('metadata.metrics:', JSON.stringify(r.metadata?.metrics));
