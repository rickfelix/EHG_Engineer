import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://zcduydscecawbmiiphxd.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('Error: SUPABASE_SERVICE_ROLE_KEY not found in environment');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSD() {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, legacy_id, sd_key, title, current_phase, status')
    .ilike('legacy_id', '%CREWAI%')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error querying SDs:', error.message);
    return;
  }

  console.log('Found SDs matching CREWAI:');
  console.log(JSON.stringify(data, null, 2));
}

checkSD();
