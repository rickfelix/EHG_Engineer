const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://dedlbzhpgkmetvhbkyzq.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSD() {
  const { data: sd, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, status, current_phase, strategic_objectives, key_principles, risks, success_criteria')
    .eq('id', 'SD-VIDEO-VARIANT-001')
    .single();

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  console.log('=== SD-VIDEO-VARIANT-001 Current State ===\n');
  console.log('ID:', sd.id);
  console.log('Title:', sd.title);
  console.log('Status:', sd.status);
  console.log('Phase:', sd.current_phase);
  console.log('\n--- Field Status ---');
  console.log('strategic_objectives:', sd.strategic_objectives ? '✅ HAS DATA' : '❌ NULL/EMPTY');
  console.log('key_principles:', sd.key_principles ? '✅ HAS DATA' : '❌ NULL/EMPTY');
  console.log('risks:', sd.risks ? '✅ HAS DATA' : '❌ NULL/EMPTY');
  console.log('success_criteria:', sd.success_criteria ? '✅ HAS DATA' : '❌ NULL/EMPTY');
  
  console.log('\n--- Current Values ---');
  console.log('strategic_objectives:', JSON.stringify(sd.strategic_objectives, null, 2));
  console.log('key_principles:', JSON.stringify(sd.key_principles, null, 2));
  console.log('risks:', JSON.stringify(sd.risks, null, 2));
  console.log('success_criteria:', JSON.stringify(sd.success_criteria, null, 2));
}

checkSD();
