import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const keys = ['SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-F','SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-E'];
const { data: sds, error } = await sb.from('strategic_directives_v2').select('id, sd_key, title, status, current_phase, scope, description').in('sd_key', keys);
if (error) { console.error('SD err', error); process.exit(1); }
for (const sd of sds) {
  console.log('='.repeat(90));
  console.log(sd.sd_key, '|', sd.id, '|', sd.status, '|', sd.current_phase);
  console.log('TITLE:', sd.title);
  console.log('--- SCOPE ---'); console.log(sd.scope || '(null)');
}
const ids = sds.map(s=>s.id);
const { data: prds, error: pe } = await sb.from('product_requirements_v2').select('*').in('directive_id', ids);
if (pe) console.error('PRD err', pe);
console.log('\n########## PRDs ##########');
for (const p of prds||[]) {
  const sd = sds.find(s=>s.id===p.directive_id);
  console.log(`PRD ${p.id} | sd=${sd?.sd_key} | status=${p.status} | phase=${p.phase}`);
  const cols = Object.keys(p).filter(k=>/activation|test/i.test(k));
  for (const c of cols) console.log(`   ${c} = ${JSON.stringify(p[c])?.slice(0,300)}`);
}
