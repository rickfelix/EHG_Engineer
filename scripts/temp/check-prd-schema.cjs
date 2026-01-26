require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Get a sample PRD to see its structure
supabase.from('product_requirements_v2')
  .select('*')
  .limit(1)
  .then(function(result) {
    if (result.error) {
      console.error('Error:', result.error.message);
      process.exit(1);
    }
    if (result.data && result.data.length > 0) {
      console.log('Sample PRD columns:');
      Object.keys(result.data[0]).forEach(function(key) {
        console.log('  -', key);
      });
    } else {
      console.log('No PRDs found in table');
    }
  });
