import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: prds } = await sb.from('product_requirements_v2').select('*').eq('sd_id', '6b090e53-3732-43e9-9f07-939bae2a0f69');
const r = prds[0];
const file = JSON.parse(fs.readFileSync('scripts/one-off/prd-content-fix-stage-journey-001.json', 'utf8'));
const dbFR = r.functional_requirements;
console.log('DB FR count:', Array.isArray(dbFR) ? dbFR.length : typeof dbFR, '| file FR count:', file.functional_requirements.length);
for (let i = 0; i < Math.max(dbFR.length, file.functional_requirements.length); i++) {
  const a = dbFR[i], b = file.functional_requirements[i];
  console.log(`FR[${i}] db.id=${a?.id} file.id=${b?.id} identical=${JSON.stringify(a)===JSON.stringify(b)}`);
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    for (const k of new Set([...Object.keys(a||{}), ...Object.keys(b||{})])) {
      if (JSON.stringify(a?.[k]) !== JSON.stringify(b?.[k])) {
        console.log('   field differs:', k, '| dbLen', JSON.stringify(a?.[k]||'').length, '| fileLen', JSON.stringify(b?.[k]||'').length);
      }
    }
  }
}
// key marker probes in DB FR
const s = JSON.stringify(dbFR);
for (const probe of ['PERSONA-JOURNEY SEQUENCE, DEFINED','CONCATENATION','WRONG ORDER','>=3 resolvable steps','TESTING R-1','TESTING R-2','4th argument','FLOW_COVERAGE_MISSING']) {
  console.log('DB FR contains', JSON.stringify(probe), '->', s.includes(probe));
}
// other columns
for (const k of ['executive_summary','test_scenarios','system_architecture','implementation_approach']) {
  const dv = JSON.stringify(r[k]); const fv = JSON.stringify(file[k]);
  console.log(`\n== ${k}: dbLen=${dv?.length} fileLen=${fv?.length}`);
  if (k==='executive_summary') { console.log(' DB:', String(r[k]).slice(0,200)); console.log(' FILE:', String(file[k]).slice(0,200)); }
  if (k==='system_architecture'||k==='implementation_approach') { console.log(' DB:', dv?.slice(0,300)); console.log(' FILE:', fv?.slice(0,300)); }
  if (k==='test_scenarios') { console.log(' db count', r[k]?.length, 'file count', file[k].length); }
}
console.log('\nsmoke_test_steps col in DB?', 'smoke_test_steps' in r, '=>', JSON.stringify(r.smoke_test_steps)?.slice(0,200));
console.log('all PRD cols:', Object.keys(r).join(','));
