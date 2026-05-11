import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const { data, error } = await sb
  .from('sub_agent_execution_results')
  .select('id, sd_id, sub_agent_code, phase, verdict, confidence, summary, metadata, created_at')
  .eq('sub_agent_code', 'RISK')
  .order('created_at', { ascending: false })
  .limit(5);

if (error) { console.error(error); process.exit(2); }
if (!data || data.length === 0) { console.log('NO ROWS'); process.exit(0); }

for (const row of data) {
  console.log('---');
  console.log('id:', row.id);
  console.log('sd_id:', row.sd_id);
  console.log('phase:', row.phase);
  console.log('verdict:', row.verdict);
  console.log('confidence:', row.confidence);
  console.log('summary:', (row.summary || '').slice(0, 200));
  const m = row.metadata || {};
  console.log('metadata.bmad_overall_risk_level:', m.bmad_overall_risk_level);
  console.log('metadata.blocking:', m.blocking);
  console.log('metadata keys:', Object.keys(m).slice(0, 15));
  console.log('created_at:', row.created_at);
}
