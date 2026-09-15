import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await s.from('validation_gate_registry').select('*');
console.log('TOTAL ROWS:', data.length);
console.log('DISTINCT gate_keys:', new Set(data.map(r=>r.gate_key)).size);
const byApp = {};
for (const r of data) byApp[r.applicability] = (byApp[r.applicability]||0)+1;
console.log('BY applicability:', JSON.stringify(byApp));
// dead rows: sd_type truthy but never equals a real sd_type? check 'all' and ''
const allRows = data.filter(r => r.sd_type === 'all');
console.log(`\nsd_type='all' rows (DEAD under exact-match resolver): ${allRows.length}`);
for (const r of allRows) console.log(`   - ${r.gate_key} | ${r.applicability} | ${(r.reason||'').slice(0,70)}`);
const emptyRows = data.filter(r => r.sd_type === '');
console.log(`\nsd_type='' rows: ${emptyRows.length}`);
for (const r of emptyRows) console.log(`   - ${r.gate_key} | profile=${r.validation_profile} | ${r.applicability}`);
// infrastructure coverage
const infra = data.filter(r => r.sd_type === 'infrastructure');
console.log(`\nsd_type='infrastructure' rows: ${infra.length}`);
for (const r of infra) console.log(`   - ${r.gate_key} | profile=${r.validation_profile} | ${r.applicability}`);
