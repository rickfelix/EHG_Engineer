/**
 * Schema Validator Module
 * DATABASE Sub-Agent - Schema Documentation & Validation
 *
 * Extracted from lib/sub-agents/database.js (SD-LEO-REFAC-DB-SUB-003)
 *
 * Responsibilities:
 * - Load schema documentation for context
 * - Static file validation (Phase 1)
 * - Schema health checks
 * - RLS policy diagnosis
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import globPkg from 'glob';
import { exec } from 'child_process';
import { promisify } from 'util';

const { glob } = globPkg;
const execAsync = promisify(exec);

/**
 * Load Schema Documentation for Context
 * Reads the auto-generated schema overview to provide context
 * @returns {Promise<Object>} Schema context object
 */
export async function loadSchemaDocumentation() {
  const schemaOverviewPath = path.join(
    process.cwd(),
    'docs',
    'reference',
    'schema',
    'engineer',
    'database-schema-overview.md'
  );

  try {
    if (!existsSync(schemaOverviewPath)) {
      return {
        loaded: false,
        reason: 'Schema docs not generated yet'
      };
    }

    const content = await readFile(schemaOverviewPath, 'utf-8');

    // Extract metadata from the schema docs
    const applicationMatch = content.match(/\*\*Application\*\*:\s*(.+)/);
    const databaseMatch = content.match(/\*\*Database\*\*:\s*(\w+)/);
    const tablesMatch = content.match(/\*\*Tables\*\*:\s*(\d+)/);
    const repositoryMatch = content.match(/\*\*Repository\*\*:\s*(.+)/);

    return {
      loaded: true,
      application: applicationMatch ? applicationMatch[1].trim() : 'Unknown',
      database_id: databaseMatch ? databaseMatch[1] : 'Unknown',
      tables_count: tablesMatch ? parseInt(tablesMatch[1]) : 0,
      repository: repositoryMatch ? repositoryMatch[1].trim() : 'Unknown',
      overview_path: schemaOverviewPath,
      content_preview: content.substring(0, 500)
    };
  } catch (error) {
    return {
      loaded: false,
      error: error.message,
      reason: 'Failed to read schema docs'
    };
  }
}

/**
 * Phase 1: Static File Validation
 * Validates migration file syntax and patterns
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} _options - Validation options
 * @returns {Promise<Object>} Validation result
 */
export async function staticFileValidation(sdId, _options) {
  console.log(`   🔍 Searching for migration files for ${sdId}...`);

  const validation = {
    verdict: 'NOT_REQUIRED',
    migration_files: [],
    critical_issues: [],
    warnings: [],
    cross_schema_fks: []
  };

  try {
    // Search for migration files mentioning this SD
    const migrationPaths = [
      'database/migrations/*.sql',
      'supabase/migrations/*.sql',
      'migrations/*.sql'
    ];

    let allFiles = [];
    for (const pattern of migrationPaths) {
      try {
        const files = await glob(pattern);
        const fileArray = Array.isArray(files) ? files : Array.from(files);
        allFiles = allFiles.concat(fileArray);
      } catch {
        // Pattern not found, skip
      }
    }

    console.log(`      Found ${allFiles.length} total migration files`);

    // Filter files that mention this SD
    const relevantFiles = [];
    for (const file of allFiles) {
      try {
        const content = await readFile(file, 'utf-8');
        if (content.includes(sdId)) {
          relevantFiles.push({ path: file, content });
        }
      } catch (err) {
        console.log(`      ⚠️  Could not read ${file}: ${err.message}`);
      }
    }

    if (relevantFiles.length === 0) {
      console.log(`      ✅ No migration files found for ${sdId}`);
      validation.verdict = 'NOT_REQUIRED';
      return validation;
    }

    console.log(`      ✅ Found ${relevantFiles.length} migration file(s) for ${sdId}`);

    validation.migration_files = relevantFiles.map(f => f.path);
    validation.verdict = 'VALID';

    // Validate each file
    for (const file of relevantFiles) {
      console.log(`      🔍 Validating ${file.path}...`);

      // Check for required patterns
      const hasCreateTable = file.content.match(/CREATE TABLE/i);
      const hasAlterTable = file.content.match(/ALTER TABLE/i);
      const hasCreateIndex = file.content.match(/CREATE INDEX/i);

      if (!hasCreateTable && !hasAlterTable && !hasCreateIndex) {
        validation.warnings.push({
          file: file.path,
          issue: 'No CREATE TABLE, ALTER TABLE, or CREATE INDEX patterns found',
          severity: 'LOW'
        });
      }

      // Check for cross-schema foreign keys (PROHIBITED)
      const crossSchemaFKs = file.content.match(/REFERENCES\s+auth\.\w+/gi);
      if (crossSchemaFKs) {
        validation.cross_schema_fks.push({
          file: file.path,
          matches: crossSchemaFKs,
          line_context: 'Search file for REFERENCES auth.'
        });
        console.log(`         ⚠️  Found ${crossSchemaFKs.length} cross-schema FK(s)`);
      }

      // Check for unclosed quotes or unbalanced parentheses
      const openQuotes = (file.content.match(/'/g) || []).length;
      const openParens = (file.content.match(/\(/g) || []).length;
      const closeParens = (file.content.match(/\)/g) || []).length;

      if (openQuotes % 2 !== 0) {
        validation.critical_issues.push({
          file: file.path,
          issue: 'Unclosed single quotes detected',
          severity: 'CRITICAL'
        });
        validation.verdict = 'INVALID';
        console.log('         ❌ Unclosed quotes detected');
      }

      if (openParens !== closeParens) {
        validation.critical_issues.push({
          file: file.path,
          issue: `Unbalanced parentheses (${openParens} open, ${closeParens} close)`,
          severity: 'CRITICAL'
        });
        validation.verdict = 'INVALID';
        console.log('         ❌ Unbalanced parentheses');
      }

      if (validation.verdict === 'VALID') {
        console.log('         ✅ Syntax validation passed');
      }
    }

  } catch (error) {
    console.error(`      ❌ File validation error: ${error.message}`);
    validation.verdict = 'ERROR';
    validation.critical_issues.push({
      issue: 'File validation failed',
      error: error.message,
      severity: 'CRITICAL'
    });
  }

  return validation;
}

/**
 * Check Schema Health (Trigger functions, etc.)
 * @param {string} _sdId - Strategic Directive ID
 * @returns {Promise<Object>} Health check result
 */
export async function checkSchemaHealth(_sdId) {
  console.log('   💊 Checking for common schema issues...');

  const health = {
    trigger_issues: [],
    recommendations: []
  };

  console.log('      💡 Reminder: Always verify trigger functions match current table schema');
  console.log('      💡 Common issue: Trigger references old column name after schema change');

  health.recommendations.push('Manually verify trigger functions match current schema');
  health.recommendations.push('Check for column name mismatches (e.g., confidence_score vs confidence)');

  return health;
}

/**
 * Diagnose RLS Policies using Supabase CLI
 * @param {string} tableName - Table name to diagnose
 * @returns {Promise<Object>} RLS diagnosis result
 */
export async function diagnoseRLSPolicies(tableName) {
  console.log(`   🔍 Diagnosing RLS policies for ${tableName} using Supabase CLI...`);

  const diagnosis = {
    cli_available: false,
    policies_found: [],
    access_issues: [],
    recommendations: []
  };

  try {
    // Check if Supabase CLI is available
    try {
      const { stdout: versionOutput } = await execAsync('supabase --version');
      diagnosis.cli_available = true;
      console.log(`      ✅ Supabase CLI available: ${versionOutput.trim()}`);
    } catch {
      console.log('      ⚠️  Supabase CLI not available');
      diagnosis.recommendations.push('Install Supabase CLI: npm install -g supabase');
      return diagnosis;
    }

    // Inspect database schema for RLS policies
    console.log('      🔍 Inspecting RLS policies...');
    try {
      const { stdout: policyOutput } = await execAsync(
        `supabase db dump --schema public | grep -A 5 "CREATE POLICY.*${tableName}"`
      );

      if (policyOutput) {
        const policies = policyOutput.split('\n').filter(line => line.includes('CREATE POLICY'));
        diagnosis.policies_found = policies;
        console.log(`      ✅ Found ${policies.length} RLS policy/policies for ${tableName}`);

        // Check for authenticated-only policies
        const authOnlyPolicies = policies.filter(p =>
          p.includes('TO authenticated') || p.includes('FOR authenticated')
        );

        if (authOnlyPolicies.length > 0) {
          diagnosis.access_issues.push({
            issue: 'Table has authenticated-only policies',
            policies: authOnlyPolicies,
            impact: 'Anonymous key cannot INSERT/UPDATE/DELETE'
          });
          console.log(`      ⚠️  ${authOnlyPolicies.length} authenticated-only policy/policies found`);
        }
      }
    } catch {
      // grep returns non-zero if no matches, which is expected
      console.log('      ℹ️  No specific policies found (or CLI command failed)');
    }

    // Check current connection type
    console.log('      🔍 Checking connection type...');
    const usingAnonKey = !!process.env.SUPABASE_ANON_KEY;
    const hasServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (usingAnonKey && diagnosis.access_issues.length > 0) {
      diagnosis.recommendations.push(
        'Option 1: Use SERVICE_ROLE_KEY for unrestricted access',
        'Option 2: Use Supabase CLI with service role: supabase db execute',
        'Option 3: Modify RLS policy to allow anon INSERT (security risk)',
        'Option 4: Create authenticated API endpoint for table operations'
      );
    }

    if (hasServiceRole) {
      console.log('      ✅ SERVICE_ROLE_KEY available - can bypass RLS');
      diagnosis.recommendations.push('Use SERVICE_ROLE_KEY for this operation');
    } else {
      console.log('      ⚠️  SERVICE_ROLE_KEY not available');
    }

  } catch (error) {
    console.error(`      ❌ RLS diagnosis error: ${error.message}`);
    diagnosis.error = error.message;
  }

  return diagnosis;
}
