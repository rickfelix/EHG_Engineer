import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

console.log('=== rework tables: REAL select (not head+count) ===');
for (const t of ['venture_channel_rework','content_rework','publish_rework','marketing_rework','rework_log','rework']) {
  const { data, error } = await sb.from(t).select('*').limit(1);
  console.log(`${t.padEnd(24)} ${error ? 'ABSENT  '+error.code+' :: '+error.message.slice(0,80) : 'EXISTS rows='+data.length+' cols='+(data[0]?Object.keys(data[0]).join(','):'(empty)')}`);
}

console.log('\n=== ledger full rows (content_ref / outcome_ref / mock_run_id) ===');
const { data: led } = await sb.from('venture_channel_publish_ledger').select('*');
led.forEach(r=>console.log(JSON.stringify({ch:r.channel_type,decision:r.decision,decision_by:r.decision_by,outcome:r.outcome,outcome_ref:r.outcome_ref,content_ref:r.content_ref,mode:r.execution_mode,mock_run_id:r.mock_run_id})));

console.log('\n=== any table holding real platform post ids? ===');
for (const t of ['marketing_content','content_items','venture_channel_posts','published_posts','social_posts','marketing_posts']) {
  const { data, error } = await sb.from(t).select('*').limit(2);
  if (!error) console.log(`${t}: EXISTS rows=${data.length} cols=${data[0]?Object.keys(data[0]).slice(0,18).join(','):'(empty)'}`);
  else console.log(`${t}: ABSENT ${error.code}`);
}
