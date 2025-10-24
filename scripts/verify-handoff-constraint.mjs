#!/usr/bin/env node
/**
 * Verify the actual CHECK constraint definition for sd_phase_handoffs.handoff_type
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

async function verifyConstraint() {
  console.log('\n🔍 Verifying sd_phase_handoffs.handoff_type CHECK constraint...\n');

  let client;
  try {
    client = await createDatabaseClient('engineer', { verify: true, verbose: true });

    // Query the actual constraint definition
    const { rows } = await client.query(`
      SELECT
        con.conname AS constraint_name,
        pg_get_constraintdef(con.oid) AS definition
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      WHERE rel.relname = 'sd_phase_handoffs'
        AND con.conname = 'sd_phase_handoffs_handoff_type_check';
    `);

    if (rows.length === 0) {
      console.log('❌ No CHECK constraint found on handoff_type column');
    } else {
      console.log('✅ CHECK constraint found:');
      console.log(`   Name: ${rows[0].constraint_name}`);
      console.log(`   Definition: ${rows[0].definition}`);

      // Parse definition to extract allowed values
      const def = rows[0].definition;
      const match = def.match(/IN \(([^)]+)\)/);
      if (match) {
        const values = match[1].split(',').map(v => v.trim().replace(/'/g, ''));
        console.log('\n   Allowed values:');
        values.forEach(v => console.log(`   - ${v}`));
      }
    }

    // Also query existing handoff_type values in the table
    console.log('\n📊 Current handoff_type values in table:');
    const { rows: typeRows } = await client.query(`
      SELECT handoff_type, COUNT(*) as count
      FROM sd_phase_handoffs
      GROUP BY handoff_type
      ORDER BY handoff_type;
    `);

    if (typeRows.length === 0) {
      console.log('   (No records found)');
    } else {
      typeRows.forEach(r => {
        console.log(`   ${r.handoff_type}: ${r.count} records`);
      });
    }

    // Test if uppercase would be accepted
    console.log('\n🧪 Testing if "EXEC-TO-PLAN" would be accepted...');
    await client.query('BEGIN');
    try {
      await client.query(`
        INSERT INTO sd_phase_handoffs (sd_id, handoff_type, status, from_phase, to_phase, created_by)
        VALUES ('TEST-CONSTRAINT', 'EXEC-TO-PLAN', 'pending', 'EXEC', 'PLAN', 'test')
        RETURNING id;
      `);
      console.log('   ✅ "EXEC-TO-PLAN" is ACCEPTED');
      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      console.log(`   ❌ "EXEC-TO-PLAN" is REJECTED`);
      console.log(`   Error: ${error.message}`);
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    throw error;
  } finally {
    if (client) {
      await client.end();
      console.log('\n🔌 Database connection closed');
    }
  }
}

verifyConstraint().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
