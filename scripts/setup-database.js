import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';.promises;
import path from 'path';

async function setupDatabase() {
  console.log('🔧 Setting up EHG_Engineer database schema...\n');
  
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
    
    // Read the schema file
    const schemaPath = path.join(process.cwd(), 'database', 'schema', '001_initial_schema.sql');
    const schemaSQL = await fs.readFile(schemaPath, 'utf-8');
    
    console.log('📄 Schema file loaded successfully');
    console.log('⚙️ Note: Database schema creation via API may be limited');
    console.log('📋 If this fails, please execute the SQL manually in Supabase dashboard\n');
    
    // Try to verify if tables already exist
    const { data: existingTables, error: checkError } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .limit(1);
    
    if (!checkError || checkError.code === 'PGRST116') {
      // PGRST116 means table doesn't exist
      if (checkError && checkError.code === 'PGRST116') {
        console.log('📊 Tables not found, manual setup required');
        console.log('\n📋 MANUAL SETUP INSTRUCTIONS:');
        console.log('1. Go to your Supabase dashboard');
        console.log('2. Navigate to SQL Editor');
        console.log('3. Copy contents of database/schema/001_initial_schema.sql');
        console.log('4. Paste and execute in SQL Editor');
        console.log('5. Run "npm run test-database" to verify setup\n');
      } else {
        console.log('✅ Database tables already exist!');
        console.log('📊 Ready for LEO Protocol operations');
      }
    }
    
    console.log('\n📋 Expected tables:');
    console.log('   - strategic_directives_v2');
    console.log('   - execution_sequences_v2');
    console.log('   - hap_blocks_v2');
    console.log('\n🔄 Next: Test the database with "npm run test-database"');
    
  } catch (error) {
    console.log('❌ Error setting up database:', error.message);
    console.log('\n📋 Note: You may need to manually execute the SQL in your Supabase dashboard');
    console.log('   Copy the contents of database/schema/001_initial_schema.sql');
    process.exit(1);
  }
}

setupDatabase();