import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function updateSDStatus() {
  console.log('Updating SD-EVA-MEETING-001 status to active...\n');
  
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .update({ 
      status: 'active',
      current_phase: 'plan_creation'
    })
    .eq('id', 'SD-EVA-MEETING-001')
    .select();
  
  if (error) {
    console.error('Error updating SD:', error.message);
    process.exit(1);
  }
  
  if (data && data.length > 0) {
    console.log('✅ SD Status Updated Successfully');
    console.log('SD ID:', data[0].id);
    console.log('New Status:', data[0].status);
    console.log('Current Phase:', data[0].current_phase);
  } else {
    console.log('No SD found with ID: SD-EVA-MEETING-001');
  }
}

updateSDStatus().catch(console.error);
