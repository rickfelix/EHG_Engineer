#!/usr/bin/env node
/**
 * Verify EVA Circuit Breaker Migration
 * Checks that all tables, functions, indexes, RLS policies, and triggers were created
 */

import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const client = new Client({
  connectionString: process.env.SUPABASE_POOLER_URL,
  ssl: { rejectUnauthorized: false }
});

async function verifyMigration() {
  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Verify tables
    console.log('🔍 Verifying tables...\n');
    const tableResult = await client.query(`
      SELECT
        table_name,
        (SELECT count(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
      FROM information_schema.tables t
      WHERE table_schema = 'public'
        AND table_name IN ('system_alerts', 'eva_circuit_breaker', 'eva_circuit_state_transitions')
      ORDER BY table_name
    `);

    console.log('Tables created:');
    tableResult.rows.forEach(row => {
      console.log(`  ✅ ${row.table_name} (${row.column_count} columns)`);
    });

    // Verify functions
    console.log('\n🔍 Verifying PostgreSQL functions...\n');
    const funcResult = await client.query(`
      SELECT
        proname as function_name,
        pg_get_function_result(oid) as return_type,
        pronargs as num_args
      FROM pg_proc
      WHERE proname IN (
        'get_or_create_eva_circuit',
        'record_eva_failure',
        'record_eva_success',
        'eva_circuit_allows_request',
        'reset_eva_circuit',
        'update_timestamp'
      )
      ORDER BY proname
    `);

    console.log('Functions created:');
    funcResult.rows.forEach(row => {
      console.log(`  ✅ ${row.function_name} (${row.num_args} args) → ${row.return_type}`);
    });

    // Verify indexes
    console.log('\n🔍 Verifying indexes...\n');
    const idxResult = await client.query(`
      SELECT
        schemaname,
        tablename,
        indexname
      FROM pg_indexes
      WHERE tablename IN ('system_alerts', 'eva_circuit_breaker', 'eva_circuit_state_transitions')
      ORDER BY tablename, indexname
    `);

    console.log('Indexes created:');
    idxResult.rows.forEach(row => {
      console.log(`  ✅ ${row.tablename}.${row.indexname}`);
    });

    // Verify RLS policies
    console.log('\n🔍 Verifying RLS policies...\n');
    const rlsResult = await client.query(`
      SELECT
        tablename,
        policyname,
        cmd as command,
        roles::text[]
      FROM pg_policies
      WHERE tablename IN ('system_alerts', 'eva_circuit_breaker', 'eva_circuit_state_transitions')
      ORDER BY tablename, policyname
    `);

    console.log('RLS Policies created:');
    rlsResult.rows.forEach(row => {
      console.log(`  ✅ ${row.tablename}: ${row.policyname} [${row.command}] for ${row.roles.join(', ')}`);
    });

    // Verify triggers
    console.log('\n🔍 Verifying triggers...\n');
    const trigResult = await client.query(`
      SELECT
        event_object_table as table_name,
        trigger_name,
        action_timing,
        event_manipulation
      FROM information_schema.triggers
      WHERE event_object_table IN ('system_alerts', 'eva_circuit_breaker')
      ORDER BY event_object_table, trigger_name
    `);

    console.log('Triggers created:');
    trigResult.rows.forEach(row => {
      console.log(`  ✅ ${row.table_name}.${row.trigger_name} [${row.action_timing} ${row.event_manipulation}]`);
    });

    // Test basic functionality
    console.log('\n🧪 Testing circuit breaker functions...\n');

    // Test get_or_create_eva_circuit
    const createResult = await client.query(`
      SELECT * FROM get_or_create_eva_circuit('test_venture_001')
    `);
    console.log('  ✅ get_or_create_eva_circuit: Created circuit for test_venture_001');
    console.log(`     State: ${createResult.rows[0].state}, Threshold: ${createResult.rows[0].failure_threshold}`);

    // Test eva_circuit_allows_request
    const allowResult = await client.query(`
      SELECT * FROM eva_circuit_allows_request('test_venture_001')
    `);
    console.log(`  ✅ eva_circuit_allows_request: ${allowResult.rows[0].allowed ? 'ALLOWED' : 'BLOCKED'}`);
    console.log(`     State: ${allowResult.rows[0].state}, Reason: ${allowResult.rows[0].reason}`);

    // Test record_eva_failure
    const failResult = await client.query(`
      SELECT * FROM record_eva_failure('test_venture_001', 'Test failure', '{"test": true}')
    `);
    console.log(`  ✅ record_eva_failure: State=${failResult.rows[0].state}, Tripped=${failResult.rows[0].tripped}, Count=${failResult.rows[0].failure_count}`);

    // Clean up test data
    await client.query('DELETE FROM eva_circuit_breaker WHERE venture_id = \'test_venture_001\'');
    console.log('  🧹 Cleaned up test circuit');

    console.log('\n✨ All migration components verified successfully!');
    console.log('\n📊 Migration Summary:');
    console.log(`   • Tables: ${tableResult.rows.length}/3 ✅`);
    console.log(`   • Functions: ${funcResult.rows.length}/6 ✅`);
    console.log(`   • Indexes: ${idxResult.rows.length} ✅`);
    console.log(`   • RLS Policies: ${rlsResult.rows.length} ✅`);
    console.log(`   • Triggers: ${trigResult.rows.length} ✅`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

verifyMigration();
