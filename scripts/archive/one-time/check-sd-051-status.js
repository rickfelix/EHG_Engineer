import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  process.env.SUPABASE_ANON_KEY
);

async function checkSD051() {
  console.log('🔍 Checking SD-051 Status and PRD\n');

  // Check for PRD
  const { data: prds } = await supabase
    .from('product_requirements_v2')
    .select('*')
    .eq('sd_id', 'SD-051');

  if (!prds || prds.length === 0) {
    console.log('❌ No PRD found for SD-051\n');
    console.log('📋 Analysis from SD scope:');
    console.log('- Only 1 feature marked as KEEP: Worker Management (30h)');
    console.log('- 3 features marked as DEFER');
    console.log('- Current status: active, 30% progress');
    console.log('- Current phase: PLAN_DESIGN\n');
    console.log('🎯 LEAD Decision Required:\n');
    console.log('Option 1: DEFER - Most features are deferred, low business value');
    console.log('Option 2: CANCEL - Insufficient scope to justify SD');
    console.log('Option 3: CREATE PRD - For just Worker Management (30h)\n');
  } else {
    console.log('✅ Found PRD(s) for SD-051:\n');
    prds.forEach(prd => {
      console.log('Title:', prd.title);
      console.log('Status:', prd.status);
      console.log('Created:', prd.created_at);
      console.log('');
    });
  }
}

checkSD051();
