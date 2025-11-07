import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  // Get distinct status values
  const { data, error } = await supabase
    .from('sd_phase_handoffs')
    .select('status, handoff_type')
    .limit(10);
  
  if (error) {
    console.error('Error:', error.message);
  } else if (data && data.length > 0) {
    console.log('Found handoffs with status values:');
    const unique = [...new Set(data.map(h => h.status))];
    console.log('Unique statuses:', unique);
  } else {
    console.log('No handoffs found. Trying strategic_directives_v2 status values...');
    
    const { data: sds } = await supabase
      .from('strategic_directives_v2')
      .select('status')
      .limit(10);
    
    if (sds && sds.length > 0) {
      const uniqueSdStatus = [...new Set(sds.map(s => s.status))];
      console.log('SD status values:', uniqueSdStatus);
      console.log('\nHandoff status might be similar. Try: draft, active, approved, completed');
    }
  }
})();
