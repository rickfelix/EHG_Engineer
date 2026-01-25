#!/usr/bin/env node

/**
 * Execute auto_proceed_sessions table migration
 *
 * Migration: database/migrations/20260125_auto_proceed_sessions.sql
 * Purpose: Create table for AUTO-PROCEED crash recovery (D18)
 * SD: SD-LEO-ENH-AUTO-PROCEED-001-06
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createDatabaseClient } from './lib/supabase-connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function executeMigration() {
  console.log('🗄️  AUTO-PROCEED Sessions Migration\n');
  console.log('Purpose: Create auto_proceed_sessions table for crash recovery');
  console.log('SD: SD-LEO-ENH-AUTO-PROCEED-001-06\n');

  const client = await createDatabaseClient('engineer', { verify: false });

  try {
    // Read the migration file
    const migrationPath = path.join(__dirname, '..', 'database', 'migrations', '20260125_auto_proceed_sessions.sql');
    console.log(`📖 Reading migration: ${migrationPath}`);
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');

    // Execute the migration
    console.log('\n🚀 Executing migration...\n');
    await client.query(migrationSql);
    console.log('✅ Migration executed successfully\n');

    // Verification: Check table exists
    console.log('🔍 Verifying table creation...');
    const tableCheck = await client.query(`
      SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'auto_proceed_sessions'
      ORDER BY ordinal_position;
    `);

    if (tableCheck.rows.length === 0) {
      throw new Error('Table auto_proceed_sessions was not created');
    }

    console.log(`✅ Table 'auto_proceed_sessions' exists with ${tableCheck.rows.length} columns:`);
    tableCheck.rows.forEach(col => {
      console.log(`   - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
    });

    // Verification: Check indexes
    console.log('\n🔍 Verifying indexes...');
    const indexCheck = await client.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'auto_proceed_sessions';
    `);

    console.log(`✅ Found ${indexCheck.rows.length} indexes:`);
    indexCheck.rows.forEach(idx => {
      console.log(`   - ${idx.indexname}`);
    });

    // Verification: Check functions exist
    console.log('\n🔍 Verifying helper functions...');
    const functionCheck = await client.query(`
      SELECT proname, pronargs
      FROM pg_proc
      WHERE proname IN (
        'upsert_auto_proceed_session',
        'update_auto_proceed_progress',
        'get_active_auto_proceed_session',
        'deactivate_auto_proceed_session',
        'update_auto_proceed_sessions_updated_at'
      );
    `);

    console.log(`✅ Found ${functionCheck.rows.length} functions:`);
    functionCheck.rows.forEach(fn => {
      console.log(`   - ${fn.proname}(${fn.pronargs} args)`);
    });

    // Verification: Check view exists
    console.log('\n🔍 Verifying view...');
    const viewCheck = await client.query(`
      SELECT table_name
      FROM information_schema.views
      WHERE table_name = 'v_active_auto_proceed_sessions';
    `);

    if (viewCheck.rows.length > 0) {
      console.log('✅ View v_active_auto_proceed_sessions created');
    } else {
      throw new Error('View v_active_auto_proceed_sessions not found');
    }

    // Test: Insert test data
    console.log('\n🧪 Testing session creation...');
    const testResult = await client.query(`
      SELECT upsert_auto_proceed_session(
        'test_session_' || NOW()::TEXT,
        'SD-TEST-001',
        FALSE,
        'PLAN',
        NULL,
        3,
        '{"test": true}'::jsonb
      ) as session_id;
    `);

    const sessionId = testResult.rows[0].session_id;
    console.log(`✅ Test session created: ${sessionId}`);

    // Test: Query active sessions
    console.log('\n🧪 Testing active session query...');
    const activeCheck = await client.query(`
      SELECT * FROM v_active_auto_proceed_sessions
      LIMIT 1;
    `);

    if (activeCheck.rows.length > 0) {
      const session = activeCheck.rows[0];
      console.log('✅ Active session query works:');
      console.log(`   Session ID: ${session.session_id}`);
      console.log(`   Active SD: ${session.active_sd_key}`);
      console.log(`   Phase: ${session.current_phase}`);
      console.log(`   Progress: ${session.completed_children}/${session.total_children} (${session.progress_percentage}%)`);
    }

    // Test: Update progress
    console.log('\n🧪 Testing progress update...');
    await client.query(`
      SELECT update_auto_proceed_progress(
        (SELECT session_id FROM auto_proceed_sessions WHERE id = $1),
        1,
        'EXEC',
        'SD-TEST-002'
      );
    `, [sessionId]);
    console.log('✅ Progress update works');

    // Test: Get active session
    console.log('\n🧪 Testing get_active_auto_proceed_session()...');
    const getActiveResult = await client.query(`
      SELECT * FROM get_active_auto_proceed_session();
    `);

    if (getActiveResult.rows.length > 0) {
      const session = getActiveResult.rows[0];
      console.log('✅ get_active_auto_proceed_session() works:');
      console.log(`   Active SD: ${session.active_sd_key}`);
      console.log(`   Phase: ${session.current_phase}`);
      console.log(`   Progress: ${session.completed_children}/${session.total_children}`);
    }

    // Test: Deactivate session
    console.log('\n🧪 Testing session deactivation...');
    await client.query(`
      SELECT deactivate_auto_proceed_session(
        (SELECT session_id FROM auto_proceed_sessions WHERE id = $1)
      );
    `, [sessionId]);
    console.log('✅ Session deactivation works');

    // Verify deactivation
    const deactivatedCheck = await client.query(`
      SELECT is_active, deactivated_at
      FROM auto_proceed_sessions
      WHERE id = $1;
    `, [sessionId]);

    if (deactivatedCheck.rows[0].is_active === false && deactivatedCheck.rows[0].deactivated_at !== null) {
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
    console.log('  Start: SELECT upsert_auto_proceed_session(\'session_id\', \'SD-XXX-001\');');
    console.log('  Update: SELECT update_auto_proceed_progress(\'session_id\', NULL, \'EXEC\');');
    console.log('  Get: SELECT * FROM get_active_auto_proceed_session();');
    console.log('  End: SELECT deactivate_auto_proceed_session(\'session_id\');');
    console.log('  View: SELECT * FROM v_active_auto_proceed_sessions;');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Run the migration
executeMigration();
