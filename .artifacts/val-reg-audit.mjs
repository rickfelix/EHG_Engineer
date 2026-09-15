import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await s.from('validation_gate_registry').select('*');
if (error) { console.error('ERR', JSON.stringify(error)); process.exit(1); }
console.log('TOTAL ROWS:', data.length);
for (const r of data) {
  console.log(`- ${r.gate_key} | sd_type=${r.sd_type} | profile=${r.validation_profile} | ${r.applicability} | created=${r.created_at}`);
}
const g6 = data.filter(r => r.gate_key === 'GATE6_BRANCH_ENFORCEMENT');
console.log('\n== GATE6_BRANCH_ENFORCEMENT ==');
console.log(JSON.stringify(g6, null, 2));
console.log('\n== distinct sd_types in registry ==', [...new Set(data.map(r=>r.sd_type))].join(', '));
