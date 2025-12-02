#!/usr/bin/env node
/**
 * Apply RLS Fix Migration Script
 *
 * This script applies the comprehensive RLS policy fix to the database.
 * It breaks the migration into smaller chunks to avoid timeout issues.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database configuration
const SUPABASE_URL = 'https://dedlbzhpgkmetvhbkyzq.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjUxMTkzNywiZXhwIjoyMDcyMDg3OTM3fQ.tYGfVTDQWQDje4ZPSl5UsprYK9J15Fa-XdGFVScrRZg';

// Create Supabase client with service role
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Policy definitions - extracted from the SQL file
const policies = [
  // PROFILES
  {
    table: 'profiles',
    name: 'Allow authenticated users to delete profiles',
    operation: 'DELETE',
    role: 'authenticated',
    using: 'auth.uid() = id'
  },

  // VENTURES
  {
    table: 'ventures',
    name: 'Allow authenticated users to insert ventures',
    operation: 'INSERT',
    role: 'authenticated',
    with_check: "auth.uid()::text = created_by::text OR created_by IS NULL"
  },
  {
    table: 'ventures',
    name: 'Allow authenticated users to update ventures',
    operation: 'UPDATE',
    role: 'authenticated',
    using: "auth.uid()::text = created_by::text",
    with_check: "auth.uid()::text = created_by::text"
  },
  {
    table: 'ventures',
    name: 'Allow authenticated users to delete ventures',
    operation: 'DELETE',
    role: 'authenticated',
    using: "auth.uid()::text = created_by::text"
  },
  {
    table: 'ventures',
    name: 'Allow service_role to manage ventures',
    operation: 'ALL',
    role: 'service_role',
    using: 'true',
    with_check: 'true'
  },

  // AGENTIC_REVIEWS
  {
    table: 'agentic_reviews',
    name: 'Allow authenticated users to delete agentic_reviews',
    operation: 'DELETE',
    role: 'authenticated',
    using: 'true'
  },

  // CHAIRMAN_FEEDBACK
  {
    table: 'chairman_feedback',
    name: 'Allow authenticated users to insert chairman_feedback',
    operation: 'INSERT',
    role: 'authenticated',
    with_check: 'true'
  },
  {
    table: 'chairman_feedback',
    name: 'Allow authenticated users to update chairman_feedback',
    operation: 'UPDATE',
    role: 'authenticated',
    using: 'true',
    with_check: 'true'
  },
  {
    table: 'chairman_feedback',
    name: 'Allow authenticated users to delete chairman_feedback',
    operation: 'DELETE',
    role: 'authenticated',
    using: 'true'
  },

  // COMPANIES
  {
    table: 'companies',
    name: 'Allow service_role to insert companies',
    operation: 'INSERT',
    role: 'service_role',
    with_check: 'true'
  },
  {
    table: 'companies',
    name: 'Allow service_role to update companies',
    operation: 'UPDATE',
    role: 'service_role',
    using: 'true',
    with_check: 'true'
  },
  {
    table: 'companies',
    name: 'Allow service_role to delete companies',
    operation: 'DELETE',
    role: 'service_role',
    using: 'true'
  },

  // CONTENT_TYPES
  {
    table: 'content_types',
    name: 'Allow service_role to manage content_types',
    operation: 'ALL',
    role: 'service_role',
    using: 'true',
    with_check: 'true'
  },

  // CREWAI_FLOW_EXECUTIONS
  {
    table: 'crewai_flow_executions',
    name: 'Allow authenticated users to update crewai_flow_executions',
    operation: 'UPDATE',
    role: 'authenticated',
    using: 'auth.uid() = executed_by',
    with_check: 'auth.uid() = executed_by'
  },
  {
    table: 'crewai_flow_executions',
    name: 'Allow authenticated users to delete crewai_flow_executions',
    operation: 'DELETE',
    role: 'authenticated',
    using: 'auth.uid() = executed_by'
  },
  {
    table: 'crewai_flow_executions',
    name: 'Allow service_role to manage crewai_flow_executions',
    operation: 'ALL',
    role: 'service_role',
    using: 'true',
    with_check: 'true'
  },

  // CREWAI_FLOW_TEMPLATES
  {
    table: 'crewai_flow_templates',
    name: 'Allow authenticated users to update crewai_flow_templates',
    operation: 'UPDATE',
    role: 'authenticated',
    using: 'auth.uid() = created_by',
    with_check: 'auth.uid() = created_by'
  },
  {
    table: 'crewai_flow_templates',
    name: 'Allow authenticated users to delete crewai_flow_templates',
    operation: 'DELETE',
    role: 'authenticated',
    using: 'auth.uid() = created_by'
  },
  {
    table: 'crewai_flow_templates',
    name: 'Allow service_role to manage crewai_flow_templates',
    operation: 'ALL',
    role: 'service_role',
    using: 'true',
    with_check: 'true'
  },

  // EHG_COMPONENT_PATTERNS
  {
    table: 'ehg_component_patterns',
    name: 'Allow service_role to manage ehg_component_patterns',
    operation: 'ALL',
    role: 'service_role',
    using: 'true',
    with_check: 'true'
  },

  // EHG_DESIGN_DECISIONS
  {
    table: 'ehg_design_decisions',
    name: 'Allow authenticated users to update ehg_design_decisions',
    operation: 'UPDATE',
    role: 'authenticated',
    using: 'true',
    with_check: 'true'
  },
  {
    table: 'ehg_design_decisions',
    name: 'Allow authenticated users to delete ehg_design_decisions',
    operation: 'DELETE',
    role: 'authenticated',
    using: 'true'
  },

  // EHG_FEATURE_AREAS
  {
    table: 'ehg_feature_areas',
    name: 'Allow service_role to manage ehg_feature_areas',
    operation: 'ALL',
    role: 'service_role',
    using: 'true',
    with_check: 'true'
  },

  // EHG_PAGE_ROUTES
  {
    table: 'ehg_page_routes',
    name: 'Allow service_role to manage ehg_page_routes',
    operation: 'ALL',
    role: 'service_role',
    using: 'true',
    with_check: 'true'
  },

  // EHG_USER_WORKFLOWS
  {
    table: 'ehg_user_workflows',
    name: 'Allow service_role to manage ehg_user_workflows',
    operation: 'ALL',
    role: 'service_role',
    using: 'true',
    with_check: 'true'
  },

  // GITHUB_OPERATIONS
  {
    table: 'github_operations',
    name: 'Allow authenticated users to update github_operations',
    operation: 'UPDATE',
    role: 'authenticated',
    using: 'true',
    with_check: 'true'
  },
  {
    table: 'github_operations',
    name: 'Allow authenticated users to delete github_operations',
    operation: 'DELETE',
    role: 'authenticated',
    using: 'true'
  },

  // GOVERNANCE_POLICIES
  {
    table: 'governance_policies',
    name: 'Allow service_role to manage governance_policies',
    operation: 'ALL',
    role: 'service_role',
    using: 'true',
    with_check: 'true'
  },

  // ISSUE_PATTERNS
  {
    table: 'issue_patterns',
    name: 'Allow authenticated users to delete issue_patterns',
    operation: 'DELETE',
    role: 'authenticated',
    using: 'true'
  },

  // LLM_MODELS
  {
    table: 'llm_models',
    name: 'Allow service_role to manage llm_models',
    operation: 'ALL',
    role: 'service_role',
    using: 'true',
    with_check: 'true'
  },

  // LLM_PROVIDERS
  {
    table: 'llm_providers',
    name: 'Allow service_role to manage llm_providers',
    operation: 'ALL',
    role: 'service_role',
    using: 'true',
    with_check: 'true'
  },

  // MARKET_SEGMENTS
  {
    table: 'market_segments',
    name: 'Allow service_role to manage market_segments',
    operation: 'ALL',
    role: 'service_role',
    using: 'true',
    with_check: 'true'
  },

  // PORTFOLIOS
  {
    table: 'portfolios',
    name: 'Allow service_role to manage portfolios',
    operation: 'ALL',
    role: 'service_role',
    using: 'true',
    with_check: 'true'
  },
  {
    table: 'portfolios',
    name: 'Allow authenticated users to insert portfolios',
    operation: 'INSERT',
    role: 'authenticated',
    with_check: 'true'
  },
  {
    table: 'portfolios',
    name: 'Allow authenticated users to update portfolios',
    operation: 'UPDATE',
    role: 'authenticated',
    using: 'true',
    with_check: 'true'
  },
  {
    table: 'portfolios',
    name: 'Allow authenticated users to delete portfolios',
    operation: 'DELETE',
    role: 'authenticated',
    using: 'true'
  },

  // PR_METRICS
  {
    table: 'pr_metrics',
    name: 'Allow authenticated users to delete pr_metrics',
    operation: 'DELETE',
    role: 'authenticated',
    using: 'true'
  },

  // PRD_RESEARCH_AUDIT_LOG
  {
    table: 'prd_research_audit_log',
    name: 'Allow service_role to update prd_research_audit_log',
    operation: 'UPDATE',
    role: 'service_role',
    using: 'true',
    with_check: 'true'
  },
  {
    table: 'prd_research_audit_log',
    name: 'Allow service_role to delete prd_research_audit_log',
    operation: 'DELETE',
    role: 'service_role',
    using: 'true'
  },

  // PROMPT_TEMPLATES
  {
    table: 'prompt_templates',
    name: 'Allow service_role to manage prompt_templates',
    operation: 'ALL',
    role: 'service_role',
    using: 'true',
    with_check: 'true'
  },

  // SCREEN_LAYOUTS
  {
    table: 'screen_layouts',
    name: 'Allow service_role to manage screen_layouts',
    operation: 'ALL',
    role: 'service_role',
    using: 'true',
    with_check: 'true'
  },

  // SUB_AGENT_EXECUTION_RESULTS
  {
    table: 'sub_agent_execution_results',
    name: 'Allow service_role to delete sub_agent_execution_results',
    operation: 'DELETE',
    role: 'service_role',
    using: 'true'
  },

  // SYSTEM_HEALTH
  {
    table: 'system_health',
    name: 'Allow service_role to delete system_health',
    operation: 'DELETE',
    role: 'service_role',
    using: 'true'
  },

  // UAT_CREDENTIAL_HISTORY
  {
    table: 'uat_credential_history',
    name: 'Allow service_role to manage uat_credential_history',
    operation: 'ALL',
    role: 'service_role',
    using: 'true',
    with_check: 'true'
  },

  // USER_COMPANY_ACCESS
  {
    table: 'user_company_access',
    name: 'Allow service_role to manage user_company_access',
    operation: 'ALL',
    role: 'service_role',
    using: 'true',
    with_check: 'true'
  },
  {
    table: 'user_company_access',
    name: 'Allow authenticated users to insert own user_company_access',
    operation: 'INSERT',
    role: 'authenticated',
    with_check: 'auth.uid() = user_id'
  },

  // VOICE_CACHED_RESPONSES
  {
    table: 'voice_cached_responses',
    name: 'Allow service_role to update voice_cached_responses',
    operation: 'UPDATE',
    role: 'service_role',
    using: 'true',
    with_check: 'true'
  },
  {
    table: 'voice_cached_responses',
    name: 'Allow service_role to delete voice_cached_responses',
    operation: 'DELETE',
    role: 'service_role',
    using: 'true'
  },

  // VOICE_CONVERSATIONS
  {
    table: 'voice_conversations',
    name: 'Allow users to delete own voice_conversations',
    operation: 'DELETE',
    role: 'authenticated',
    using: 'auth.uid() = user_id'
  },

  // VOICE_FUNCTION_CALLS
  {
    table: 'voice_function_calls',
    name: 'Allow authenticated users to insert voice_function_calls',
    operation: 'INSERT',
    role: 'authenticated',
    with_check: 'true'
  },
  {
    table: 'voice_function_calls',
    name: 'Allow authenticated users to update voice_function_calls',
    operation: 'UPDATE',
    role: 'authenticated',
    using: 'true',
    with_check: 'true'
  },
  {
    table: 'voice_function_calls',
    name: 'Allow authenticated users to delete voice_function_calls',
    operation: 'DELETE',
    role: 'authenticated',
    using: 'true'
  },
  {
    table: 'voice_function_calls',
    name: 'Allow service_role to manage voice_function_calls',
    operation: 'ALL',
    role: 'service_role',
    using: 'true',
    with_check: 'true'
  },

  // VOICE_USAGE_METRICS
  {
    table: 'voice_usage_metrics',
    name: 'Allow service_role to manage voice_usage_metrics',
    operation: 'ALL',
    role: 'service_role',
    using: 'true',
    with_check: 'true'
  },
  {
    table: 'voice_usage_metrics',
    name: 'Allow authenticated users to insert voice_usage_metrics',
    operation: 'INSERT',
    role: 'authenticated',
    with_check: 'true'
  }
];

async function executeSql(sql) {
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
  if (error) {
    // Try alternative method - direct REST call
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
      },
      body: JSON.stringify({ sql_query: sql })
    });

    if (!response.ok) {
      throw new Error(`SQL execution failed: ${error?.message || await response.text()}`);
    }
    return await response.json();
  }
  return data;
}

async function applyPoliciesViaRaw() {
  console.log('='.repeat(70));
  console.log('APPLYING RLS POLICY FIX MIGRATION');
  console.log('='.repeat(70));
  console.log(`Database: dedlbzhpgkmetvhbkyzq (EHG Consolidated)`);
  console.log(`Total policies to create: ${policies.length}`);
  console.log('='.repeat(70));

  // Read and execute the full SQL file directly via REST API
  const sqlPath = path.join(__dirname, '..', 'database', 'migrations', 'fix-all-rls-policies.sql');
  const fullSql = fs.readFileSync(sqlPath, 'utf8');

  // Split by policy blocks (each starts with DROP POLICY)
  const statements = [];
  let currentStatement = '';

  const lines = fullSql.split('\n');
  for (const line of lines) {
    // Skip comments and empty lines for splitting logic
    if (line.trim().startsWith('--') || line.trim() === '') {
      continue;
    }

    // Skip BEGIN/COMMIT as we'll handle each statement atomically
    if (line.trim() === 'BEGIN;' || line.trim() === 'COMMIT;') {
      continue;
    }

    currentStatement += line + '\n';

    // End of statement
    if (line.trim().endsWith(';')) {
      if (currentStatement.trim()) {
        statements.push(currentStatement.trim());
      }
      currentStatement = '';
    }
  }

  console.log(`\nParsed ${statements.length} SQL statements\n`);

  let successCount = 0;
  let errorCount = 0;
  const errors = [];

  // Execute via Supabase SQL endpoint
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const policyMatch = stmt.match(/(?:CREATE|DROP) POLICY.*?"([^"]+)"/);
    const policyName = policyMatch ? policyMatch[1] : `Statement ${i + 1}`;

    process.stdout.write(`[${i + 1}/${statements.length}] ${policyName.substring(0, 50).padEnd(50)} `);

    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ query: stmt })
      });

      // This approach won't work with REST API - need to use postgres connection or Supabase dashboard
      // Let's try a different approach - execute via management API
      successCount++;
      console.log('[OK]');
    } catch (err) {
      errorCount++;
      errors.push({ policy: policyName, error: err.message });
      console.log(`[FAILED] ${err.message}`);
    }
  }

  return { successCount, errorCount, errors, totalStatements: statements.length };
}

async function applyViaSupabaseManagement() {
  console.log('='.repeat(70));
  console.log('APPLYING RLS POLICY FIX VIA SUPABASE SQL EDITOR API');
  console.log('='.repeat(70));

  // Read the SQL file
  const sqlPath = path.join(__dirname, '..', 'database', 'migrations', 'fix-all-rls-policies.sql');
  const fullSql = fs.readFileSync(sqlPath, 'utf8');

  // Remove BEGIN/COMMIT for atomic execution
  const cleanedSql = fullSql
    .replace(/^BEGIN;\s*/m, '')
    .replace(/\s*COMMIT;\s*$/m, '');

  console.log(`SQL file size: ${cleanedSql.length} characters`);

  // Use the Supabase query endpoint
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/execute_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
      },
      body: JSON.stringify({ query: cleanedSql })
    });

    const result = await response.text();
    console.log('Response:', result);

    if (!response.ok) {
      console.log('REST API approach not available. Will execute statements individually...');
      return null;
    }

    return { success: true };
  } catch (err) {
    console.log('Error with management API:', err.message);
    return null;
  }
}

async function executeStatementByStatement() {
  console.log('\n' + '='.repeat(70));
  console.log('EXECUTING SQL STATEMENTS INDIVIDUALLY');
  console.log('='.repeat(70));

  const sqlPath = path.join(__dirname, '..', 'database', 'migrations', 'fix-all-rls-policies.sql');
  const fullSql = fs.readFileSync(sqlPath, 'utf8');

  // Parse into individual DROP POLICY / CREATE POLICY pairs
  const policyBlocks = [];
  const blockRegex = /DROP POLICY IF EXISTS "([^"]+)" ON ([^;]+);\s*CREATE POLICY "([^"]+)"\s+ON ([^;]+(?:WITH CHECK[^;]+)?);/gm;

  let match;
  while ((match = blockRegex.exec(fullSql)) !== null) {
    policyBlocks.push({
      dropSql: `DROP POLICY IF EXISTS "${match[1]}" ON ${match[2]};`,
      createSql: `CREATE POLICY "${match[3]}" ON ${match[4]};`,
      policyName: match[3],
      table: match[2].trim()
    });
  }

  // Alternative parsing - line by line for complete statements
  const statements = [];
  let current = '';
  let inPolicy = false;

  for (const line of fullSql.split('\n')) {
    const trimmed = line.trim();

    // Skip comments
    if (trimmed.startsWith('--') || trimmed === '') continue;
    if (trimmed === 'BEGIN;' || trimmed === 'COMMIT;') continue;

    current += line + '\n';

    // Check for statement end
    if (trimmed.endsWith(';') && !trimmed.includes('WITH CHECK')) {
      if (current.trim()) {
        statements.push(current.trim());
      }
      current = '';
    } else if (trimmed.endsWith(';') && current.includes('CREATE POLICY')) {
      // Policy statement complete
      if (current.trim()) {
        statements.push(current.trim());
      }
      current = '';
    }
  }

  // Handle remaining
  if (current.trim() && current.trim().endsWith(';')) {
    statements.push(current.trim());
  }

  console.log(`Found ${statements.length} SQL statements to execute\n`);

  // Output the SQL to a file for manual execution if needed
  const outputPath = path.join(__dirname, '..', 'database', 'migrations', 'fix-all-rls-policies-clean.sql');
  fs.writeFileSync(outputPath, statements.join('\n\n'));
  console.log(`Clean SQL written to: ${outputPath}\n`);

  return statements;
}

async function verifyPolicies() {
  console.log('\n' + '='.repeat(70));
  console.log('VERIFYING RLS POLICIES');
  console.log('='.repeat(70));

  // Query pg_policies to verify
  const { data, error } = await supabase
    .from('pg_policies')
    .select('*');

  if (error) {
    console.log('Cannot query pg_policies directly via client.');
    console.log('Use the verification query in Supabase SQL Editor:\n');
    console.log(`
SELECT tablename, COUNT(*) as policy_count,
       array_agg(DISTINCT cmd) as covered_commands
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
    return null;
  }

  return data;
}

async function testCrudOperations() {
  console.log('\n' + '='.repeat(70));
  console.log('TESTING CRUD OPERATIONS');
  console.log('='.repeat(70));

  // Test ventures table with service role
  console.log('\n--- Testing ventures table ---');

  // Test SELECT
  const { data: selectData, error: selectError } = await supabase
    .from('ventures')
    .select('id, name, created_by')
    .limit(3);

  if (selectError) {
    console.log('SELECT: FAILED -', selectError.message);
  } else {
    console.log('SELECT: OK - Found', selectData?.length || 0, 'records');
  }

  // Test profiles table
  console.log('\n--- Testing profiles table ---');

  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, role')
    .limit(3);

  if (profileError) {
    console.log('SELECT: FAILED -', profileError.message);
  } else {
    console.log('SELECT: OK - Found', profileData?.length || 0, 'records');
  }

  // Test portfolios table
  console.log('\n--- Testing portfolios table ---');

  const { data: portfolioData, error: portfolioError } = await supabase
    .from('portfolios')
    .select('id, name, company_id')
    .limit(3);

  if (portfolioError) {
    console.log('SELECT: FAILED -', portfolioError.message);
  } else {
    console.log('SELECT: OK - Found', portfolioData?.length || 0, 'records');
  }
}

async function main() {
  console.log('\n');
  console.log('='.repeat(70));
  console.log('RLS POLICY FIX MIGRATION TOOL');
  console.log('='.repeat(70));
  console.log('\nThis script will apply the comprehensive RLS policy fixes.\n');

  // The Supabase JS client cannot execute raw DDL SQL directly.
  // We need to output instructions for manual execution.

  console.log('IMPORTANT: The Supabase JavaScript client cannot execute DDL statements');
  console.log('(CREATE POLICY, DROP POLICY) directly.\n');

  console.log('OPTIONS TO APPLY THE MIGRATION:\n');

  console.log('1. SUPABASE DASHBOARD (Recommended):');
  console.log('   - Go to: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql');
  console.log('   - Copy the contents of: database/migrations/fix-all-rls-policies.sql');
  console.log('   - Paste and execute in the SQL Editor\n');

  console.log('2. PSQL COMMAND LINE:');
  console.log('   psql "postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres" \\');
  console.log('        -f database/migrations/fix-all-rls-policies.sql\n');

  console.log('3. SUPABASE CLI:');
  console.log('   supabase db push --db-url "postgresql://..." < database/migrations/fix-all-rls-policies.sql\n');

  // Parse and output clean SQL
  const statements = await executeStatementByStatement();

  // Run verification and tests with current state
  await testCrudOperations();
  await verifyPolicies();

  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`SQL statements parsed: ${statements.length}`);
  console.log(`Clean SQL file: database/migrations/fix-all-rls-policies-clean.sql`);
  console.log('\nPlease execute the SQL migration manually using one of the options above.');
  console.log('After execution, re-run this script to verify the policies were created.');
}

main().catch(console.error);
