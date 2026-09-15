import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv'; dotenv.config();
import fs from 'fs';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { sd_type, results } = JSON.parse(fs.readFileSync('.artifacts/val-gates.json','utf8'));
const { data: reg } = await s.from('validation_gate_registry').select('*');
const names = new Set(); for (const v of Object.values(results)) if (Array.isArray(v)) v.forEach(n=>names.add(n));

const mine = new Set(reg.filter(r=>r.sd_type===sd_type && !r.validation_profile).map(r=>r.gate_key));
// Design B: gate has a DISABLED row for a DIFFERENT sd_type but none for mine
const disabledElsewhere = {};
for (const r of reg) {
  if (r.applicability==='DISABLED' && r.sd_type && r.sd_type!==sd_type && !r.validation_profile && names.has(r.gate_key) && !mine.has(r.gate_key)) {
    (disabledElsewhere[r.gate_key] ||= []).push(`${r.sd_type}`);
  }
}
console.log(`\n=== DESIGN B: gate DISABLED for another sd_type, no row for '${sd_type}', and IS in this SD's downstream gate set ===`);
const keys = Object.keys(disabledElsewhere).sort();
console.log(`COUNT: ${keys.length}`);
for (const k of keys) console.log(`  - ${k}  (disabled for: ${[...new Set(disabledElsewhere[k])].join(', ')})`);

// Registry gate_keys that match NO enumerated gate name (stale/orphan registry rows)
const orphans = [...new Set(reg.map(r=>r.gate_key))].filter(k=>!names.has(k));
console.log(`\n=== ORPHAN registry gate_keys (no matching gate in any enumerated phase) ===`);
console.log(`COUNT: ${orphans.length}`); console.log(orphans.sort().map(o=>'  - '+o).join('\n'));
