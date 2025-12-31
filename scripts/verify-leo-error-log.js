#!/usr/bin/env node
/**
 * Verify LEO Error Log Table
 * Quick verification script for SD-GENESIS-V32-PULSE
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

async function verify() {
  console.log('🔍 Verifying leo_error_log table...\n');

  let client;

  try {
    client = await createDatabaseClient('engineer', { verify: false });

    // Check table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'leo_error_log'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      throw new Error('Table leo_error_log does not exist!');
    }

    console.log('✅ Table exists');

    // Check columns
    const columns = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'leo_error_log'
      ORDER BY ordinal_position;
    `);

    console.log(`✅ ${columns.rows.length} columns found`);

    // Check indexes
    const indexes = await client.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'leo_error_log';
    `);

    console.log(`✅ ${indexes.rows.length} indexes found`);

    // Check RLS
    const rls = await client.query(`
      SELECT relrowsecurity
      FROM pg_class
      WHERE relname = 'leo_error_log';
    `);

    console.log(`✅ RLS enabled: ${rls.rows[0].relrowsecurity}`);

    // Check policies
    const policies = await client.query(`
      SELECT policyname, cmd, roles
      FROM pg_policies
      WHERE tablename = 'leo_error_log';
    `);

    console.log(`✅ ${policies.rows.length} RLS policies found`);

    // Check functions
    const functions = await client.query(`
      SELECT proname
      FROM pg_proc
      WHERE proname IN ('log_critical_error', 'get_recent_errors');
    `);

    console.log(`✅ ${functions.rows.length} helper functions found`);

    // Test insert via function
    const testInsert = await client.query(`
      SELECT log_critical_error(
        'VALIDATION_ERROR',
        'Test verification insert',
        'verify-leo-error-log',
        'verification-script',
        '{"verification": true}'::jsonb,
        'SD-GENESIS-V32-PULSE'
      ) as error_id;
    `);

    const errorId = testInsert.rows[0].error_id;
    console.log(`✅ Test insert successful: ${errorId}`);

    // Query back
    const testQuery = await client.query(`
      SELECT * FROM leo_error_log WHERE id = $1;
    `, [errorId]);

    console.log('✅ Test query successful');
    console.log(`   - Error Type: ${testQuery.rows[0].error_type}`);
    console.log(`   - Severity: ${testQuery.rows[0].severity}`);
    console.log(`   - Status: ${testQuery.rows[0].status}`);

    // Cleanup
    await client.query('DELETE FROM leo_error_log WHERE id = $1', [errorId]);
    console.log('✅ Test record cleaned up');

    console.log('\n✅ All verifications passed!\n');
    return true;

  } catch (error) {
    console.error('\n❌ Verification failed:');
    console.error(`   Error: ${error.message}\n`);
    return false;

  } finally {
    if (client) {
      await client.end();
    }
  }
}

verify()
  .then(success => process.exit(success ? 0 : 1))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
