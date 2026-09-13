import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 1. The flagged duplicate
const { data: dup } = await sb.from('strategic_directives_v2')
  .select('id,sd_key,title,status,current_phase,created_at,completion_date,description,scope')
  .eq('sd_key','SD-EVA-QA-AUDIT-DBSCHEMA-001').maybeSingle();
console.log('=== FLAGGED DUP: SD-EVA-QA-AUDIT-DBSCHEMA-001 ===');
if (!dup) console.log('NOT FOUND'); else {
  console.log('status:', dup.status, '| phase:', dup.current_phase, '| created:', dup.created_at, '| completed:', dup.completion_date);
  console.log('title:', dup.title);
  console.log('desc:', (dup.description||'').slice(0,2500));
  console.log('scope:', (dup.scope||'').slice(0,2500));
}

// 2. Broader dedup sweep: any SD mentioning generated columns / derived / drift
const terms = ['GENERATED ALWAYS','generated column','derived column','summary column','drift','_evaluated','control_pack','fence_status','denormal'];
console.log('\n=== BROADER DEDUP SWEEP (title+description ilike) ===');
for (const t of terms) {
  const { data } = await sb.from('strategic_directives_v2')
    .select('sd_key,title,status,created_at')
    .or(`title.ilike.%${t}%,description.ilike.%${t}%`)
    .order('created_at',{ascending:false}).limit(12);
  if (data && data.length) {
    console.log(`\n-- term "${t}" (${data.length}) --`);
    data.forEach(r=>console.log(`  [${r.status}] ${r.sd_key} :: ${(r.title||'').slice(0,110)}`));
  } else console.log(`-- term "${t}": 0 --`);
}
