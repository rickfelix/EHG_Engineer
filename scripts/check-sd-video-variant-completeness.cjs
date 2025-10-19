const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSD() {
  const { data: sd, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', 'SD-VIDEO-VARIANT-001')
    .single();

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  console.log('=== SD-VIDEO-VARIANT-001 Completeness Check ===\n');
  console.log('Title:', sd.title);
  console.log('Status:', sd.status);
  console.log('Phase:', sd.current_phase);
  console.log('\n--- Required Fields ---');
  console.log('strategic_objectives:', sd.strategic_objectives ? `✅ EXISTS (${JSON.stringify(sd.strategic_objectives).length} chars)` : '❌ MISSING');
  console.log('key_principles:', sd.key_principles ? `✅ EXISTS (${JSON.stringify(sd.key_principles).length} chars)` : '❌ MISSING');
  console.log('risks:', sd.risks ? `✅ EXISTS (${JSON.stringify(sd.risks).length} chars)` : '❌ MISSING');
  console.log('success_criteria:', sd.success_criteria ? `✅ EXISTS (${sd.success_criteria.length} items)` : '❌ MISSING');
  
  console.log('\n--- Current Values ---');
  if (sd.strategic_objectives) console.log('Strategic Objectives:', JSON.stringify(sd.strategic_objectives, null, 2));
  if (sd.key_principles) console.log('Key Principles:', JSON.stringify(sd.key_principles, null, 2));
  if (sd.risks) console.log('Risks:', JSON.stringify(sd.risks, null, 2));
  if (sd.success_criteria) console.log('Success Criteria:', JSON.stringify(sd.success_criteria, null, 2));
}

checkSD();
