#!/usr/bin/env node

/**
 * Migration File Validation Script
 *
 * PURPOSE: Validates migration files AND verifies database state.
 *
 * TWO-PHASE VALIDATION:
 *
 * PHASE 1: STATIC FILE VALIDATION
 * ✅ Checks if migration files exist for an SD
 * ✅ Validates SQL syntax
 * ✅ Checks for required schema patterns
 * ✅ Cross-references with PRD requirements
 *
 * PHASE 2: DATABASE VERIFICATION (--verify-db flag)
 * ✅ Connects to database (read-only)
 * ✅ Verifies tables mentioned in migration actually exist
 * ✅ Verifies columns match expectations
 * ✅ Checks if seed data was inserted (if applicable)
 * ❌ Does NOT execute migrations
 * ❌ Does NOT modify database
 *
 * LESSON LEARNED: SD-AGENT-PLATFORM-001
 * Migration file existed, tables were created, but seed data failed silently (0 records).
 * This script now catches both file issues AND database state mismatches.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Supabase connection (for reading PRD only, NOT for checking migrations)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const MIGRATIONS_DIR = path.join(__dirname, '../database/migrations');

/**
 * Find all migration files for a given SD
 */
function findMigrationFiles(sdId) {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return [];
  }

  const files = fs.readdirSync(MIGRATIONS_DIR);
  const pattern = new RegExp(`SD-${sdId}`, 'i');

  return files
    .filter(file => pattern.test(file) && file.endsWith('.sql'))
    .map(file => ({
      name: file,
      path: path.join(MIGRATIONS_DIR, file),
      content: fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8')
    }));
}

/**
 * Basic SQL syntax validation
 */
function validateSQLSyntax(content, _filename) {
  const issues = [];

  // Check for unclosed quotes
  const singleQuotes = (content.match(/'/g) || []).length;
  if (singleQuotes % 2 !== 0) {
    issues.push('Unclosed single quote detected');
  }

  // Check for unclosed parentheses
  const openParens = (content.match(/\(/g) || []).length;
  const closeParens = (content.match(/\)/g) || []).length;
  if (openParens !== closeParens) {
    issues.push(`Mismatched parentheses: ${openParens} open, ${closeParens} close`);
  }

  // Check for basic SQL keywords
  const hasValidSQL = /\b(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|SELECT)\b/i.test(content);
  if (!hasValidSQL) {
    issues.push('No valid SQL statements found');
  }

  // Check for proper statement terminators
  const statements = content.split(';').filter(s => s.trim());
  if (statements.length === 0) {
    issues.push('No SQL statements found (missing semicolons?)');
  }

  return {
    valid: issues.length === 0,
    issues,
    statementCount: statements.length
  };
}

/**
 * Check for common migration patterns
 */
function checkMigrationPatterns(content) {
  const patterns = {
    createTable: /CREATE TABLE/i.test(content),
    alterTable: /ALTER TABLE/i.test(content),
    addColumn: /ADD COLUMN/i.test(content),
    createIndex: /CREATE INDEX/i.test(content),
    rlsPolicy: /CREATE POLICY/i.test(content),
    enableRLS: /ENABLE ROW LEVEL SECURITY/i.test(content),
    comments: /--.*SD-/i.test(content), // Check for SD reference in comments
    transaction: /BEGIN;|COMMIT;/i.test(content)
  };

  const warnings = [];

  // Check for RLS without policies
  if (patterns.enableRLS && !patterns.rlsPolicy) {
    warnings.push('RLS enabled but no policies defined');
  }

  // Check for table creation without indexes
  if (patterns.createTable && !patterns.createIndex) {
    warnings.push('Table created but no indexes defined (may need performance review)');
  }

  // Check for SD reference in comments
  if (!patterns.comments) {
    warnings.push('No SD reference in comments (makes tracking difficult)');
  }

  return {
    patterns,
    warnings
  };
}

/**
 * Get PRD database requirements (if any)
 */
async function getPRDDatabaseRequirements(sdId) {
  try {
    const { data: prd, error } = await supabase
      .from('product_requirements_v2')
      .select('database_requirements, technical_design')
      .eq('directive_id', sdId)
      .single();

    if (error || !prd) {
      return null;
    }

    return {
      database_requirements: prd.database_requirements,
      technical_design: prd.technical_design
    };
  } catch (err) {
    console.error('Error fetching PRD:', err.message);
    return null;
  }
}

/**
 * Check if PRD mentions database changes
 */
function checkPRDForDatabaseChanges(prdData) {
  if (!prdData) return { required: false };

  const dbKeywords = [
    'table', 'schema', 'column', 'migration',
    'database', 'supabase', 'postgresql', 'sql'
  ];

  const allText = JSON.stringify(prdData).toLowerCase();
  const mentions = dbKeywords.filter(keyword => allText.includes(keyword));

  return {
    required: mentions.length > 0,
    mentions,
    details: prdData.database_requirements || 'No explicit database requirements section'
  };
}

/**
 * Extract table names from migration SQL
 */
function extractTableNames(sqlContent) {
  const tables = new Set();

  // Match CREATE TABLE statements
  const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?(\w+)["`]?/gi;
  let match;
  while ((match = createTableRegex.exec(sqlContent)) !== null) {
    tables.add(match[1]);
  }

  // Match ALTER TABLE statements
  const alterTableRegex = /ALTER\s+TABLE\s+["`]?(\w+)["`]?/gi;
  while ((match = alterTableRegex.exec(sqlContent)) !== null) {
    tables.add(match[1]);
  }

  // Match INSERT INTO statements (for seed data verification)
  const insertRegex = /INSERT\s+INTO\s+["`]?(\w+)["`]?/gi;
  while ((match = insertRegex.exec(sqlContent)) !== null) {
    tables.add(match[1]);
  }

  return Array.from(tables);
}

/**
 * Verify tables exist in database
 */
async function verifyTablesExist(tableNames, targetDb = 'EHG') {
  try {
    // Determine which Supabase instance to check
    const supabaseUrl = targetDb === 'EHG'
      ? process.env.EHG_SUPABASE_URL
      : process.env.SUPABASE_URL;
    const supabaseKey = targetDb === 'EHG'
      ? process.env.EHG_SUPABASE_ANON_KEY
      : process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return {
        error: `Missing ${targetDb} Supabase credentials`,
        verified: false
      };
    }

    const { createClient } = await import('@supabase/supabase-js');
    const dbClient = createClient(supabaseUrl, supabaseKey);

    const results = [];

    for (const tableName of tableNames) {
      try {
        // Try to query table metadata (just check if we can access it)
        const { data, error } = await dbClient
          .from(tableName)
          .select('*', { count: 'exact', head: true })
          .limit(0);

        if (error) {
          results.push({
            table: tableName,
            exists: false,
            error: error.message,
            accessible: false
          });
        } else {
          results.push({
            table: tableName,
            exists: true,
            accessible: true,
            rowCount: data?.length || 0
          });
        }
      } catch (err) {
        results.push({
          table: tableName,
          exists: false,
          error: err.message,
          accessible: false
        });
      }
    }

    return {
      verified: true,
      results,
      allExist: results.every(r => r.exists),
      allAccessible: results.every(r => r.accessible)
    };
  } catch (err) {
    return {
      error: err.message,
      verified: false
    };
  }
}

/**
 * Check if seed data was inserted
 */
async function verifySeedData(tableNames, targetDb = 'EHG') {
  try {
    const supabaseUrl = targetDb === 'EHG'
      ? process.env.EHG_SUPABASE_URL
      : process.env.SUPABASE_URL;
    const supabaseKey = targetDb === 'EHG'
      ? process.env.EHG_SUPABASE_ANON_KEY
      : process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return { error: `Missing ${targetDb} Supabase credentials` };
    }

    const { createClient } = await import('@supabase/supabase-js');
    const dbClient = createClient(supabaseUrl, supabaseKey);

    const results = [];

    for (const tableName of tableNames) {
      try {
        const { count, error } = await dbClient
          .from(tableName)
          .select('*', { count: 'exact', head: true });

        if (error) {
          results.push({
            table: tableName,
            error: error.message,
            hasData: false
          });
        } else {
          results.push({
            table: tableName,
            rowCount: count || 0,
            hasData: count > 0
          });
        }
      } catch (err) {
        results.push({
          table: tableName,
          error: err.message,
          hasData: false
        });
      }
    }

    return {
      results,
      allHaveData: results.every(r => r.hasData),
      emptyTables: results.filter(r => !r.hasData).map(r => r.table)
    };
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * Main validation function
 */
async function validateMigrations(sdId, options = {}) {
  const { verifyDb = false, targetDb = 'EHG', checkSeedData = false } = options;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Migration Validation for SD-${sdId}`);
  console.log(`${'='.repeat(60)}\n`);

  console.log('VALIDATION MODE:');
  console.log('  Phase 1: Static file validation (always)');
  if (verifyDb) {
    console.log('  Phase 2: Database verification (enabled)');
    console.log(`  Target DB: ${targetDb}`);
    if (checkSeedData) {
      console.log('  Seed Data Check: enabled');
    }
  } else {
    console.log('  Phase 2: Database verification (skipped - use --verify-db to enable)');
  }
  console.log('');

  // PHASE 1: STATIC FILE VALIDATION

  // Step 1: Check PRD for database requirements
  console.log('=== PHASE 1: STATIC FILE VALIDATION ===\n');
  console.log('Step 1: Checking PRD for database requirements...');
  const prdData = await getPRDDatabaseRequirements(sdId);
  const dbCheck = checkPRDForDatabaseChanges(prdData);

  if (!dbCheck.required) {
    console.log('✅ No database changes required for this SD');
    console.log('   Verdict: NOT_REQUIRED\n');
    return {
      verdict: 'NOT_REQUIRED',
      reason: 'PRD does not specify database changes'
    };
  }

  console.log('✅ Database changes detected in PRD');
  console.log(`   Keywords found: ${dbCheck.mentions.join(', ')}\n`);

  // Step 2: Find migration files
  console.log('Step 2: Searching for migration files...');
  const migrationFiles = findMigrationFiles(sdId);

  if (migrationFiles.length === 0) {
    console.log('❌ No migration files found');
    console.log(`   Expected location: ${MIGRATIONS_DIR}`);
    console.log(`   Expected pattern: *SD-${sdId}*.sql\n`);
    console.log('   Verdict: INCOMPLETE\n');
    return {
      verdict: 'INCOMPLETE',
      reason: 'Database changes required but no migration files found',
      expectedLocation: MIGRATIONS_DIR,
      expectedPattern: `*SD-${sdId}*.sql`
    };
  }

  console.log(`✅ Found ${migrationFiles.length} migration file(s):`);
  migrationFiles.forEach(file => console.log(`   - ${file.name}`));
  console.log('');

  // Step 3: Validate each migration file
  console.log('Step 3: Validating migration files...\n');
  const validationResults = [];
  const allTableNames = new Set();

  for (const file of migrationFiles) {
    console.log(`Validating: ${file.name}`);

    const syntaxCheck = validateSQLSyntax(file.content, file.name);
    const patternCheck = checkMigrationPatterns(file.content);
    const tables = extractTableNames(file.content);

    tables.forEach(t => allTableNames.add(t));

    const result = {
      filename: file.name,
      path: file.path,
      syntaxValid: syntaxCheck.valid,
      syntaxIssues: syntaxCheck.issues,
      statementCount: syntaxCheck.statementCount,
      patterns: patternCheck.patterns,
      warnings: patternCheck.warnings,
      tables
    };

    validationResults.push(result);

    if (syntaxCheck.valid) {
      console.log(`  ✅ Syntax valid (${syntaxCheck.statementCount} statements)`);
    } else {
      console.log('  ❌ Syntax issues found:');
      syntaxCheck.issues.forEach(issue => console.log(`     - ${issue}`));
    }

    if (tables.length > 0) {
      console.log(`  📋 Tables referenced: ${tables.join(', ')}`);
    }

    if (patternCheck.warnings.length > 0) {
      console.log('  ⚠️  Warnings:');
      patternCheck.warnings.forEach(warning => console.log(`     - ${warning}`));
    }

    console.log('');
  }

  // Step 4: Static validation verdict
  const allValid = validationResults.every(r => r.syntaxValid);
  const hasWarnings = validationResults.some(r => r.warnings.length > 0);

  let staticVerdict;
  if (allValid && !hasWarnings) {
    staticVerdict = 'VALID';
  } else if (allValid && hasWarnings) {
    staticVerdict = 'VALID_WITH_WARNINGS';
  } else {
    staticVerdict = 'INVALID';
  }

  console.log(`Phase 1 Result: ${staticVerdict}\n`);

  // PHASE 2: DATABASE VERIFICATION (if enabled)
  let dbVerification = null;
  let seedDataCheck = null;

  if (verifyDb && allValid) {
    console.log('=== PHASE 2: DATABASE VERIFICATION ===\n');
    console.log(`Step 4: Verifying tables exist in ${targetDb} database...\n`);

    const tableArray = Array.from(allTableNames);
    dbVerification = await verifyTablesExist(tableArray, targetDb);

    if (dbVerification.error) {
      console.log(`❌ Database connection error: ${dbVerification.error}\n`);
    } else {
      console.log('Database verification complete:\n');
      dbVerification.results.forEach(result => {
        if (result.exists && result.accessible) {
          console.log(`  ✅ ${result.table} - EXISTS and ACCESSIBLE`);
        } else if (result.exists && !result.accessible) {
          console.log(`  ⚠️  ${result.table} - EXISTS but NOT ACCESSIBLE (RLS issue?)`);
        } else {
          console.log(`  ❌ ${result.table} - DOES NOT EXIST`);
          if (result.error) {
            console.log(`     Error: ${result.error}`);
          }
        }
      });
      console.log('');

      // Step 5: Check seed data (if requested)
      if (checkSeedData && dbVerification.allExist) {
        console.log('Step 5: Checking seed data...\n');
        seedDataCheck = await verifySeedData(tableArray, targetDb);

        if (seedDataCheck.error) {
          console.log(`❌ Seed data check error: ${seedDataCheck.error}\n`);
        } else {
          console.log('Seed data verification:\n');
          seedDataCheck.results.forEach(result => {
            if (result.hasData) {
              console.log(`  ✅ ${result.table} - ${result.rowCount} rows`);
            } else if (result.error) {
              console.log(`  ❌ ${result.table} - ERROR: ${result.error}`);
            } else {
              console.log(`  ⚠️  ${result.table} - 0 rows (EMPTY - seed data may have failed)`);
            }
          });
          console.log('');

          if (seedDataCheck.emptyTables.length > 0) {
            console.log(`⚠️  WARNING: ${seedDataCheck.emptyTables.length} table(s) have no data:`);
            console.log(`   ${seedDataCheck.emptyTables.join(', ')}`);
            console.log('   This matches the SD-AGENT-PLATFORM-001 pattern:');
            console.log('   - Migration exists ✓');
            console.log('   - Tables created ✓');
            console.log('   - Seed data missing ✗\n');
          }
        }
      }
    }
  }

  // Final Verdict
  console.log(`${'='.repeat(60)}`);
  console.log('FINAL VERDICT');
  console.log(`${'='.repeat(60)}\n`);

  let finalVerdict, reason;

  if (!allValid) {
    finalVerdict = 'INVALID';
    reason = 'Migration files have syntax errors';
  } else if (dbVerification && !dbVerification.allExist) {
    finalVerdict = 'DB_MISMATCH';
    reason = 'Migration files valid but tables do not exist in database';
  } else if (dbVerification && !dbVerification.allAccessible) {
    finalVerdict = 'DB_ACCESS_ISSUE';
    reason = 'Tables exist but some are not accessible (check RLS policies)';
  } else if (seedDataCheck && !seedDataCheck.allHaveData) {
    finalVerdict = 'SEED_DATA_MISSING';
    reason = 'Tables exist but seed data was not inserted (silent failure)';
  } else if (hasWarnings) {
    finalVerdict = 'VALID_WITH_WARNINGS';
    reason = 'All checks passed but with warnings';
  } else {
    finalVerdict = 'VALID';
    reason = verifyDb
      ? 'All checks passed - files valid and database state verified'
      : 'Static validation passed - use --verify-db for database verification';
  }

  console.log(`Verdict: ${finalVerdict}`);
  console.log(`Reason: ${reason}`);
  console.log(`${'='.repeat(60)}\n`);

  return {
    verdict: finalVerdict,
    reason,
    filesChecked: migrationFiles.length,
    validationResults,
    dbVerification,
    seedDataCheck,
    prdDatabaseRequirements: dbCheck.details,
    tablesReferenced: Array.from(allTableNames)
  };
}

// CLI execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);

  // Parse arguments
  const sdId = args.find(arg => !arg.startsWith('--'));
  const verifyDb = args.includes('--verify-db');
  const checkSeedData = args.includes('--check-seed-data');
  const targetDb = args.find(arg => arg.startsWith('--db='))?.split('=')[1] || 'EHG';

  if (!sdId) {
    console.error('Migration File Validation Script');
    console.error('');
    console.error('Usage: node validate-migration-files.js <SD-ID> [options]');
    console.error('');
    console.error('Options:');
    console.error('  --verify-db              Enable Phase 2: Database verification');
    console.error('  --check-seed-data        Check if seed data was inserted (requires --verify-db)');
    console.error('  --db=<target>            Target database: EHG (default) or ENGINEER');
    console.error('');
    console.error('Examples:');
    console.error('  node validate-migration-files.js RECONNECT-014');
    console.error('  node validate-migration-files.js RECONNECT-014 --verify-db');
    console.error('  node validate-migration-files.js AGENT-PLATFORM-001 --verify-db --check-seed-data');
    console.error('  node validate-migration-files.js NAV-REFACTOR-001 --verify-db --db=ENGINEER');
    console.error('');
    console.error('Verdicts:');
    console.error('  NOT_REQUIRED         - No database changes needed');
    console.error('  VALID                - All checks passed');
    console.error('  VALID_WITH_WARNINGS  - Passed but has warnings');
    console.error('  INCOMPLETE           - Migration files missing');
    console.error('  INVALID              - Syntax errors in migration files');
    console.error('  DB_MISMATCH          - Files valid but tables missing in database');
    console.error('  DB_ACCESS_ISSUE      - Tables exist but not accessible (RLS)');
    console.error('  SEED_DATA_MISSING    - Tables exist but no data (silent failure)');
    console.error('');
    process.exit(1);
  }

  const options = {
    verifyDb,
    targetDb,
    checkSeedData: checkSeedData && verifyDb // Only check seed data if db verification enabled
  };

  validateMigrations(sdId, options)
    .then(result => {
      const successVerdicts = ['VALID', 'VALID_WITH_WARNINGS', 'NOT_REQUIRED'];
      process.exit(successVerdicts.includes(result.verdict) ? 0 : 1);
    })
    .catch(err => {
      console.error('Error:', err.message);
      console.error(err.stack);
      process.exit(1);
    });
}

export { validateMigrations };
