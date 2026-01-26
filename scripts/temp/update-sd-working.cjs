require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const sdId = process.argv[2];

supabase.from('strategic_directives_v2')
  .update({ is_working_on: true, current_phase: 'LEAD_APPROVAL' })
  .eq('id', sdId)
  .select()
  .single()
  .then(function(result) {
    if (result.error) {
      console.error('Error:', result.error.message);
      process.exit(1);
    }
    console.log('SD marked as working on');
    console.log('ID:', result.data.id);
    console.log('Title:', result.data.title);
    console.log('Phase:', result.data.current_phase);
  });
