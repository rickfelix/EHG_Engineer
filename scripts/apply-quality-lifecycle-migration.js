#!/usr/bin/env node

/**
 * Apply Quality Lifecycle Schema Migration
 * SD: SD-QUALITY-DB-001
 *
 * Creates:
 * - feedback table (unified issues + enhancements)
 * - releases table (release planning)
 * - feedback_sd_map junction table
 * - target_release_id column on strategic_directives_v2
 * - 14 indexes (12 on feedback, 3 on releases)
 * - RLS policies for both tables
 * - update_updated_at triggers
 */

import { createDatabaseClient, splitPostgreSQLStatements } from '../lib/supabase-connection.js';
import fs from 'fs';
import path from 'path';

async function main() {
  let client;

  try {
    console.log('🔧 Applying Quality Lifecycle Schema Migration (SD-QUALITY-DB-001)\n');

    client = await createDatabaseClient('engineer', { verify: false });

    // Read the migration file
    const migrationPath = path.join(process.cwd(), 'database/migrations/391_quality_lifecycle_schema.sql');

    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }

    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Use the established pattern for splitting PostgreSQL statements
    // This handles $$ delimiters in function bodies correctly
    const statements = splitPostgreSQLStatements(migrationSQL);

    console.log(`Found ${statements.length} statements to execute\n`);

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i].trim();

      // Skip empty statements and comments
      if (!stmt || stmt.startsWith('--')) {
        continue;
      }

      // Skip DO blocks (verification messages)
      if (stmt.toUpperCase().startsWith('DO')) {
        console.log(`[${i + 1}/${statements.length}] Skipping verification block\n`);
        skipCount++;
        continue;
      }

      // Skip COMMENT ON statements (non-critical)
      if (stmt.toUpperCase().startsWith('COMMENT ON')) {
        console.log(`[${i + 1}/${statements.length}] Applying documentation comment...`);
        try {
          await client.query(stmt);
          console.log('   ✅ Success\n');
          successCount++;
        } catch (_error) {
          console.log('   ⚠️  Comment failed (non-critical)\n');
          skipCount++;
        }
        continue;
      }

      console.log(`[${i + 1}/${statements.length}] Executing statement...`);

      // Show first 100 chars for context
      const preview = stmt.substring(0, 100).replace(/\n/g, ' ');
      console.log(`   ${preview}${stmt.length > 100 ? '...' : ''}`);

      try {
        await client.query(stmt);
        console.log('   ✅ Success\n');
        successCount++;
      } catch (error) {
        // Handle expected "already exists" errors gracefully
        if (error.message.includes('already exists')) {
          console.log('   ⚠️  Already exists (OK)\n');
          skipCount++;
        } else if (error.message.includes('does not exist') && stmt.toUpperCase().includes('DROP')) {
          console.log('   ⚠️  Does not exist (OK for DROP IF EXISTS)\n');
          skipCount++;
        } else {
          console.error('   ❌ Error:', error.message);
          console.error(`   Statement: ${stmt.substring(0, 200)}...\n`);
          errorCount++;
          // Continue execution for idempotent migrations
        }
      }
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Migration Complete: ${successCount} succeeded, ${skipCount} skipped, ${errorCount} errors\n`);

    // Verification
    console.log('🔍 Verifying migration...\n');

    // Check tables
    const tablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('feedback', 'releases', 'feedback_sd_map')
      ORDER BY table_name
    `);

    console.log('✅ Tables created:');
    tablesResult.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });

    // Check indexes on feedback
    const indexResult = await client.query(`
      SELECT COUNT(*) as count
      FROM pg_indexes
      WHERE tablename = 'feedback'
    `);

    console.log(`\n✅ Indexes on feedback: ${indexResult.rows[0].count}`);

    // Check target_release_id column
    const columnResult = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'strategic_directives_v2'
        AND column_name = 'target_release_id'
    `);

    if (columnResult.rows.length > 0) {
      console.log('✅ Column added: strategic_directives_v2.target_release_id');
    } else {
      console.log('⚠️  Column not found: strategic_directives_v2.target_release_id');
    }

    // Check RLS enabled
    const rlsResult = await client.query(`
      SELECT tablename, rowsecurity
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename IN ('feedback', 'releases')
      ORDER BY tablename
    `);

    console.log('\n✅ RLS enabled:');
    rlsResult.rows.forEach(row => {
      console.log(`   - ${row.tablename}: ${row.rowsecurity ? 'YES' : 'NO'}`);
    });

    console.log('\n✅ Migration verification complete');
    console.log('═══════════════════════════════════════════════════════════\n');

    if (errorCount > 0) {
      console.log('⚠️  Migration completed with errors. Review output above.');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
    }
  }
}

main();
