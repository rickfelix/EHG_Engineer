const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseKey) {
  console.error('❌ SUPABASE_ANON_KEY environment variable not set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function getSDFull() {
  const { data: sd, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', 'SD-VIDEO-VARIANT-001')
    .single();

  if (error) {
    console.error('❌ Error:', error.message);
    return;
  }

  console.log('=== SD-VIDEO-VARIANT-001 Full Details ===\n');
  console.log(`Title: ${sd.title}`);
  console.log(`Status: ${sd.status}`);
  console.log(`Phase: ${sd.current_phase}`);
  console.log(`Priority: ${sd.priority}`);
  console.log(`Category: ${sd.category}`);
  console.log(`Target Application: ${sd.target_application || 'N/A'}`);
  console.log(`\n--- DESCRIPTION ---`);
  console.log(sd.description || 'N/A');
  console.log(`\n--- SCOPE ---`);
  console.log(sd.scope || 'N/A');
  console.log(`\n--- OBJECTIVES ---`);
  console.log(sd.objectives || 'N/A');
  console.log(`\n--- SUCCESS CRITERIA ---`);
  console.log(sd.success_criteria || 'N/A');
}

getSDFull().catch(console.error);
