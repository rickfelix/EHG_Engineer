require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const sdId = process.argv[2];

supabase.from('strategic_directives_v2')
  .select('id, uuid_id, sd_key, title')
  .eq('id', sdId)
  .single()
  .then(function(result) {
    if (result.error) {
      console.log('Error by id:', result.error.message);
      // Try by sd_key
      supabase.from('strategic_directives_v2')
        .select('id, uuid_id, sd_key, title')
        .eq('sd_key', sdId)
        .single()
        .then(function(result2) {
          if (result2.error) {
            console.log('Error by sd_key:', result2.error.message);
          } else {
            console.log('Found by sd_key:');
            console.log('  id:', result2.data.id);
            console.log('  uuid_id:', result2.data.uuid_id);
            console.log('  sd_key:', result2.data.sd_key);
            console.log('  title:', result2.data.title);
          }
        });
    } else {
      console.log('Found by id:');
      console.log('  id:', result.data.id);
      console.log('  uuid_id:', result.data.uuid_id);
      console.log('  sd_key:', result.data.sd_key);
      console.log('  title:', result.data.title);
    }
  });
