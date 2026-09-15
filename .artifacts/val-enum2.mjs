import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv'; dotenv.config();
import fs from 'fs';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: sds, error } = await s.from('strategic_directives_v2').select('*').eq('sd_key','SD-LEARN-FIX-ADDRESS-PAT-LES-015');
if (error) { console.error('SELECT ERROR:', error.message); process.exit(1); }
const sd = sds[0];
console.log(`SD ok: type=${sd.sd_type} phase=${sd.current_phase} target=${sd.target_application}`);

const mods = {
  'plan-to-exec': '../scripts/modules/handoff/executors/plan-to-exec/index.js',
  'exec-to-plan': '../scripts/modules/handoff/executors/exec-to-plan/index.js',
  'plan-to-lead': '../scripts/modules/handoff/executors/plan-to-lead/index.js',
};
const results = {};
for (const [phase, path] of Object.entries(mods)) {
  try {
    const M = await import(path);
    const Cls = M.default || Object.values(M).find(v => typeof v === 'function');
    const inst = new Cls({ supabase: s });
    const gates = await inst.getRequiredGates(sd, {});
    results[phase] = gates.map(g => g.name || g.key || 'unknown');
    console.log(`[OK] ${phase}: ${gates.length} gates`);
  } catch (e) {
    results[phase] = { ERROR: `${e.constructor.name}: ${e.message}` };
    console.log(`[THROW] ${phase}: ${e.constructor.name}: ${e.message}`);
  }
}
try {
  const { getRequiredGates } = await import('../scripts/modules/handoff/executors/lead-final-approval/gates.js');
  const g = getRequiredGates(s, null, sd);
  results['lead-final-approval'] = g.map(x => x.name || x.key || 'unknown');
  console.log(`[OK] lead-final-approval: ${g.length} gates`);
} catch (e) { results['lead-final-approval'] = { ERROR: e.message }; console.log(`[THROW] lead-final-approval: ${e.message}`); }

// registry rows for this sd_type
const { data: reg } = await s.from('validation_gate_registry').select('*');
const forType = new Set(reg.filter(r => r.sd_type === sd.sd_type && !r.validation_profile).map(r => r.gate_key));
const allNames = new Set();
for (const v of Object.values(results)) if (Array.isArray(v)) v.forEach(n => allNames.add(n));
const unaudited = [...allNames].filter(n => !forType.has(n));
console.log(`\nDISTINCT gate names across enumerable phases: ${allNames.size}`);
console.log(`Registry rows matching sd_type='${sd.sd_type}' (profile NULL): ${forType.size}`);
console.log(`UNAUDITED (no registry row for this sd_type): ${unaudited.length}`);
console.log(unaudited.sort().join('\n'));
fs.writeFileSync('.artifacts/val-gates.json', JSON.stringify({sd_type: sd.sd_type, results, unaudited}, null, 2));
