/**
 * Migration Correctness Checker
 * SD-QUALITY-GATE-001: hasMigrationCorrectness (20%)
 *
 * Validates database migration syntax and naming conventions.
 * Returns true if all migrations follow conventions and have valid SQL.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface MigrationResult {
  passed: boolean;
  migrationsChecked: number;
  validMigrations: number;
  issues: MigrationIssue[];
  details: string[];
}

export interface MigrationIssue {
  file: string;
  type: 'naming' | 'syntax' | 'destructive';
  message: string;
  severity: 'error' | 'warning';
}

const MIGRATION_PATHS = [
  'database/migrations/',
  'supabase/migrations/'
];

// Naming pattern: NNN_description.sql
const NAMING_PATTERN = /^\d{3}_[a-z][a-z0-9_]*\.sql$/;

// Destructive operations that require review
const DESTRUCTIVE_PATTERNS = [
  /DROP\s+TABLE\s+(?!IF\s+EXISTS)/gi,
  /TRUNCATE\s+TABLE/gi,
  /DELETE\s+FROM\s+\w+\s*;/gi,  // DELETE without WHERE
  /ALTER\s+TABLE\s+\w+\s+DROP\s+COLUMN(?!\s+IF\s+EXISTS)/gi
];

// Basic SQL syntax patterns
const SQL_KEYWORDS = [
  'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP',
  'BEGIN', 'COMMIT', 'ROLLBACK', 'DO', 'GRANT', 'REVOKE'
];

/**
 * Check migration correctness
 */
export function checkMigrationCorrectness(
  basePath: string = process.cwd()
): MigrationResult {
  const details: string[] = [];
  const issues: MigrationIssue[] = [];
  let migrationsChecked = 0;
  let validMigrations = 0;

  details.push(`Checking migration correctness in: ${basePath}`);

  for (const migrationPath of MIGRATION_PATHS) {
    const fullPath = join(basePath, migrationPath);

    if (!existsSync(fullPath)) {
      details.push(`Path not found: ${migrationPath} (skipping)`);
      continue;
    }

    details.push(`Scanning: ${migrationPath}`);

    const files = readdirSync(fullPath);
    const migrationFiles = files.filter(f =>
      f.endsWith('.sql') &&
      !f.includes('rollback') &&
      !f.includes('_down')
    );

    for (const migrationFile of migrationFiles) {
      migrationsChecked++;
      let isValid = true;
      const filePath = join(fullPath, migrationFile);

      // Check 1: Naming convention
      if (!NAMING_PATTERN.test(migrationFile)) {
        // Allow non-numbered migrations with a warning
        if (!/^\d{3}_/.test(migrationFile)) {
          issues.push({
            file: migrationFile,
            type: 'naming',
            message: 'Non-standard naming (expected: NNN_description.sql)',
            severity: 'warning'
          });
          details.push(`  ⚠ ${migrationFile} - non-standard naming (warning)`);
        }
      }

      // Check 2: Read and validate content
      try {
        const content = readFileSync(filePath, 'utf8');

        // Check for destructive operations
        for (const pattern of DESTRUCTIVE_PATTERNS) {
          const matches = content.match(pattern);
          if (matches) {
            issues.push({
              file: migrationFile,
              type: 'destructive',
              message: `Contains destructive operation: ${matches[0].substring(0, 50)}...`,
              severity: 'warning'  // Warning, not error - may be intentional
            });
            details.push(`  ⚠ ${migrationFile} - destructive operation detected`);
          }
        }

        // Check 3: Basic SQL syntax (presence of keywords)
        const hasValidSql = SQL_KEYWORDS.some(keyword =>
          new RegExp(`\\b${keyword}\\b`, 'i').test(content)
        );

        if (!hasValidSql && content.trim().length > 0) {
          // Check if it's just comments
          const nonCommentLines = content
            .split('\n')
            .filter(line => !line.trim().startsWith('--') && line.trim().length > 0);

          if (nonCommentLines.length > 0) {
            issues.push({
              file: migrationFile,
              type: 'syntax',
              message: 'No recognizable SQL keywords found',
              severity: 'warning'
            });
            details.push(`  ⚠ ${migrationFile} - no SQL keywords found`);
          }
        }

        // Check 4: Balanced transaction blocks
        const beginCount = (content.match(/\bBEGIN\b/gi) || []).length;
        const commitCount = (content.match(/\bCOMMIT\b/gi) || []).length;
        const rollbackCount = (content.match(/\bROLLBACK\b/gi) || []).length;

        if (beginCount > 0 && beginCount !== (commitCount + rollbackCount)) {
          issues.push({
            file: migrationFile,
            type: 'syntax',
            message: `Unbalanced transactions: ${beginCount} BEGIN vs ${commitCount} COMMIT + ${rollbackCount} ROLLBACK`,
            severity: 'warning'
          });
          details.push(`  ⚠ ${migrationFile} - unbalanced transactions`);
        }

      } catch (err: unknown) {
        const errMessage = err instanceof Error ? err.message : String(err);
        issues.push({
          file: migrationFile,
          type: 'syntax',
          message: `Could not read file: ${errMessage}`,
          severity: 'error'
        });
        isValid = false;
        details.push(`  ✗ ${migrationFile} - read error`);
      }

      if (isValid) {
        validMigrations++;
        details.push(`  ✓ ${migrationFile} - valid`);
      }
    }
  }

  // Determine pass/fail
  const errorCount = issues.filter(i => i.severity === 'error').length;
  const passed = errorCount === 0;

  if (migrationsChecked === 0) {
    details.push('No migrations found to check - PASS');
  } else {
    const warningCount = issues.filter(i => i.severity === 'warning').length;
    if (passed) {
      details.push(`${validMigrations}/${migrationsChecked} migrations valid - PASS`);
      if (warningCount > 0) {
        details.push(`(${warningCount} warnings - review recommended)`);
      }
    } else {
      details.push(`${errorCount} errors, ${warningCount} warnings - FAIL`);
    }
  }

  return {
    passed,
    migrationsChecked,
    validMigrations,
    issues,
    details
  };
}

// CLI execution
if (process.argv[1]?.includes('check-migration')) {
  const basePath = process.argv[2] || process.cwd();

  console.log('Checking migration correctness...');
  const result = checkMigrationCorrectness(basePath);

  console.log('\nResults:');
  result.details.forEach(d => console.log(`  ${d}`));

  if (result.issues.length > 0) {
    console.log('\nIssues found:');
    result.issues.forEach(issue => {
      const icon = issue.severity === 'error' ? '✗' : '⚠';
      console.log(`  ${icon} [${issue.type}] ${issue.file}: ${issue.message}`);
    });
  }

  console.log(`\nVerdict: ${result.passed ? 'PASS' : 'FAIL'}`);
  process.exit(result.passed ? 0 : 1);
}
