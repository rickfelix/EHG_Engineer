import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data, error } = await supabase
  .from('strategic_directives_v2')
  .select('id, title, status, priority, current_phase, category, sd_type, target_application, created_at')
  .eq('id', 'SD-GITHUB-ACTIONS-FIX-001')
  .single();

if (error) {
  console.error('Error:', error);
  process.exit(1);
}

console.log('✅ SD-GITHUB-ACTIONS-FIX-001 Verification:\n');
console.log('ID:', data.id);
console.log('Title:', data.title);
console.log('Status:', data.status);
console.log('Priority:', data.priority, '(P0)');
console.log('Current Phase:', data.current_phase);
console.log('Category:', data.category);
console.log('SD Type:', data.sd_type);
console.log('Target Application:', data.target_application);
console.log('Created At:', new Date(data.created_at).toLocaleString());
console.log('\n✅ Strategic Directive successfully created in database!');
