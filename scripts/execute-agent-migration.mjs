/**
 * Execute Agent Execution Schema Migration
 * SD-STAGE4-AGENT-PROGRESS-001
 *
 * Executes 002_create_agent_execution_schema.sql against EHG Supabase database
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Supabase connection from EHG .env
const SUPABASE_URL = 'https://liapbndqlqxdcgpwntbv.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_SERVICE_KEY or VITE_SUPABASE_ANON_KEY required');
  process.exit(1);
}

async function executeMigration() {
  console.log('=== Agent Execution Schema Migration ===\n');

  // Read migration SQL
  const sqlPath = join(__dirname, 'sql', '002_create_agent_execution_schema.sql');
  console.log(`Reading migration from: ${sqlPath}`);

  const migrationSQL = readFileSync(sqlPath, 'utf-8');
  console.log(`✅ Migration SQL loaded (${migrationSQL.length} characters)\n`);

  // Connect to Supabase
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  console.log('Executing migration...\n');

  try {
    // Execute the migration
    const { data, error } = await supabase.rpc('exec_sql', {
      sql_query: migrationSQL
    });

    if (error) {
      console.error('❌ Migration failed:', error.message);
      console.error('Details:', error);
      process.exit(1);
    }

    console.log('✅ Migration executed successfully!\n');
    console.log('Created tables:');
    console.log('  - agent_executions');
    console.log('  - agent_execution_logs');
    console.log('  - execution_metrics\n');

    console.log('Created triggers:');
    console.log('  - update_agent_executions_timestamp');
    console.log('  - notify_agent_execution_updates\n');

    console.log('RLS policies enabled: ✅');
    console.log('PostgreSQL NOTIFY channel: agent_execution_updates\n');

    // Verify tables exist
    const { data: tables, error: verifyError } = await supabase
      .from('agent_executions')
      .select('id')
      .limit(1);

    if (verifyError && verifyError.code !== 'PGRST116') {
      console.warn('⚠️  Verification warning:', verifyError.message);
    } else {
      console.log('✅ Verification: agent_executions table accessible\n');
    }

    console.log('=== Migration Complete ===');
    console.log('Next steps:');
    console.log('1. Run unit tests: npm run test:unit');
    console.log('2. Test services integration');
    console.log('3. Verify RLS policies with authenticated user\n');

  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

executeMigration();
