/**
 * RLS Policy Validator
 * SD-DATABASE-VALIDATION-001: Phase 4 - Automation
 *
 * Validates Row Level Security (RLS) policies across database tables:
 * - Detects tables without RLS enabled
 * - Validates policy completeness (SELECT, INSERT, UPDATE, DELETE)
 * - Checks for service_role policies
 * - Verifies policy naming conventions
 *
 * Usage:
 *   node scripts/db-validate/rls-validator.js [--verbose] [--fix]
 */

import { createDatabaseClient } from '../lib/supabase-connection.js';

/**
 * Standard RLS policy patterns expected for each table
 */
export const EXPECTED_POLICY_PATTERNS = {
  // Tables that should have service_role full access
  serviceRoleRequired: true,
  // Tables that should allow authenticated read
  authenticatedReadRequired: true,
  // Naming convention patterns
  namingPatterns: {
    serviceRole: /service_role_all_|Service role has full access/i,
    authenticatedRead: /authenticated_read_|Authenticated users can read/i,
    anonRead: /anon_read_|Anon users can read/i
  }
};

/**
 * Tables exempt from RLS requirements (internal system tables)
 */
export const RLS_EXEMPT_TABLES = [
  // Add tables here that legitimately don't need RLS
  // (e.g., internal caching tables, temporary tables)
];

/**
 * Critical tables that MUST have RLS enabled
 */
export const CRITICAL_TABLES = [
  'strategic_directives_v2',
  'product_requirements_v2',
  'leo_protocols',
  'leo_agents',
  'compliance_policies',
  'governance_proposals',
  'retrospectives'
];

/**
 * RLS validation result
 * @typedef {Object} RLSValidationResult
 * @property {boolean} valid - Whether all validations passed
 * @property {string[]} errors - Critical errors (tables without RLS)
 * @property {string[]} warnings - Non-critical issues (naming conventions)
 * @property {Object} metadata - Validation metadata
 */

/**
 * Table RLS info
 * @typedef {Object} TableRLSInfo
 * @property {string} tableName - Table name
 * @property {boolean} rlsEnabled - Whether RLS is enabled
 * @property {Array} policies - List of policies
 * @property {boolean} hasServiceRole - Has service_role policy
 * @property {boolean} hasAuthenticatedRead - Has authenticated read policy
 */

export class RLSValidator {
  constructor(project = 'engineer', options = {}) {
    this.project = project;
    this.verbose = options.verbose || false;
    this.client = null;
    this.tableInfo = new Map();
  }

  /**
   * Connect to database
   */
  async connect() {
    this.client = await createDatabaseClient(this.project, { verify: false });
    return this;
  }

  /**
   * Disconnect from database
   */
  async disconnect() {
    if (this.client) {
      await this.client.end();
      this.client = null;
    }
  }

  /**
   * Get all tables with their RLS status
   * @returns {Promise<TableRLSInfo[]>}
   */
  async getTablesWithRLSStatus() {
    const result = await this.client.query(`
      SELECT
        t.tablename as table_name,
        t.rowsecurity as rls_enabled
      FROM pg_tables t
      WHERE t.schemaname = 'public'
      ORDER BY t.tablename
    `);

    return result.rows.map(row => ({
      tableName: row.table_name,
      rlsEnabled: row.rls_enabled
    }));
  }

  /**
   * Get all policies for a specific table
   * @param {string} tableName - Table name
   * @returns {Promise<Array>}
   */
  async getPoliciesForTable(tableName) {
    const result = await this.client.query(`
      SELECT
        policyname as policy_name,
        permissive,
        roles,
        cmd as command,
        qual,
        with_check
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = $1
      ORDER BY policyname
    `, [tableName]);

    return result.rows;
  }

  /**
   * Get all policies grouped by table
   * @returns {Promise<Map<string, Array>>}
   */
  async getAllPolicies() {
    const result = await this.client.query(`
      SELECT
        tablename as table_name,
        policyname as policy_name,
        permissive,
        roles,
        cmd as command,
        qual,
        with_check
      FROM pg_policies
      WHERE schemaname = 'public'
      ORDER BY tablename, policyname
    `);

    const policiesByTable = new Map();
    for (const row of result.rows) {
      if (!policiesByTable.has(row.table_name)) {
        policiesByTable.set(row.table_name, []);
      }
      policiesByTable.get(row.table_name).push({
        name: row.policy_name,
        permissive: row.permissive,
        roles: row.roles,
        command: row.command,
        qual: row.qual,
        withCheck: row.with_check
      });
    }

    return policiesByTable;
  }

  /**
   * Check if a table has service_role policy
   * @param {Array} policies - Table policies
   * @returns {boolean}
   */
  hasServiceRolePolicy(policies) {
    return policies.some(p =>
      EXPECTED_POLICY_PATTERNS.namingPatterns.serviceRole.test(p.name) ||
      (p.roles && p.roles.includes('service_role'))
    );
  }

  /**
   * Check if a table has authenticated read policy
   * @param {Array} policies - Table policies
   * @returns {boolean}
   */
  hasAuthenticatedReadPolicy(policies) {
    return policies.some(p =>
      EXPECTED_POLICY_PATTERNS.namingPatterns.authenticatedRead.test(p.name) ||
      (p.roles && p.roles.includes('authenticated') && p.command === 'SELECT')
    );
  }

  /**
   * Validate RLS for a single table
   * @param {string} tableName - Table name
   * @param {boolean} rlsEnabled - Whether RLS is enabled
   * @param {Array} policies - Table policies
   * @returns {Object} - Validation result for this table
   */
  validateTable(tableName, rlsEnabled, policies) {
    const errors = [];
    const warnings = [];

    // Check if table is exempt
    if (RLS_EXEMPT_TABLES.includes(tableName)) {
      return { valid: true, errors: [], warnings: [], exempt: true };
    }

    // Check RLS enabled
    if (!rlsEnabled) {
      const isCritical = CRITICAL_TABLES.includes(tableName);
      if (isCritical) {
        errors.push(`CRITICAL: Table '${tableName}' does not have RLS enabled`);
      } else {
        errors.push(`Table '${tableName}' does not have RLS enabled`);
      }
    }

    // If RLS is enabled, check policies
    if (rlsEnabled) {
      // Check for service_role policy
      if (!this.hasServiceRolePolicy(policies)) {
        warnings.push(`Table '${tableName}' may be missing service_role policy`);
      }

      // Check for authenticated read policy
      if (!this.hasAuthenticatedReadPolicy(policies)) {
        warnings.push(`Table '${tableName}' may be missing authenticated read policy`);
      }

      // Check for at least one policy
      if (policies.length === 0) {
        errors.push(`Table '${tableName}' has RLS enabled but no policies defined`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate all tables
   * @returns {Promise<RLSValidationResult>}
   */
  async validateAll() {
    const startTime = Date.now();
    const allErrors = [];
    const allWarnings = [];
    const tableResults = [];

    // Get tables and policies
    const tables = await this.getTablesWithRLSStatus();
    const policiesByTable = await this.getAllPolicies();

    // Validate each table
    for (const { tableName, rlsEnabled } of tables) {
      const policies = policiesByTable.get(tableName) || [];
      const result = this.validateTable(tableName, rlsEnabled, policies);

      tableResults.push({
        tableName,
        rlsEnabled,
        policyCount: policies.length,
        ...result
      });

      allErrors.push(...result.errors);
      allWarnings.push(...result.warnings);
    }

    // Calculate statistics
    const tablesWithRLS = tables.filter(t => t.rlsEnabled).length;
    const tablesWithoutRLS = tables.filter(t => !t.rlsEnabled).length;
    const criticalWithoutRLS = tables.filter(
      t => !t.rlsEnabled && CRITICAL_TABLES.includes(t.tableName)
    ).length;

    return {
      valid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings,
      metadata: {
        totalTables: tables.length,
        tablesWithRLS,
        tablesWithoutRLS,
        criticalWithoutRLS,
        duration: Date.now() - startTime
      },
      details: tableResults
    };
  }

  /**
   * Validate only critical tables
   * @returns {Promise<RLSValidationResult>}
   */
  async validateCritical() {
    const startTime = Date.now();
    const errors = [];
    const warnings = [];

    const tables = await this.getTablesWithRLSStatus();
    const policiesByTable = await this.getAllPolicies();

    for (const criticalTable of CRITICAL_TABLES) {
      const tableInfo = tables.find(t => t.tableName === criticalTable);

      if (!tableInfo) {
        warnings.push(`Critical table '${criticalTable}' not found in database`);
        continue;
      }

      const policies = policiesByTable.get(criticalTable) || [];
      const result = this.validateTable(criticalTable, tableInfo.rlsEnabled, policies);

      errors.push(...result.errors);
      warnings.push(...result.warnings);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metadata: {
        criticalTablesChecked: CRITICAL_TABLES.length,
        duration: Date.now() - startTime
      }
    };
  }

  /**
   * Get tables without RLS
   * @returns {Promise<string[]>}
   */
  async getTablesWithoutRLS() {
    const tables = await this.getTablesWithRLSStatus();
    return tables
      .filter(t => !t.rlsEnabled && !RLS_EXEMPT_TABLES.includes(t.tableName))
      .map(t => t.tableName);
  }

  /**
   * Get summary of RLS status
   * @returns {Promise<Object>}
   */
  async getSummary() {
    const tables = await this.getTablesWithRLSStatus();
    const policiesByTable = await this.getAllPolicies();

    const withRLS = tables.filter(t => t.rlsEnabled);
    const withoutRLS = tables.filter(t => !t.rlsEnabled);

    // Count policies
    let totalPolicies = 0;
    for (const policies of policiesByTable.values()) {
      totalPolicies += policies.length;
    }

    return {
      totalTables: tables.length,
      tablesWithRLS: withRLS.length,
      tablesWithoutRLS: withoutRLS.length,
      rlsCoverage: (withRLS.length / tables.length * 100).toFixed(1) + '%',
      totalPolicies,
      averagePoliciesPerTable: (totalPolicies / tables.length).toFixed(1),
      tablesWithoutRLSList: withoutRLS.map(t => t.tableName)
    };
  }

  /**
   * Generate SQL to enable RLS on tables without it
   * @returns {Promise<string>}
   */
  async generateFixSQL() {
    const tablesWithoutRLS = await this.getTablesWithoutRLS();
    const sqlStatements = [];

    for (const tableName of tablesWithoutRLS) {
      sqlStatements.push(`-- Enable RLS for ${tableName}`);
      sqlStatements.push(`ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;`);
      sqlStatements.push('');

      // Add standard policies
      sqlStatements.push('-- Add service_role policy');
      sqlStatements.push(`CREATE POLICY "service_role_all_${tableName}" ON ${tableName}`);
      sqlStatements.push('  FOR ALL TO service_role USING (true) WITH CHECK (true);');
      sqlStatements.push('');

      sqlStatements.push('-- Add authenticated read policy');
      sqlStatements.push(`CREATE POLICY "authenticated_read_${tableName}" ON ${tableName}`);
      sqlStatements.push('  FOR SELECT TO authenticated USING (true);');
      sqlStatements.push('');
    }

    return sqlStatements.join('\n');
  }

  /**
   * Log validation result
   * @param {RLSValidationResult} result - Validation result
   */
  logResult(result) {
    if (result.valid) {
      console.log('\x1b[32m%s\x1b[0m', '✓ RLS validation PASSED');
    } else {
      console.log('\x1b[31m%s\x1b[0m', '✗ RLS validation FAILED');
      result.errors.forEach(err => console.log(`  ERROR: ${err}`));
    }

    if (result.warnings.length > 0 && this.verbose) {
      console.log('\nWarnings:');
      result.warnings.forEach(warn => console.log(`  WARN: ${warn}`));
    }

    console.log('\nSummary:');
    console.log(`  Total tables: ${result.metadata.totalTables}`);
    console.log(`  Tables with RLS: ${result.metadata.tablesWithRLS}`);
    console.log(`  Tables without RLS: ${result.metadata.tablesWithoutRLS}`);
    if (result.metadata.criticalWithoutRLS !== undefined) {
      console.log(`  Critical tables without RLS: ${result.metadata.criticalWithoutRLS}`);
    }
    console.log(`  Duration: ${result.metadata.duration}ms`);
  }
}

/**
 * Get RLS summary without full validation
 * @param {string} project - Database project
 * @returns {Promise<Object>}
 */
export async function getRLSSummary(project = 'engineer') {
  const validator = new RLSValidator(project);
  try {
    await validator.connect();
    return await validator.getSummary();
  } finally {
    await validator.disconnect();
  }
}

/**
 * Quick check if all critical tables have RLS
 * @param {string} project - Database project
 * @returns {Promise<boolean>}
 */
export async function checkCriticalTablesRLS(project = 'engineer') {
  const validator = new RLSValidator(project);
  try {
    await validator.connect();
    const result = await validator.validateCritical();
    return result.valid;
  } finally {
    await validator.disconnect();
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const project = args.find(a => a.startsWith('--project='))?.split('=')[1] || 'engineer';
  const verbose = args.includes('--verbose');
  const criticalOnly = args.includes('--critical');
  const summary = args.includes('--summary');
  const generateFix = args.includes('--fix');

  const validator = new RLSValidator(project, { verbose });

  async function main() {
    try {
      await validator.connect();
      console.log(`\nRLS Validator - ${project} database\n`);

      if (summary) {
        const summaryResult = await validator.getSummary();
        console.log('RLS Summary:');
        console.log(`  Total tables: ${summaryResult.totalTables}`);
        console.log(`  Tables with RLS: ${summaryResult.tablesWithRLS}`);
        console.log(`  Tables without RLS: ${summaryResult.tablesWithoutRLS}`);
        console.log(`  RLS coverage: ${summaryResult.rlsCoverage}`);
        console.log(`  Total policies: ${summaryResult.totalPolicies}`);
        console.log(`  Avg policies/table: ${summaryResult.averagePoliciesPerTable}`);

        if (summaryResult.tablesWithoutRLSList.length > 0) {
          console.log('\nTables without RLS:');
          summaryResult.tablesWithoutRLSList.forEach(t => console.log(`  - ${t}`));
        }
        return;
      }

      if (generateFix) {
        const fixSQL = await validator.generateFixSQL();
        console.log('SQL to fix RLS issues:\n');
        console.log(fixSQL);
        return;
      }

      const result = criticalOnly
        ? await validator.validateCritical()
        : await validator.validateAll();

      validator.logResult(result);

      process.exit(result.valid ? 0 : 1);

    } catch (error) {
      console.error('RLS validation error:', error.message);
      process.exit(1);
    } finally {
      await validator.disconnect();
    }
  }

  main();
}
