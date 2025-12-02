#!/usr/bin/env node
/**
 * Execute RLS Fix Migration via Direct PostgreSQL Connection
 *
 * This script connects directly to Supabase PostgreSQL and executes the RLS policy fixes.
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Direct PostgreSQL connection string for Supabase
// Format: postgresql://postgres.[project-ref]:[password]@[host]:[port]/postgres
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres.dedlbzhpgkmetvhbkyzq:YOUR_DB_PASSWORD@aws-1-us-east-1.pooler.supabase.com:6543/postgres';

// Alternative: Use the transaction pooler connection
const SUPABASE_PROJECT_REF = 'dedlbzhpgkmetvhbkyzq';

async function executeWithPooledConnection() {
  console.log('='.repeat(70));
  console.log('APPLYING RLS POLICY FIX MIGRATION');
  console.log('='.repeat(70));

  // Read SQL file
  const sqlPath = path.join(__dirname, '..', 'database', 'migrations', 'fix-all-rls-policies.sql');
  const fullSql = fs.readFileSync(sqlPath, 'utf8');

  console.log(`\nSQL file: ${sqlPath}`);
  console.log(`SQL size: ${fullSql.length} characters`);

  // Parse into individual statements for execution
  const statements = [];
  let currentStatement = '';

  for (const line of fullSql.split('\n')) {
    const trimmed = line.trim();

    // Skip pure comments
    if (trimmed.startsWith('--') && !trimmed.includes('============')) {
      continue;
    }

    // Skip comment-only lines
    if (trimmed.startsWith('--')) {
      continue;
    }

    // Skip empty lines
    if (trimmed === '') {
      continue;
    }

    currentStatement += line + '\n';

    // Detect end of statement
    if (trimmed.endsWith(';')) {
      const stmt = currentStatement.trim();
      if (stmt && stmt !== 'BEGIN;' && stmt !== 'COMMIT;') {
        statements.push(stmt);
      }
      currentStatement = '';
    }
  }

  console.log(`\nParsed ${statements.length} SQL statements\n`);

  // Check for database URL
  if (!process.env.DATABASE_URL) {
    console.log('\n' + '='.repeat(70));
    console.log('DATABASE CONNECTION REQUIRED');
    console.log('='.repeat(70));
    console.log('\nTo execute this migration, you need a direct PostgreSQL connection.');
    console.log('\nOption 1: Set DATABASE_URL environment variable:');
    console.log('  export DATABASE_URL="postgresql://postgres.dedlbzhpgkmetvhbkyzq:[PASSWORD]@aws-1-us-east-1.pooler.supabase.com:6543/postgres"');
    console.log('  node scripts/execute-rls-fix-psql.mjs\n');

    console.log('Option 2: Use Supabase Dashboard SQL Editor:');
    console.log('  1. Go to: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql');
    console.log('  2. Paste the SQL from: database/migrations/fix-all-rls-policies.sql');
    console.log('  3. Click "Run"\n');

    // Output statements for manual review
    console.log('\n' + '='.repeat(70));
    console.log('SQL STATEMENTS TO EXECUTE');
    console.log('='.repeat(70));

    let dropCount = 0;
    let createCount = 0;

    for (const stmt of statements) {
      if (stmt.startsWith('DROP POLICY')) dropCount++;
      if (stmt.startsWith('CREATE POLICY')) createCount++;
    }

    console.log(`\nDROP POLICY statements: ${dropCount}`);
    console.log(`CREATE POLICY statements: ${createCount}`);
    console.log(`Total statements: ${statements.length}`);

    // List tables being modified
    const tables = new Set();
    for (const stmt of statements) {
      const match = stmt.match(/ON public\.(\w+)/);
      if (match) tables.add(match[1]);
    }

    console.log(`\nTables affected (${tables.size}):`);
    for (const table of Array.from(tables).sort()) {
      console.log(`  - ${table}`);
    }

    return;
  }

  // Connect and execute
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('Connected successfully!\n');

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    // Execute within a transaction
    await client.query('BEGIN');

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const policyMatch = stmt.match(/"([^"]+)"/);
      const policyName = policyMatch ? policyMatch[1] : `Statement ${i + 1}`;
      const shortName = policyName.substring(0, 50).padEnd(50);

      process.stdout.write(`[${String(i + 1).padStart(2)}/${statements.length}] ${shortName} `);

      try {
        await client.query(stmt);
        successCount++;
        console.log('[OK]');
      } catch (err) {
        // Check if it's a "policy already exists" or "table doesn't exist" error
        if (err.message.includes('already exists')) {
          successCount++;
          console.log('[SKIP - already exists]');
        } else if (err.message.includes('does not exist')) {
          console.log('[SKIP - table not found]');
        } else {
          errorCount++;
          errors.push({ policy: policyName, error: err.message, sql: stmt });
          console.log(`[FAILED]`);
          console.log(`   Error: ${err.message}`);
        }
      }
    }

    if (errorCount === 0) {
      await client.query('COMMIT');
      console.log('\n[TRANSACTION COMMITTED]');
    } else {
      await client.query('ROLLBACK');
      console.log('\n[TRANSACTION ROLLED BACK due to errors]');
    }

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('EXECUTION SUMMARY');
    console.log('='.repeat(70));
    console.log(`Successful: ${successCount}`);
    console.log(`Errors: ${errorCount}`);

    if (errors.length > 0) {
      console.log('\nErrors encountered:');
      for (const err of errors) {
        console.log(`  - ${err.policy}: ${err.error}`);
      }
    }

    // Verify policies
    console.log('\n' + '='.repeat(70));
    console.log('VERIFYING POLICIES');
    console.log('='.repeat(70));

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
      ORDER BY tablename;
    `);

    console.log('\nPolicy coverage by table:');
    console.log('-'.repeat(70));
    console.log('Table'.padEnd(35) + 'Count'.padEnd(8) + 'Commands');
    console.log('-'.repeat(70));

    for (const row of verifyResult.rows) {
      const commands = row.covered_commands.join(', ');
      console.log(`${row.tablename.padEnd(35)}${String(row.policy_count).padEnd(8)}${commands}`);
    }

  } catch (err) {
    console.error('Fatal error:', err.message);
    await client.query('ROLLBACK');
  } finally {
    await client.end();
    console.log('\nDatabase connection closed.');
  }
}

executeWithPooledConnection().catch(console.error);
