#!/usr/bin/env node
/**
 * Migration Executor Module
 * Enhanced QA Engineering Director v2.0
 *
 * Automatically executes pending database migrations.
 * Impact: Saves 5-8 minutes of manual Supabase Dashboard work.
 */

import { execSync } from 'child_process';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

// Cross-platform path resolution (SD-WIN-MIG-005 fix)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EHG_ENGINEER_ROOT = path.resolve(__dirname, '../../..');
const EHG_ROOT = path.resolve(__dirname, '../../../../ehg');

/**
 * Execute pending database migrations
 * @param {Array} pendingMigrations - Array of migration file objects
 * @param {string} targetApp - 'ehg' or 'EHG_Engineer'
 * @returns {Promise<Object>} Execution results
 */
export async function executePendingMigrations(pendingMigrations, targetApp = 'ehg') {
  console.log(`🚀 Migration Executor: Applying ${pendingMigrations.length} pending migration(s)...`);

  const appPath = targetApp === 'ehg'
    ? EHG_ROOT
    : EHG_ENGINEER_ROOT;

  // NOTE: As of SD-ARCH-EHG-006 (2025-11-30), both apps use CONSOLIDATED database
  const projectRef = 'dedlbzhpgkmetvhbkyzq';  // CONSOLIDATED: replaces old liapbndqlqxdcgpwntbv

  try {
    // Step 1: Link to Supabase project
    console.log(`   Linking to Supabase project: ${projectRef}...`);

    try {
      execSync(`supabase link --project-ref ${projectRef}`, {
        cwd: appPath,
        encoding: 'utf8',
        stdio: 'pipe'
      });
      console.log('   ✅ Linked to Supabase project');
    } catch {
      // Already linked, continue
      console.log('   ℹ️  Project already linked');
    }

    // Step 2: Apply migrations automatically
    console.log('   Applying migrations...');

    const output = execSync('supabase db push', {
      cwd: appPath,
      encoding: 'utf8',
      stdio: 'pipe',
      input: 'Y\n' // Auto-confirm
    });

    // Step 3: Parse output for applied migrations
    const appliedMigrations = parseAppliedMigrations(output);

    return {
      verdict: 'SUCCESS',
      applied_migrations: appliedMigrations,
      pending_count: pendingMigrations.length,
      applied_count: appliedMigrations.length,
      time_saved: '5-8 minutes (vs manual Supabase Dashboard)',
      app: targetApp,
      output: output.substring(0, 500) // First 500 chars of output
    };

  } catch (error) {
    // Execution failed - provide fallback instructions
    return {
      verdict: 'FAILED',
      error: error.message,
      fallback_instructions: {
        manual_cli: `cd ${appPath} && supabase db push`,
        manual_dashboard: 'Copy SQL to Supabase Dashboard SQL Editor',
        migration_files: pendingMigrations.map(m => m.filepath)
      },
      app: targetApp
    };
  }
}

/**
 * Execute migration via direct SQL
 * @param {Object} migrationFile - Migration file object
 * @param {string} targetApp - 'ehg' or 'EHG_Engineer'
 * @returns {Promise<Object>} Execution results
 */
export async function executeViaPSQL(migrationFile, targetApp = 'ehg') {
  console.log(`🔧 Migration Executor: Applying via psql - ${migrationFile.filename}...`);

  const poolerUrl = targetApp === 'ehg'
    ? process.env.EHG_POOLER_URL
    : process.env.SUPABASE_POOLER_URL;

  if (!poolerUrl) {
    return {
      verdict: 'SKIP',
      message: 'No pooler URL configured - use manual method',
      migration: migrationFile.filename
    };
  }

  try {
    // Execute via psql using -f (file-based) to avoid shell injection
    // Previously used -c with interpolated SQL content, which allowed shell metacharacter injection
    execSync(`psql "${poolerUrl}" -f "${migrationFile.filepath}"`, {
      encoding: 'utf8',
      stdio: 'pipe'
    });

    return {
      verdict: 'SUCCESS',
      migration: migrationFile.filename,
      method: 'psql',
      app: targetApp
    };

  } catch (error) {
    return {
      verdict: 'FAILED',
      error: error.message,
      migration: migrationFile.filename,
      method: 'psql',
      app: targetApp
    };
  }
}

/**
 * Parse applied migrations from supabase db push output
 */
function parseAppliedMigrations(output) {
  const appliedMigrations = [];

  // Look for migration file names in output
  const lines = output.split('\n');

  for (const line of lines) {
    // Match patterns like "Applied 20251004_create_table.sql"
    const match = line.match(/Applied\s+([0-9_a-zA-Z-]+\.sql)/);
    if (match) {
      appliedMigrations.push(match[1]);
    }
  }

  return appliedMigrations;
}

/**
 * Validate migration file before execution
 * @param {string} filepath - Path to migration file
 * @returns {Promise<Object>} Validation results
 */
export async function validateMigrationFile(filepath) {
  try {
    const content = await readFile(filepath, 'utf8');

    const issues = [];

    // Check for cross-schema foreign keys
    if (/REFERENCES\s+(auth|storage|extensions)\./i.test(content)) {
      issues.push({
        severity: 'ERROR',
        issue: 'Cross-schema foreign key detected',
        pattern: 'REFERENCES auth.users',
        fix: 'Remove FK constraint - use UUID without REFERENCES'
      });
    }

    // Check for auth.users in FROM/JOIN
    if (/FROM\s+auth\.users|JOIN\s+auth\.users/i.test(content)) {
      issues.push({
        severity: 'ERROR',
        issue: 'Direct auth.users reference in query',
        pattern: 'FROM auth.users',
        fix: 'Use auth.uid() function instead'
      });
    }

    // Check for hardcoded UUIDs referencing auth
    if (/INSERT.*auth\.users.*VALUES.*[0-9a-f-]{36}/i.test(content)) {
      issues.push({
        severity: 'WARNING',
        issue: 'Hardcoded UUID may reference auth.users',
        fix: 'Use NULL or gen_random_uuid() instead'
      });
    }

    if (issues.length > 0) {
      return {
        verdict: 'BLOCKED',
        issues,
        filepath,
        recommendation: 'Fix migration file before execution'
      };
    }

    return {
      verdict: 'PASS',
      filepath,
      message: 'Migration file validation passed'
    };

  } catch (error) {
    return {
      verdict: 'ERROR',
      error: error.message,
      filepath
    };
  }
}
