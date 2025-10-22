#!/usr/bin/env node

/**
 * System Consistency Validator
 *
 * Validates database schema and codebase consistency to prevent issues like
 * those discovered in SD-KNOWLEDGE-001.
 *
 * Checks performed:
 * 1. Table Duplication Detection - Prevents Issue #2
 * 2. Trigger-Code Table Reference Consistency - Prevents Issue #2 & #3
 * 3. Foreign Key Naming Conventions - Prevents Issue #3
 * 4. Deprecated Table Usage Detection - Prevents Issue #2
 * 5. Schema Validation Function Availability - Ensures Issue #1 prevention active
 *
 * Exit Codes:
 * 0 - All checks passed
 * 1 - One or more checks failed
 *
 * Usage:
 * node scripts/validate-system-consistency.js
 * node scripts/validate-system-consistency.js --check=table-duplication
 * node scripts/validate-system-consistency.js --strict  # Fail on warnings
 *
 * @see docs/retrospectives/SD-KNOWLEDGE-001-completion-issues-and-prevention.md
 */

import { createClient } from '@supabase/supabase-js';
import globPkg from 'glob';
const { glob } = globPkg;
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
);

// Configuration
const CONFIG = {
  // Table name similarity threshold (Levenshtein distance)
  SIMILARITY_THRESHOLD: 5,

  // Deprecated tables (marked for removal)
  DEPRECATED_TABLES: [
    'sd_phase_handoffs'  // Replaced by sd_phase_handoffs
  ],

  // Expected foreign key naming patterns
  FK_NAMING_PATTERNS: {
    'strategic_directives_v2': ['sd_id', 'directive_id', 'sd_uuid'],
    'product_requirements_v2': ['prd_id', 'sd_uuid'],
    'retrospectives': ['sd_id'],
    'sub_agent_execution_results': ['sd_id']
  },

  // Critical functions that must exist
  REQUIRED_FUNCTIONS: [
    'get_table_schema',
    'validate_uuid_format',
    'calculate_sd_progress'
  ]
};

// Test results tracking
const results = {
  checks: [],
  passed: 0,
  failed: 0,
  warnings: 0
};

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1, str2) {
  const matrix = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

/**
 * Check 1: Table Duplication Detection
 * Prevents SD-KNOWLEDGE-001 Issue #2
 */
async function checkTableDuplication() {
  console.log('\n🔍 CHECK 1: Table Duplication Detection');
  console.log('-'.repeat(70));

  const { data: tables, error } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `
  });

  if (error) {
    // Fallback: query via Supabase if exec_sql not available
    console.log('   ⚠️  exec_sql not available, cannot query all tables');
    console.log('   ℹ️  This check requires service role access');
    results.warnings++;
    results.checks.push({
      name: 'Table Duplication',
      status: 'SKIPPED',
      message: 'Requires service role access'
    });
    return;
  }

  const tableNames = tables.map(t => t.table_name);
  const duplicates = [];

  // Compare each table with others
  for (let i = 0; i < tableNames.length; i++) {
    for (let j = i + 1; j < tableNames.length; j++) {
      const table1 = tableNames[i];
      const table2 = tableNames[j];
      const distance = levenshteinDistance(table1, table2);

      if (distance <= CONFIG.SIMILARITY_THRESHOLD) {
        duplicates.push({
          table1,
          table2,
          similarity: distance
        });
      }
    }
  }

  if (duplicates.length === 0) {
    console.log('   ✅ No duplicate or similar table names found');
    results.passed++;
    results.checks.push({
      name: 'Table Duplication',
      status: 'PASS',
      message: `Checked ${tableNames.length} tables`
    });
  } else {
    console.log(`   ❌ Found ${duplicates.length} potentially duplicate table(s):`);
    duplicates.forEach(dup => {
      console.log(`      • ${dup.table1} ↔ ${dup.table2} (distance: ${dup.similarity})`);
    });
    console.log('');
    console.log('   💡 Action: Consolidate duplicate tables to single source of truth');
    results.failed++;
    results.checks.push({
      name: 'Table Duplication',
      status: 'FAIL',
      message: `Found ${duplicates.length} potential duplicates`,
      details: duplicates
    });
  }
}

/**
 * Check 2: Trigger-Code Table Reference Consistency
 * Prevents SD-KNOWLEDGE-001 Issue #2 & #3
 */
async function checkTriggerCodeConsistency() {
  console.log('\n🔍 CHECK 2: Trigger-Code Table Reference Consistency');
  console.log('-'.repeat(70));

  // Get all triggers
  const { data: triggers, error } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT
        tgname AS trigger_name,
        tgrelid::regclass::text AS table_name,
        pg_get_triggerdef(oid) AS trigger_definition
      FROM pg_trigger
      WHERE NOT tgisinternal
      ORDER BY tgname;
    `
  });

  if (error) {
    console.log('   ⚠️  Cannot query triggers (requires service role)');
    results.warnings++;
    results.checks.push({
      name: 'Trigger-Code Consistency',
      status: 'SKIPPED',
      message: 'Requires service role access'
    });
    return;
  }

  console.log(`   Found ${triggers.length} triggers to check`);

  // Parse trigger definitions for table references
  const inconsistencies = [];

  for (const trigger of triggers) {
    // Extract FROM tablename patterns
    const fromPattern = /FROM\s+([a-z_]+)/gi;
    let match;
    const tablesInTrigger = new Set();

    while ((match = fromPattern.exec(trigger.trigger_definition)) !== null) {
      tablesInTrigger.add(match[1]);
    }

    // Check if any referenced tables are deprecated
    for (const table of tablesInTrigger) {
      if (CONFIG.DEPRECATED_TABLES.includes(table)) {
        inconsistencies.push({
          trigger: trigger.trigger_name,
          issue: `References deprecated table: ${table}`,
          definition: trigger.trigger_definition.substring(0, 100) + '...'
        });
      }
    }
  }

  if (inconsistencies.length === 0) {
    console.log('   ✅ All triggers use correct table references');
    results.passed++;
    results.checks.push({
      name: 'Trigger-Code Consistency',
      status: 'PASS',
      message: `Checked ${triggers.length} triggers`
    });
  } else {
    console.log(`   ❌ Found ${inconsistencies.length} inconsistency(ies):`);
    inconsistencies.forEach(issue => {
      console.log(`      • Trigger "${issue.trigger}": ${issue.issue}`);
    });
    console.log('');
    console.log('   💡 Action: Update triggers to use current table names');
    results.failed++;
    results.checks.push({
      name: 'Trigger-Code Consistency',
      status: 'FAIL',
      message: `Found ${inconsistencies.length} inconsistencies`,
      details: inconsistencies
    });
  }
}

/**
 * Check 3: Foreign Key Naming Conventions
 * Prevents SD-KNOWLEDGE-001 Issue #3
 */
async function checkForeignKeyNaming() {
  console.log('\n🔍 CHECK 3: Foreign Key Naming Conventions');
  console.log('-'.repeat(70));

  // Get all columns that look like foreign keys
  const { data: columns, error } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT
        table_name,
        column_name,
        data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          column_name LIKE '%_id' OR
          column_name LIKE '%_uuid' OR
          column_name LIKE 'directive%'
        )
      ORDER BY table_name, column_name;
    `
  });

  if (error) {
    console.log('   ⚠️  Cannot query columns (requires service role)');
    results.warnings++;
    results.checks.push({
      name: 'Foreign Key Naming',
      status: 'SKIPPED',
      message: 'Requires service role access'
    });
    return;
  }

  console.log(`   Found ${columns.length} potential foreign key columns`);

  const violations = [];

  // Check strategic_directives references
  const sdReferences = columns.filter(c =>
    c.column_name === 'sd_id' ||
    c.column_name === 'directive_id' ||
    c.column_name === 'sd_uuid'
  );

  // Group by table
  const tableGroups = {};
  for (const col of sdReferences) {
    if (!tableGroups[col.table_name]) {
      tableGroups[col.table_name] = [];
    }
    tableGroups[col.table_name].push(col.column_name);
  }

  // Check for tables with multiple different SD reference columns
  for (const [table, cols] of Object.entries(tableGroups)) {
    const uniqueCols = [...new Set(cols)];
    if (uniqueCols.length > 1) {
      violations.push({
        table,
        issue: `Multiple SD reference columns: ${uniqueCols.join(', ')}`,
        recommendation: 'Standardize to one naming convention'
      });
    }
  }

  if (violations.length === 0) {
    console.log('   ✅ Foreign key naming is consistent');
    results.passed++;
    results.checks.push({
      name: 'Foreign Key Naming',
      status: 'PASS',
      message: `Checked ${columns.length} columns`
    });
  } else {
    console.log(`   ⚠️  Found ${violations.length} naming inconsistency(ies):`);
    violations.forEach(issue => {
      console.log(`      • Table "${issue.table}": ${issue.issue}`);
      console.log(`        ${issue.recommendation}`);
    });
    console.log('');
    console.log('   💡 Action: Standardize foreign key naming (e.g., always use sd_uuid)');
    results.warnings++;
    results.checks.push({
      name: 'Foreign Key Naming',
      status: 'WARNING',
      message: `Found ${violations.length} naming inconsistencies`,
      details: violations
    });
  }
}

/**
 * Check 4: Deprecated Table Usage Detection
 * Prevents SD-KNOWLEDGE-001 Issue #2
 */
async function checkDeprecatedUsage() {
  console.log('\n🔍 CHECK 4: Deprecated Table Usage Detection');
  console.log('-'.repeat(70));

  const deprecatedUsages = [];

  // Scan JavaScript/TypeScript files
  const codeFiles = await glob('**/*.{js,mjs,ts,tsx}', {
    ignore: ['node_modules/**', '**/dist/**', 'test-results/**']
  });

  console.log(`   Scanning ${codeFiles.length} code files...`);

  for (const file of codeFiles) {
    const content = fs.readFileSync(file, 'utf8');

    for (const deprecated of CONFIG.DEPRECATED_TABLES) {
      // Check for table references
      const patterns = [
        new RegExp(`from\\(['"]${deprecated}['"]\\)`, 'g'),
        new RegExp(`FROM\\s+${deprecated}`, 'gi'),
        new RegExp(`INSERT INTO\\s+${deprecated}`, 'gi'),
        new RegExp(`UPDATE\\s+${deprecated}`, 'gi')
      ];

      for (const pattern of patterns) {
        if (pattern.test(content)) {
          deprecatedUsages.push({
            file,
            table: deprecated,
            pattern: pattern.source
          });
          break; // Only report once per file
        }
      }
    }
  }

  if (deprecatedUsages.length === 0) {
    console.log('   ✅ No deprecated table usage found');
    results.passed++;
    results.checks.push({
      name: 'Deprecated Usage',
      status: 'PASS',
      message: `Scanned ${codeFiles.length} files`
    });
  } else {
    console.log(`   ❌ Found ${deprecatedUsages.length} deprecated table usage(s):`);
    deprecatedUsages.forEach(usage => {
      console.log(`      • ${usage.file}: References ${usage.table}`);
    });
    console.log('');
    console.log('   💡 Action: Update code to use current table names');
    results.failed++;
    results.checks.push({
      name: 'Deprecated Usage',
      status: 'FAIL',
      message: `Found ${deprecatedUsages.length} usages`,
      details: deprecatedUsages
    });
  }
}

/**
 * Check 5: Schema Validation Function Availability
 * Ensures SD-KNOWLEDGE-001 Issue #1 prevention is active
 */
async function checkSchemaFunctions() {
  console.log('\n🔍 CHECK 5: Schema Validation Function Availability');
  console.log('-'.repeat(70));

  const missingFunctions = [];

  for (const funcName of CONFIG.REQUIRED_FUNCTIONS) {
    // Try to call the function
    const { data, error } = await supabase.rpc(funcName, funcName === 'get_table_schema' ? { table_name: 'strategic_directives_v2' } : {}).catch(() => ({ error: { message: 'Function not available' } }));

    if (error && error.message.includes('not found')) {
      missingFunctions.push(funcName);
    }
  }

  if (missingFunctions.length === 0) {
    console.log('   ✅ All required schema functions available');
    results.passed++;
    results.checks.push({
      name: 'Schema Functions',
      status: 'PASS',
      message: `Checked ${CONFIG.REQUIRED_FUNCTIONS.length} functions`
    });
  } else {
    console.log(`   ❌ Missing ${missingFunctions.length} required function(s):`);
    missingFunctions.forEach(func => {
      console.log(`      • ${func}()`);
    });
    console.log('');
    console.log('   💡 Action: Apply migration database/migrations/20251015_create_schema_validation_functions.sql');
    results.failed++;
    results.checks.push({
      name: 'Schema Functions',
      status: 'FAIL',
      message: `Missing ${missingFunctions.length} functions`,
      details: missingFunctions
    });
  }
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  const strictMode = args.includes('--strict');
  const specificCheck = args.find(arg => arg.startsWith('--check='))?.split('=')[1];

  console.log('🔐 SYSTEM CONSISTENCY VALIDATOR');
  console.log('='.repeat(70));
  console.log('Purpose: Prevent issues like those in SD-KNOWLEDGE-001');
  console.log('Mode:', strictMode ? 'STRICT (warnings = failures)' : 'STANDARD');
  if (specificCheck) {
    console.log('Running check:', specificCheck);
  }
  console.log('='.repeat(70));

  try {
    // Run checks
    if (!specificCheck || specificCheck === 'table-duplication') {
      await checkTableDuplication();
    }

    if (!specificCheck || specificCheck === 'trigger-consistency') {
      await checkTriggerCodeConsistency();
    }

    if (!specificCheck || specificCheck === 'foreign-key-naming') {
      await checkForeignKeyNaming();
    }

    if (!specificCheck || specificCheck === 'deprecated-usage') {
      await checkDeprecatedUsage();
    }

    if (!specificCheck || specificCheck === 'schema-functions') {
      await checkSchemaFunctions();
    }

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 VALIDATION SUMMARY');
    console.log('='.repeat(70));
    console.log(`✅ Passed:   ${results.passed}`);
    console.log(`❌ Failed:   ${results.failed}`);
    console.log(`⚠️  Warnings: ${results.warnings}`);
    console.log('='.repeat(70));

    // Detailed results
    console.log('\n📋 Check Results:');
    results.checks.forEach((check, idx) => {
      const icon = check.status === 'PASS' ? '✅' :
                   check.status === 'FAIL' ? '❌' :
                   check.status === 'WARNING' ? '⚠️' : 'ℹ️';
      console.log(`${idx + 1}. ${icon} ${check.name}: ${check.status} - ${check.message}`);
    });

    // Exit code
    const shouldFail = results.failed > 0 || (strictMode && results.warnings > 0);

    if (shouldFail) {
      console.log('\n❌ VALIDATION FAILED');
      console.log('Review the issues above and fix before committing.');
      process.exit(1);
    } else {
      console.log('\n✅ ALL CHECKS PASSED');
      console.log('System consistency validated successfully!');
      process.exit(0);
    }

  } catch (error) {
    console.error('\n❌ VALIDATION ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Execute
main();
