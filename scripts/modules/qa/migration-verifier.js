#!/usr/bin/env node
/**
 * Migration Verifier Module
 * Enhanced QA Engineering Director v2.0
 *
 * Verifies database migrations are applied before testing.
 * Impact: Prevents 1-2 hours of debugging wrong database state.
 */

import { createClient } from '@supabase/supabase-js';
import { readdir, readFile } from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

// Load EHG_Engineer .env first
dotenv.config();

// Also load EHG app .env to have both sets of credentials available
// Using override: false ensures EHG_Engineer vars take precedence
dotenv.config({ path: '/mnt/c/_EHG/ehg/.env', override: false });

/**
 * Verify database migrations for SD
 * @param {string} sd_id - Strategic Directive ID
 * @param {string} targetApp - 'ehg' or 'EHG_Engineer'
 * @returns {Promise<Object>} Verification result
 */
export async function verifyDatabaseMigrations(sd_id, targetApp = 'ehg') {
  console.log(`🔍 Migration Verifier: Checking migrations for ${sd_id}...`);

  // Step 1: Find migration files for this SD
  const migrationFiles = await findSDMigrationFiles(sd_id, targetApp);

  if (migrationFiles.length === 0) {
    return {
      verdict: 'NO_MIGRATIONS',
      message: `No database migrations found for ${sd_id}`,
      sd_id,
      app: targetApp
    };
  }

  console.log(`   Found ${migrationFiles.length} migration file(s)`);

  // Step 2: Check if migrations are applied
  const supabaseUrl = targetApp === 'ehg'
    ? process.env.VITE_SUPABASE_URL || 'https://liapbndqlqxdcgpwntbv.supabase.co'
    : process.env.SUPABASE_URL;

  const supabaseKey = targetApp === 'ehg'
    ? process.env.VITE_SUPABASE_ANON_KEY
    : process.env.SUPABASE_ANON_KEY;

  const supabase = createClient(supabaseUrl, supabaseKey);

  const appliedMigrations = [];
  const pendingMigrations = [];

  for (const migrationFile of migrationFiles) {
    const applied = await checkMigrationApplied(supabase, migrationFile);

    if (applied) {
      appliedMigrations.push(migrationFile.filename);
    } else {
      pendingMigrations.push(migrationFile);
    }
  }

  // Step 3: Return verdict
  if (pendingMigrations.length > 0) {
    return {
      verdict: 'BLOCKED',
      blocker: 'Database migrations not applied',
      pending_migrations: pendingMigrations.map(m => m.filename),
      applied_migrations: appliedMigrations,
      instructions: {
        automated: 'Run automated migration executor module',
        manual_cli: `cd ${pendingMigrations[0].directory} && supabase db push`,
        manual_dashboard: 'Copy SQL to Supabase Dashboard SQL Editor',
        file_location: pendingMigrations[0].filepath
      },
      sd_id,
      app: targetApp
    };
  }

  return {
    verdict: 'PASS',
    applied_migrations: appliedMigrations,
    message: `All ${appliedMigrations.length} migration(s) applied successfully`,
    sd_id,
    app: targetApp
  };
}

/**
 * Find migration files related to SD
 */
async function findSDMigrationFiles(sd_id, targetApp) {
  const migrationsPath = targetApp === 'ehg'
    ? '/mnt/c/_EHG/ehg/supabase/migrations'
    : '/mnt/c/_EHG/EHG_Engineer/database/migrations';

  try {
    const files = await readdir(migrationsPath);

    // Filter by SD ID in filename
    const sdSlug = sd_id.toLowerCase().replace('sd-', '').replace(/-/g, '_');
    const sdFiles = files.filter(file =>
      file.toLowerCase().includes(sdSlug) ||
      file.toLowerCase().includes(sd_id.toLowerCase())
    );

    return sdFiles.map(filename => ({
      filename,
      filepath: path.join(migrationsPath, filename),
      directory: migrationsPath
    }));
  } catch (error) {
    console.error('   ⚠️  Could not read migrations directory:', error.message);
    return [];
  }
}

/**
 * Check if migration is applied by checking if table exists
 */
async function checkMigrationApplied(supabase, migrationFile) {
  try {
    // Read migration file to extract table name
    const content = await readFile(migrationFile.filepath, 'utf8');
    const tableName = extractTableName(content);

    if (!tableName) {
      console.log(`   ⚠️  Could not extract table name from ${migrationFile.filename}`);
      return false;
    }

    // Check if table exists
    const { error } = await supabase
      .from(tableName)
      .select('*')
      .limit(1);

    return !error; // If no error, table exists
  } catch (error) {
    return false;
  }
}

/**
 * Extract table name from migration SQL
 */
function extractTableName(sqlContent) {
  // Look for CREATE TABLE statements
  const createTableMatch = sqlContent.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_][a-zA-Z0-9_]*)/i);

  if (createTableMatch) {
    return createTableMatch[1];
  }

  // Alternative: look for INSERT INTO or ALTER TABLE
  const insertMatch = sqlContent.match(/INSERT\s+INTO\s+([a-zA-Z_][a-zA-Z0-9_]*)/i);
  if (insertMatch) {
    return insertMatch[1];
  }

  const alterMatch = sqlContent.match(/ALTER\s+TABLE\s+([a-zA-Z_][a-zA-Z0-9_]*)/i);
  if (alterMatch) {
    return alterMatch[1];
  }

  return null;
}
