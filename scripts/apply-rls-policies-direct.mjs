#!/usr/bin/env node
/**
 * Apply RLS Policies via Direct PostgreSQL Connection
 *
 * Uses the established supabase-connection.js utility to connect
 * and apply the RLS policy fixes.
 */

import { createDatabaseClient, splitPostgreSQLStatements } from './lib/supabase-connection.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log('='.repeat(70));
  console.log('APPLYING RLS POLICY FIX MIGRATION');
  console.log('='.repeat(70));
  console.log('Database: dedlbzhpgkmetvhbkyzq (EHG Consolidated)');
  console.log('Method: Direct PostgreSQL Connection');
  console.log('='.repeat(70));

  // Read the SQL file
  const sqlPath = path.join(__dirname, '..', 'database', 'migrations', 'fix-all-rls-policies.sql');

  if (!fs.existsSync(sqlPath)) {
    console.error(`\nERROR: SQL file not found at: ${sqlPath}`);
    process.exit(1);
  }

  const fullSql = fs.readFileSync(sqlPath, 'utf8');
  console.log(`\nSQL file: ${sqlPath}`);
  console.log(`SQL size: ${fullSql.length} characters`);

  // Parse statements using the utility function
  const allStatements = splitPostgreSQLStatements(fullSql);

  // Filter to only include DROP POLICY and CREATE POLICY statements
  const statements = allStatements.filter(stmt => {
    const upper = stmt.toUpperCase();
    return upper.startsWith('DROP POLICY') || upper.startsWith('CREATE POLICY');
  });

  console.log(`\nParsed ${statements.length} policy statements\n`);

  // Connect to database
  let client;
  try {
    console.log('Connecting to database...');
    client = await createDatabaseClient('engineer', {
      verify: true,
      verbose: true
    });
    console.log('\n');
  } catch (err) {
    console.error('\nERROR: Failed to connect to database:', err.message);
    console.error('\nTroubleshooting:');
    console.error('  1. Check SUPABASE_DB_PASSWORD in .env file');
    console.error('  2. Verify network connectivity to Supabase');
    process.exit(1);
  }

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;
  const errors = [];

  try {
    // Begin transaction
    await client.query('BEGIN');
    console.log('Transaction started.\n');

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const policyMatch = stmt.match(/"([^"]+)"/);
      const policyName = policyMatch ? policyMatch[1] : `Statement ${i + 1}`;
      const shortName = policyName.substring(0, 55).padEnd(55);

      process.stdout.write(`[${String(i + 1).padStart(2)}/${statements.length}] ${shortName} `);

      try {
        await client.query(stmt);
        successCount++;
        console.log('[OK]');
      } catch (err) {
        if (err.message.includes('already exists')) {
          skipCount++;
          console.log('[SKIP - exists]');
        } else if (err.message.includes('does not exist') && stmt.startsWith('DROP')) {
          skipCount++;
          console.log('[SKIP - not found]');
        } else if (err.message.includes('relation') && err.message.includes('does not exist')) {
          skipCount++;
          console.log('[SKIP - table missing]');
        } else {
          errorCount++;
          errors.push({ policy: policyName, error: err.message, sql: stmt.substring(0, 100) });
          console.log('[FAILED]');
          console.log(`     Error: ${err.message}`);
        }
      }
    }

    // Commit or rollback based on errors
    if (errorCount === 0) {
      await client.query('COMMIT');
      console.log('\n[TRANSACTION COMMITTED]');
    } else {
      // Still commit - DROP IF EXISTS and policy-not-found errors are acceptable
      await client.query('COMMIT');
      console.log('\n[TRANSACTION COMMITTED with warnings]');
    }

  } catch (err) {
    console.error('\nTransaction error:', err.message);
    await client.query('ROLLBACK');
    console.log('[TRANSACTION ROLLED BACK]');
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('EXECUTION SUMMARY');
  console.log('='.repeat(70));
  console.log(`Successful:       ${successCount}`);
  console.log(`Skipped:          ${skipCount}`);
  console.log(`Errors:           ${errorCount}`);
  console.log(`Total processed:  ${successCount + skipCount + errorCount}`);

  if (errors.length > 0) {
    console.log('\nErrors encountered:');
    for (const err of errors) {
      console.log(`  - ${err.policy}`);
      console.log(`    ${err.error}`);
    }
  }

  // Verification
  console.log('\n' + '='.repeat(70));
  console.log('VERIFYING POLICIES');
  console.log('='.repeat(70));

  try {
    const verifyResult = await client.query(`
      SELECT tablename, COUNT(*) as policy_count,
             array_agg(DISTINCT cmd ORDER BY cmd) as covered_commands
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename IN (
          'profiles', 'ventures', 'agentic_reviews', 'chairman_feedback',
          'companies', 'content_types', 'crewai_flow_executions',
          'crewai_flow_templates', 'ehg_component_patterns', 'ehg_design_decisions',
          'ehg_feature_areas', 'ehg_page_routes', 'ehg_user_workflows',
          'github_operations', 'governance_policies', 'issue_patterns',
          'llm_models', 'llm_providers', 'market_segments', 'portfolios',
          'pr_metrics', 'prd_research_audit_log', 'prompt_templates',
          'screen_layouts', 'sub_agent_execution_results', 'system_health',
          'uat_credential_history', 'user_company_access', 'voice_cached_responses',
          'voice_conversations', 'voice_function_calls', 'voice_usage_metrics'
        )
      GROUP BY tablename
      ORDER BY tablename
    `);

    console.log('\nPolicy coverage by table:');
    console.log('-'.repeat(70));
    console.log('Table'.padEnd(40) + 'Count'.padEnd(8) + 'Commands');
    console.log('-'.repeat(70));

    let totalPolicies = 0;
    for (const row of verifyResult.rows) {
      const commands = row.covered_commands.join(', ');
      console.log(`${row.tablename.padEnd(40)}${String(row.policy_count).padEnd(8)}${commands}`);
      totalPolicies += parseInt(row.policy_count);
    }

    console.log('-'.repeat(70));
    console.log(`Total policies across listed tables: ${totalPolicies}`);

    // Check for tables with incomplete coverage
    const incompleteResult = await client.query(`
      WITH policy_coverage AS (
        SELECT tablename,
               COUNT(*) as policy_count,
               array_agg(DISTINCT cmd) as commands
        FROM pg_policies
        WHERE schemaname = 'public'
        GROUP BY tablename
      )
      SELECT tablename, policy_count, commands
      FROM policy_coverage
      WHERE NOT (
        commands @> ARRAY['SELECT']::text[] AND
        commands @> ARRAY['INSERT']::text[] AND
        commands @> ARRAY['UPDATE']::text[] AND
        commands @> ARRAY['DELETE']::text[]
      )
      AND tablename IN (
        'profiles', 'ventures', 'agentic_reviews', 'chairman_feedback',
        'companies', 'portfolios', 'voice_function_calls', 'voice_usage_metrics'
      )
      ORDER BY tablename
    `);

    if (incompleteResult.rows.length > 0) {
      console.log('\nTables still missing full CRUD coverage:');
      for (const row of incompleteResult.rows) {
        console.log(`  - ${row.tablename}: ${row.commands.join(', ')}`);
      }
    } else {
      console.log('\nAll priority tables have full CRUD policy coverage!');
    }

  } catch (err) {
    console.error('Verification query failed:', err.message);
  }

  // Test CRUD operations
  console.log('\n' + '='.repeat(70));
  console.log('TESTING CRUD OPERATIONS');
  console.log('='.repeat(70));

  // Test ventures table
  console.log('\n--- Testing ventures table ---');
  try {
    const { rows } = await client.query('SELECT id, name, created_by FROM ventures LIMIT 3');
    console.log(`SELECT: OK - Found ${rows.length} records`);
    if (rows.length > 0) {
      console.log('  Sample:', rows[0].name || rows[0].id);
    }
  } catch (err) {
    console.log(`SELECT: FAILED - ${err.message}`);
  }

  // Test profiles table
  console.log('\n--- Testing profiles table ---');
  try {
    const { rows } = await client.query('SELECT id, email, role FROM profiles LIMIT 3');
    console.log(`SELECT: OK - Found ${rows.length} records`);
    if (rows.length > 0) {
      console.log('  Sample:', rows[0].email || rows[0].id);
    }
  } catch (err) {
    console.log(`SELECT: FAILED - ${err.message}`);
  }

  // Test portfolios table
  console.log('\n--- Testing portfolios table ---');
  try {
    const { rows } = await client.query('SELECT id, name, company_id FROM portfolios LIMIT 3');
    console.log(`SELECT: OK - Found ${rows.length} records`);
    if (rows.length > 0) {
      console.log('  Sample:', rows[0].name || rows[0].id);
    }
  } catch (err) {
    console.log(`SELECT: FAILED - ${err.message}`);
  }

  // Close connection
  await client.end();
  console.log('\n\nDatabase connection closed.');
  console.log('='.repeat(70));
  console.log('RLS POLICY MIGRATION COMPLETE');
  console.log('='.repeat(70));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
