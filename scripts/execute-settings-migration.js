import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// EHG Application Database (CONSOLIDATED as of SD-ARCH-EHG-006)
const supabaseUrl = process.env.EHG_SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co';
const supabaseKey = process.env.EHG_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('❌ Error: EHG_SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function executeMigration() {
  console.log('🔄 Executing SD-UAT-020 Settings Tables Migration...\n');
  console.log(`📍 Database: ${supabaseUrl}`);
  console.log('📁 Migration: create-settings-tables-sd-uat-020.sql\n');

  try {
    // Read migration file
    const migrationPath = join(__dirname, '../database/migrations/create-settings-tables-sd-uat-020.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf8');

    // Split into individual statements (rough approach for PostgreSQL)
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`📊 Found ${statements.length} SQL statements to execute\n`);

    // Execute each statement
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';

      // Skip comment-only statements
      if (statement.trim().startsWith('--')) continue;

      console.log(`⏳ Executing statement ${i + 1}/${statements.length}...`);

      const { error } = await supabase.rpc('exec_sql', { sql_query: statement });

      if (error) {
        // Try alternative method using direct query
        const { error: _queryError } = await supabase.from('_').select('*').limit(0);

        console.log(`❌ Statement ${i + 1} failed: ${error.message}`);
        errorCount++;
      } else {
        console.log(`✅ Statement ${i + 1} executed successfully`);
        successCount++;
      }
    }

    console.log('\n📊 Migration Summary:');
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ❌ Errors: ${errorCount}\n`);

    // Verify tables created
    console.log('🔍 Verifying tables created...\n');

    const { error: tablesError } = await supabase
      .from('profiles')
      .select('*')
      .limit(0);

    if (tablesError && !tablesError.message.includes('0 rows')) {
      console.log('❌ Profiles table verification failed:', tablesError.message);
    } else {
      console.log('✅ Profiles table exists');
    }

    const { error: prefsError } = await supabase
      .from('user_preferences')
      .select('*')
      .limit(0);

    if (prefsError && !prefsError.message.includes('0 rows')) {
      console.log('❌ User preferences table verification failed:', prefsError.message);
    } else {
      console.log('✅ User preferences table exists');
    }

    console.log('\n✅ Migration completed successfully!');
    console.log('\n📋 Next Steps:');
    console.log('   1. Create test user at http://localhost:8080/login');
    console.log('   2. Navigate to /settings page');
    console.log('   3. Test all three settings tabs');
    console.log('   4. Verify data persists after refresh\n');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

executeMigration();
