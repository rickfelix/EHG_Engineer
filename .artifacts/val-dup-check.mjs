import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const terms = ['pre-commit','pre_commit','precommit','secret-detection','secret detection','secret scan','secret-scan','merge_head','merge commit','merge-commit','husky','SECRET'];
const m = (s) => terms.some(t => s.toLowerCase().includes(t.toLowerCase()));

const { data: sds, error: e1 } = await sb.from('strategic_directives_v2').select('id,sd_key,title,status,current_phase,created_at').limit(3000);
console.log('=== strategic_directives_v2 ===');
if (e1) console.log('ERR', e1.message); else {
  const hits = sds.filter(s => m(`${s.title||''} ${s.sd_key||''} ${s.id||''}`));
  hits.forEach(h => console.log(`${h.sd_key||h.id} | ${h.status}/${h.current_phase} | ${h.created_at?.slice(0,10)} | ${h.title}`));
  console.log(`(scanned ${sds.length}, hits ${hits.length})`);
}
const { data: qfs, error: e2 } = await sb.from('quick_fixes').select('id,title,status,disposition,created_at').limit(3000);
console.log('\n=== quick_fixes ===');
if (e2) console.log('ERR', e2.message); else {
  const hits = qfs.filter(q => m(`${q.title||''} ${q.id||''}`));
  hits.forEach(h => console.log(`${h.id} | ${h.status}/${h.disposition||'-'} | ${h.created_at?.slice(0,10)} | ${h.title}`));
  console.log(`(scanned ${qfs.length}, hits ${hits.length})`);
}
console.log('\n=== target SD row ===');
let { data: me } = await sb.from('strategic_directives_v2').select('id,sd_key,title,status,current_phase,scope,metadata').eq('sd_key','SD-LEO-FIX-PRE-COMMIT-SECRET-001').maybeSingle();
if (!me) ({ data: me } = await sb.from('strategic_directives_v2').select('id,sd_key,title,status,current_phase,scope,metadata').eq('id','SD-LEO-FIX-PRE-COMMIT-SECRET-001').maybeSingle());
if (!me) console.log('NOT FOUND'); else {
  console.log('id:', me.id, '| key:', me.sd_key, '| status:', me.status, '| phase:', me.current_phase);
  console.log('SCOPE:\n', (me.scope||'(empty)').slice(0,1200));
  const kc = me.metadata?.key_changes; if (kc) console.log('\nKEY_CHANGES:\n', JSON.stringify(kc).slice(0,900));
}
