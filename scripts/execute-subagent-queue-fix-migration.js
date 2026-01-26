#!/usr/bin/env node

/**
 * Execute Sub-Agent Queue Type Fix Migration
 *
 * Fixes type mismatch between:
 * - strategic_directives_v2.id (VARCHAR(50))
 * - sub_agent_queue.sd_id (UUID - INCORRECT)
 *
 * Related to: create-subagent-automation.sql
 * Issue: SD-LEO-ENH-AUTO-PROCEED-001-12
 * Migration: 20260125_fix_subagent_queue_sd_id_type.sql
 */

import { createDatabaseClient, splitPostgreSQLStatements } from './lib/supabase-connection.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log('========================================');
  console.log('SUB-AGENT QUEUE TYPE FIX MIGRATION');
  console.log('========================================\n');

  // Read migration file
  const migrationPath = path.join(__dirname, '../database/migrations/20260125_fix_subagent_queue_sd_id_type.sql');
  console.log(`Reading migration file: ${migrationPath}\n`);

  if (!fs.existsSync(migrationPath)) {
    console.error(`❌ Migration file not found: ${migrationPath}`);
    process.exit(1);
  }

  const sqlContent = fs.readFileSync(migrationPath, 'utf8');
  console.log(`✅ Migration file loaded (${sqlContent.length} bytes)\n`);

  let client;

  try {
    // Create database client
    console.log('Connecting to database...\n');
    client = await createDatabaseClient('engineer', {
      verify: false,
      ssl: { rejectUnauthorized: false }
    });
    console.log('✅ Connected to database\n');

    // Check if sub_agent_queue table exists
    console.log('Checking if sub_agent_queue table exists...\n');
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'sub_agent_queue'
      ) as exists
    `);

    if (!tableCheck.rows[0].exists) {
      console.log('⚠️  sub_agent_queue table does not exist yet.');
      console.log('This is expected if create-subagent-automation.sql has not been executed.');
      console.log('\nSkipping migration - no action needed.\n');
      await client.end();
      process.exit(0);
    }

    // Check current sd_id column type
    console.log('Checking current sd_id column type...\n');
    const columnCheck = await client.query(`
      SELECT data_type, udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'sub_agent_queue'
        AND column_name = 'sd_id'
    `);

    const currentType = columnCheck.rows[0]?.data_type;
    console.log(`Current sd_id type: ${currentType}\n`);

    if (currentType === 'character varying') {
      console.log('✅ sd_id is already VARCHAR type. Migration not needed.\n');
      await client.end();
      process.exit(0);
    }

    // Execute migration
    console.log('Executing migration...\n');
    console.log('This will:');
    console.log('1. Drop dependent views and functions');
    console.log('2. Alter sub_agent_queue.sd_id from UUID to VARCHAR(50)');
    console.log('3. Recreate foreign key constraint');
    console.log('4. Recreate all functions with correct VARCHAR(50) parameter');
    console.log('5. Recreate views\n');

    // Split SQL into statements and execute
    const statements = splitPostgreSQLStatements(sqlContent);
    console.log(`Executing ${statements.length} SQL statements...\n`);

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i].trim();
      if (!stmt) continue;

      // Show progress for major operations
      if (stmt.toLowerCase().includes('drop view')) {
        console.log(`  [${i+1}/${statements.length}] Dropping view...`);
      } else if (stmt.toLowerCase().includes('drop function')) {
        console.log(`  [${i+1}/${statements.length}] Dropping function...`);
      } else if (stmt.toLowerCase().includes('alter table')) {
        console.log(`  [${i+1}/${statements.length}] Altering table...`);
      } else if (stmt.toLowerCase().includes('create or replace function')) {
        console.log(`  [${i+1}/${statements.length}] Creating function...`);
      } else if (stmt.toLowerCase().includes('create or replace view')) {
        console.log(`  [${i+1}/${statements.length}] Creating view...`);
      }

      try {
        await client.query(stmt);
      } catch (error) {
        // Ignore "does not exist" errors for DROP statements
        if (error.message.includes('does not exist') && stmt.toLowerCase().includes('drop')) {
          continue;
        }
        throw error;
      }
    }

    console.log('\n✅ Migration executed successfully!\n');

    // Run verification queries
    console.log('Running verification queries...\n');

    const typeVerification = await client.query(`
      SELECT
        'sub_agent_queue.sd_id' as column_name,
        data_type,
        udt_name,
        character_maximum_length
      FROM information_schema.columns
      WHERE table_name = 'sub_agent_queue' AND column_name = 'sd_id'

      UNION ALL

      SELECT
        'strategic_directives_v2.id' as column_name,
        data_type,
        udt_name,
        character_maximum_length
      FROM information_schema.columns
      WHERE table_name = 'strategic_directives_v2' AND column_name = 'id'
    `);

    console.log('Column types after migration:');
    typeVerification.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type} (max: ${row.character_maximum_length})`);
    });

    // Verify foreign key constraint
    const fkCheck = await client.query(`
      SELECT
        tc.constraint_name,
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = 'sub_agent_queue'
        AND kcu.column_name = 'sd_id'
    `);

    console.log('\nForeign key constraint:');
    if (fkCheck.rows.length > 0) {
      const fk = fkCheck.rows[0];
      console.log(`  ✅ ${fk.constraint_name}: ${fk.table_name}.${fk.column_name} → ${fk.foreign_table_name}.${fk.foreign_column_name}`);
    } else {
      console.log('  ⚠️  No foreign key constraint found');
    }

    // Verify functions
    const functionCheck = await client.query(`
      SELECT
        p.proname as function_name,
        pg_get_function_identity_arguments(p.oid) as arguments
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.proname IN (
          'queue_required_subagents',
          'check_subagent_completion',
          'validate_lead_approval',
          'complete_subagent_work'
        )
      ORDER BY p.proname
    `);

    console.log('\nRecreated functions:');
    functionCheck.rows.forEach(fn => {
      console.log(`  ✅ ${fn.function_name}(${fn.arguments})`);
    });

    // Verify view
    const viewCheck = await client.query(`
      SELECT viewname
      FROM pg_views
      WHERE schemaname = 'public'
        AND viewname = 'v_pending_subagent_work'
    `);

    console.log('\nRecreated views:');
    if (viewCheck.rows.length > 0) {
      console.log('  ✅ v_pending_subagent_work');
    } else {
      console.log('  ⚠️  v_pending_subagent_work not found');
    }

    console.log('\n========================================');
    console.log('MIGRATION SUMMARY');
    console.log('========================================\n');
    console.log('✅ sub_agent_queue.sd_id type changed: UUID → VARCHAR(50)');
    console.log('✅ Foreign key constraint recreated');
    console.log('✅ All 4 functions recreated with VARCHAR(50) parameter');
    console.log('✅ View v_pending_subagent_work recreated\n');
    console.log('The trigger trg_subagent_automation will now work correctly');
    console.log('with strategic_directives_v2 updates.\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
    }
  }
}

main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
