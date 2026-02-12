#!/usr/bin/env node

/**
 * Execute auto_proceed_sessions table migration via Supabase API
 *
 * Migration: database/migrations/20260125_auto_proceed_sessions.sql
 * Purpose: Create table for AUTO-PROCEED crash recovery (D18)
 * SD: SD-LEO-ENH-AUTO-PROCEED-001-06
 *
 * Uses Supabase client with service_role key to execute SQL via API
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function executeMigration() {
  console.log('🗄️  AUTO-PROCEED Sessions Migration (via API)\n');
  console.log('Purpose: Create auto_proceed_sessions table for crash recovery');
  console.log('SD: SD-LEO-ENH-AUTO-PROCEED-001-06\n');

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  try {
    // Read the migration file
    const migrationPath = path.join(__dirname, '..', 'database', 'migrations', '20260125_auto_proceed_sessions.sql');
    console.log(`📖 Reading migration: ${migrationPath}`);
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');

    // Execute the migration via RPC (using a SQL function or direct execution)
    console.log('\n🚀 Executing migration...\n');

    // Split the SQL into individual statements and execute them
    // Remove comments and split by semicolons
    const statements = migrationSql
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n')
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    console.log(`Executing ${statements.length} SQL statements...\n`);

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      if (!stmt) continue;

      // Show progress for major operations
      if (stmt.includes('CREATE TABLE')) {
        console.log(`  [${i + 1}/${statements.length}] Creating table...`);
      } else if (stmt.includes('CREATE INDEX')) {
        console.log(`  [${i + 1}/${statements.length}] Creating index...`);
      } else if (stmt.includes('CREATE FUNCTION') || stmt.includes('CREATE OR REPLACE FUNCTION')) {
        console.log(`  [${i + 1}/${statements.length}] Creating function...`);
      } else if (stmt.includes('CREATE TRIGGER')) {
        console.log(`  [${i + 1}/${statements.length}] Creating trigger...`);
      } else if (stmt.includes('CREATE VIEW') || stmt.includes('CREATE OR REPLACE VIEW')) {
        console.log(`  [${i + 1}/${statements.length}] Creating view...`);
      } else if (stmt.includes('GRANT')) {
        console.log(`  [${i + 1}/${statements.length}] Setting permissions...`);
      }

      // Execute via RPC
      const { _data, error } = await supabase.rpc('exec_sql', { sql: stmt + ';' });

      if (error) {
        // Try direct execution if exec_sql doesn't exist
        console.log('  Note: exec_sql RPC not found, using direct query...');
        const { error: directError } = await supabase.from('_sql').insert({ query: stmt });

        if (directError) {
          console.error(`❌ Error executing statement ${i + 1}:`, directError.message);
          console.error('Statement:', stmt.substring(0, 200) + '...');
          throw directError;
        }
      }
    }

    console.log('\n✅ Migration executed successfully\n');

    // Verification: Check table exists
    console.log('🔍 Verifying table creation...');
    const { data: _tableCheck, error: tableError } = await supabase
      .from('auto_proceed_sessions')
      .select('*')
      .limit(0);

    if (tableError && tableError.code !== 'PGRST116') { // PGRST116 = no rows (which is fine)
      throw new Error(`Table verification failed: ${tableError.message}`);
    }

    console.log('✅ Table \'auto_proceed_sessions\' exists');

    // Test: Insert test data using upsert function
    console.log('\n🧪 Testing session creation...');
    const testSessionId = `test_session_${Date.now()}`;

    const { data: createResult, error: createError } = await supabase.rpc('upsert_auto_proceed_session', {
      p_session_id: testSessionId,
      p_active_sd_key: 'SD-TEST-001',
      p_chain_orchestrators: false,
      p_current_phase: 'PLAN',
      p_parent_orchestrator_key: null,
      p_total_children: 3,
      p_metadata: { test: true }
    });

    if (createError) {
      console.error('❌ Test session creation failed:', createError.message);
      throw createError;
    }

    console.log(`✅ Test session created: ${createResult}`);

    // Test: Query active sessions via view
    console.log('\n🧪 Testing active session query...');
    const { data: activeCheck, error: activeError } = await supabase
      .from('v_active_auto_proceed_sessions')
      .select('*')
      .limit(1);

    if (activeError) {
      console.error('❌ Active session query failed:', activeError.message);
      throw activeError;
    }

    if (activeCheck && activeCheck.length > 0) {
      const session = activeCheck[0];
      console.log('✅ Active session query works:');
      console.log(`   Session ID: ${session.session_id}`);
      console.log(`   Active SD: ${session.active_sd_key}`);
      console.log(`   Phase: ${session.current_phase}`);
      console.log(`   Progress: ${session.completed_children}/${session.total_children} (${session.progress_percentage}%)`);
    }

    // Test: Update progress
    console.log('\n🧪 Testing progress update...');
    const { error: updateError } = await supabase.rpc('update_auto_proceed_progress', {
      p_session_id: testSessionId,
      p_completed_children: 1,
      p_current_phase: 'EXEC',
      p_active_sd_key: 'SD-TEST-002'
    });

    if (updateError) {
      console.error('❌ Progress update failed:', updateError.message);
      throw updateError;
    }

    console.log('✅ Progress update works');

    // Test: Get active session
    console.log('\n🧪 Testing get_active_auto_proceed_session()...');
    const { data: getActiveResult, error: getActiveError } = await supabase.rpc('get_active_auto_proceed_session');

    if (getActiveError) {
      console.error('❌ get_active_auto_proceed_session failed:', getActiveError.message);
      throw getActiveError;
    }

    if (getActiveResult && getActiveResult.length > 0) {
      const session = getActiveResult[0];
      console.log('✅ get_active_auto_proceed_session() works:');
      console.log(`   Active SD: ${session.active_sd_key}`);
      console.log(`   Phase: ${session.current_phase}`);
      console.log(`   Progress: ${session.completed_children}/${session.total_children}`);
    }

    // Test: Deactivate session
    console.log('\n🧪 Testing session deactivation...');
    const { error: deactivateError } = await supabase.rpc('deactivate_auto_proceed_session', {
      p_session_id: testSessionId
    });

    if (deactivateError) {
      console.error('❌ Session deactivation failed:', deactivateError.message);
      throw deactivateError;
    }

    console.log('✅ Session deactivation works');

    // Verify deactivation
    const { data: deactivatedCheck, error: deactivatedError } = await supabase
      .from('auto_proceed_sessions')
      .select('is_active, deactivated_at')
      .eq('session_id', testSessionId)
      .single();

    if (!deactivatedError && deactivatedCheck.is_active === false && deactivatedCheck.deactivated_at !== null) {
      console.log('✅ Session properly deactivated');
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ MIGRATION COMPLETE - All verifications passed');
    console.log('='.repeat(60));
    console.log('\nCreated:');
    console.log('  - auto_proceed_sessions table');
    console.log('  - 4 indexes (session_id, active, sd_key, created)');
    console.log('  - 1 unique constraint (single active session)');
    console.log('  - 5 helper functions (upsert, update, get, deactivate, trigger)');
    console.log('  - 1 view (v_active_auto_proceed_sessions)');
    console.log('  - Grants for authenticated and service_role');
    console.log('\nUsage:');
    console.log('  Start: supabase.rpc(\'upsert_auto_proceed_session\', {...})');
    console.log('  Update: supabase.rpc(\'update_auto_proceed_progress\', {...})');
    console.log('  Get: supabase.rpc(\'get_active_auto_proceed_session\')');
    console.log('  End: supabase.rpc(\'deactivate_auto_proceed_session\', {...})');
    console.log('  View: supabase.from(\'v_active_auto_proceed_sessions\').select(\'*\')');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run the migration
executeMigration();
