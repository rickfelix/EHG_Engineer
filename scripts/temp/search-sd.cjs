require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Search for SDs with keywords
supabase.from('strategic_directives_v2')
  .select('id, title, status, current_phase, sd_type')
  .or('id.ilike.%PRD%,id.ilike.%GROUNDING%,id.ilike.%VALIDATION%,title.ilike.%PRD%,title.ilike.%grounding%,title.ilike.%validation%')
  .order('created_at', { ascending: false })
  .limit(30)
  .then(function(result) {
    if (result.error) {
      console.error('Error:', result.error.message);
      process.exit(1);
    }
    if (!result.data || result.data.length === 0) {
      console.log('No SDs found matching PRD, GROUNDING, or VALIDATION keywords');
    } else {
      console.log('SDs matching PRD/GROUNDING/VALIDATION:');
      result.data.forEach(function(sd) {
        console.log('  ' + sd.id);
        console.log('    Title: ' + (sd.title || 'N/A'));
        console.log('    Status: ' + sd.status + ' | Phase: ' + sd.current_phase);
        console.log('');
      });
    }
  });
