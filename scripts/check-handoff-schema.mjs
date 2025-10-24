#!/usr/bin/env node
import { createDatabaseClient } from './lib/supabase-connection.js';

async function checkSchema() {
  const client = await createDatabaseClient('engineer', { verbose: false });

  try {
    const result = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'sd_phase_handoffs'
      ORDER BY ordinal_position;
    `);

    console.log('\n📊 sd_phase_handoffs table schema:\n');
    console.table(result.rows);

  } finally {
    await client.end();
  }
}

checkSchema().catch(console.error);
