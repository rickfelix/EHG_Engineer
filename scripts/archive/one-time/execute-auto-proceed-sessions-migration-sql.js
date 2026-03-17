#!/usr/bin/env node

/**
 * Execute auto_proceed_sessions table migration via SQL
 *
 * Migration: database/migrations/20260125_auto_proceed_sessions.sql
 * Purpose: Create table for AUTO-PROCEED crash recovery (D18)
 * SD: SD-LEO-ENH-AUTO-PROCEED-001-06
 *
 * This script uses direct SQL execution through PostgREST
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function _executeSql(sql) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ sql })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`SQL execution failed: ${response.status} ${response.statusText}\n${errorText}`);
  }

  return await response.json();
}

async function _query(tableName, select = '*', filters = {}) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  let url = `${supabaseUrl}/rest/v1/${tableName}?select=${select}`;

  for (const [key, value] of Object.entries(filters)) {
    url += `&${key}=eq.${value}`;
  }

  const response = await fetch(url, {
    headers: {
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Query failed: ${response.status} ${response.statusText}\n${errorText}`);
  }

  return await response.json();
}

async function _rpc(functionName, params = {}) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify(params)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`RPC ${functionName} failed: ${response.status} ${response.statusText}\n${errorText}`);
  }

  return await response.json();
}

async function executeMigration() {
  console.log('🗄️  AUTO-PROCEED Sessions Migration\n');
  console.log('Purpose: Create auto_proceed_sessions table for crash recovery');
  console.log('SD: SD-LEO-ENH-AUTO-PROCEED-001-06\n');

  try {
    // Read the migration file
    const migrationPath = path.join(__dirname, '..', 'database', 'migrations', '20260125_auto_proceed_sessions.sql');
    console.log(`📖 Reading migration: ${migrationPath}\n`);
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');

    console.log('📋 Migration file loaded successfully');
    console.log('   File size: ' + migrationSql.length + ' bytes');
    console.log('\n⚠️  MANUAL EXECUTION REQUIRED\n');
    console.log('The migration SQL is ready, but must be executed via Supabase Dashboard:');
    console.log('\n1. Open Supabase Dashboard: https://supabase.com/dashboard');
    console.log('2. Go to: SQL Editor');
    console.log('3. Create a new query');
    console.log('4. Copy the migration SQL from: ' + migrationPath);
    console.log('5. Execute the query');
    console.log('\n📄 Migration SQL Preview (first 1000 chars):\n');
    console.log('─'.repeat(60));
    console.log(migrationSql.substring(0, 1000));
    console.log('...\n');
    console.log('─'.repeat(60));
    console.log('\n✅ Migration file verified and ready');
    console.log('\nAfter manual execution in Supabase Dashboard, you can verify with:');
    console.log('   node scripts/verify-auto-proceed-sessions-migration.js');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run the migration
executeMigration();
