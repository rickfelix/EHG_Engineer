import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function checkSchema() {
  console.log('Attempting to discover sd_phase_handoffs schema...\n');

  // Try with minimal fields first
  const testRecord = {
    sd_id: 'TEST',
    from_phase: 'exec',
    to_phase: 'plan',
    status: 'pending'
  };

  const { data, error: insertError } = await supabase
    .from('sd_phase_handoffs')
    .insert(testRecord)
    .select();

  if (insertError) {
    console.log('❌ Insert error:', insertError.message);
    console.log('\nFull error details:', JSON.stringify(insertError, null, 2));
  } else {
    console.log('✅ Insert succeeded!');
    console.log('Record columns:', Object.keys(data[0]));

    // Clean up test record
    await supabase.from('sd_phase_handoffs').delete().eq('sd_id', 'TEST');
  }
}

checkSchema();
