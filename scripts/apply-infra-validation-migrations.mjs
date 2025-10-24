#!/usr/bin/env node
/**
 * Apply SD-INFRA-VALIDATION Migrations
 *
 * Applies three migrations to enable infrastructure SD validation:
 * 1. add_sd_type_column.sql - Add sd_type column
 * 2. update_sd_cicd_type.sql - Mark SD-CICD-WORKFLOW-FIX as infrastructure
 * 3. update_calculate_sd_progress_with_type.sql - Type-aware validation function
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const migrations = [
  'add_sd_type_column.sql',
  'update_sd_cicd_type.sql',
  'update_calculate_sd_progress_with_type.sql'
];

console.log('🔧 APPLYING SD-INFRA-VALIDATION MIGRATIONS');
console.log('═══════════════════════════════════════════════════════════\n');

for (const migration of migrations) {
  console.log(`📋 Migration: ${migration}`);
  console.log('───────────────────────────────────────────────────────────');

  const migrationPath = join(__dirname, '../database/migrations', migration);
  const sql = readFileSync(migrationPath, 'utf8');

  console.log(`   File size: ${(sql.length / 1024).toFixed(1)} KB`);
  console.log(`   Executing via psql...\n`);

  try {
    // Use Supabase CLI to execute migration
    // Note: Requires SUPABASE_DB_PASSWORD environment variable
    const result = execSync(
      `cat "${migrationPath}" | supabase db execute`,
      {
        encoding: 'utf8',
        stdio: 'pipe',
        env: {
          ...process.env,
          PGPASSWORD: process.env.SUPABASE_DB_PASSWORD || process.env.EHG_ENGINEER_DB_PASSWORD
        }
      }
    );

    console.log('   ✅ Migration applied successfully');
    if (result) {
      console.log('   Output:', result.trim());
    }
  } catch (error) {
    console.error('   ❌ Migration failed:', error.message);
    if (error.stdout) console.log('   stdout:', error.stdout.toString());
    if (error.stderr) console.log('   stderr:', error.stderr.toString());
    console.log('   ⚠️  Continuing with next migration...');
  }

  console.log('');
}

console.log('═══════════════════════════════════════════════════════════');
console.log('✅ Migration application complete');
console.log('');
console.log('🔍 VERIFICATION:');
console.log('   Run: node scripts/verify-infra-validation-migrations.mjs');
console.log('');
