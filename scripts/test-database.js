import { createClient  } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

async function testDatabase() {
  console.log('🔍 Testing EHG_Engineer database functionality...\n');
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey || 
      supabaseUrl === 'your_supabase_url_here' || 
      supabaseKey === 'your_supabase_anon_key_here') {
    console.log('❌ Missing or placeholder Supabase credentials in .env file');
    console.log('Please update .env with your actual Supabase URL and API key');
    process.exit(1);
  }
  
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    let allTablesPassed = true;
    
    // Test 1: Test strategic_directives_v2 table
    console.log('📋 Test 1: Testing strategic_directives_v2 table...');
    const { data: _sdData, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .limit(1);
    
    if (sdError) {
      if (sdError.code === 'PGRST116') {
        console.log('❌ Table strategic_directives_v2 does not exist');
        console.log('   Please execute database/schema/001_initial_schema.sql in Supabase');
        allTablesPassed = false;
      } else {
        console.log('⚠️  Error querying strategic_directives_v2:', sdError.message);
        allTablesPassed = false;
      }
    } else {
      console.log('✅ strategic_directives_v2 table accessible');
    }
    
    // Test 2: Test execution_sequences_v2 table
    console.log('\n📋 Test 2: Testing execution_sequences_v2 table...');
    const { data: _esData, error: esError } = await supabase
      .from('execution_sequences_v2')
      .select('id')
      .limit(1);
    
    if (esError) {
      if (esError.code === 'PGRST116') {
        console.log('❌ Table execution_sequences_v2 does not exist');
        console.log('   Please execute database/schema/001_initial_schema.sql in Supabase');
        allTablesPassed = false;
      } else {
        console.log('⚠️  Error querying execution_sequences_v2:', esError.message);
        allTablesPassed = false;
      }
    } else {
      console.log('✅ execution_sequences_v2 table accessible');
    }
    
    // Test 3: Test hap_blocks_v2 table
    console.log('\n📋 Test 3: Testing hap_blocks_v2 table...');
    const { data: _hapData, error: hapError } = await supabase
      .from('hap_blocks_v2')
      .select('hap_id')
      .limit(1);
    
    if (hapError) {
      if (hapError.code === 'PGRST116') {
        console.log('❌ Table hap_blocks_v2 does not exist');
        console.log('   Please execute database/schema/001_initial_schema.sql in Supabase');
        allTablesPassed = false;
      } else {
        console.log('⚠️  Error querying hap_blocks_v2:', hapError.message);
        allTablesPassed = false;
      }
    } else {
      console.log('✅ hap_blocks_v2 table accessible');
    }
    
    // Summary
    if (allTablesPassed) {
      console.log('\n🎉 Database test completed successfully!');
      console.log('📊 All core LEO Protocol tables are accessible');
      console.log('\n🔄 Next: Create your first Strategic Directive');
    } else {
      console.log('\n⚠️  Some tables are missing');
      console.log('📋 Manual setup required:');
      console.log('1. Go to your Supabase dashboard');
      console.log('2. Navigate to SQL Editor');
      console.log('3. Copy contents of database/schema/001_initial_schema.sql');
      console.log('4. Paste and execute in SQL Editor');
      console.log('5. Run this test again to verify');
    }
    
  } catch (_error) {
    console.log('❌ Database test failed:', error.message);
    process.exit(1);
  }
}

testDatabase();