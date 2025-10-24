import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('ERROR: Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
  try {
    const handoffId = '24cdf8db-5b60-4202-b6aa-dd9b417408ce';
    
    // Update the handoff record
    const { data, error } = await supabase
      .from('sd_phase_handoffs')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        accepted_by: 'EXEC Agent'
      })
      .eq('handoff_id', handoffId)
      .select();
    
    if (error) {
      console.error('ERROR:', error.message);
      process.exit(1);
    }
    
    if (!data || data.length === 0) {
      console.error('ERROR: Handoff not found with ID:', handoffId);
      process.exit(1);
    }
    
    console.log('✅ HANDOFF ACCEPTED SUCCESSFULLY');
    console.log('');
    console.log('Handoff ID:', data[0].handoff_id);
    console.log('SD ID:', data[0].sd_id);
    console.log('From Phase:', data[0].from_phase);
    console.log('To Phase:', data[0].to_phase);
    console.log('Status:', data[0].status);
    console.log('Accepted At:', data[0].accepted_at);
    console.log('Accepted By:', data[0].accepted_by);
    
  } catch (err) {
    console.error('EXCEPTION:', err.message);
    process.exit(1);
  }
})();
