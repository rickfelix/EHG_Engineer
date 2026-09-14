import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv'; dotenv.config();
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: sd, error: e1 } = await sb.from('strategic_directives_v2')
  .select('id,sd_key,title,status,current_phase,sd_type,priority,created_at,metadata')
  .eq('sd_key','SD-LEARN-FIX-ADDRESS-PAT-LES-010').maybeSingle();
console.log('--- TARGET SD ---'); console.log(e1 || JSON.stringify({id:sd?.id,sd_key:sd?.sd_key,status:sd?.status,phase:sd?.current_phase,type:sd?.sd_type,prio:sd?.priority,created:sd?.created_at},null,1));

const terms = ['launch-readiness','LAUNCH-READINESS','launch readiness','stage-23','stage 23','stage-24','promotion_gate','KILL-GATES','PAT-LES-a7862f7339c4','PAT-LES-010'];
const seen = new Map();
for (const t of terms) {
  const { data } = await sb.from('strategic_directives_v2')
    .select('id,sd_key,title,status,sd_type,created_at')
    .or(`sd_key.ilike.%${t}%,title.ilike.%${t}%,description.ilike.%${t}%`).limit(50);
  for (const r of (data||[])) seen.set(r.sd_key, r);
}
console.log('\n--- SDs MATCHING STAGE-23/24 LAUNCH-READINESS / PROMOTION_GATE TERMS ---');
for (const r of [...seen.values()].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))))
  console.log(`${r.status.padEnd(12)} ${String(r.sd_type||'').padEnd(15)} ${r.sd_key}  | ${String(r.title).slice(0,70)}`);

const { data: pats } = await sb.from('issue_patterns')
  .select('pattern_id,summary,status,occurrence_count,first_seen_sd_id,created_at')
  .or('pattern_id.eq.PAT-LES-a7862f7339c4,summary.ilike.%promotion_gate%,summary.ilike.%Stage 23%');
console.log('\n--- ISSUE PATTERNS ---');
for (const p of (pats||[])) console.log(`${p.pattern_id} [${p.status}] x${p.occurrence_count} first_seen=${p.first_seen_sd_id} :: ${String(p.summary).slice(0,110)}`);
