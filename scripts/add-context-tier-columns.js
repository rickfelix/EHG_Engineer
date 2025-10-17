#!/usr/bin/env node
/**
 * Add context_tier and target_file columns to leo_protocol_sections
 * Part of CLAUDE.md performance optimization (123k → 18k chars)
 */

import dotenv from 'dotenv';
import { createDatabaseClient } from './lib/supabase-connection.js';

dotenv.config();

async function addContextTierColumns() {
  console.log('🔄 Adding context_tier and target_file columns to leo_protocol_sections...\n');

  let client;
  try {
    // Connect to database
    client = await createDatabaseClient('engineer', { verify: true, verbose: true });

    // Check if columns already exist
    const checkColumnsQuery = `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'leo_protocol_sections'
      AND column_name IN ('context_tier', 'target_file');
    `;

    const { rows: existingColumns } = await client.query(checkColumnsQuery);

    if (existingColumns.length === 2) {
      console.log('✅ Columns already exist. Skipping creation.');
      return;
    }

    // Add context_tier column
    console.log('Adding context_tier column...');
    await client.query(`
      ALTER TABLE leo_protocol_sections
      ADD COLUMN IF NOT EXISTS context_tier TEXT
      CHECK (context_tier IN ('ROUTER', 'CORE', 'PHASE_LEAD', 'PHASE_PLAN', 'PHASE_EXEC', 'REFERENCE'));
    `);

    // Add target_file column
    console.log('Adding target_file column...');
    await client.query(`
      ALTER TABLE leo_protocol_sections
      ADD COLUMN IF NOT EXISTS target_file TEXT;
    `);

    // Verify columns were added
    const { rows: verifyColumns } = await client.query(checkColumnsQuery);

    if (verifyColumns.length === 2) {
      console.log('\n✅ Columns added successfully!');
      console.log('   - context_tier: TEXT with CHECK constraint');
      console.log('   - target_file: TEXT');

      // Show current sections count
      const { rows: countRows } = await client.query(
        'SELECT COUNT(*) as count FROM leo_protocol_sections'
      );
      console.log(`\n📊 Total sections in database: ${countRows[0].count}`);
      console.log('   Ready for classification step.');
    } else {
      throw new Error('Column verification failed');
    }

  } catch (error) {
    console.error('❌ Error adding columns:', error.message);
    throw error;
  } finally {
    if (client) {
      await client.end();
    }
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  addContextTierColumns()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export { addContextTierColumns };
