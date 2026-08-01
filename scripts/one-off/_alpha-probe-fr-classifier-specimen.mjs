/**
 * Ground-truth probe for SD-FDBK-FIX-COMPLETION-FLAG-HARNESS-001.
 *
 * Runs the REAL classifier + the REAL gate projection against the 93-scored specimen
 * (SD-FDBK-INFRA-WORKER-LOOP-DIRECTIVE-001) so the diagnosis rests on what the code
 * actually computes, not on reading it. Read-only: no writes anywhere.
 */
import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';
import {
  classifyFrDelivery,
  projectGateResult,
  isFrTraceabilityEnforced,
} from '../modules/handoff/gates/fr-delivery-classifier.js';

const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const KEY = 'SD-FDBK-INFRA-WORKER-LOOP-DIRECTIVE-001';

const { data: sd } = await s
  .from('strategic_directives_v2')
  .select('id, sd_key, metadata')
  .eq('sd_key', KEY)
  .single();

const classification = await classifyFrDelivery(s, {
  sdId: sd.id,
  directiveId: sd.sd_key,
  sdMetadata: sd.metadata || {},
});

console.log('=== CLASSIFICATION (real code, real data) ===');
console.log('total       :', classification.total);
console.log('delivered   :', classification.delivered);
console.log('descoped    :', classification.descoped);
console.log('undelivered :', classification.undelivered);
for (const f of classification.frs) {
  console.log(`  ${f.id.padEnd(6)} ${f.status.padEnd(12)} ${f.evidence}`);
}

console.log('\n=== GATE PROJECTION ===');
console.log('env LEO_FR_TRACEABILITY_ENFORCE =', JSON.stringify(process.env.LEO_FR_TRACEABILITY_ENFORCE));
console.log('isFrTraceabilityEnforced()      =', isFrTraceabilityEnforced());

const off = projectGateResult(classification, { enforced: false, gateName: 'FR_DELIVERY_VERIFICATION' });
const on = projectGateResult(classification, { enforced: true, gateName: 'FR_DELIVERY_VERIFICATION' });

console.log('\n-- AS SHIPPED (enforced=false, the default) --');
console.log('passed:', off.passed, '| score:', off.score, '| required:', off.required);
console.log('issues  :', JSON.stringify(off.issues));
console.log('warnings:', JSON.stringify(off.warnings, null, 2));
console.log('details.raw_score:', off.details.raw_score);

console.log('\n-- IF ENFORCED (enforced=true) --');
console.log('passed:', on.passed, '| score:', on.score, '| required:', on.required);
console.log('issues  :', JSON.stringify(on.issues, null, 2));
