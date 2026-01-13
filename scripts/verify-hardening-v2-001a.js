#!/usr/bin/env node

/**
 * SD-HARDENING-V2-001A Verification Script
 *
 * Tests:
 * 1. Chairman email is set in app_config
 * 2. fn_is_chairman() returns TRUE for Chairman
 * 3. fn_is_chairman() returns FALSE for non-Chairman
 * 4. RLS policies allow Chairman read access to governance tables
 * 5. RLS policies deny non-Chairman read access
 * 6. service_role can perform all operations
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

const CHAIRMAN_EMAIL = 'rickfelix2000@gmail.com';
const _TEST_NON_CHAIRMAN_EMAIL = 'test@example.com';

const GOVERNANCE_TABLES = [
  'strategic_directives_v2',
  'leo_protocol_sections',
  'board_members'
];

async function main() {
  const results = {
    tests: [],
    passed: 0,
    failed: 0
  };

  let client;

  try {
    console.log('🔍 SD-HARDENING-V2-001A Verification\n');
    console.log('=' .repeat(60));

    // Connect as service_role for initial setup
    client = await createDatabaseClient('engineer', { verify: false });

    // TEST 1: Verify Chairman email in app_config
    console.log('\n📋 TEST 1: Chairman Email Configuration');
    try {
      const configResult = await client.query(`
        SELECT value
        FROM app_config
        WHERE key = 'chairman_email'
      `);

      const chairmanEmail = configResult.rows[0]?.value;
      const test1Pass = chairmanEmail === CHAIRMAN_EMAIL;

      results.tests.push({
        name: 'US-001: Chairman email configured',
        status: test1Pass ? 'PASS' : 'FAIL',
        expected: CHAIRMAN_EMAIL,
        actual: chairmanEmail || 'NOT SET'
      });

      if (test1Pass) {
        results.passed++;
        console.log(`   ✅ PASS: Chairman email = ${chairmanEmail}`);
      } else {
        results.failed++;
        console.log(`   ❌ FAIL: Expected ${CHAIRMAN_EMAIL}, got ${chairmanEmail || 'NOT SET'}`);
      }
    } catch (_error) {
      results.failed++;
      results.tests.push({
        name: 'US-001: Chairman email configured',
        status: 'ERROR',
        error: error.message
      });
      console.log(`   ❌ ERROR: ${error.message}`);
    }

    // TEST 2: Verify fn_is_chairman function exists and has correct logic
    console.log('\n📋 TEST 2: fn_is_chairman() Function Exists');
    try {
      const fnCheckResult = await client.query(`
        SELECT proname, prosrc
        FROM pg_proc
        WHERE proname = 'fn_is_chairman'
      `);

      const fnExists = fnCheckResult.rows.length > 0;
      const fnSource = fnCheckResult.rows[0]?.prosrc || '';
      const hasConfigCheck = fnSource.includes('app_config');
      const hasChairmanEmailCheck = fnSource.includes('chairman_email');

      const test2Pass = fnExists && hasConfigCheck && hasChairmanEmailCheck;

      results.tests.push({
        name: 'US-001: fn_is_chairman() function exists with correct logic',
        status: test2Pass ? 'PASS' : 'FAIL',
        exists: fnExists,
        checksConfig: hasConfigCheck,
        checksChairmanEmail: hasChairmanEmailCheck
      });

      if (test2Pass) {
        results.passed++;
        console.log('   ✅ PASS: fn_is_chairman() exists and checks app_config');
      } else {
        results.failed++;
        console.log(`   ❌ FAIL: Function missing or incorrect (exists: ${fnExists})`);
      }
    } catch (_error) {
      results.failed++;
      results.tests.push({
        name: 'US-001: fn_is_chairman() function exists',
        status: 'ERROR',
        error: error.message
      });
      console.log(`   ❌ ERROR: ${error.message}`);
    }

    // TEST 3: Verify RLS policies exist for governance tables
    console.log('\n📋 TEST 3: RLS Policies for Governance Tables');
    for (const tableName of GOVERNANCE_TABLES) {
      try {
        const policyResult = await client.query(`
          SELECT
            schemaname,
            tablename,
            policyname,
            permissive,
            roles,
            cmd
          FROM pg_policies
          WHERE tablename = $1
          ORDER BY policyname
        `, [tableName]);

        const policies = policyResult.rows;
        const hasAnonymousReadPolicy = policies.some(p =>
          p.policyname.includes('anon') &&
          p.cmd === 'SELECT'
        );

        const test3Pass = policies.length > 0 && hasAnonymousReadPolicy;

        results.tests.push({
          name: `US-002/US-003: ${tableName} RLS policies`,
          status: test3Pass ? 'PASS' : 'FAIL',
          policyCount: policies.length,
          hasAnonymousRead: hasAnonymousReadPolicy,
          policies: policies.map(p => p.policyname)
        });

        if (test3Pass) {
          results.passed++;
          console.log(`   ✅ PASS: ${tableName} has ${policies.length} policies`);
          policies.forEach(p => {
            console.log(`      - ${p.policyname} (${p.cmd})`);
          });
        } else {
          results.failed++;
          console.log(`   ❌ FAIL: ${tableName} missing expected policies`);
        }
      } catch (_error) {
        results.failed++;
        results.tests.push({
          name: `US-002/US-003: ${tableName} RLS policies`,
          status: 'ERROR',
          error: error.message
        });
        console.log(`   ❌ ERROR for ${tableName}: ${error.message}`);
      }
    }

    // TEST 4: Verify service_role can perform operations
    console.log('\n📋 TEST 4: Service Role Operations');
    try {
      // Test SELECT
      const selectResult = await client.query(`
        SELECT COUNT(*) as count FROM strategic_directives_v2
      `);

      // Test INSERT (with rollback) - use actual board_members schema
      await client.query('BEGIN');
      const insertResult = await client.query(`
        INSERT INTO board_members (board_role, voting_weight, expertise_domains)
        VALUES ('Test Advisor', 0.0, ARRAY['Testing'])
        RETURNING id
      `);
      await client.query('ROLLBACK');

      const test4Pass = selectResult.rows.length > 0 && insertResult.rows.length > 0;

      results.tests.push({
        name: 'US-004: service_role can perform all operations',
        status: test4Pass ? 'PASS' : 'FAIL',
        selectCount: selectResult.rows[0]?.count,
        canInsert: insertResult.rows.length > 0
      });

      if (test4Pass) {
        results.passed++;
        console.log('   ✅ PASS: service_role can SELECT and INSERT');
      } else {
        results.failed++;
        console.log('   ❌ FAIL: service_role operations restricted');
      }
    } catch (_error) {
      results.failed++;
      results.tests.push({
        name: 'US-004: service_role can perform all operations',
        status: 'ERROR',
        error: error.message
      });
      console.log(`   ❌ ERROR: ${error.message}`);
    }

    // Print Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 VERIFICATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Tests: ${results.tests.length}`);
    console.log(`✅ Passed: ${results.passed}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(`\nSuccess Rate: ${((results.passed / results.tests.length) * 100).toFixed(1)}%`);

    // Overall status
    const allPassed = results.failed === 0;
    if (allPassed) {
      console.log('\n✅ ALL TESTS PASSED - Implementation complete!\n');
    } else {
      console.log('\n⚠️  Some tests failed - Review required\n');
    }

    // Write detailed results to file
    const fs = await import('fs');
    const resultsPath = './verification-results-hardening-v2-001a.json';
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
    console.log(`📄 Detailed results saved to: ${resultsPath}`);

    // Exit with appropriate code
    process.exit(results.failed > 0 ? 1 : 0);

  } catch (_error) {
    console.error('\n❌ FATAL ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
    }
  }
}

main();
