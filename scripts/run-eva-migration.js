#!/usr/bin/env node
/**
 * Execute EVA Decision Rollback Migration on EHG Database
 * SD: SD-EVA-DECISION-001
 * Usage: node scripts/run-eva-migration.js
 */

import { readFileSync } from 'fs';
import { createDatabaseClient, splitPostgreSQLStatements } from './lib/supabase-connection.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Migration file path (in EHG repo)
const migrationFile = join(__dirname, '../../ehg/database/migrations/20251204_eva_decision_rollback.sql');

async function executeMigration() {
  console.log('\n🚀 Executing EVA Decision Rollback Migration\n');
  console.log(`📁 File: ${migrationFile}`);
  console.log('🎯 Target: EHG Application Database (EVA tables)\n');

  let client;
  try {
    // Read migration file
    const migrationSQL = readFileSync(migrationFile, 'utf-8');
    console.log(`📄 Migration file loaded (${migrationSQL.length} characters)\n`);

    // Create database client for EHG application database
    console.log('🔌 Connecting to EHG database...');
    client = await createDatabaseClient('ehg', {
      verify: true,
      verbose: true
    });

    // Split SQL statements
    const statements = splitPostgreSQLStatements(migrationSQL);
    console.log(`\n📊 Found ${statements.length} SQL statements\n`);

    // Execute each statement
    let successCount = 0;
    let skipCount = 0;
    const errors = [];

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      const preview = statement.substring(0, 80).replace(/\n/g, ' ') + '...';

      try {
        console.log(`[${i + 1}/${statements.length}] Executing: ${preview}`);
        const result = await client.query(statement);

        if (result.command === 'CREATE' || result.command === 'ALTER' || result.command === 'INSERT') {
          console.log(`   ✅ Success: ${result.command}`);
          successCount++;
        } else if (result.command === 'COMMENT' || result.command === 'GRANT') {
          console.log(`   ℹ️  ${result.command} applied`);
          successCount++;
        } else {
          console.log(`   ✅ Executed (${result.rowCount || 0} rows affected)`);
          successCount++;
        }
      } catch (error) {
        // Check if error is due to "already exists" - this is OK for IF NOT EXISTS
        if (error.message.includes('already exists') ||
            error.message.includes('already enabled') ||
            error.message.includes('duplicate key value violates unique constraint')) {
          console.log(`   ⚠️  Skipped: ${error.message.split('\n')[0]}`);
          skipCount++;
        } else {
          console.error(`   ❌ Error: ${error.message.split('\n')[0]}`);
          errors.push({
            statement: preview,
            error: error.message
          });
        }
      }
    }

    // Summary
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Migration Summary');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ Successful: ${successCount}`);
    console.log(`⚠️  Skipped (already exists): ${skipCount}`);
    console.log(`❌ Errors: ${errors.length}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (errors.length > 0) {
      console.error('❌ Migration completed with errors:\n');
      errors.forEach((err, idx) => {
        console.error(`Error ${idx + 1}:`);
        console.error(`  Statement: ${err.statement}`);
        console.error(`  Error: ${err.error}\n`);
      });
      process.exit(1);
    } else {
      console.log('✅ Migration completed successfully!\n');

      // Verify created objects
      console.log('🔍 Verifying created objects...\n');

      try {
        // Check eva_actions.is_reversible column
        const evaCheck = await client.query(`
          SELECT column_name, data_type, column_default
          FROM information_schema.columns
          WHERE table_name = 'eva_actions' AND column_name = 'is_reversible'
        `);

        if (evaCheck.rows.length > 0) {
          console.log('✅ eva_actions.is_reversible column exists');
          console.log(`   Type: ${evaCheck.rows[0].data_type}`);
          console.log(`   Default: ${evaCheck.rows[0].column_default}`);
        } else {
          console.log('❌ eva_actions.is_reversible column NOT found');
        }

        // Check decision_log.is_reversible column
        const decisionCheck = await client.query(`
          SELECT column_name, data_type, column_default
          FROM information_schema.columns
          WHERE table_name = 'decision_log' AND column_name = 'is_reversible'
        `);

        if (decisionCheck.rows.length > 0) {
          console.log('✅ decision_log.is_reversible column exists');
          console.log(`   Type: ${decisionCheck.rows[0].data_type}`);
          console.log(`   Default: ${decisionCheck.rows[0].column_default}`);
        } else {
          console.log('❌ decision_log.is_reversible column NOT found');
        }

        // Check index
        const indexCheck = await client.query(`
          SELECT indexname, indexdef
          FROM pg_indexes
          WHERE tablename = 'eva_actions' AND indexname = 'idx_eva_actions_reversible'
        `);

        if (indexCheck.rows.length > 0) {
          console.log('✅ idx_eva_actions_reversible index exists');
        } else {
          console.log('❌ idx_eva_actions_reversible index NOT found');
        }

        // Check view
        const viewCheck = await client.query(`
          SELECT table_name
          FROM information_schema.views
          WHERE table_name = 'rollback_eligible_actions'
        `);

        if (viewCheck.rows.length > 0) {
          console.log('✅ rollback_eligible_actions view exists');
        } else {
          console.log('❌ rollback_eligible_actions view NOT found');
        }

        // Check functions
        const funcCheck = await client.query(`
          SELECT proname, prosrc
          FROM pg_proc
          WHERE proname IN ('determine_action_reversibility', 'set_action_reversibility')
          ORDER BY proname
        `);

        console.log(`✅ Found ${funcCheck.rows.length} functions`);
        funcCheck.rows.forEach(func => {
          console.log(`   - ${func.proname}`);
        });

        // Check trigger
        const triggerCheck = await client.query(`
          SELECT trigger_name, event_manipulation, action_statement
          FROM information_schema.triggers
          WHERE trigger_name = 'trigger_set_action_reversibility'
        `);

        if (triggerCheck.rows.length > 0) {
          console.log('✅ trigger_set_action_reversibility trigger exists');
          console.log(`   Event: ${triggerCheck.rows[0].event_manipulation}`);
        } else {
          console.log('❌ trigger_set_action_reversibility trigger NOT found');
        }

        console.log('\n✅ All verifications complete!\n');
      } catch (verifyError) {
        console.error('⚠️  Verification error:', verifyError.message);
      }
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
      console.log('🔌 Database connection closed\n');
    }
  }
}

// Run migration
executeMigration();
