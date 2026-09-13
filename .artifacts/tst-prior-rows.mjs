import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD='a281d3a9-c69a-456c-b514-2de7790ea6a7';
const { data, error } = await sb.from('sub_agent_execution_results')
  .select('id, sub_agent_code, phase, verdict, created_at, sd_id, metadata')
  .eq('sd_id', SD).order('created_at',{ascending:false});
if (error) { console.error(error); process.exit(1); }
for (const r of data) {
  console.log(`${r.created_at} | ${r.sub_agent_code.padEnd(12)} | phase=${String(r.phase).padEnd(22)} | verdict=${r.verdict} | ${r.id}`);
  if (r.id.startsWith('26462519')) console.log('   META KEYS:', Object.keys(r.metadata||{}).join(','));
}
