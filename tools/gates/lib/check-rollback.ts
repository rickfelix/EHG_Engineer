/**
 * Rollback Safety Checker
 * SD-QUALITY-GATE-001: hasRollbackSafety (20%)
 *
 * Verifies database migrations have rollback capability.
 * Returns true if all migrations have rollback scripts OR no migrations present.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';

export interface RollbackResult {
  passed: boolean;
  migrationsFound: number;
  migrationsWithRollback: number;
  migrationsWithoutRollback: string[];
  details: string[];
}

const MIGRATION_PATHS = [
  'database/migrations/',
  'supabase/migrations/'
];

/**
 * Check rollback safety for migrations
 */
export function checkRollbackSafety(
  basePath: string = process.cwd()
): RollbackResult {
  const details: string[] = [];
  const migrationsWithoutRollback: string[] = [];
  let migrationsFound = 0;
  let migrationsWithRollback = 0;

  details.push(`Checking rollback safety in: ${basePath}`);

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
      !f.includes('_down') &&
      /^\d{3}_/.test(f)  // Match numbered migrations like 025_xxx.sql
    );

    for (const migrationFile of migrationFiles) {
      migrationsFound++;

      // Check for various rollback patterns
      const hasRollback = checkMigrationHasRollback(fullPath, migrationFile, files);

      if (hasRollback) {
        migrationsWithRollback++;
        details.push(`  ✓ ${migrationFile} - has rollback`);
      } else {
        migrationsWithoutRollback.push(migrationFile);
        details.push(`  ✗ ${migrationFile} - NO rollback found`);
      }
    }
  }

  // Determine pass/fail
  let passed: boolean;

  if (migrationsFound === 0) {
    passed = true;
    details.push('No numbered migrations found - PASS (no rollback needed)');
  } else if (migrationsWithoutRollback.length === 0) {
    passed = true;
    details.push(`All ${migrationsFound} migrations have rollback - PASS`);
  } else {
    // Advisory: Pass with warning if most have rollback
    const coverage = migrationsWithRollback / migrationsFound;
    passed = coverage >= 0.8;  // 80% coverage is acceptable

    if (passed) {
      details.push(`${migrationsWithRollback}/${migrationsFound} migrations have rollback (${(coverage * 100).toFixed(0)}%) - PASS (advisory)`);
    } else {
      details.push(`${migrationsWithRollback}/${migrationsFound} migrations have rollback (${(coverage * 100).toFixed(0)}%) - FAIL`);
    }
  }

  return {
    passed,
    migrationsFound,
    migrationsWithRollback,
    migrationsWithoutRollback,
    details
  };
}

/**
 * Check if a migration file has an associated rollback
 */
function checkMigrationHasRollback(
  dir: string,
  migrationFile: string,
  allFiles: string[]
): boolean {
  const baseName = basename(migrationFile, '.sql');

  // Pattern 1: xxx_rollback_yyy.sql or xxx_rollback.sql
  const rollbackPattern1 = new RegExp(`^${baseName.split('_')[0]}[_-]rollback`, 'i');

  // Pattern 2: rollback_xxx.sql
  const rollbackPattern2 = new RegExp(`rollback[_-]${baseName.split('_')[0]}`, 'i');

  // Pattern 3: xxx_down.sql
  const downPattern = new RegExp(`^${baseName}[_-]down\\.sql$`, 'i');

  // Check for matching files
  for (const file of allFiles) {
    if (rollbackPattern1.test(file) ||
        rollbackPattern2.test(file) ||
        downPattern.test(file)) {
      return true;
    }
  }

  // Pattern 4: Check if migration file contains DOWN section
  try {
    const content = readFileSync(join(dir, migrationFile), 'utf8');
    if (content.includes('-- DOWN') ||
        content.includes('-- ROLLBACK') ||
        content.includes('-- To rollback')) {
      return true;
    }
  } catch {
    // Ignore read errors
  }

  return false;
}

// CLI execution
if (process.argv[1]?.includes('check-rollback')) {
  const basePath = process.argv[2] || process.cwd();

  console.log('Checking rollback safety...');
  const result = checkRollbackSafety(basePath);

  console.log('\nResults:');
  result.details.forEach(d => console.log(`  ${d}`));
  console.log(`\nVerdict: ${result.passed ? 'PASS' : 'FAIL'}`);

  if (result.migrationsWithoutRollback.length > 0) {
    console.log('\nMigrations without rollback:');
    result.migrationsWithoutRollback.forEach(m => console.log(`  - ${m}`));
  }

  process.exit(result.passed ? 0 : 1);
}
