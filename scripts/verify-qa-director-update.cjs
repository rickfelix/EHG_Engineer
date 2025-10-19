const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyUpdate() {
  console.log('🔍 Verifying QA Engineering Director update...\n');

  try {
    const { data, error } = await supabase
      .from('leo_sub_agents')
      .select('*')
      .eq('code', 'TESTING')
      .single();

    if (error) {
      console.error('❌ Error fetching sub-agent:', error);
      process.exit(1);
    }

    console.log('✅ QA Engineering Director Sub-Agent:');
    console.log(`   ID: ${data.id}`);
    console.log(`   Name: ${data.name}`);
    console.log(`   Code: ${data.code}`);
    console.log(`   Priority: ${data.priority}`);
    console.log(`   Activation Type: ${data.activation_type}`);
    console.log(`   Active: ${data.active}`);
    console.log('');
    console.log('📋 Capabilities:');
    if (data.capabilities && data.capabilities.length > 0) {
      data.capabilities.forEach((cap, idx) => {
        console.log(`   ${idx + 1}. ${cap}`);
      });
    } else {
      console.log('   (none)');
    }
    console.log('');
    console.log('📊 Metadata:');
    console.log(JSON.stringify(data.metadata, null, 2));
    console.log('');
    console.log('📝 Description Preview (first 500 chars):');
    console.log(data.description.substring(0, 500) + '...');
    console.log('');
    console.log('✅ Verification complete!');
    console.log('');
    console.log('🔑 Key Confirmations:');
    console.log(`   ✅ Description length: ${data.description.length} characters`);
    console.log(`   ✅ Capabilities count: ${data.capabilities.length}`);
    console.log(`   ✅ Metadata version: ${data.metadata.version}`);
    console.log(`   ✅ Edition: ${data.metadata.edition}`);
    console.log('');

  } catch (error) {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  }
}

verifyUpdate();
