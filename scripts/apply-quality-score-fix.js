#!/usr/bin/env node
/**
 * Apply quality_score constraint fix migration
 * Temporary script to fix constraint issue
 */

import { createDatabaseClient } from './lib/supabase-connection.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function applyMigration() {
  console.log('🔧 Applying quality_score constraint fix migration...\n');

  const client = await createDatabaseClient('engineer', {
    verbose: true
  });

  try {
    // Read migration file
    const migrationPath = join(__dirname, '../database/migrations/20251015_fix_quality_score_constraint.sql');
    const sql = readFileSync(migrationPath, 'utf8');

    console.log('\n📝 Executing migration...\n');

    // Execute migration
    const result = await client.query(sql);

    console.log('\n✅ Migration applied successfully!\n');

    // Get and display notices
    if (result.notices) {
      console.log('📋 Migration output:');
      result.notices.forEach(notice => {
        console.log('  ', notice.message);
      });
    }

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
