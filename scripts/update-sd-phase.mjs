import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function updatePhase() {
  console.log('📊 Updating SD phase to exec_implementation\n');
  
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .update({ 
      current_phase: 'exec_implementation',
      progress: 20
    })
    .eq('id', 'SD-EVA-MEETING-001')
    .select();
  
  if (error) {
    console.error('❌ Error:', error.message);
  } else {
    console.log('✅ SD Phase Updated:');
    console.log('  Current Phase:', data[0].current_phase);
    console.log('  Progress:', data[0].progress + '%');
  }
}

updatePhase().catch(console.error);
