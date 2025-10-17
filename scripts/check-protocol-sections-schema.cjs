const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
  console.log('🔍 Checking leo_protocol_sections table schema...\n');

  try {
    const { data, error } = await supabase
      .from('leo_protocol_sections')
      .select('*')
      .limit(1);

    if (error) {
      console.error('❌ Error querying table:', error);
      process.exit(1);
    }

    if (data && data.length > 0) {
      console.log('✅ Available columns in leo_protocol_sections:');
      console.log(Object.keys(data[0]).join(', '));
      console.log('\n📊 Sample record:');
      console.log(JSON.stringify(data[0], null, 2));
    } else {
      console.log('⚠️ No records found in table');
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  }
}

checkSchema();
