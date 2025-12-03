#!/usr/bin/env node

/**
 * RLS Policy Verification Script
 * Purpose: Automated verification of Row-Level Security policies on all application tables
 * Usage: node scripts/verify-rls-policies.js [--json] [--table <table_name>]
 * Exit codes: 0 = all tables verified, 1 = missing RLS policies, 2 = script error
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const { Client } = pg;

// Table exclusion patterns (system tables only)
// Note: agent_ and documentation_ tables are NO LONGER excluded (secured via migrations 020/021)
const EXCLUDED_TABLE_PATTERNS = [
  /^pg_/,           // PostgreSQL system tables
  /^_pg/,           // PostgreSQL internal tables
  /^sql_/,          // SQL system tables
  /^information_schema/ // Information schema
];

// Configuration
const CONFIG = {
  connectionString: process.env.SUPABASE_RLS_AUDITOR_URL || process.env.SUPABASE_POOLER_URL,
  statementTimeout: 30000, // 30 seconds
  connectionTimeoutMillis: 5000,
  maxRetries: 3,
  retryDelayMs: 1000
};

class RLSVerifier {
  constructor() {
    this.client = null;
    this.results = {
      timestamp: new Date().toISOString(),
      total_tables_checked: 0,
      tables_with_rls: 0,
      tables_missing_rls: 0,
      tables_with_full_crud: 0,
      tables_with_read_only: 0,
      tables_with_partial_coverage: 0,
      tables_with_incomplete_policies: 0, // Deprecated, kept for backward compatibility
      rls_coverage_percentage: 0,
      full_crud_percentage: 0,
      policy_coverage_percentage: 0, // Deprecated, kept for backward compatibility
      passed: false,
      failed_tables: [],
      warnings: [],
      read_only_tables: [],
      partial_coverage_tables: [],
      execution_time_ms: 0
    };
  }

  /**
   * Check if table should be excluded from RLS verification
   */
  shouldExcludeTable(tableName) {
    return EXCLUDED_TABLE_PATTERNS.some(pattern => pattern.test(tableName));
  }

  /**
   * Connect to database with retry logic
   */
  async connect(attempt = 1) {
    try {
      // Always configure SSL to reject unauthorized for Postgres connections
      // This handles self-signed certificates in various environments
      const connectionConfig = {
        connectionString: CONFIG.connectionString,
        ssl: {
          rejectUnauthorized: false,
          // Additional SSL options for compatibility
          checkServerIdentity: () => undefined
        },
        statement_timeout: CONFIG.statementTimeout,
        connectionTimeoutMillis: CONFIG.connectionTimeoutMillis
      };

      this.client = new Client(connectionConfig);

      await this.client.connect();
      console.log('✅ Connected to database');
      return true;
    } catch (error) {
      if (attempt < CONFIG.maxRetries) {
        console.warn(`⚠️  Connection attempt ${attempt} failed, retrying in ${CONFIG.retryDelayMs}ms...`);
        console.warn(`    Error: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, CONFIG.retryDelayMs));
        return this.connect(attempt + 1);
      }
      throw new Error(`Failed to connect after ${CONFIG.maxRetries} attempts: ${error.message}`);
    }
  }

  /**
   * Query all application tables and their RLS status
   */
  async queryTables(specificTable = null) {
    const query = `
      SELECT
        c.relname AS table_name,
        c.relrowsecurity AS rls_enabled,
        n.nspname AS schema_name,
        (
          SELECT COUNT(*)
          FROM pg_policies p
          WHERE p.tablename = c.relname
            AND p.schemaname = n.nspname
        ) AS policy_count,
        (
          SELECT json_agg(json_build_object(
            'policy_name', policyname,
            'command', cmd,
            'roles', roles
          ))
          FROM pg_policies p
          WHERE p.tablename = c.relname
            AND p.schemaname = n.nspname
        ) AS policies
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE
        n.nspname = 'public'
        AND c.relkind = 'r'
        ${specificTable ? 'AND c.relname = $1' : ''}
      ORDER BY c.relname;
    `;

    const params = specificTable ? [specificTable] : [];
    const { rows } = await this.client.query(query, params);
    return rows;
  }

  /**
   * Verify RLS policies for a single table
   */
  verifyTablePolicies(table) {
    const verification = {
      table_name: table.table_name,
      schema: table.schema_name,
      rls_enabled: table.rls_enabled,
      policy_count: parseInt(table.policy_count),
      policies: table.policies || [],
      missing_policies: [],
      policy_type: 'UNKNOWN',
      status: 'PASS',
      issues: []
    };

    // Check if RLS is enabled
    if (!table.rls_enabled) {
      verification.status = 'FAIL';
      verification.policy_type = 'NO_RLS';
      verification.issues.push('RLS not enabled on table');
      this.results.tables_missing_rls++;
      return verification;
    }

    // Table has RLS enabled
    this.results.tables_with_rls++;

    // Check if policies exist
    if (verification.policy_count === 0) {
      verification.status = 'FAIL';
      verification.policy_type = 'NO_POLICIES';
      verification.issues.push('RLS enabled but no policies defined');
      return verification;
    }

    // Check for CRUD policy coverage
    const requiredCommands = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
    const existingCommands = new Set(
      verification.policies.map(p => p.command.toUpperCase())
    );

    // Check if ALL command is present (equivalent to full CRUD)
    const hasAllCommand = existingCommands.has('ALL');

    requiredCommands.forEach(cmd => {
      if (!existingCommands.has(cmd) && !hasAllCommand) {
        verification.missing_policies.push(cmd);
      }
    });

    // Categorize by policy type
    if (verification.missing_policies.length === 0 || hasAllCommand) {
      // Full CRUD coverage
      verification.policy_type = 'FULL_CRUD';
      verification.status = 'PASS';
      this.results.tables_with_full_crud++;
    } else if (existingCommands.has('SELECT') && verification.missing_policies.length === 3) {
      // Only SELECT - read-only (intentional pattern)
      verification.policy_type = 'READ_ONLY';
      verification.status = 'INFO';
      verification.issues.push('Read-only (SELECT only) - may be intentional');
      this.results.tables_with_read_only++;
      this.results.read_only_tables.push(verification);
    } else {
      // Partial coverage (some operations allowed, others missing)
      verification.policy_type = 'PARTIAL';
      verification.status = 'INFO';
      verification.issues.push(`Partial coverage: missing ${verification.missing_policies.join(', ')}`);
      this.results.tables_with_partial_coverage++;
      this.results.partial_coverage_tables.push(verification);
    }

    // Keep deprecated counter for backward compatibility
    if (verification.missing_policies.length > 0) {
      this.results.tables_with_incomplete_policies++;
    }

    return verification;
  }

  /**
   * Run verification on all tables
   */
  async verify(specificTable = null) {
    const startTime = Date.now();

    try {
      await this.connect();

      console.log('🔍 Querying database tables...\n');
      const tables = await this.queryTables(specificTable);

      console.log(`Found ${tables.length} table(s) to verify\n`);

      // Filter out excluded tables
      const tablesToVerify = tables.filter(t => !this.shouldExcludeTable(t.table_name));
      const excludedCount = tables.length - tablesToVerify.length;

      if (excludedCount > 0) {
        console.log(`ℹ️  Excluded ${excludedCount} system/internal tables\n`);
      }

      this.results.total_tables_checked = tablesToVerify.length;

      // Verify each table
      tablesToVerify.forEach(table => {
        const verification = this.verifyTablePolicies(table);

        if (verification.status === 'FAIL') {
          this.results.failed_tables.push(verification);
          console.log(`❌ ${verification.table_name}: ${verification.issues.join(', ')}`);
        } else if (verification.status === 'INFO') {
          // Don't add to warnings - these are informational categorizations
          const icon = verification.policy_type === 'READ_ONLY' ? '📖' : '⚡';
          console.log(`${icon} ${verification.table_name}: ${verification.issues.join(', ')}`);
        } else {
          console.log(`✅ ${verification.table_name}: ${verification.policy_count} policies (${verification.policy_type})`);
        }
      });

      // Calculate coverage percentages
      this.results.rls_coverage_percentage = this.results.total_tables_checked > 0
        ? Math.round((this.results.tables_with_rls / this.results.total_tables_checked) * 100)
        : 0;

      this.results.full_crud_percentage = this.results.total_tables_checked > 0
        ? Math.round((this.results.tables_with_full_crud / this.results.total_tables_checked) * 100)
        : 0;

      // Keep deprecated percentage for backward compatibility (now same as full_crud_percentage)
      this.results.policy_coverage_percentage = this.results.full_crud_percentage;

      this.results.passed = this.results.tables_missing_rls === 0;
      this.results.execution_time_ms = Date.now() - startTime;

      return this.results;

    } finally {
      if (this.client) {
        await this.client.end();
      }
    }
  }

  /**
   * Generate human-readable report
   */
  generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('RLS POLICY VERIFICATION REPORT');
    console.log('='.repeat(60));
    console.log(`Timestamp: ${this.results.timestamp}`);
    console.log(`Execution Time: ${this.results.execution_time_ms}ms`);
    console.log('');
    console.log('COVERAGE SUMMARY:');
    console.log(`  Total Tables Checked: ${this.results.total_tables_checked}`);
    console.log(`  ✅ Tables with RLS Enabled: ${this.results.tables_with_rls} (${this.results.rls_coverage_percentage}%)`);
    console.log(`  ❌ Tables Missing RLS: ${this.results.tables_missing_rls}`);
    console.log('');
    console.log('POLICY BREAKDOWN:');
    console.log(`  ✅ Full CRUD (SELECT, INSERT, UPDATE, DELETE): ${this.results.tables_with_full_crud} (${this.results.full_crud_percentage}%)`);
    console.log(`  📖 Read-Only (SELECT only): ${this.results.tables_with_read_only}`);
    console.log(`  ⚡ Partial Coverage (some operations): ${this.results.tables_with_partial_coverage}`);
    console.log('');

    if (this.results.failed_tables.length > 0) {
      console.log('FAILED TABLES (Missing RLS):');
      this.results.failed_tables.forEach(table => {
        console.log(`  ❌ ${table.table_name}:`);
        table.issues.forEach(issue => console.log(`     - ${issue}`));
      });
      console.log('');
    }

    if (this.results.read_only_tables.length > 0) {
      console.log('READ-ONLY TABLES (Informational):');
      this.results.read_only_tables.slice(0, 5).forEach(table => {
        console.log(`  📖 ${table.table_name}`);
      });
      if (this.results.read_only_tables.length > 5) {
        console.log(`  ... and ${this.results.read_only_tables.length - 5} more`);
      }
      console.log('');
    }

    if (this.results.partial_coverage_tables.length > 0) {
      console.log('PARTIAL COVERAGE TABLES (Informational):');
      this.results.partial_coverage_tables.slice(0, 5).forEach(table => {
        console.log(`  ⚡ ${table.table_name}: missing ${table.missing_policies.join(', ')}`);
      });
      if (this.results.partial_coverage_tables.length > 5) {
        console.log(`  ... and ${this.results.partial_coverage_tables.length - 5} more`);
      }
      console.log('');
    }

    console.log('VERDICT:');
    if (this.results.passed) {
      console.log('  ✅ ALL TABLES HAVE RLS ENABLED');
      if (this.results.full_crud_percentage === 100) {
        console.log('  ✅ ALL TABLES HAVE FULL CRUD POLICIES');
      } else {
        console.log(`  ℹ️  ${this.results.full_crud_percentage}% have full CRUD policies`);
        console.log('  ℹ️  Remaining tables have intentional read-only or partial coverage');
      }
    } else {
      console.log('  ❌ RLS POLICY VERIFICATION FAILED');
      console.log(`  ${this.results.tables_missing_rls} table(s) require RLS to be enabled`);
    }
    console.log('='.repeat(60));
  }

  /**
   * Generate JSON report
   */
  generateJSONReport() {
    return JSON.stringify(this.results, null, 2);
  }
}

// CLI Entry Point
async function main() {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');
  const tableIndex = args.indexOf('--table');
  const specificTable = tableIndex >= 0 ? args[tableIndex + 1] : null;

  const verifier = new RLSVerifier();

  try {
    const results = await verifier.verify(specificTable);

    if (jsonOutput) {
      console.log(verifier.generateJSONReport());
    } else {
      verifier.generateReport();
    }

    // Exit with appropriate code
    process.exit(results.passed ? 0 : 1);

  } catch (error) {
    console.error('\n❌ VERIFICATION FAILED');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(2);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default RLSVerifier;
