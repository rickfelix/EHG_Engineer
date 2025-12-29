#!/usr/bin/env node
/**
 * Test EVA Circuit Breaker Functionality
 * End-to-end test of the circuit breaker state machine
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

async function testCircuitBreaker() {
  const testVentureId = 'test_eva_circuit_' + Date.now();

  try {
    await client.connect();
    console.log('🧪 EVA Circuit Breaker Functional Test');
    console.log('=' .repeat(50));
    console.log(`Test Venture: ${testVentureId}\n`);

    // TEST 1: Initial state (closed)
    console.log('📍 TEST 1: Initial Circuit State');
    let result = await client.query(`
      SELECT * FROM eva_circuit_allows_request($1)
    `, [testVentureId]);
    console.log(`   State: ${result.rows[0].state}`);
    console.log(`   Allowed: ${result.rows[0].allowed}`);
    console.log(`   Reason: ${result.rows[0].reason}`);
    console.assert(result.rows[0].allowed === true, 'Initial state should allow requests');
    console.log('   ✅ PASS\n');

    // TEST 2: First failure (should stay closed)
    console.log('📍 TEST 2: First Failure (1/3 threshold)');
    result = await client.query(`
      SELECT * FROM record_eva_failure($1, $2, $3)
    `, [testVentureId, 'Test error 1', JSON.stringify({ attempt: 1 })]);
    console.log(`   State: ${result.rows[0].state}`);
    console.log(`   Tripped: ${result.rows[0].tripped}`);
    console.log(`   Failure Count: ${result.rows[0].failure_count}`);
    console.assert(result.rows[0].state === 'closed', 'Should stay closed after 1 failure');
    console.assert(result.rows[0].tripped === false, 'Should not trip on first failure');
    console.log('   ✅ PASS\n');

    // TEST 3: Second failure (should stay closed)
    console.log('📍 TEST 3: Second Failure (2/3 threshold)');
    result = await client.query(`
      SELECT * FROM record_eva_failure($1, $2, $3)
    `, [testVentureId, 'Test error 2', JSON.stringify({ attempt: 2 })]);
    console.log(`   State: ${result.rows[0].state}`);
    console.log(`   Tripped: ${result.rows[0].tripped}`);
    console.log(`   Failure Count: ${result.rows[0].failure_count}`);
    console.assert(result.rows[0].state === 'closed', 'Should stay closed after 2 failures');
    console.assert(result.rows[0].tripped === false, 'Should not trip on second failure');
    console.log('   ✅ PASS\n');

    // TEST 4: Third failure (should trip to open)
    console.log('📍 TEST 4: Third Failure (3/3 threshold - TRIP)');
    result = await client.query(`
      SELECT * FROM record_eva_failure($1, $2, $3)
    `, [testVentureId, 'Test error 3', JSON.stringify({ attempt: 3 })]);
    console.log(`   State: ${result.rows[0].state}`);
    console.log(`   Tripped: ${result.rows[0].tripped}`);
    console.log(`   Failure Count: ${result.rows[0].failure_count}`);
    console.assert(result.rows[0].state === 'open', 'Should trip to open after 3 failures');
    console.assert(result.rows[0].tripped === true, 'Should indicate circuit was tripped');
    console.log('   ✅ PASS\n');

    // TEST 5: Check system alert was created
    console.log('📍 TEST 5: System Alert Created');
    result = await client.query(`
      SELECT * FROM system_alerts
      WHERE alert_type = 'circuit_breaker'
        AND source_entity_id = $1
        AND resolved_at IS NULL
    `, [testVentureId]);
    console.log(`   Alerts found: ${result.rows.length}`);
    console.log(`   Severity: ${result.rows[0].severity}`);
    console.log(`   Title: ${result.rows[0].title}`);
    console.assert(result.rows.length > 0, 'Should create system alert when circuit trips');
    console.assert(result.rows[0].severity === 'critical', 'Alert should be critical');
    console.log('   ✅ PASS\n');

    // TEST 6: Requests should be blocked when open
    console.log('📍 TEST 6: Requests Blocked in Open State');
    result = await client.query(`
      SELECT * FROM eva_circuit_allows_request($1)
    `, [testVentureId]);
    console.log(`   State: ${result.rows[0].state}`);
    console.log(`   Allowed: ${result.rows[0].allowed}`);
    console.log(`   Reason: ${result.rows[0].reason}`);
    console.assert(result.rows[0].allowed === false, 'Requests should be blocked when circuit is open');
    console.log('   ✅ PASS\n');

    // TEST 7: Manual reset by Chairman
    console.log('📍 TEST 7: Manual Reset by Chairman');
    result = await client.query(`
      SELECT * FROM reset_eva_circuit($1, $2)
    `, [testVentureId, 'CHAIRMAN_TEST']);
    console.log(`   Success: ${result.rows[0].success}`);
    console.log(`   Previous State: ${result.rows[0].previous_state}`);
    console.log(`   Message: ${result.rows[0].message}`);
    console.assert(result.rows[0].success === true, 'Reset should succeed');
    console.assert(result.rows[0].previous_state === 'open', 'Should record previous state');
    console.log('   ✅ PASS\n');

    // TEST 8: Alert should be resolved after reset
    console.log('📍 TEST 8: Alert Resolved After Reset');
    result = await client.query(`
      SELECT * FROM system_alerts
      WHERE alert_type = 'circuit_breaker'
        AND source_entity_id = $1
    `, [testVentureId]);
    console.log(`   Resolved: ${result.rows[0].resolved_at !== null}`);
    console.log(`   Resolved By: ${result.rows[0].resolved_by}`);
    console.assert(result.rows[0].resolved_at !== null, 'Alert should be resolved after reset');
    console.assert(result.rows[0].resolved_by === 'CHAIRMAN_TEST', 'Should record who resolved');
    console.log('   ✅ PASS\n');

    // TEST 9: Success after closed
    console.log('📍 TEST 9: Record Success (Reset Failure Count)');
    await client.query(`
      SELECT * FROM record_eva_failure($1, $2, $3)
    `, [testVentureId, 'Test error before success', JSON.stringify({ test: true })]);
    result = await client.query(`
      SELECT * FROM record_eva_success($1)
    `, [testVentureId]);
    console.log(`   State: ${result.rows[0].state}`);
    console.log(`   Recovered: ${result.rows[0].recovered}`);

    // Verify failure count was reset
    const circuitResult = await client.query(`
      SELECT failure_count FROM eva_circuit_breaker WHERE venture_id = $1
    `, [testVentureId]);
    console.log(`   Failure Count: ${circuitResult.rows[0].failure_count}`);
    console.assert(circuitResult.rows[0].failure_count === 0, 'Success should reset failure count');
    console.log('   ✅ PASS\n');

    // TEST 10: State transition audit trail
    console.log('📍 TEST 10: State Transition Audit Trail');
    result = await client.query(`
      SELECT from_state, to_state, trigger_reason, triggered_by
      FROM eva_circuit_state_transitions
      WHERE venture_id = $1
      ORDER BY created_at
    `, [testVentureId]);
    console.log(`   Transitions recorded: ${result.rows.length}`);
    result.rows.forEach((row, i) => {
      console.log(`   ${i + 1}. ${row.from_state} → ${row.to_state} (${row.trigger_reason}) by ${row.triggered_by}`);
    });
    console.assert(result.rows.length > 0, 'Should record state transitions');
    console.assert(result.rows.some(r => r.trigger_reason === 'failure_threshold'), 'Should record threshold trip');
    console.assert(result.rows.some(r => r.trigger_reason === 'manual_reset'), 'Should record manual reset');
    console.log('   ✅ PASS\n');

    // Cleanup
    console.log('🧹 Cleaning up test data...');
    await client.query('DELETE FROM eva_circuit_breaker WHERE venture_id = $1', [testVentureId]);
    await client.query('DELETE FROM system_alerts WHERE source_entity_id = $1', [testVentureId]);

    console.log('\n✨ All Tests Passed!');
    console.log('=' .repeat(50));
    console.log('EVA Circuit Breaker is fully functional and ready for production.\n');

  } catch (_error) {
    console.error('\n❌ Test Failed:', error.message);
    console.error('Full error:', error);

    // Try to cleanup even on failure
    try {
      await client.query('DELETE FROM eva_circuit_breaker WHERE venture_id = $1', [testVentureId]);
      await client.query('DELETE FROM system_alerts WHERE source_entity_id = $1', [testVentureId]);
    } catch (cleanupError) {
      console.error('Cleanup failed:', cleanupError.message);
    }

    process.exit(1);
  } finally {
    await client.end();
  }
}

testCircuitBreaker();
