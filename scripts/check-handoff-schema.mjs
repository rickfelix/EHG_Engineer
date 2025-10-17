import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function checkSchema() {
  const { data, error } = await supabase
    .from('sd_phase_handoffs')
    .select('*')
    .limit(1);

  if (error) {
    console.log('❌ Error:', error.message);
    console.log('\nAttempting to get any record...');
    
    const result = await supabase.from('sd_phase_handoffs').select('*');
    console.log('Query result:', JSON.stringify(result, null, 2));
  } else {
    console.log('✅ Sample record structure:');
    console.log(JSON.stringify(data, null, 2));
  }
}

checkSchema();
