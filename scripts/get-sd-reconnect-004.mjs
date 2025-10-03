import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const { data: sd, error } = await supabase
  .from('strategic_directives_v2')
  .select('*')
  .eq('id', 'SD-RECONNECT-004')
  .single();

if (error) {
  console.error('Error fetching SD:', error);
  process.exit(1);
}

console.log('═══════════════════════════════════════════════════════');
console.log('SD-RECONNECT-004 DETAILS');
console.log('═══════════════════════════════════════════════════════');
console.log('ID:', sd.id);
console.log('Title:', sd.title);
console.log('Status:', sd.status);
console.log('Priority:', sd.priority);
console.log('Current Phase:', sd.current_phase);
console.log('Progress:', sd.progress_percentage + '%');
console.log('\nDescription:');
console.log(sd.description);
console.log('\nBusiness Value:');
console.log(sd.business_value);
console.log('\nAcceptance Criteria:');
console.log(JSON.stringify(sd.acceptance_criteria, null, 2));
console.log('\nMetadata:');
console.log(JSON.stringify(sd.metadata, null, 2));
console.log('═══════════════════════════════════════════════════════');
