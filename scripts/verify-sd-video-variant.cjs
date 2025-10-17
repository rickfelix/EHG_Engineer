require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('sd_key', 'SD-VIDEO-VARIANT-001')
    .single();

  if (error) {
    console.error('❌ Error:', error);
    return;
  }

  console.log('✅ SD Found in Database\n');
  console.log('ID:', data.id);
  console.log('SD Key:', data.sd_key);
  console.log('Title:', data.title);
  console.log('Category:', data.category);
  console.log('Priority:', data.priority);
  console.log('Status:', data.status);
  console.log('Current Phase:', data.current_phase);
  console.log('Target Application:', data.target_application);
  console.log('\nStrategic Intent:');
  console.log(data.strategic_intent);
  console.log('\nScope (In-Scope Items):');
  data.scope.in_scope.forEach(item => console.log(`  - ${item}`));
  console.log('\nResearch Prompts Embedded:', data.metadata.research_prompts_embedded);
  console.log('Integration Points:', data.metadata.integration_points.length);
  console.log('New Components:', data.metadata.new_components.length);
  console.log('\n✅ Verification Complete!');

  process.exit(0);
})();
