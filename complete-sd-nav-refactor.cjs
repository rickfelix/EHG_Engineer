require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

(async () => {
  // Find the SD
  const { data: sds, error: searchError } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .ilike('title', '%Navigation Refactor%')
    .limit(1);

  if (searchError) {
    console.error('Error searching:', searchError);
    return;
  }

  if (!sds || sds.length === 0) {
    console.log('SD not found in database');
    return;
  }

  console.log('Found SD ID:', sds[0].id);
  console.log('Current status:', sds[0].status);
  console.log('Current progress:', sds[0].progress);

  // Update to completed
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .update({
      status: 'completed',
      progress: 100,
      current_phase: 'COMPLETED'
    })
    .eq('id', sds[0].id)
    .select();

  if (error) {
    console.error('Error updating:', error);
    return;
  }

  console.log('\n✅ SD-NAV-REFACTOR-001 marked as COMPLETED');
  console.log('Status:', data[0].status);
  console.log('Progress:', data[0].progress + '%');
  console.log('Phase:', data[0].current_phase);
})();
