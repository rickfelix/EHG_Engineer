/**
 * Check priority constraint for user_stories table
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function checkConstraint() {
  const client = new Client({
    connectionString: process.env.SUPABASE_POOLER_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected\n');

    // Get constraint definition
    const query = `
      SELECT
        conname AS constraint_name,
        pg_get_constraintdef(oid) AS constraint_definition
      FROM pg_constraint
      WHERE conname LIKE '%priority%'
        AND conrelid = 'user_stories'::regclass;
    `;

    const result = await client.query(query);

    console.log('📋 Priority Constraints:\n');
    result.rows.forEach(row => {
      console.log(`${row.constraint_name}:`);
      console.log(`  ${row.constraint_definition}\n`);
    });

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await client.end();
  }
}

checkConstraint();
