import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const sb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: prds } = await sb.from('product_requirements_v2').select('*').eq('sd_id', '6b090e53-3732-43e9-9f07-939bae2a0f69');
const r = prds[0];
console.log('PRD id', r.id, 'status', r.status, 'updated', r.updated_at, 'phase', r.phase);
const file = JSON.parse(fs.readFileSync('scripts/one-off/prd-content-fix-stage-journey-001.json', 'utf8'));
for (const k of Object.keys(file)) {
  const dbv = r[k];
  const same = JSON.stringify(dbv) === JSON.stringify(file[k]);
  console.log(`  ${k}: col present=${dbv !== undefined && dbv !== null} matchesFile=${same}`);
}
console.log('--- content col (md) length:', String(r.content||'').length);
const md = String(r.content||'');
for (const probe of ['PERSONA-JOURNEY SEQUENCE, DEFINED', 'WRONG ORDER', 'TESTING R-1', 'TESTING R-2', 'TOP-LEVEL coverage_selfcheck', '4th argument']) {
  console.log('  md contains', JSON.stringify(probe), '->', md.includes(probe));
}
