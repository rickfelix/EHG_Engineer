#!/usr/bin/env node

/**
 * Run Test Management Schema Migration
 * SD-TEST-MGMT-SCHEMA-001
 *
 * Approach:
 * 1. Try RPC execution via fn_execute_sql_admin
 * 2. Fall back to Supabase client verification
 * 3. Output SQL for manual execution if needed
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Split SQL into individual statements (handles $$ blocks)
 */
function splitPostgreSQLStatements(sql) {
  const statements = [];
  let current = '';
  let inDollarQuote = false;
  let dollarTag = null;

  const lines = sql.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('--')) continue;

    // Track dollar quoting ($$, $body$, etc.)
    const dollarMatch = line.match(/\$([a-zA-Z_]*)\$/);
    if (dollarMatch) {
      if (!inDollarQuote) {
        inDollarQuote = true;
        dollarTag = dollarMatch[0];
      } else if (dollarMatch[0] === dollarTag) {
        inDollarQuote = false;
        dollarTag = null;
      }
    }

    current += line + '\n';

    // End of statement: semicolon outside dollar quotes
    if (trimmed.endsWith(';') && !inDollarQuote) {
      const stmt = current.trim();
      if (stmt && !stmt.startsWith('--')) {
        statements.push(stmt);
      }
      current = '';
    }
  }

  if (current.trim()) {
    statements.push(current.trim());
  }

  return statements.filter(s => s.length > 0);
}

async function runMigration() {
  console.log('🗄️  Running Test Management Schema Migration...');
  console.log('   SD: SD-TEST-MGMT-SCHEMA-001\n');

  const sqlPath = path.join(__dirname, '../database/migrations/20260105_test_management_schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf-8');
  const statements = splitPostgreSQLStatements(sql);

  console.log(`📋 Found ${statements.length} SQL statements\n`);

  // Try RPC execution first
  console.log('🔌 Attempting RPC execution via fn_execute_sql_admin...');

  let rpcAvailable = false;
  try {
    const { error: rpcError } = await supabase.rpc('fn_execute_sql_admin', {
      sql_text: 'SELECT 1'
    });
    rpcAvailable = !rpcError;
  } catch (_e) {
    rpcAvailable = false;
  }

  if (rpcAvailable) {
    console.log('   ✅ RPC available, executing migration...\n');

    let success = 0;
    let skipped = 0;
    let errors = 0;

    for (const stmt of statements) {
      const trimmed = stmt.trim();
      if (!trimmed) continue;

      try {
        const { error } = await supabase.rpc('fn_execute_sql_admin', {
          sql_text: trimmed
        });

        if (error) {
          if (error.message.includes('already exists')) {
            skipped++;
          } else {
            console.log(`   ❌ Error: ${error.message.substring(0, 100)}`);
            errors++;
          }
        } else {
          success++;
          if (trimmed.includes('CREATE TABLE')) {
            const match = trimmed.match(/CREATE TABLE.*?(\w+)/i);
            if (match) console.log(`   ✅ Created table: ${match[1]}`);
          }
        }
      } catch (err) {
        errors++;
        console.log(`   ❌ Error: ${err.message.substring(0, 100)}`);
      }
    }

    console.log('\n📊 Migration complete:');
    console.log(`   ✅ Success: ${success}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   ❌ Errors: ${errors}`);
  } else {
    console.log('   ⚠️  RPC not available. Checking if tables exist...\n');
  }

  // Verify tables exist (works with regular Supabase client)
  const tables = ['tests', 'test_runs', 'test_fixtures', 'feature_test_map', 'test_ownership', 'test_performance_baselines'];
  console.log('🔍 Verifying tables:');

  let tablesExist = 0;
  let tablesMissing = [];

  for (const table of tables) {
    try {
      const { error } = await supabase.from(table).select('id').limit(1);

      if (error && (error.code === '42P01' || error.message.includes('does not exist'))) {
        console.log(`   ❌ ${table}: does not exist`);
        tablesMissing.push(table);
      } else {
        console.log(`   ✅ ${table}: exists`);
        tablesExist++;
      }
    } catch (err) {
      console.log(`   ⚠️  ${table}: ${err.message.substring(0, 50)}`);
      tablesMissing.push(table);
    }
  }

  console.log(`\n📊 Table Status: ${tablesExist}/${tables.length} exist`);

  if (tablesMissing.length > 0 && !rpcAvailable) {
    console.log('\n' + '='.repeat(70));
    console.log('⚠️  MANUAL MIGRATION REQUIRED');
    console.log('='.repeat(70));
    console.log('\nThe following tables need to be created:');
    tablesMissing.forEach(t => console.log(`   - ${t}`));
    console.log('\nOptions:');
    console.log('1. Apply migration via Supabase Dashboard SQL Editor');
    console.log('2. Use Supabase CLI: supabase db push');
    console.log(`\nMigration file: ${sqlPath}`);
    console.log('\nQuick option: Copy the SQL below to Supabase SQL Editor:\n');
    console.log('─'.repeat(70));
    console.log(sql);
    console.log('─'.repeat(70));
  } else if (tablesMissing.length === 0) {
    console.log('\n✅ All tables exist! Migration complete or already applied.');
  }
}

runMigration().catch(err => {
  console.error('\n❌ Migration failed:', err.message);
  process.exit(1);
});
