#!/usr/bin/env node

/**
 * Apply Orchestrator Progress Function Fix
 * Fixes the function signature conflicts and ensures calculate_sd_progress
 * properly handles orchestrator SDs.
 */

import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log('========================================');
  console.log('ORCHESTRATOR PROGRESS FUNCTION FIX');
  console.log('========================================\n');

  // Read migration file
  const migrationPath = path.join(__dirname, '../database/migrations/20260101_fix_orchestrator_progress_function.sql');
  console.log(`Reading migration file: ${migrationPath}\n`);

  if (!fs.existsSync(migrationPath)) {
    console.error(`Error: Migration file not found: ${migrationPath}`);
    process.exit(1);
  }

  const sqlContent = fs.readFileSync(migrationPath, 'utf8');
  console.log(`Migration file loaded (${sqlContent.length} bytes)\n`);

  // Database connection
  const password = 'Fl!M32DaM00n!1';
  const connectionString = `postgresql://postgres.dedlbzhpgkmetvhbkyzq:${encodeURIComponent(password)}@aws-1-us-east-1.pooler.supabase.com:6543/postgres`;

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to database\n');

    console.log('Executing migration...\n');
    await client.query(sqlContent);
    console.log('Migration executed successfully!\n');

    // Run verification
    console.log('Running verification queries...\n');

    const progressResult = await client.query(`
      SELECT calculate_sd_progress('SD-VENTURE-SELECTION-001') as progress
    `);
    console.log(`calculate_sd_progress('SD-VENTURE-SELECTION-001') = ${progressResult.rows[0].progress}`);

    const isOrchResult = await client.query(`
      SELECT is_orchestrator_sd('SD-VENTURE-SELECTION-001') as is_orch
    `);
    console.log(`is_orchestrator_sd('SD-VENTURE-SELECTION-001') = ${isOrchResult.rows[0].is_orch}`);

    const breakdownResult = await client.query(`
      SELECT get_progress_breakdown('SD-VENTURE-SELECTION-001') as breakdown
    `);
    const breakdown = breakdownResult.rows[0].breakdown;
    console.log('\nProgress Breakdown:');
    console.log(JSON.stringify(breakdown, null, 2));

    if (progressResult.rows[0].progress === 100) {
      console.log('\nSUCCESS: Orchestrator progress now returns 100%');
      console.log('Parent SD can now be marked as complete.');
    } else {
      console.log(`\nWARNING: Progress is ${progressResult.rows[0].progress}%, not 100%`);
      console.log('Check the breakdown above for missing requirements.');
    }

  } catch (error) {
    console.error('Error executing migration:', error.message);
    if (error.position) {
      console.error('Error position:', error.position);
    }
    process.exit(1);
  } finally {
    await client.end();
    console.log('\nDatabase connection closed.');
  }
}

main().catch(console.error);
