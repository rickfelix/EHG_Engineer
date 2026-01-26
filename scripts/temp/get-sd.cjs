require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const sdId = process.argv[2] || 'SD-LEO-INFRA-PRD-GROUNDING-VALIDATION-001';

supabase.from('strategic_directives_v2')
  .select('*')
  .ilike('id', '%' + sdId + '%')
  .then(function(result) {
    if (result.error) {
      console.error('Error:', result.error.message);
      process.exit(1);
    }
    if (!result.data || result.data.length === 0) {
      console.log('No SD found matching:', sdId);
      // List all SDs to help debug
      supabase.from('strategic_directives_v2')
        .select('id, title, status, current_phase')
        .order('created_at', { ascending: false })
        .limit(20)
        .then(function(listResult) {
          console.log('\nAvailable SDs:');
          if (listResult.data) {
            listResult.data.forEach(function(sd) {
              console.log('  ' + sd.id + ' - ' + sd.status + ' - ' + sd.current_phase);
            });
          }
        });
    } else {
      console.log(JSON.stringify(result.data[0], null, 2));
    }
  });
