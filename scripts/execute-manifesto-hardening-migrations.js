#!/usr/bin/env node

/**
 * Execute Manifesto Hardening Migrations
 * SD-2025-12-26-MANIFESTO-HARDENING
 *
 * Applies Law 1 and Law 3 database enforcement migrations.
 */

import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database connection - Supabase pooler
const CONNECTION_STRING = 'postgresql://postgres.dedlbzhpgkmetvhbkyzq:Fl!M32DaM00n!1@aws-1-us-east-1.pooler.supabase.com:6543/postgres';

const MIGRATIONS = [
  {
    name: 'Law 1: Doctrine of Constraint Enforcement',
    file: '20251226_law1_doctrine_of_constraint_enforcement.sql',
    law: 1
  },
  {
    name: 'Law 3: Circuit Breaker 85% Threshold',
    file: '20251226_law3_circuit_breaker_85_threshold.sql',
    law: 3
  },
  {
    name: 'SD Tracking Artifact',
    file: '20251226_sd_manifesto_hardening_tracking.sql',
    law: null
  }
];

async function executeMigration(client, migration) {
  const migrationPath = path.join(__dirname, '../database/migrations', migration.file);

  console.log(`\n${'='.repeat(70)}`);
  console.log(`MIGRATION: ${migration.name}`);
  console.log(`${'='.repeat(70)}`);
  console.log(`File: ${migration.file}`);

  if (!fs.existsSync(migrationPath)) {
    console.error(`❌ Migration file not found: ${migrationPath}`);
    return { success: false, error: 'File not found' };
  }

  const sqlContent = fs.readFileSync(migrationPath, 'utf8');
  console.log(`Size: ${(sqlContent.length / 1024).toFixed(1)} KB`);

  try {
    console.log(`\nExecuting...`);
    const startTime = Date.now();

    await client.query(sqlContent);

    const duration = Date.now() - startTime;
    console.log(`✅ SUCCESS (${duration}ms)`);

    return { success: true, duration };
  } catch (err) {
    console.error(`❌ FAILED: ${err.message}`);
    return { success: false, error: err.message };
  }
}

async function verifyEnforcement(client) {
  console.log(`\n${'='.repeat(70)}`);
  console.log('VERIFICATION: Testing Enforcement Triggers');
  console.log(`${'='.repeat(70)}`);

  const tests = [];

  // Test 1: Verify doctrine_constraint_violations table exists
  try {
    const result = await client.query(`
      SELECT COUNT(*) as count FROM doctrine_constraint_violations
    `);
    console.log(`✅ doctrine_constraint_violations table exists (${result.rows[0].count} records)`);
    tests.push({ name: 'Law 1 audit table', passed: true });
  } catch (err) {
    console.log(`❌ doctrine_constraint_violations table check failed: ${err.message}`);
    tests.push({ name: 'Law 1 audit table', passed: false, error: err.message });
  }

  // Test 2: Verify circuit_breaker_blocks table exists
  try {
    const result = await client.query(`
      SELECT COUNT(*) as count FROM circuit_breaker_blocks
    `);
    console.log(`✅ circuit_breaker_blocks table exists (${result.rows[0].count} records)`);
    tests.push({ name: 'Law 3 audit table', passed: true });
  } catch (err) {
    console.log(`❌ circuit_breaker_blocks table check failed: ${err.message}`);
    tests.push({ name: 'Law 3 audit table', passed: false, error: err.message });
  }

  // Test 3: Verify SD was created
  try {
    const result = await client.query(`
      SELECT id, title, status, progress
      FROM strategic_directives_v2
      WHERE id = 'SD-2025-12-26-MANIFESTO-HARDENING'
    `);
    if (result.rows.length > 0) {
      console.log(`✅ SD-2025-12-26-MANIFESTO-HARDENING exists (status: ${result.rows[0].status}, progress: ${result.rows[0].progress}%)`);
      tests.push({ name: 'Tracking SD', passed: true });
    } else {
      console.log(`❌ SD-2025-12-26-MANIFESTO-HARDENING not found`);
      tests.push({ name: 'Tracking SD', passed: false });
    }
  } catch (err) {
    console.log(`❌ SD check failed: ${err.message}`);
    tests.push({ name: 'Tracking SD', passed: false, error: err.message });
  }

  // Test 4: Verify triggers exist
  try {
    const result = await client.query(`
      SELECT trigger_name, event_object_table
      FROM information_schema.triggers
      WHERE trigger_name LIKE 'trg_doctrine_%'
         OR trigger_name = 'enforce_handoff_creation'
      ORDER BY trigger_name
    `);
    console.log(`\nTriggers installed (${result.rows.length}):`);
    result.rows.forEach(row => {
      console.log(`  - ${row.trigger_name} on ${row.event_object_table}`);
    });
    tests.push({ name: 'Enforcement triggers', passed: result.rows.length >= 5 });
  } catch (err) {
    console.log(`❌ Trigger check failed: ${err.message}`);
    tests.push({ name: 'Enforcement triggers', passed: false, error: err.message });
  }

  // Test 5: Test EXEC constraint (should fail)
  console.log(`\n--- Testing Law 1 Enforcement ---`);
  try {
    await client.query(`
      INSERT INTO strategic_directives_v2 (id, title, description, scope, created_by)
      VALUES ('TEST-EXEC-VIOLATION-001', 'Test EXEC Violation', 'Should fail', 'Test', 'EXEC')
    `);
    // If we get here, the constraint didn't work
    console.log(`❌ EXEC constraint NOT enforced - INSERT succeeded (should have failed)`);
    // Clean up
    await client.query(`DELETE FROM strategic_directives_v2 WHERE id = 'TEST-EXEC-VIOLATION-001'`);
    tests.push({ name: 'Law 1 EXEC block', passed: false, error: 'INSERT succeeded' });
  } catch (err) {
    if (err.message.includes('DOCTRINE_OF_CONSTRAINT_VIOLATION')) {
      console.log(`✅ Law 1 ENFORCED: EXEC INSERT correctly rejected`);
      console.log(`   Error: ${err.message.split('\n')[0]}`);
      tests.push({ name: 'Law 1 EXEC block', passed: true });
    } else {
      console.log(`⚠️ Different error: ${err.message}`);
      tests.push({ name: 'Law 1 EXEC block', passed: false, error: err.message });
    }
  }

  // Test 6: Test Circuit Breaker (should fail with low score)
  console.log(`\n--- Testing Law 3 Enforcement ---`);
  try {
    await client.query(`
      INSERT INTO sd_phase_handoffs (
        sd_id, handoff_type, from_phase, to_phase,
        validation_score, status, created_by
      ) VALUES (
        'SD-TEST-CIRCUIT-BREAKER', 'PLAN-TO-EXEC', 'PLAN', 'EXEC',
        70, 'pending_acceptance', 'UNIFIED-HANDOFF-SYSTEM'
      )
    `);
    // If we get here, the circuit breaker didn't work
    console.log(`❌ Circuit Breaker NOT enforced - low score handoff succeeded (should have failed)`);
    // Clean up
    await client.query(`DELETE FROM sd_phase_handoffs WHERE sd_id = 'SD-TEST-CIRCUIT-BREAKER'`);
    tests.push({ name: 'Law 3 Circuit Breaker', passed: false, error: 'INSERT succeeded' });
  } catch (err) {
    if (err.message.includes('CIRCUIT BREAKER TRIPPED') || err.message.includes('85%')) {
      console.log(`✅ Law 3 ENFORCED: Low-score handoff correctly rejected`);
      console.log(`   Error: ${err.message.split('\n')[0]}`);
      tests.push({ name: 'Law 3 Circuit Breaker', passed: true });
    } else {
      console.log(`⚠️ Different error: ${err.message}`);
      tests.push({ name: 'Law 3 Circuit Breaker', passed: false, error: err.message });
    }
  }

  return tests;
}

async function main() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║       EHG v9.0.0 MANIFESTO HARDENING - MIGRATION EXECUTOR            ║');
  console.log('║                  SD-2025-12-26-MANIFESTO-HARDENING                   ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');
  console.log('\nEnforcing Immutable Laws at the DATABASE layer...\n');

  const client = new Client({
    connectionString: CONNECTION_STRING,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Connecting to Supabase...');
    await client.connect();
    console.log('✅ Connected to database\n');

    const results = [];

    // Execute each migration
    for (const migration of MIGRATIONS) {
      const result = await executeMigration(client, migration);
      results.push({ ...migration, ...result });
    }

    // Run verification tests
    const tests = await verifyEnforcement(client);

    // Summary
    console.log(`\n${'='.repeat(70)}`);
    console.log('EXECUTION SUMMARY');
    console.log(`${'='.repeat(70)}\n`);

    console.log('Migrations:');
    results.forEach(r => {
      const status = r.success ? '✅' : '❌';
      const info = r.success ? `${r.duration}ms` : r.error;
      console.log(`  ${status} ${r.name}: ${info}`);
    });

    console.log('\nVerification Tests:');
    tests.forEach(t => {
      const status = t.passed ? '✅' : '❌';
      console.log(`  ${status} ${t.name}`);
    });

    const allMigrationsPassed = results.every(r => r.success);
    const allTestsPassed = tests.every(t => t.passed);

    console.log(`\n${'='.repeat(70)}`);
    if (allMigrationsPassed && allTestsPassed) {
      console.log('✅ ALL MIGRATIONS AND TESTS PASSED');
      console.log('\n"Logic in the database, not just the chat window."');
      console.log('The Immutable Laws are now enforced at the SCHEMA layer.');
    } else {
      console.log('⚠️  SOME ISSUES DETECTED - Review output above');
    }
    console.log(`${'='.repeat(70)}\n`);

  } catch (err) {
    console.error('❌ Fatal error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
