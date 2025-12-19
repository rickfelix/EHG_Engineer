#!/usr/bin/env node

/**
 * Apply SD Baseline Issues Table Migration
 * SD: SD-HARDENING-V2-001B
 *
 * Creates:
 * - sd_baseline_issues table
 * - baseline_summary view
 * - baseline_stale_issues view
 * - check_baseline_gate() function
 * - generate_baseline_issue_key() function
 */

import { createDatabaseClient, splitPostgreSQLStatements } from './lib/supabase-connection.js';
import fs from 'fs';
import path from 'path';

async function main() {
  const client = await createDatabaseClient('engineer', { verify: false });

  try {
    console.log('🔧 Applying SD Baseline Issues Migration (SD-HARDENING-V2-001B)\n');

    // Read the migration file
    const migrationPath = path.join(process.cwd(), 'database/migrations/20251219_sd_baseline_issues.sql');

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

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];

      // Skip DO blocks (verification messages)
      if (stmt.toUpperCase().trim().startsWith('DO')) {
        console.log(`[${i + 1}/${statements.length}] Skipping verification block\n`);
        skipCount++;
        continue;
      }

      // Skip COMMENT ON statements (non-critical)
      if (stmt.toUpperCase().trim().startsWith('COMMENT ON')) {
        console.log(`[${i + 1}/${statements.length}] Applying documentation comment...`);
        try {
          await client.query(stmt);
          console.log('   ✅ Success\n');
          successCount++;
        } catch (error) {
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
          console.error('   ❌ Failed:', error.message);
          throw error;
        }
      }
    }

    console.log('\n📊 Migration Summary:');
    console.log(`   ✅ Successful: ${successCount}`);
    console.log(`   ⚠️  Skipped: ${skipCount}`);
    console.log(`   📝 Total: ${statements.length}\n`);

    // Verification
    console.log('📋 Verification:\n');

    // 1. Check table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'sd_baseline_issues'
      ) as exists
    `);
    console.log(`✅ Table sd_baseline_issues: ${tableCheck.rows[0].exists ? 'EXISTS' : 'MISSING'}`);

    // 2. Check views
    const viewsCheck = await client.query(`
      SELECT table_name
      FROM information_schema.views
      WHERE table_schema = 'public'
        AND table_name IN ('baseline_summary', 'baseline_stale_issues')
      ORDER BY table_name
    `);
    console.log(`✅ Views created: ${viewsCheck.rows.map(r => r.table_name).join(', ')}`);

    // 3. Check functions
    const functionsCheck = await client.query(`
      SELECT proname as function_name
      FROM pg_proc
      WHERE proname IN ('check_baseline_gate', 'generate_baseline_issue_key')
      ORDER BY proname
    `);
    console.log(`✅ Functions created: ${functionsCheck.rows.map(r => r.function_name).join(', ')}`);

    // 4. Check RLS policies
    const policiesCheck = await client.query(`
      SELECT policyname, cmd
      FROM pg_policies
      WHERE tablename = 'sd_baseline_issues'
      ORDER BY policyname
    `);
    console.log(`✅ RLS Policies (${policiesCheck.rows.length}):`);
    policiesCheck.rows.forEach(p => {
      console.log(`   - ${p.policyname} (${p.cmd})`);
    });

    // 5. Check indexes
    const indexesCheck = await client.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'sd_baseline_issues'
      ORDER BY indexname
    `);
    console.log(`✅ Indexes (${indexesCheck.rows.length}): ${indexesCheck.rows.map(r => r.indexname).join(', ')}`);

    // 6. Test the gate function
    console.log('\n🧪 Testing check_baseline_gate() function:');
    const gateTest = await client.query('SELECT check_baseline_gate() as result');
    console.log('   Result:', JSON.stringify(gateTest.rows[0].result, null, 2));

    // 7. Test the key generation function
    console.log('\n🧪 Testing generate_baseline_issue_key() function:');
    const keyTest = await client.query('SELECT generate_baseline_issue_key(\'security\') as key');
    console.log(`   Generated key: ${keyTest.rows[0].key}`);

    console.log('\n✅ Migration completed successfully!');
    console.log('\n📚 Next Steps:');
    console.log('   1. Insert LEO Protocol section for baseline management');
    console.log('   2. Run: node scripts/generate-claude-md-from-db.js');
    console.log('   3. Test baseline issue tracking workflow\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
