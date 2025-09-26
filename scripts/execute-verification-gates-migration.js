#!/usr/bin/env node

/**
 * Execute Handoff Verification Gates Migration
 * Creates mandatory verification checkpoints for handoffs
 */

import { Pool } from 'pg';
import { readFile } from 'fs/promises';
import { join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

async function executeVerificationGatesMigration() {
  console.log('🚪 EXECUTING HANDOFF VERIFICATION GATES MIGRATION');
  console.log('='.repeat(50));

  const pool = new Pool({
    connectionString: process.env.SUPABASE_POOLER_URL,
    ssl: { rejectUnauthorized: false, require: true }
  });

  try {
    const client = await pool.connect();
    console.log('✅ Connected to database');

    // Read the migration file
    const migrationPath = join(process.cwd(), 'database/migrations/2025-09-24-handoff-verification-gates.sql');
    const migrationSQL = await readFile(migrationPath, 'utf-8');

    console.log('\n🔧 Executing verification gates migration...');
    await client.query(migrationSQL);

    console.log('✅ Migration executed successfully!');

    // Verify tables were created
    console.log('\n🔍 Verifying table creation...');

    const tables = [
      'handoff_verification_gates',
      'gate_requirements_templates'
    ];

    for (const table of tables) {
      const result = await client.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = $1 AND table_schema = 'public'
        )
      `, [table]);

      if (result.rows[0].exists) {
        console.log(`✅ Table '${table}' created successfully`);
      } else {
        console.error(`❌ Table '${table}' was not created`);
      }
    }

    // Verify functions were created
    console.log('\n🔍 Verifying functions...');
    const functions = [
      'generate_handoff_verification_gates',
      'check_handoff_gates_status'
    ];

    for (const func of functions) {
      const result = await client.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.routines
          WHERE routine_name = $1 AND routine_schema = 'public'
        )
      `, [func]);

      if (result.rows[0].exists) {
        console.log(`✅ Function '${func}' created successfully`);
      } else {
        console.error(`❌ Function '${func}' was not created`);
      }
    }

    // Verify gate templates were inserted
    console.log('\n📋 Verifying gate templates...');
    const templateCount = await client.query('SELECT COUNT(*) FROM gate_requirements_templates');
    console.log(`✅ Gate templates: ${templateCount.rows[0].count} configured`);

    // Test the gate generation function
    console.log('\n🧪 Testing gate generation...');

    // Find an active SD to test with
    const testSD = await client.query(`
      SELECT id FROM strategic_directives_v2
      WHERE status IN ('active', 'in_progress')
      LIMIT 1
    `);

    if (testSD.rows.length > 0) {
      const sdId = testSD.rows[0].id;
      console.log(`📋 Testing with SD: ${sdId}`);

      // Generate test gates
      const gateGeneration = await client.query(
        'SELECT * FROM generate_handoff_verification_gates($1, $2, $3)',
        [sdId, `PRD-${sdId}`, 'EXEC-to-PLAN']
      );

      console.log(`✅ Generated ${gateGeneration.rows.length} verification gates:`);
      gateGeneration.rows.forEach(gate => {
        console.log(`   📋 ${gate.gate_type}: ${gate.gate_name}`);
      });

      // Test gate status checking
      const gateStatus = await client.query(
        'SELECT * FROM check_handoff_gates_status($1, $2)',
        [sdId, `PRD-${sdId}`]
      );

      if (gateStatus.rows.length > 0) {
        const status = gateStatus.rows[0];
        console.log(`✅ Gate status check: ${status.overall_status} (${status.passed_gates}/${status.total_gates} passed)`);
        console.log(`   Can proceed: ${status.can_proceed ? 'YES' : 'NO'}`);
      }

    } else {
      console.log('⚠️  No active SDs found for testing');
    }

    // Check view creation
    const viewCheck = await client.query(`
      SELECT table_name FROM information_schema.views
      WHERE table_name = 'handoff_readiness_dashboard'
    `);

    if (viewCheck.rows.length > 0) {
      console.log('✅ Dashboard view created: handoff_readiness_dashboard');

      // Test the view
      const dashboardTest = await client.query('SELECT COUNT(*) FROM handoff_readiness_dashboard');
      console.log(`📊 Dashboard entries: ${dashboardTest.rows[0].count}`);
    } else {
      console.error('❌ Dashboard view was not created');
    }

    client.release();

    console.log('\n🎉 HANDOFF VERIFICATION GATES SYSTEM READY!');
    console.log('📝 New capabilities enabled:');
    console.log('   • Mandatory user story completion verification');
    console.log('   • Test coverage requirement enforcement');
    console.log('   • Implementation evidence validation');
    console.log('   • Auto-generation of verification gates');
    console.log('   • Handoff blocking on failed gates');
    console.log('   • Real-time readiness dashboard');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  executeVerificationGatesMigration()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Script failed:', error);
      process.exit(1);
    });
}

export { executeVerificationGatesMigration };