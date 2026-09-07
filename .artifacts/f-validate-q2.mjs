import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const keys = ['SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-F','SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-E'];
const { data: prds, error: pe } = await sb.from('product_requirements_v2').select('*').in('directive_id', keys);
if (pe) console.error('PRD err', pe);
console.log('PRD count:', (prds||[]).length);
for (const p of prds||[]) {
  console.log('='.repeat(80));
  console.log(`PRD id=${p.id} directive_id=${p.directive_id} status=${p.status} phase=${p.phase}`);
  console.log('ALL COLUMNS:', Object.keys(p).join(', '));
  for (const c of Object.keys(p).filter(k=>/activation|test|bypass/i.test(k))) {
    console.log(`   >>> ${c} = ${JSON.stringify(p[c])?.slice(0,600)}`);
  }
}
// activation bypass rows
const { data: bp } = await sb.from('sd_phase_handoffs').select('id, sd_id, from_phase, to_phase, status, created_at, metadata').or('sd_id.eq.dfdad20c-bf37-47ef-8588-0ebd82cfb874').order('created_at',{ascending:false}).limit(10);
console.log('\n##### Child E handoffs #####');
for (const h of bp||[]) console.log(h.from_phase,'->',h.to_phase, h.status, h.created_at, JSON.stringify(h.metadata||{}).slice(0,400));
