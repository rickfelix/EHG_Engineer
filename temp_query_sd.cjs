const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
  try {
    console.log('=== Querying SD-SETTINGS-2025-10-12 ===');
    const { data: sdData, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('sd_id', 'SD-SETTINGS-2025-10-12')
      .single();

    if (sdError) {
      console.error('SD Query Error:', sdError);
    } else {
      console.log('SD Found:', JSON.stringify(sdData, null, 2));
    }

    console.log('\n=== Querying without .single() ===');
    const { data: allData, error: allError } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('sd_id', 'SD-SETTINGS-2025-10-12');

    if (allError) {
      console.error('All Query Error:', allError);
    } else {
      console.log('Results count:', allData ? allData.length : 0);
      if (allData && allData.length > 0) {
        console.log('Results:', JSON.stringify(allData, null, 2));
      }
    }

    console.log('\n=== Testing Pattern Match ===');
    const { data: likeData, error: likeError } = await supabase
      .from('strategic_directives_v2')
      .select('sd_id, title, status, priority, description, scope, target_app')
      .ilike('sd_id', '%SETTINGS%');

    if (likeError) {
      console.error('LIKE Query Error:', likeError);
    } else {
      console.log('SETTINGS SDs found:', JSON.stringify(likeData, null, 2));
    }

  } catch (error) {
    console.error('Unexpected error:', error);
  }
})();
