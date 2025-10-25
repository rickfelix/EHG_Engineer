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

// Table exclusion patterns (system tables, internal tables)
const EXCLUDED_TABLE_PATTERNS = [
  /^pg_/,           // PostgreSQL system tables
  /^_pg/,           // PostgreSQL internal tables
  /^agent_/,        // Agent coordination tables
  /^documentation_/, // Documentation tables
  /^compliance_alerts$/, // Internal compliance table
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
      tables_with_incomplete_policies: 0,
      policy_coverage_percentage: 0,
      passed: false,
      failed_tables: [],
      warnings: [],
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
      this.client = new Client({
        connectionString: CONFIG.connectionString,
        ssl: { rejectUnauthorized: false },
        statement_timeout: CONFIG.statementTimeout,
        connectionTimeoutMillis: CONFIG.connectionTimeoutMillis
      });

      await this.client.connect();
      console.log('✅ Connected to database');
      return true;
    } catch (error) {
      if (attempt < CONFIG.maxRetries) {
        console.warn(`⚠️  Connection attempt ${attempt} failed, retrying in ${CONFIG.retryDelayMs}ms...`);
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
      status: 'PASS',
      issues: []
    };

    // Check if RLS is enabled
    if (!table.rls_enabled) {
      verification.status = 'FAIL';
      verification.issues.push('RLS not enabled on table');
      this.results.tables_missing_rls++;
      return verification;
    }

    // Check if policies exist
    if (verification.policy_count === 0) {
      verification.status = 'FAIL';
      verification.issues.push('RLS enabled but no policies defined');
      this.results.tables_missing_rls++;
      return verification;
    }

    // Check for CRUD policy coverage
    const requiredCommands = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
    const existingCommands = new Set(
      verification.policies.map(p => p.command.toUpperCase())
    );

    requiredCommands.forEach(cmd => {
      if (!existingCommands.has(cmd)) {
        verification.missing_policies.push(cmd);
      }
    });

    if (verification.missing_policies.length > 0) {
      verification.status = 'WARNING';
      verification.issues.push(`Incomplete policy coverage: missing ${verification.missing_policies.join(', ')}`);
      this.results.tables_with_incomplete_policies++;
    } else {
      this.results.tables_with_rls++;
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
        } else if (verification.status === 'WARNING') {
          this.results.warnings.push(verification);
          console.log(`⚠️  ${verification.table_name}: ${verification.issues.join(', ')}`);
        } else {
          console.log(`✅ ${verification.table_name}: ${verification.policy_count} policies`);
        }
      });

      // Calculate coverage percentage
      this.results.policy_coverage_percentage = this.results.total_tables_checked > 0
        ? Math.round((this.results.tables_with_rls / this.results.total_tables_checked) * 100)
        : 0;

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
    console.log('SUMMARY:');
    console.log(`  Total Tables Checked: ${this.results.total_tables_checked}`);
    console.log(`  ✅ Tables with RLS: ${this.results.tables_with_rls}`);
    console.log(`  ❌ Tables Missing RLS: ${this.results.tables_missing_rls}`);
    console.log(`  ⚠️  Tables with Incomplete Policies: ${this.results.tables_with_incomplete_policies}`);
    console.log(`  Coverage: ${this.results.policy_coverage_percentage}%`);
    console.log('');

    if (this.results.failed_tables.length > 0) {
      console.log('FAILED TABLES:');
      this.results.failed_tables.forEach(table => {
        console.log(`  ❌ ${table.table_name}:`);
        table.issues.forEach(issue => console.log(`     - ${issue}`));
      });
      console.log('');
    }

    if (this.results.warnings.length > 0) {
      console.log('WARNINGS:');
      this.results.warnings.forEach(table => {
        console.log(`  ⚠️  ${table.table_name}:`);
        table.issues.forEach(issue => console.log(`     - ${issue}`));
        if (table.missing_policies.length > 0) {
          console.log(`     Missing: ${table.missing_policies.join(', ')}`);
        }
      });
      console.log('');
    }

    console.log('VERDICT:');
    if (this.results.passed) {
      console.log('  ✅ ALL TABLES HAVE RLS POLICIES');
    } else {
      console.log('  ❌ RLS POLICY VERIFICATION FAILED');
      console.log(`  ${this.results.tables_missing_rls} table(s) require RLS policies`);
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
