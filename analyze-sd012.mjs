import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function analyzeSD012() {
  console.log('🔍 Analyzing SD-012: Stage 18 - Documentation Sync\n');
  
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('sd_key', 'SD-012')
    .single();

  if (sdError) {
    console.error('Failed to fetch SD-012:', sdError.message);
    return;
  }

  console.log('✅ SD-012 Found\n');
  console.log('Key:', sd.sd_key);
  console.log('Title:', sd.title);
  console.log('Status:', sd.status);
  console.log('Priority:', sd.priority);
  console.log('Description:', sd.description ? sd.description.substring(0, 300) : 'None');
  
  if (sd.backlog_items) {
    console.log('\n📦 Backlog Items:', sd.backlog_items.length);
    console.log(JSON.stringify(sd.backlog_items, null, 2));
  } else {
    console.log('\n⚠️  No backlog items in database');
  }
  
  if (sd.metadata) {
    console.log('\n📊 Metadata:');
    console.log(JSON.stringify(sd.metadata, null, 2));
  }
}

analyzeSD012();
