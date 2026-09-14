import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv'; dotenv.config();
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: sd } = await sb.from('strategic_directives_v2')
  .select('id,sd_key,title,status,current_phase,sd_type,priority,created_at')
  .eq('sd_key','SD-LEARN-FIX-ADDRESS-PAT-LES-010').maybeSingle();
console.log('--- TARGET SD ---'); console.log(JSON.stringify(sd,null,1));

const terms = ['launch-readiness','launch readiness','stage-23','stage 23','stage-24','promotion_gate','KILL-GATES','PAT-LES-a7862f7339c4','PAT-LES-010','LEARN-FIX'];
const seen = new Map();
for (const t of terms) {
  const { data } = await sb.from('strategic_directives_v2')
    .select('id,sd_key,title,status,sd_type,created_at')
    .or(`sd_key.ilike.%${t}%,title.ilike.%${t}%,description.ilike.%${t}%`).limit(80);
  for (const r of (data||[])) seen.set(r.sd_key, r);
}
const open = [...seen.values()].filter(r => !['completed','cancelled','archived'].includes(r.status));
console.log(`\n--- NON-TERMINAL SDs ON THIS GROUND (${open.length}) ---`);
for (const r of open.sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))))
  console.log(`${r.status.padEnd(12)} ${String(r.sd_type||'').padEnd(14)} ${r.sd_key} | ${String(r.title).slice(0,75)}`);

const { data: p1, error: pe } = await sb.from('issue_patterns')
  .select('*').eq('pattern_id','PAT-LES-a7862f7339c4').maybeSingle();
console.log('\n--- PAT-LES-a7862f7339c4 ---');
if (pe) console.log('ERR', pe.message);
else if (!p1) console.log('NOT FOUND by pattern_id');
else console.log(JSON.stringify({pattern_id:p1.pattern_id,status:p1.status,occ:p1.occurrence_count,first_seen_sd_id:p1.first_seen_sd_id,summary:String(p1.summary||'').slice(0,200),resolution_sd:p1.resolution_sd_id},null,1));

const { data: others } = await sb.from('strategic_directives_v2')
  .select('sd_key,status,title').ilike('sd_key','%PAT-LES-010%');
console.log('\n--- SDs keyed to PAT-LES-010 ---'); console.log((others||[]).map(o=>`${o.status} ${o.sd_key}`).join('\n')||'(only the target)');
