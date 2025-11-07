import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '/mnt/c/_EHG/EHG_Engineer/.env' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('=== STRATEGIC DIRECTIVE STATUS ===');
const { data: sd, error: sdError } = await supabase
  .from('strategic_directives_v2')
  .select('id, title, status, current_phase, progress_percentage')
  .eq('id', 'SD-VENTURE-UNIFICATION-001')
  .single();

if (sdError) {
  console.log('Error:', sdError.message);
} else {
  console.log('ID:', sd.id);
  console.log('Title:', sd.title);
  console.log('Status:', sd.status);
  console.log('Current Phase:', sd.current_phase);
  console.log('Progress:', sd.progress_percentage + '%');
}

console.log('\n=== COMPLETED HANDOFFS ===');
const { data: handoffs, error: handoffError } = await supabase
  .from('sd_phase_handoffs')
  .select('from_phase, to_phase, created_at, status')
  .eq('sd_id', 'SD-VENTURE-UNIFICATION-001')
  .order('created_at', { ascending: false });

if (handoffError) {
  console.log('Error:', handoffError.message);
} else if (!handoffs || handoffs.length === 0) {
  console.log('No handoffs found yet.');
} else {
  handoffs.forEach(h => {
    console.log(`${h.from_phase} → ${h.to_phase} [${h.status}] at ${h.created_at}`);
  });
}

console.log('\n=== PRD STATUS ===');
const { data: prd, error: prdError } = await supabase
  .from('product_requirements_v2')
  .select('id, research_confidence_score')
  .eq('sd_id', 'SD-VENTURE-UNIFICATION-001');

if (prdError) {
  console.log('Error:', prdError.message);
} else if (!prd || prd.length === 0) {
  console.log('No PRD created yet.');
} else {
  console.log('PRD ID:', prd[0].id);
  console.log('Research Confidence:', prd[0].research_confidence_score);
}

console.log('\n=== EPIC EXECUTION SEQUENCES ===');
const { data: ees, error: eesError } = await supabase
  .from('execution_sequences_v2')
  .select('id, sequence_number, title, status')
  .eq('directive_id', 'SD-VENTURE-UNIFICATION-001')
  .order('sequence_number');

if (eesError) {
  console.log('Error:', eesError.message);
} else if (!ees || ees.length === 0) {
  console.log('No Epic Execution Sequences found.');
} else {
  console.log(`Found ${ees.length} Epic Execution Sequences:`);
  ees.forEach(e => {
    console.log(`  ${e.sequence_number}. [${e.status}] ${e.title}`);
  });
}
