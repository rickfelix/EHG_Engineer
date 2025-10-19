const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://dedlbzhpgkmetvhbkyzq.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
  // Try to get one record to see columns
  const { data, error } = await supabase
    .from('sd_phase_handoffs')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error querying table:', error.message);
    return;
  }

  if (data && data.length > 0) {
    console.log('Columns in sd_phase_handoffs:');
    console.log(Object.keys(data[0]).sort().join('\n'));
  } else {
    console.log('No records in table yet. Trying to insert to see schema...');
    // Try inserting minimal record to see what columns are required
    const { error: insertError } = await supabase
      .from('sd_phase_handoffs')
      .insert({ test: 'test' });
    
    if (insertError) {
      console.log('Insert error (reveals required columns):', insertError.message);
    }
  }
}

checkSchema();
