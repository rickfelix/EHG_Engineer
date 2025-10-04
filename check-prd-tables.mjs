import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkTables() {
  console.log('🔍 Checking PRD Tables...\n');

  // Check product_requirements_v2
  const { data: v2Data, error: v2Error } = await supabase
    .from('product_requirements_v2')
    .select('*')
    .limit(1);

  if (v2Error) {
    console.log('❌ product_requirements_v2 error:', v2Error.message);
  } else {
    console.log('✅ Found product_requirements_v2 table!');
    if (v2Data.length > 0) {
      console.log('\nSample structure:');
      console.log(JSON.stringify(v2Data[0], null, 2));
    } else {
      console.log('(Table exists but is empty)');
    }
  }

  // Check prds table
  const { data: prdsData, error: prdsError } = await supabase
    .from('prds')
    .select('id, title, strategic_directive_id');

  if (!prdsError && prdsData) {
    console.log('\n📊 prds table has', prdsData.length, 'records');
    if (prdsData.length > 0) {
      console.log('\nSample records:');
      prdsData.slice(0, 5).forEach(p => {
        console.log(`  - ${p.id}: ${p.title}`);
        console.log(`    SD: ${p.strategic_directive_id || 'none'}`);
      });
    }
  }
}

checkTables();
