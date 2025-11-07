import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  // Check for triggers on sd_phase_handoffs
  const { data, error } = await supabase.rpc('exec_sql', {
    query: `
      SELECT 
        trigger_name,
        event_manipulation,
        action_statement
      FROM information_schema.triggers
      WHERE event_object_table = 'sd_phase_handoffs'
    `
  });
  
  if (error) {
    console.log('Trying direct query for constraints...');
    // Try checking table constraints instead
    const { data: constraints, error: err2 } = await supabase.rpc('exec_sql', {
      query: `
        SELECT 
          conname as constraint_name,
          pg_get_constraintdef(oid) as definition
        FROM pg_constraint
        WHERE conrelid = 'sd_phase_handoffs'::regclass
      `
    });
    
    if (err2) {
      console.error('Cannot query triggers/constraints:', err2.message);
    } else {
      console.log('Constraints:', JSON.stringify(constraints, null, 2));
    }
  } else {
    console.log('Triggers:', JSON.stringify(data, null, 2));
  }
})();
