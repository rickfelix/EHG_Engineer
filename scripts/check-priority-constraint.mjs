#!/usr/bin/env node
import { createDatabaseClient } from './lib/supabase-connection.js';

async function checkConstraint() {
  const client = await createDatabaseClient('engineer', { verbose: true });

  try {
    // Check constraint definition
    const constraint = await client.query(`
      SELECT
        con.conname AS constraint_name,
        pg_get_constraintdef(con.oid) AS constraint_definition
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      WHERE rel.relname = 'strategic_directives_v2'
      AND con.conname LIKE '%priority%';
    `);

    console.log('\n📋 Priority Constraint:');
    if (constraint.rows.length > 0) {
      constraint.rows.forEach(row => {
        console.log(`   ${row.constraint_name}: ${row.constraint_definition}`);
      });
    } else {
      console.log('   No priority constraint found');
    }

    // Check column type
    const columnInfo = await client.query(`
      SELECT column_name, data_type, character_maximum_length
      FROM information_schema.columns
      WHERE table_name = 'strategic_directives_v2'
      AND column_name = 'priority';
    `);

    console.log('\n📊 Column Info:');
    if (columnInfo.rows.length > 0) {
      console.log(`   Type: ${columnInfo.rows[0].data_type}`);
      if (columnInfo.rows[0].character_maximum_length) {
        console.log(`   Max Length: ${columnInfo.rows[0].character_maximum_length}`);
      }
    }

    // Check current values in use
    const values = await client.query(`
      SELECT DISTINCT priority, COUNT(*) as count
      FROM strategic_directives_v2
      GROUP BY priority
      ORDER BY count DESC;
    `);

    console.log('\n📈 Current Priority Values in Use:');
    values.rows.forEach(row => {
      console.log(`   ${row.priority}: ${row.count} SD(s)`);
    });

  } finally {
    await client.end();
  }
}

checkConstraint().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
