import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function linkSDandPRD() {
  console.log('🔗 Linking SD-EVA-MEETING-001 ↔ PRD-SD-EVA-MEETING-001\n');
  
  // Step 1: Get SD UUID
  const { data: sd, error: sdFetchError } = await supabase
    .from('strategic_directives_v2')
    .select('uuid, id')
    .eq('id', 'SD-EVA-MEETING-001')
    .single();
  
  if (sdFetchError) {
    console.error('❌ Error fetching SD:', sdFetchError.message);
    process.exit(1);
  }
  
  console.log('✅ SD Found:');
  console.log('  ID:', sd.id);
  console.log('  UUID:', sd.uuid);
  
  // Step 2: Update SD with PRD reference
  const { error: sdUpdateError } = await supabase
    .from('strategic_directives_v2')
    .update({ 
      prd_id: 'PRD-SD-EVA-MEETING-001',
      current_phase: 'exec_implementation'
    })
    .eq('id', 'SD-EVA-MEETING-001');
  
  if (sdUpdateError) {
    console.error('❌ Error updating SD:', sdUpdateError.message);
  } else {
    console.log('✅ SD updated with PRD link and phase set to exec_implementation');
  }
  
  // Step 3: Update PRD with SD UUID
  const { error: prdUpdateError } = await supabase
    .from('product_requirements_v2')
    .update({ 
      sd_uuid: sd.uuid,
      directive_id: 'SD-EVA-MEETING-001',
      sd_id: 'SD-EVA-MEETING-001'
    })
    .eq('id', 'PRD-SD-EVA-MEETING-001');
  
  if (prdUpdateError) {
    console.error('❌ Error updating PRD:', prdUpdateError.message);
  } else {
    console.log('✅ PRD updated with SD UUID and directive_id');
  }
  
  // Step 4: Verify linkage
  console.log('\n🔍 Verifying linkage...\n');
  
  const { data: verifySD } = await supabase
    .from('strategic_directives_v2')
    .select('id, prd_id, current_phase')
    .eq('id', 'SD-EVA-MEETING-001')
    .single();
  
  const { data: verifyPRD } = await supabase
    .from('product_requirements_v2')
    .select('id, directive_id, sd_id, sd_uuid')
    .eq('id', 'PRD-SD-EVA-MEETING-001')
    .single();
  
  console.log('SD Linkage:');
  console.log('  SD ID:', verifySD?.id);
  console.log('  PRD ID:', verifySD?.prd_id);
  console.log('  Current Phase:', verifySD?.current_phase);
  
  console.log('\nPRD Linkage:');
  console.log('  PRD ID:', verifyPRD?.id);
  console.log('  Directive ID:', verifyPRD?.directive_id);
  console.log('  SD ID:', verifyPRD?.sd_id);
  console.log('  SD UUID:', verifyPRD?.sd_uuid);
  
  console.log('\n✅ Database linking complete!');
}

linkSDandPRD().catch(console.error);
