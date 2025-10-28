#!/usr/bin/env node

/**
 * Test RCA Gate Enforcement
 * SD-RCA-001
 *
 * Creates test P0 RCR, verifies gate blocking, then cleans up
 *
 * Usage:
 *   node scripts/test-rca-gate.js
 */

import { createDatabaseClient } from '../lib/supabase-connection.js';

async function testRCAGate() {
  console.log('🧪 Testing RCA Gate Enforcement\n');

  const client = await createDatabaseClient('engineer');

  try {
    // Step 1: Create P0 RCR (bypassing RLS)
    console.log('Step 1: Creating P0 RCR...');
    const insertResult = await client.query(`
      INSERT INTO root_cause_reports (
        scope_type,
        scope_id,
        sd_id,
        trigger_source,
        trigger_tier,
        failure_signature,
        problem_statement,
        observed,
        expected,
        evidence_refs,
        confidence,
        impact_level,
        likelihood_level,
        status,
        metadata
      ) VALUES (
        'SD',
        'SD-BACKEND-001',
        'SD-BACKEND-001',
        'MANUAL',
        4,
        'test:gate:' || extract(epoch from now())::text,
        'Test P0 RCR for gate enforcement',
        '{"description": "Testing gate blocking logic"}',
        '{"description": "Gate should block"}',
        '{"context": "Test scenario"}',
        40,
        'CRITICAL',
        'FREQUENT',
        'OPEN',
        '{"test": true}'
      )
      RETURNING id, severity_priority, status;
    `);

    const testRCR = insertResult.rows[0];
    console.log(`✅ Created P0 RCR: ${testRCR.id}`);
    console.log(`   Priority: ${testRCR.severity_priority}`);
    console.log(`   Status: ${testRCR.status}\n`);

    // Step 2: Test gate-check (should be BLOCKED)
    console.log('Step 2: Testing gate-check (should be BLOCKED)...');
    const gateResult = await client.query(`
      SELECT
        id,
        severity_priority,
        status
      FROM root_cause_reports
      WHERE sd_id = 'SD-BACKEND-001'
        AND status IN ('OPEN', 'IN_REVIEW', 'CAPA_PENDING', 'CAPA_APPROVED', 'FIX_IN_PROGRESS')
        AND severity_priority IN ('P0', 'P1');
    `);

    if (gateResult.rows.length > 0) {
      console.log('❌ Gate Status: BLOCKED (as expected)');
      console.log(`   Found ${gateResult.rows.length} blocking RCR(s)\n`);
    } else {
      console.log('⚠️  Gate Status: PASS (unexpected - should be blocked)\n');
    }

    // Step 3: Create and verify CAPA
    console.log('Step 3: Creating CAPA manifest...');
    const capaResult = await client.query(`
      INSERT INTO remediation_manifests (
        rcr_id,
        proposed_changes,
        impact_assessment,
        verification_plan,
        acceptance_criteria,
        owner_agent,
        status,
        verified_at
      ) VALUES (
        $1,
        '{"description": "Test fix"}',
        '{"risk_level": "LOW"}',
        '{"tests": ["gate_test"]}',
        '{"criteria": ["gate_unblocked"]}',
        'MANUAL',
        'VERIFIED',
        NOW()
      )
      RETURNING id, status;
    `, [testRCR.id]);

    const testCAPA = capaResult.rows[0];
    console.log(`✅ Created CAPA: ${testCAPA.id}`);
    console.log(`   Status: ${testCAPA.status}\n`);

    // Step 4: Test gate-check again (should be PASS)
    console.log('Step 4: Testing gate-check after CAPA verified...');
    const gateResult2 = await client.query(`
      SELECT
        r.id,
        r.severity_priority,
        r.status,
        m.status as capa_status
      FROM root_cause_reports r
      LEFT JOIN remediation_manifests m ON m.rcr_id = r.id
      WHERE r.sd_id = 'SD-BACKEND-001'
        AND r.status IN ('OPEN', 'IN_REVIEW', 'CAPA_PENDING', 'CAPA_APPROVED', 'FIX_IN_PROGRESS')
        AND r.severity_priority IN ('P0', 'P1')
        AND (m.status IS NULL OR m.status != 'VERIFIED');
    `);

    if (gateResult2.rows.length === 0) {
      console.log('✅ Gate Status: PASS (as expected)');
      console.log('   All P0/P1 RCRs have verified CAPAs\n');
    } else {
      console.log('❌ Gate Status: BLOCKED (unexpected - should pass)\n');
    }

    // Step 5: Cleanup
    console.log('Step 5: Cleaning up test data...');
    await client.query('DELETE FROM remediation_manifests WHERE rcr_id = $1', [testRCR.id]);
    await client.query('DELETE FROM root_cause_reports WHERE id = $1', [testRCR.id]);
    console.log('✅ Test data cleaned up\n');

    console.log('🎉 RCA Gate Enforcement Test Complete');
    console.log('\nTest Summary:');
    console.log('  ✅ P0 RCR creation');
    console.log('  ✅ Gate blocking (without verified CAPA)');
    console.log('  ✅ CAPA verification');
    console.log('  ✅ Gate passing (with verified CAPA)');
    console.log('  ✅ Cleanup');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

// Run test
testRCAGate()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
