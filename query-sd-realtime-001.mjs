import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  process.env.SUPABASE_ANON_KEY
);

// Query SD-REALTIME-001
const { data: sd, error } = await supabase
  .from('strategic_directives_v2')
  .select('*')
  .eq('id', 'SD-REALTIME-001')
  .single();

if (error) {
  console.error('Error:', error);
  process.exit(1);
}

console.log('=== SD-REALTIME-001 Details ===\n');
console.log('ID:', sd.id);
console.log('Title:', sd.title);
console.log('Status:', sd.status);
console.log('Priority:', sd.priority);
console.log('Progress:', sd.progress, '%');
console.log('Current Phase:', sd.current_phase || 'N/A');
console.log('Created:', sd.created_at);
console.log('\nDescription:');
console.log(sd.description || 'No description');
console.log('\nScope:');
console.log(sd.scope || 'No scope defined');

// Check for existing PRD
const { data: prd } = await supabase
  .from('product_requirements_v2')
  .select('*')
  .eq('sd_id', 'SD-REALTIME-001')
  .single();

console.log('\n=== PRD Status ===');
console.log(prd ? 'PRD exists: ' + prd.id : 'No PRD found');

// Check for backlog items
const { data: backlog } = await supabase
  .from('sd_backlog_map')
  .select('*')
  .eq('sd_id', 'SD-REALTIME-001');

console.log('\n=== Backlog Items ===');
console.log('Total backlog items:', backlog?.length || 0);
if (backlog && backlog.length > 0) {
  backlog.forEach((item, i) => {
    console.log('\n' + (i + 1) + '. ' + item.backlog_title);
    console.log('   Priority:', item.priority);
    console.log('   Status:', item.completion_status);
    console.log('   Description:', item.item_description || 'N/A');
  });
}
