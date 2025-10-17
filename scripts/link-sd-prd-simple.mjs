import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function linkSDandPRD() {
  console.log('🔗 Linking SD ↔ PRD\n');
  
  // Update SD with PRD reference and set phase to exec_implementation
  const { error: sdError } = await supabase
    .from('strategic_directives_v2')
    .update({ 
      prd_id: 'PRD-SD-EVA-MEETING-001',
      current_phase: 'exec_implementation',
      progress: 20
    })
    .eq('id', 'SD-EVA-MEETING-001');
  
  if (sdError) {
    console.error('❌ SD update error:', sdError.message);
  } else {
    console.log('✅ SD updated: prd_id, phase→exec_implementation, progress→20%');
  }
  
  // Update PRD with SD reference
  const { error: prdError } = await supabase
    .from('product_requirements_v2')
    .update({ 
      directive_id: 'SD-EVA-MEETING-001',
      sd_id: 'SD-EVA-MEETING-001'
    })
    .eq('id', 'PRD-SD-EVA-MEETING-001');
  
  if (prdError) {
    console.error('❌ PRD update error:', prdError.message);
  } else {
    console.log('✅ PRD updated: directive_id, sd_id');
  }
  
  console.log('\n✅ Database linking complete!');
}

linkSDandPRD().catch(console.error);
