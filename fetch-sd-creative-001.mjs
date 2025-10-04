import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const { data: sd, error } = await supabase
  .from('strategic_directives_v2')
  .select('*')
  .eq('sd_key', 'SD-CREATIVE-001')
  .single();

if (error) {
  console.error('Error:', error.message);
  process.exit(1);
}

if (!sd) {
  console.error('SD-CREATIVE-001 not found');
  process.exit(1);
}

console.log('📋 SD-CREATIVE-001: Creative Media Automation Suite');
console.log('═══════════════════════════════════════════════════════════\n');
console.log('Title:', sd.title);
console.log('Status:', sd.status);
console.log('Priority:', sd.priority);
console.log('Current Phase:', sd.current_phase || 'Not started');
console.log('Progress:', sd.progress || 0, '%');
console.log('\nDescription:');
console.log(sd.description || 'No description');
console.log('\nScope:');
console.log(sd.scope || 'No scope defined');
console.log('\nKey Changes:');
console.log(sd.key_changes || 'No key changes listed');
console.log('\nMetadata:');
console.log(JSON.stringify(sd.metadata, null, 2));
