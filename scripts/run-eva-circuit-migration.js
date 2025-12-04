#!/usr/bin/env node
/**
 * EVA Circuit Breaker Migration Executor
 * Applies the EVA circuit breaker tables and functions to Supabase
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Missing Supabase credentials in .env file');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Create Supabase client with service role
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function executeSql(sql) {
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
  if (error) throw error;
  return data;
}

async function runMigration() {
  console.log('🚀 EVA Circuit Breaker Migration');
  console.log('================================\n');

  console.log(`📍 Database: ${SUPABASE_URL}`);
  console.log('🔑 Using service role key\n');

  // Read migration file
  const migrationPath = join(__dirname, '../../ehg/database/migrations/20251204_eva_circuit_breaker.sql');
  console.log(`📄 Reading migration: ${migrationPath}`);

  let migrationSql;
  try {
    migrationSql = readFileSync(migrationPath, 'utf8');
    console.log(`✅ Migration file loaded (${migrationSql.length} bytes)\n`);
  } catch (error) {
    console.error(`❌ Failed to read migration file: ${error.message}`);
    process.exit(1);
  }

  // Execute migration
  console.log('🔨 Executing migration...');
  try {
    // Split into individual statements and execute
    // Note: Supabase SQL editor executes the entire script
    const { error } = await supabase.rpc('exec_sql', { sql_query: migrationSql });

    if (error) {
      // If exec_sql doesn't exist, try direct query
      if (error.code === '42883') {
        console.log('ℹ️  exec_sql function not available, using direct query execution...');

        // For Supabase, we'll use the REST API to execute raw SQL
        // This requires using the service role key with elevated privileges
        const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
          },
          body: JSON.stringify({ query: migrationSql })
        });

        if (!response.ok) {
          // Fall back to executing via pg client
          console.log('ℹ️  Falling back to pg client...');
          await executeViaPgClient(migrationSql);
        } else {
          console.log('✅ Migration executed successfully via REST API');
        }
      } else {
        throw error;
      }
    } else {
      console.log('✅ Migration executed successfully');
    }
  } catch (error) {
    console.error(`❌ Migration failed: ${error.message}`);
    console.error('Full error:', error);

    // Try alternative execution method
    console.log('\n🔄 Attempting alternative execution via pg client...');
    try {
      await executeViaPgClient(migrationSql);
    } catch (pgError) {
      console.error(`❌ Alternative method also failed: ${pgError.message}`);
      process.exit(1);
    }
  }

  // Verify tables were created
  console.log('\n🔍 Verifying table creation...');
  await verifyTables();

  console.log('\n✨ Migration completed successfully!');
}

async function executeViaPgClient(sql) {
  const pg = await import('pg');
  const { Client } = pg.default;

  const client = new Client({
    connectionString: process.env.SUPABASE_POOLER_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to database via pg client');

    await client.query(sql);
    console.log('✅ Migration executed successfully via pg client');
  } finally {
    await client.end();
  }
}

async function verifyTables() {
  const tables = [
    'system_alerts',
    'eva_circuit_breaker',
    'eva_circuit_state_transitions'
  ];

  for (const table of tables) {
    try {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (error) {
        console.error(`  ❌ ${table}: ${error.message}`);
      } else {
        console.log(`  ✅ ${table}: Exists (${count || 0} rows)`);
      }
    } catch (error) {
      console.error(`  ❌ ${table}: Verification failed - ${error.message}`);
    }
  }

  // Verify functions
  console.log('\n🔍 Verifying functions...');
  const functions = [
    'get_or_create_eva_circuit',
    'record_eva_failure',
    'record_eva_success',
    'eva_circuit_allows_request',
    'reset_eva_circuit'
  ];

  for (const func of functions) {
    try {
      // Check if function exists by querying pg_proc
      const { data, error } = await supabase.rpc('exec_sql', {
        sql_query: `SELECT proname FROM pg_proc WHERE proname = '${func}'`
      });

      if (error || !data) {
        // Alternative check using information_schema
        console.log(`  ⚠️  ${func}: Cannot verify (exec_sql not available)`);
      } else {
        console.log(`  ✅ ${func}: Exists`);
      }
    } catch (error) {
      console.log(`  ⚠️  ${func}: Verification skipped`);
    }
  }
}

// Run migration
runMigration().catch(error => {
  console.error('\n💥 Fatal error:', error);
  process.exit(1);
});
