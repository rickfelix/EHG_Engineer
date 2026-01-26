#!/usr/bin/env node

/**
 * Execute Implementation Context Migration
 *
 * Adds implementation_context column to strategic_directives_v2 to prevent
 * LLM hallucination of irrelevant requirements.
 *
 * Related to: SD-LEO-INFRA-PRD-GROUNDING-VALIDATION-001
 * Migration: 20260126_add_implementation_context.sql
 */

import { createDatabaseClient, splitPostgreSQLStatements } from './lib/supabase-connection.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log('========================================');
  console.log('IMPLEMENTATION CONTEXT MIGRATION');
  console.log('========================================\n');

  // Read migration file
  const migrationPath = path.join(__dirname, '../database/migrations/20260126_add_implementation_context.sql');
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

    // Check if column already exists
    console.log('Checking if implementation_context column exists...\n');
    const columnCheck = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'strategic_directives_v2'
        AND column_name = 'implementation_context'
      ) as exists
    `);

    if (columnCheck.rows[0].exists) {
      console.log('✅ implementation_context column already exists. Migration not needed.\n');
      await client.end();
      process.exit(0);
    }

    // Execute migration
    console.log('Executing migration...\n');
    console.log('This will:');
    console.log('1. Add implementation_context column (DEFAULT: web)');
    console.log('2. Add CHECK constraint for valid values');
    console.log('3. Add column comment');
    console.log('4. Update existing infrastructure SDs → infrastructure');
    console.log('5. Update existing database SDs → database');
    console.log('6. Log migration to audit_log\n');

    // Split SQL into statements and execute
    const statements = splitPostgreSQLStatements(sqlContent);
    console.log(`Executing ${statements.length} SQL statements...\n`);

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i].trim();
      if (!stmt) continue;

      // Show progress for major operations
      if (stmt.toLowerCase().includes('alter table') && stmt.toLowerCase().includes('add column')) {
        console.log(`  [${i+1}/${statements.length}] Adding implementation_context column...`);
      } else if (stmt.toLowerCase().includes('add constraint')) {
        console.log(`  [${i+1}/${statements.length}] Adding CHECK constraint...`);
      } else if (stmt.toLowerCase().includes('comment on column')) {
        console.log(`  [${i+1}/${statements.length}] Adding column comment...`);
      } else if (stmt.toLowerCase().includes('update strategic_directives_v2')) {
        console.log(`  [${i+1}/${statements.length}] Updating existing SD types...`);
      } else if (stmt.toLowerCase().includes('insert into audit_log')) {
        console.log(`  [${i+1}/${statements.length}] Logging migration...`);
      }

      try {
        const result = await client.query(stmt);

        // Show UPDATE counts
        if (stmt.toLowerCase().includes('update strategic_directives_v2')) {
          console.log(`    → Updated ${result.rowCount} rows`);
        }
      } catch (error) {
        console.error(`\n❌ Failed on statement ${i+1}:`, error.message);
        console.error('Statement:', stmt.substring(0, 200) + '...');
        throw error;
      }
    }

    console.log('\n✅ Migration executed successfully!\n');

    // Run verification queries
    console.log('Running verification queries...\n');

    // Verify column
    const columnVerify = await client.query(`
      SELECT
        column_name,
        data_type,
        column_default,
        is_nullable
      FROM information_schema.columns
      WHERE table_name = 'strategic_directives_v2'
        AND column_name = 'implementation_context'
    `);

    console.log('Column details:');
    if (columnVerify.rows.length > 0) {
      const col = columnVerify.rows[0];
      console.log(`  ✅ ${col.column_name}: ${col.data_type}`);
      console.log(`     Default: ${col.column_default}`);
      console.log(`     Nullable: ${col.is_nullable}`);
    } else {
      console.log('  ❌ Column not found');
    }

    // Verify CHECK constraint
    const constraintCheck = await client.query(`
      SELECT constraint_name, check_clause
      FROM information_schema.check_constraints
      WHERE constraint_name = 'valid_implementation_context'
    `);

    console.log('\nCHECK constraint:');
    if (constraintCheck.rows.length > 0) {
      const constraint = constraintCheck.rows[0];
      console.log(`  ✅ ${constraint.constraint_name}`);
      console.log(`     Clause: ${constraint.check_clause}`);
    } else {
      console.log('  ❌ Constraint not found');
    }

    // Verify comment
    const commentCheck = await client.query(`
      SELECT
        c.table_name,
        c.column_name,
        pgd.description
      FROM pg_catalog.pg_statio_all_tables st
      JOIN pg_catalog.pg_description pgd ON (pgd.objoid = st.relid)
      JOIN information_schema.columns c ON (
        pgd.objsubid = c.ordinal_position
        AND c.table_schema = st.schemaname
        AND c.table_name = st.relname
      )
      WHERE c.table_name = 'strategic_directives_v2'
        AND c.column_name = 'implementation_context'
    `);

    console.log('\nColumn comment:');
    if (commentCheck.rows.length > 0) {
      console.log(`  ✅ ${commentCheck.rows[0].description}`);
    } else {
      console.log('  ⚠️  Comment not found (non-critical)');
    }

    // Show updated records by type
    const updatedCheck = await client.query(`
      SELECT
        sd_type,
        implementation_context,
        COUNT(*) as count
      FROM strategic_directives_v2
      WHERE sd_type IN ('infrastructure', 'database')
      GROUP BY sd_type, implementation_context
      ORDER BY sd_type, implementation_context
    `);

    console.log('\nUpdated SD records by type:');
    if (updatedCheck.rows.length > 0) {
      updatedCheck.rows.forEach(row => {
        console.log(`  ✅ ${row.sd_type} → ${row.implementation_context}: ${row.count} records`);
      });
    } else {
      console.log('  (No infrastructure/database SDs found)');
    }

    // Show sample of updated SDs
    const sampleCheck = await client.query(`
      SELECT sd_key, sd_type, implementation_context
      FROM strategic_directives_v2
      WHERE sd_type IN ('infrastructure', 'database')
      ORDER BY sd_type, sd_key
      LIMIT 5
    `);

    console.log('\nSample updated SDs:');
    sampleCheck.rows.forEach(row => {
      console.log(`  ${row.sd_key} (${row.sd_type}) → ${row.implementation_context}`);
    });

    console.log('\n========================================');
    console.log('MIGRATION SUMMARY');
    console.log('========================================\n');
    console.log('✅ implementation_context column added to strategic_directives_v2');
    console.log('✅ CHECK constraint added for valid values');
    console.log('✅ Existing infrastructure SDs updated → infrastructure');
    console.log('✅ Existing database SDs updated → database');
    console.log('✅ Migration logged to audit_log\n');
    console.log('PRD generation will now be grounded to correct implementation context,');
    console.log('preventing hallucination of irrelevant requirements (e.g., WCAG for CLI tools).\n');

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
