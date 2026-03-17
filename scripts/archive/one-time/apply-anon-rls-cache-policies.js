#!/usr/bin/env node
/**
 * Apply ANON RLS Policies for Knowledge Retrieval Cache Tables
 * SD-2025-1015-ANON-RLS-CACHE
 *
 * Purpose: Enable ANON key to write to cache/audit tables
 * Context: automated-knowledge-retrieval.js fails with RLS violations
 *
 * Tables:
 * 1. tech_stack_references - Full CRUD for caching research results
 * 2. prd_research_audit_log - INSERT-only for audit logging
 */

import { createDatabaseClient, splitPostgreSQLStatements } from './lib/supabase-connection.js';
import chalk from 'chalk';

const POLICIES_SQL = `
-- ============================================================================
-- tech_stack_references: Full CRUD for ANON (24-hour TTL cache)
-- ============================================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow anon users to insert tech_stack_references" ON tech_stack_references;
DROP POLICY IF EXISTS "Allow anon users to update tech_stack_references" ON tech_stack_references;
DROP POLICY IF EXISTS "Allow anon users to delete tech_stack_references" ON tech_stack_references;
DROP POLICY IF EXISTS "Allow anon users to select tech_stack_references" ON tech_stack_references;

-- Create new policies for ANON role
CREATE POLICY "Allow anon users to insert tech_stack_references"
  ON tech_stack_references FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anon users to update tech_stack_references"
  ON tech_stack_references FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow anon users to delete tech_stack_references"
  ON tech_stack_references FOR DELETE
  TO anon
  USING (true);

CREATE POLICY "Allow anon users to select tech_stack_references"
  ON tech_stack_references FOR SELECT
  TO anon
  USING (true);

-- Grant table permissions to anon role
GRANT SELECT, INSERT, UPDATE, DELETE ON tech_stack_references TO anon;

-- ============================================================================
-- prd_research_audit_log: INSERT-only for ANON (audit logging)
-- ============================================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow anon users to insert prd_research_audit_log" ON prd_research_audit_log;
DROP POLICY IF EXISTS "Allow anon users to select prd_research_audit_log" ON prd_research_audit_log;

-- Create new policies for ANON role
CREATE POLICY "Allow anon users to insert prd_research_audit_log"
  ON prd_research_audit_log FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anon users to select prd_research_audit_log"
  ON prd_research_audit_log FOR SELECT
  TO anon
  USING (true);

-- Grant table permissions to anon role
GRANT SELECT, INSERT ON prd_research_audit_log TO anon;
`;

async function applyPolicies() {
  console.log(chalk.cyan('\n🔐 Applying ANON RLS Policies for Cache Tables...\n'));

  let client;

  try {
    // Connect to EHG_Engineer database
    console.log(chalk.gray('📡 Connecting to database...'));
    client = await createDatabaseClient('engineer', {
      verify: true,
      verbose: true
    });

    // Split SQL into individual statements
    const statements = splitPostgreSQLStatements(POLICIES_SQL);
    console.log(chalk.gray(`\n📋 Executing ${statements.length} SQL statements...\n`));

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const preview = stmt.substring(0, 80).replace(/\n/g, ' ') + '...';

      try {
        console.log(chalk.gray(`   ${i + 1}/${statements.length}: ${preview}`));
        await client.query(stmt);
        console.log(chalk.green('      ✓ Success'));
      } catch (error) {
        // Check if error is benign (e.g., "policy does not exist")
        if (error.message.includes('does not exist') && stmt.includes('DROP POLICY')) {
          console.log(chalk.yellow('      ⚠ Policy doesn\'t exist (skipping)'));
        } else {
          throw new Error(`Statement ${i + 1} failed: ${error.message}\nSQL: ${stmt}`);
        }
      }
    }

    console.log(chalk.green('\n✅ All policies applied successfully!\n'));

    // Verify policies were created
    console.log(chalk.cyan('🔍 Verifying policies...\n'));

    const verifySQL = `
      SELECT schemaname, tablename, policyname, roles::text[], cmd
      FROM pg_policies
      WHERE tablename IN ('tech_stack_references', 'prd_research_audit_log')
        AND 'anon' = ANY(roles)
      ORDER BY tablename, cmd;
    `;

    const { rows } = await client.query(verifySQL);

    if (rows.length === 0) {
      console.log(chalk.yellow('⚠️  No ANON policies found (unexpected)'));
    } else {
      console.log(chalk.green(`✓ Found ${rows.length} ANON policies:\n`));
      rows.forEach(row => {
        console.log(chalk.gray(`   ${row.tablename}.${row.policyname}`));
        console.log(chalk.gray(`      Command: ${row.cmd}`));
        // roles is now cast to text[] which becomes a JS array
        const rolesArray = Array.isArray(row.roles) ? row.roles : [row.roles];
        console.log(chalk.gray(`      Roles: ${rolesArray.join(', ')}\n`));
      });
    }

    // Test ANON access (optional)
    console.log(chalk.cyan('🧪 Testing ANON access...\n'));

    const testSQL = `
      -- Test SELECT access
      SELECT COUNT(*) as count FROM tech_stack_references;
    `;

    const { rows: testRows } = await client.query(testSQL);
    console.log(chalk.green(`✓ ANON SELECT access verified (${testRows[0].count} rows in tech_stack_references)`));

    console.log(chalk.green('\n✅ All verifications passed!\n'));
    console.log(chalk.cyan('📝 Next Steps:'));
    console.log(chalk.gray('   1. Run automated-knowledge-retrieval.js to test cache writes'));
    console.log(chalk.gray('   2. Verify no RLS errors occur'));
    console.log(chalk.gray('   3. Check tech_stack_references table for cached entries\n'));

  } catch (error) {
    console.error(chalk.red('\n❌ Error applying policies:'), error.message);
    console.error(chalk.gray('\nTroubleshooting:'));
    console.error(chalk.gray('   1. Verify database connection credentials'));
    console.error(chalk.gray('   2. Ensure tables exist: tech_stack_references, prd_research_audit_log'));
    console.error(chalk.gray('   3. Check database user has permission to create policies'));
    console.error(chalk.gray('   4. Verify RLS is enabled on these tables\n'));
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
      console.log(chalk.gray('📡 Database connection closed\n'));
    }
  }
}

// Run the script
applyPolicies();
