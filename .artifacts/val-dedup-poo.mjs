import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 1. This SD's own row
const { data: me, error: e0 } = await sb.from('strategic_directives_v2')
  .select('id,sd_key,title,status,current_phase,priority,metadata,description,scope,created_at,parent_sd_id')
  .eq('sd_key','SD-LEO-INFRA-PUBLISH-OUTCOME-OBSERVER-001').maybeSingle();
if (e0) console.log('ERR me:', e0.message);
console.log('=== THIS SD ===');
if (me) {
  console.log({id:me.id, sd_key:me.sd_key, status:me.status, phase:me.current_phase, priority:me.priority, parent:me.parent_sd_id, created:me.created_at});
  console.log('decomposition_recommended:', me.metadata?.decomposition_recommended);
  console.log('metadata keys:', Object.keys(me.metadata||{}));
}

// 2. Dedup search across SDs
const terms = ['outcome','observ','publish','graduat','ledger','rework','reconcil'];
const { data: sds, error: e1 } = await sb.from('strategic_directives_v2')
  .select('id,sd_key,title,status,current_phase,created_at')
  .order('created_at',{ascending:false}).limit(2000);
if (e1) console.log('ERR sds:', e1.message);
console.log('\n=== SD DEDUP CANDIDATES (title match) ===');
const hits = (sds||[]).filter(s => terms.some(t => (s.title||'').toLowerCase().includes(t)));
hits.forEach(s=>console.log(`${s.status.padEnd(12)} ${s.current_phase||'-'} | ${s.sd_key} | ${s.title}`));
console.log('total SDs scanned:', (sds||[]).length, 'hits:', hits.length);
