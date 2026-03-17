import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use the correct pooler URL from .env
const connectionString = 'postgresql://postgres.dedlbzhpgkmetvhbkyzq:Fl%21M32DaM00n%211@aws-1-us-east-1.pooler.supabase.com:5432/postgres';

async function auditRLS() {
  console.log('=== COMPREHENSIVE RLS POLICY AUDIT ===\n');
  console.log('Database: dedlbzhpgkmetvhbkyzq (EHG Consolidated)\n');

  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  console.log('Connected to database via direct connection.\n');

  // 1. Get all tables and their RLS status
  console.log('=== STEP 1: Getting all tables and RLS status ===\n');

  const tablesResult = await client.query(`
    SELECT
      c.relname as table_name,
      c.relrowsecurity as rls_enabled,
      c.relforcerowsecurity as rls_forced
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
    ORDER BY c.relname;
  `);

  console.log('Found ' + tablesResult.rows.length + ' tables in public schema.\n');

  // 2. Get all existing policies
  console.log('=== STEP 2: Getting all existing RLS policies ===\n');

  const policiesResult = await client.query(`
    SELECT
      schemaname,
      tablename,
      policyname,
      permissive,
      roles,
      cmd,
      qual,
      with_check
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname;
  `);

  console.log('Found ' + policiesResult.rows.length + ' RLS policies.\n');

  // Build a map of policies by table
  const policiesByTable = {};
  for (const policy of policiesResult.rows) {
    if (!policiesByTable[policy.tablename]) {
      policiesByTable[policy.tablename] = [];
    }
    policiesByTable[policy.tablename].push(policy);
  }

  // 3. Analyze each table
  console.log('=== STEP 3: Analyzing RLS status per table ===\n');

  const auditReport = {
    timestamp: new Date().toISOString(),
    database: 'dedlbzhpgkmetvhbkyzq',
    summary: {
      totalTables: 0,
      tablesWithRlsDisabled: 0,
      tablesWithRlsEnabledNoPolicies: 0,
      tablesWithIncompletePolicies: 0,
      tablesWithFullCoverage: 0,
      totalPoliciesNeeded: 0
    },
    tables: [],
    rlsDisabledTables: [],
    rlsEnabledNoPoliciesTables: [],
    incompletePolicyTables: [],
    fullCoverageTables: [],
    criticalSecurityGaps: [],
    missingPolicies: []
  };

  const priorityTables = [
    'nav_routes', 'nav_preferences', 'ventures', 'venture_stages',
    'venture_metrics', 'profiles', 'user_preferences', 'strategic_directives',
    'prds', 'user_stories', 'workflow_executions', 'stage_executions',
    'competitor_analysis', 'gtm_intel_sources', 'market_research_results',
    'blueprints', 'sd_blueprints', 'venture_genesis_sessions'
  ];

  const requiredActions = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];

  for (const table of tablesResult.rows) {
    const tableName = table.table_name;
    const rlsEnabled = table.rls_enabled;
    const policies = policiesByTable[tableName] || [];
    const isPriority = priorityTables.includes(tableName);

    // Determine what actions are covered
    const coveredActions = new Set();
    for (const policy of policies) {
      if (policy.cmd === 'ALL') {
        requiredActions.forEach(function(a) { coveredActions.add(a); });
      } else {
        coveredActions.add(policy.cmd);
      }
    }

    const missingActions = requiredActions.filter(function(a) { return !coveredActions.has(a); });

    const tableReport = {
      tableName: tableName,
      rlsEnabled: rlsEnabled,
      rlsForced: table.rls_forced,
      isPriority: isPriority,
      policies: policies.map(function(p) {
        return {
          name: p.policyname,
          command: p.cmd,
          permissive: p.permissive,
          roles: p.roles,
          qual: p.qual,
          withCheck: p.with_check
        };
      }),
      coveredActions: Array.from(coveredActions),
      missingActions: missingActions,
      status: 'unknown'
    };

    if (!rlsEnabled) {
      tableReport.status = 'RLS_DISABLED';
      auditReport.rlsDisabledTables.push(tableName);
      auditReport.summary.tablesWithRlsDisabled++;
      if (isPriority) {
        auditReport.criticalSecurityGaps.push({
          table: tableName,
          issue: 'RLS is disabled on priority table',
          severity: 'CRITICAL'
        });
      }
    } else if (policies.length === 0) {
      tableReport.status = 'RLS_ENABLED_NO_POLICIES';
      auditReport.rlsEnabledNoPoliciesTables.push(tableName);
      auditReport.summary.tablesWithRlsEnabledNoPolicies++;
      // Add all actions as missing
      for (const action of requiredActions) {
        auditReport.missingPolicies.push({
          table: tableName,
          action: action,
          priority: isPriority ? 'HIGH' : 'NORMAL'
        });
      }
      auditReport.summary.totalPoliciesNeeded += 4;
      if (isPriority) {
        auditReport.criticalSecurityGaps.push({
          table: tableName,
          issue: 'RLS enabled but no policies - queries will return empty or fail',
          severity: 'CRITICAL'
        });
      }
    } else if (missingActions.length > 0) {
      tableReport.status = 'INCOMPLETE_POLICIES';
      auditReport.incompletePolicyTables.push(tableName);
      auditReport.summary.tablesWithIncompletePolicies++;
      for (const action of missingActions) {
        auditReport.missingPolicies.push({
          table: tableName,
          action: action,
          priority: isPriority ? 'HIGH' : 'NORMAL'
        });
      }
      auditReport.summary.totalPoliciesNeeded += missingActions.length;
    } else {
      tableReport.status = 'FULL_COVERAGE';
      auditReport.fullCoverageTables.push(tableName);
      auditReport.summary.tablesWithFullCoverage++;
    }

    auditReport.tables.push(tableReport);
    auditReport.summary.totalTables++;
  }

  // Print summary
  console.log('=== AUDIT SUMMARY ===\n');
  console.log('Total tables: ' + auditReport.summary.totalTables);
  console.log('Tables with RLS disabled: ' + auditReport.summary.tablesWithRlsDisabled);
  console.log('Tables with RLS enabled but no policies: ' + auditReport.summary.tablesWithRlsEnabledNoPolicies);
  console.log('Tables with incomplete policies: ' + auditReport.summary.tablesWithIncompletePolicies);
  console.log('Tables with full coverage: ' + auditReport.summary.tablesWithFullCoverage);
  console.log('Total policies needed: ' + auditReport.summary.totalPoliciesNeeded);
  console.log('Critical security gaps: ' + auditReport.criticalSecurityGaps.length);

  console.log('\n=== TABLES WITH RLS DISABLED ===');
  auditReport.rlsDisabledTables.forEach(function(t) {
    const isPrio = priorityTables.includes(t) ? ' [PRIORITY]' : '';
    console.log('  - ' + t + isPrio);
  });

  console.log('\n=== TABLES WITH RLS ENABLED BUT NO POLICIES (Will cause 406 errors!) ===');
  auditReport.rlsEnabledNoPoliciesTables.forEach(function(t) {
    const isPrio = priorityTables.includes(t) ? ' [PRIORITY]' : '';
    console.log('  - ' + t + isPrio);
  });

  console.log('\n=== TABLES WITH INCOMPLETE POLICY COVERAGE ===');
  for (const table of auditReport.tables.filter(function(t) { return t.status === 'INCOMPLETE_POLICIES'; })) {
    const isPrio = table.isPriority ? ' [PRIORITY]' : '';
    console.log('  - ' + table.tableName + isPrio + ': missing ' + table.missingActions.join(', '));
  }

  console.log('\n=== CRITICAL SECURITY GAPS ===');
  for (const gap of auditReport.criticalSecurityGaps) {
    console.log('  [' + gap.severity + '] ' + gap.table + ': ' + gap.issue);
  }

  // Save report
  const reportPath = './database/rls-audit-report.json';
  fs.writeFileSync(reportPath, JSON.stringify(auditReport, null, 2));
  console.log('\nReport saved to: ' + reportPath);

  await client.end();
  return auditReport;
}

auditRLS().catch(function(err) {
  console.error('Audit failed:', err);
  process.exit(1);
});
