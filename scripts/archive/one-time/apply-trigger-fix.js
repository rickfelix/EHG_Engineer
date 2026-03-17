#!/usr/bin/env node
/**
 * Apply validation trigger fix migration
 */

import { createDatabaseClient } from './lib/supabase-connection.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function applyMigration() {
  console.log('🔧 Applying validation trigger fix migration...\n');

  const client = await createDatabaseClient('engineer', {
    verbose: true
  });

  try {
    // Read migration file
    const migrationPath = join(__dirname, '../database/migrations/20251016_fix_validation_trigger.sql');
    const sql = readFileSync(migrationPath, 'utf8');

    console.log('\n📝 Executing migration...\n');

    // Execute migration
    const _result = await client.query(sql);

    console.log('\n✅ Migration applied successfully!\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

// Run migration
applyMigration()
  .then(() => {
    console.log('✅ Complete!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
