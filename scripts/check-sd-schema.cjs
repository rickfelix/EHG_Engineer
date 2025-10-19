const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
  // Get one record to see all columns
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', 'SD-VIDEO-VARIANT-001')
    .single();

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  console.log('Columns in strategic_directives_v2:');
  console.log(Object.keys(data).sort().join('\n'));

  console.log('\n\nHas progress_percentage?', 'progress_percentage' in data);
}

checkSchema();
