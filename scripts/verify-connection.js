import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

async function testConnection() {
  console.log('🔌 Testing Supabase connection for EHG_Engineer...\n');
  
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
    
    // Test basic connection - simpler query
    const { data: _data, error } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .limit(1);

    if (error && error.code !== 'PGRST116') {
      // PGRST116 means table doesn't exist yet, which is expected in Phase 1
      console.log('❌ Connection failed:', error.message);
      process.exit(1);
    }
    
    console.log('✅ Supabase connection successful!');
    console.log('📊 Database is accessible and ready for schema setup');
    console.log('\n🔄 Next: Proceed to Phase 2 for database schema creation');
    
  } catch (_error) {
    console.log('❌ Connection error:', error.message);
    process.exit(1);
  }
}

testConnection();