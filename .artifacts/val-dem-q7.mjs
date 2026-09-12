import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// which ventures own the 12 telemetry rows?
const { data: vt } = await sb.from('venture_telemetry').select('*').limit(12);
const vids = [...new Set((vt||[]).map(r=>r.venture_id))];
console.log('venture_telemetry distinct venture_ids:', JSON.stringify(vids));
if (vids.length) {
  const { data: vs } = await sb.from('ventures').select('id,name,is_demo,current_lifecycle_stage,launch_mode').in('id', vids.filter(Boolean));
  for (const v of (vs||[])) console.log(` -> ${v.name} S${v.current_lifecycle_stage} demo=${v.is_demo} launch_mode=${v.launch_mode}`);
}
console.log('sample telemetry row keys:', Object.keys((vt||[])[0]||{}).join(', '));

// AltifyAI telemetry?
const { count: altiCount } = await sb.from('venture_telemetry').select('*',{count:'exact',head:true}).eq('venture_id','50763b6a-1fad-4e1e-b2fc-296a1d66ebf9');
console.log('\nAltifyAI venture_telemetry rows:', altiCount);

// the GATE-ON-DEAD-INSTRUMENT pattern in full
const { data: pat } = await sb.from('issue_patterns').select('*').eq('pattern_id','PAT-RCG-SOLO-MT8VUXZC').maybeSingle();
console.log('\n=== PAT-RCG-SOLO-MT8VUXZC ===');
console.log('summary:', pat?.issue_summary);
console.log('solution/proven:', JSON.stringify(pat?.proven_solutions || pat?.solution || pat?.prevention_checklist || {}, null, 1).slice(0,2500));

// ledger's 3 rows - what do they look like (mock discriminator question)
const { data: led } = await sb.from('venture_channel_publish_ledger').select('*');
console.log('\n=== venture_channel_publish_ledger all 3 rows ===');
console.log(JSON.stringify(led,null,1).slice(0,2000));

// feedback columns
const { data: fb1 } = await sb.from('feedback').select('*').limit(1);
console.log('\nfeedback columns:', Object.keys(fb1?.[0]||{}).join(', '));
