#!/usr/bin/env node
/**
 * Apply Handoff Type Uppercase Migration
 *
 * Updates sd_phase_handoffs.handoff_type CHECK constraint to accept all-uppercase format
 * Fixes: unified-handoff-system.js now normalizes to "EXEC-TO-PLAN" but database expected "EXEC-to-PLAN"
 */

import { readFileSync } from 'fs';
import { createDatabaseClient, splitPostgreSQLStatements } from './lib/supabase-connection.js';

const MIGRATION_FILE = './database/migrations/update_handoff_type_constraint_to_uppercase.sql';

async function applyMigration() {
  console.log('\n🔧 Applying Handoff Type Uppercase Migration...\n');

  let client;
  try {
    // Read migration file
    console.log(`📄 Reading migration file: ${MIGRATION_FILE}`);
    const sql = readFileSync(MIGRATION_FILE, 'utf-8');
    const statements = splitPostgreSQLStatements(sql);
    console.log(`   ✅ Parsed ${statements.length} SQL statements\n`);

    // Connect to database (CORRECTED: 'engineer' not 'ehg')
    console.log('🔌 Connecting to EHG_Engineer database...');
    client = await createDatabaseClient('engineer', { verify: true, verbose: true });
    console.log('   ✅ Connected\n');

    // Execute migration in transaction
    console.log('🚀 Executing migration...');
    await client.query('BEGIN');

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i].trim();
      if (!stmt || stmt.startsWith('--')) continue;

      console.log(`   ${i + 1}/${statements.length}: Executing statement...`);
      await client.query(stmt);
      console.log(`   ✅ Success`);
    }

    await client.query('COMMIT');
    console.log('\n✅ Migration applied successfully!\n');

    // Verify constraint
    console.log('🔍 Verifying new constraint...');
    const { rows: constraintRows } = await client.query(`
      SELECT con.conname AS constraint_name, pg_get_constraintdef(con.oid) AS definition
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      WHERE rel.relname = 'sd_phase_handoffs'
        AND con.conname = 'sd_phase_handoffs_handoff_type_check';
    `);

    if (constraintRows.length > 0) {
      console.log('   ✅ Constraint exists');
      console.log(`   Definition: ${constraintRows[0].definition}`);
    } else {
      console.log('   ⚠️  Warning: Constraint not found');
    }

    // Verify updated records
    console.log('\n🔍 Verifying updated records...');
    const { rows: records } = await client.query(`
      SELECT handoff_type, COUNT(*) as count
      FROM sd_phase_handoffs
      GROUP BY handoff_type
      ORDER BY handoff_type;
    `);

    console.log('   Updated handoff types:');
    records.forEach(r => {
      console.log(`   - ${r.handoff_type}: ${r.count} records`);
    });

    // Test insertion with uppercase format
    console.log('\n🧪 Testing insertion with uppercase format...');
    await client.query('BEGIN');
    try {
      await client.query(`
        INSERT INTO sd_phase_handoffs (sd_id, handoff_type, status, phase_from, phase_to, created_by)
        VALUES ('TEST-SD-001', 'EXEC-TO-PLAN', 'pending', 'EXEC', 'PLAN', 'system')
        RETURNING id;
      `);
      console.log('   ✅ Test insertion successful');

      // Clean up test record
      await client.query(`DELETE FROM sd_phase_handoffs WHERE sd_id = 'TEST-SD-001';`);
      await client.query('COMMIT');
      console.log('   ✅ Test record cleaned up');
    } catch (testError) {
      await client.query('ROLLBACK');
      console.log(`   ❌ Test insertion failed: ${testError.message}`);
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    if (client) {
      try {
        await client.query('ROLLBACK');
        console.log('   ✅ Transaction rolled back');
      } catch (rollbackError) {
        console.error('   ❌ Rollback failed:', rollbackError.message);
      }
    }
    throw error;
  } finally {
    if (client) {
      await client.end();
      console.log('\n🔌 Database connection closed');
    }
  }
}

applyMigration().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
