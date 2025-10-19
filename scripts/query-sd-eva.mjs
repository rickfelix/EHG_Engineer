import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function getSDInfo() {
  console.log('=== STEP 1: QUERYING SD METADATA ===\n');
  
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('sd_id', 'SD-EVA-MEETING-001')
    .single();
  
  if (sdError) {
    console.log('Error fetching SD:', sdError.message);
    return;
  }
  
  if (!sd) {
    console.log('SD-EVA-MEETING-001 not found in database');
    return;
  }
  
  console.log('SD ID:', sd.sd_id);
  console.log('Title:', sd.title);
  console.log('Status:', sd.status);
  console.log('Priority:', sd.priority);
  console.log('Progress:', sd.progress + '%');
  console.log('Current Phase:', sd.current_phase);
  console.log('Target Application:', sd.target_application);
  console.log('Category:', sd.category);
  console.log('\nDescription:', sd.description);
  console.log('\nScope:', sd.scope);
  
  console.log('\n=== STEP 2: QUERYING FOR EXISTING PRD ===\n');
  
  const { data: prd, error: prdError } = await supabase
    .from('product_requirements_v2')
    .select('*')
    .eq('directive_id', 'SD-EVA-MEETING-001');
  
  if (prdError) {
    console.log('Error:', prdError.message);
  } else if (prd && prd.length > 0) {
    console.log('✅ PRD Found:');
    console.log('  Title:', prd[0].title);
    console.log('  ID:', prd[0].id);
    console.log('  Story Points:', prd[0].story_points);
  } else {
    console.log('❌ No PRD found - will need to create one');
  }
  
  console.log('\n=== STEP 3: QUERYING BACKLOG ITEMS ===\n');
  
  const { data: backlog, error: backlogError } = await supabase
    .from('sd_backlog_map')
    .select('*')
    .eq('sd_id', 'SD-EVA-MEETING-001')
    .order('priority', { ascending: false });
  
  if (backlogError) {
    console.log('Error:', backlogError.message);
  } else if (backlog && backlog.length > 0) {
    console.log(`Found ${backlog.length} backlog items:\n`);
    backlog.forEach((item, idx) => {
      console.log(`Item #${idx + 1}:`);
      console.log('  Title:', item.backlog_title);
      console.log('  Priority:', item.priority);
      console.log('  Status:', item.completion_status);
      console.log('  Phase:', item.phase);
      if (item.item_description) {
        console.log('  Description:', item.item_description);
      }
      if (item.extras && item.extras.Description_1) {
        console.log('  Detailed:', item.extras.Description_1);
      }
      console.log('');
    });
  } else {
    console.log('No backlog items found for this SD');
  }
}

getSDInfo().catch(console.error);
