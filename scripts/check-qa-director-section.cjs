const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkQASections() {
  console.log('🔍 Searching for QA Director sections in leo_protocol_sections...\n');

  try {
    // Search for any sections related to QA
    const { data: qaKeyword, error: qaError } = await supabase
      .from('leo_protocol_sections')
      .select('*')
      .or('title.ilike.%QA%,content.ilike.%QA Engineering Director%,section_type.ilike.%qa%');

    if (qaError) {
      console.error('❌ Error searching sections:', qaError);
      process.exit(1);
    }

    console.log(`📊 Found ${qaKeyword ? qaKeyword.length : 0} sections related to QA:`);
    if (qaKeyword && qaKeyword.length > 0) {
      qaKeyword.forEach(section => {
        console.log(`\n✅ Section:
`);
        console.log(`   ID: ${section.id}`);
        console.log(`   Title: ${section.title}`);
        console.log(`   Section Type: ${section.section_type}`);
        console.log(`   Order Index: ${section.order_index}`);
        console.log(`   Content preview (first 200 chars):`);
        console.log(`   ${section.content.substring(0, 200)}...`);
      });
    } else {
      console.log('   (none found)');
    }

    // Also check all section types
    console.log('\n\n📋 All available section types:');
    const { data: allSections, error: allError } = await supabase
      .from('leo_protocol_sections')
      .select('section_type, title')
      .order('order_index');

    if (allError) {
      console.error('❌ Error fetching all sections:', allError);
    } else if (allSections) {
      allSections.forEach((s, idx) => {
        console.log(`   ${idx + 1}. ${s.section_type}: ${s.title}`);
      });
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  }
}

checkQASections();
