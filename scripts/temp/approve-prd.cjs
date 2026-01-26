require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const sdId = process.argv[2] || 'f586fb6f-9b64-4e34-805e-26533f6c9d25';

supabase.from('product_requirements_v2')
  .update({
    status: 'approved',
    updated_at: new Date().toISOString()
  })
  .eq('sd_id', sdId)
  .select('id, status')
  .single()
  .then(function(result) {
    if (result.error) {
      console.error('Error updating PRD:', result.error.message);
      process.exit(1);
    }
    console.log('PRD approved:', result.data.id);
    console.log('Status:', result.data.status);
  });
