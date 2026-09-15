import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: sds } = await s.from('strategic_directives_v2').select('id, sd_key, sd_type, status, current_phase, validation_profile, target_application, metadata, parent_sd_id').eq('sd_key','SD-LEARN-FIX-ADDRESS-PAT-LES-015');
const sd = sds?.[0];
console.log('SD:', JSON.stringify({id:sd?.id, sd_key:sd?.sd_key, sd_type:sd?.sd_type, status:sd?.status, phase:sd?.current_phase, profile:sd?.validation_profile, target:sd?.target_application, parent:sd?.parent_sd_id}, null, 1));

// Attempt the PLANNED approach: construct executors with only {supabase}
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
    console.log(`\n[OK] ${phase}: ${results[phase].length} gates`);
  } catch (e) {
    results[phase] = { ERROR: e.message };
    console.log(`\n[THROW] ${phase}: ${e.constructor.name}: ${e.message}`);
  }
}
try {
  const { getRequiredGates } = await import('../scripts/modules/handoff/executors/lead-final-approval/gates.js');
  const gates = getRequiredGates(s, null, sd);
  results['lead-final-approval'] = gates.map(g => g.name || g.key || 'unknown');
  console.log(`\n[OK] lead-final-approval: ${results['lead-final-approval'].length} gates`);
} catch (e) {
  results['lead-final-approval'] = { ERROR: e.message };
  console.log(`\n[THROW] lead-final-approval: ${e.message}`);
}
import fs from 'fs';
fs.writeFileSync('.artifacts/val-gates.json', JSON.stringify({sd_type: sd?.sd_type, results}, null, 2));
console.log('\n--- written to .artifacts/val-gates.json ---');
