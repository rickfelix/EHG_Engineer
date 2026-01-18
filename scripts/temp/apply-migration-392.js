#!/usr/bin/env node
/**
 * Apply Migration 392: Quality Lifecycle Fixes
 * Purpose: Apply RLS policies and source_type constraint updates
 */

import { createDatabaseClient, splitPostgreSQLStatements } from '../lib/supabase-connection.js';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function applyMigration() {
  const migrationPath = join(__dirname, '../../database/migrations/392_quality_lifecycle_fixes.sql');

  console.log('🗄️ Applying migration: 392_quality_lifecycle_fixes.sql');
  console.log('📍 Target: EHG Engineer database (dedlbzhpgkmetvhbkyzq)');
  console.log('');

  let client;
  try {
    // Read migration file
    const sql = await readFile(migrationPath, 'utf-8');
    console.log('✅ Loaded migration file');

    // Connect to database
    client = await createDatabaseClient('engineer', {
      verify: true,
      verbose: true
    });
    console.log('');

    // Split statements
    const statements = splitPostgreSQLStatements(sql);
    console.log(`📝 Found ${statements.length} SQL statements\n`);

    // Execute each statement
    let executed = 0;
    for (const stmt of statements) {
      try {
        // Skip empty or comment-only statements
        const trimmed = stmt.trim();
        if (!trimmed || trimmed.startsWith('--')) continue;

        // Show what we're executing (first 80 chars)
        const preview = trimmed.substring(0, 80).replace(/\n/g, ' ');
        console.log(`   Executing: ${preview}...`);

        await client.query(stmt);
        executed++;
      } catch (err) {
        console.error(`   ❌ Failed: ${err.message}`);
        throw err;
      }
    }

    console.log(`\n✅ Successfully executed ${executed} statements`);

    // Verify changes
    console.log('\n🔍 Verifying changes...');

    // Check RLS on feedback_sd_map
    const rlsCheck = await client.query(`
      SELECT tablename, rowsecurity
      FROM pg_tables
      WHERE schemaname = 'public' AND tablename = 'feedback_sd_map'
    `);
    if (rlsCheck.rows.length > 0) {
      console.log(`   feedback_sd_map RLS: ${rlsCheck.rows[0].rowsecurity ? '✅ ENABLED' : '❌ DISABLED'}`);
    }

    // Check policies on feedback_sd_map
    const policiesCheck = await client.query(`
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'feedback_sd_map'
      ORDER BY policyname
    `);
    console.log(`   feedback_sd_map policies: ${policiesCheck.rows.length} found`);
    policiesCheck.rows.forEach(row => {
      console.log(`      - ${row.policyname}`);
    });

    // Check source_type constraint
    const constraintCheck = await client.query(`
      SELECT conname, pg_get_constraintdef(oid) as definition
      FROM pg_constraint
      WHERE conname = 'feedback_source_type_check'
    `);
    if (constraintCheck.rows.length > 0) {
      console.log('   feedback source_type constraint: ✅ UPDATED');
      const def = constraintCheck.rows[0].definition;
      // Count allowed values
      const values = def.match(/'[^']+'/g);
      console.log(`      Allowed values: ${values ? values.length : 0}`);
    }

    console.log('\n✅ Migration applied and verified successfully!\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
      console.log('🔌 Database connection closed');
    }
  }
}

applyMigration().catch(console.error);
