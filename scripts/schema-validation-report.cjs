#!/usr/bin/env node
/**
 * Schema Validation Coverage Report
 * SD-LEO-ORCH-SELF-HEALING-DATABASE-001-D
 *
 * Scans LEO pipeline scripts for Supabase database operations
 * and reports how many are covered by the schema pre-flight validation.
 *
 * Usage: node scripts/schema-validation-report.cjs [--verbose]
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SCAN_DIRS = ['scripts', 'lib'];
const SCAN_EXTENSIONS = ['.js', '.cjs', '.mjs'];
const SKIP_DIRS = ['node_modules', '.worktrees', 'archive', 'coverage', 'dist'];

// Patterns that indicate Supabase database operations
const DB_OPERATION_PATTERNS = [
  /\.from\(\s*['"`]\w+['"`]\s*\)/,
  /supabase\.from\(\s*['"`]\w+['"`]\s*\)/,
  /\.rpc\(\s*['"`]\w+['"`]/,
  /\.insert\(\s*\{/,
  /\.update\(\s*\{/,
  /\.upsert\(\s*\{/,
  /\.delete\(\s*\)/,
];

// Patterns that the hook can validate (column extraction is possible)
const VALIDATABLE_PATTERNS = [
  /\.eq\(\s*['"`]\w+['"`]/,
  /\.neq\(\s*['"`]\w+['"`]/,
  /\.select\(\s*['"`][^*]/,
  /\.order\(\s*['"`]\w+['"`]/,
  /\.in\(\s*['"`]\w+['"`]/,
  /\.insert\(\s*\{[^}]+\}/,
  /\.update\(\s*\{[^}]+\}/,
  /\.upsert\(\s*\{[^}]+\}/,
  /\.gt\(\s*['"`]\w+['"`]/,
  /\.gte\(\s*['"`]\w+['"`]/,
  /\.lt\(\s*['"`]\w+['"`]/,
  /\.lte\(\s*['"`]\w+['"`]/,
];

function scanDirectory(dirPath, results = []) {
  if (!fs.existsSync(dirPath)) return results;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP_DIRS.includes(entry.name)) continue;

    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      scanDirectory(fullPath, results);
    } else if (SCAN_EXTENSIONS.includes(path.extname(entry.name))) {
      results.push(fullPath);
    }
  }
  return results;
}

function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const hasDbOps = DB_OPERATION_PATTERNS.some(p => p.test(content));
  const hasValidatable = VALIDATABLE_PATTERNS.some(p => p.test(content));

  return {
    path: filePath,
    hasDbOps,
    hasValidatable,
    dbOpCount: DB_OPERATION_PATTERNS.filter(p => p.test(content)).length,
  };
}

function main() {
  const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');
  const rootDir = path.resolve(__dirname, '..');

  console.log('Schema Validation Coverage Report');
  console.log('═'.repeat(60));
  console.log();

  let totalFiles = 0;
  let dbFiles = 0;
  let validatedFiles = 0;
  const unvalidated = [];

  for (const dir of SCAN_DIRS) {
    const dirPath = path.join(rootDir, dir);
    const files = scanDirectory(dirPath);

    for (const file of files) {
      totalFiles++;
      const analysis = analyzeFile(file);

      if (analysis.hasDbOps) {
        dbFiles++;
        if (analysis.hasValidatable) {
          validatedFiles++;
        } else {
          unvalidated.push(path.relative(rootDir, file));
        }
      }
    }
  }

  const coverage = dbFiles > 0 ? Math.round((validatedFiles / dbFiles) * 100) : 100;

  console.log(`  Total files scanned:    ${totalFiles}`);
  console.log(`  Files with DB ops:      ${dbFiles}`);
  console.log(`  Validated (extractable): ${validatedFiles}`);
  console.log(`  Unvalidated:            ${dbFiles - validatedFiles}`);
  console.log();
  console.log(`  Coverage: ${coverage}%`);
  console.log();

  if (coverage >= 90) {
    console.log('  ✅ Coverage target met (≥90%)');
  } else {
    console.log(`  ⚠️  Coverage below target (${coverage}% < 90%)`);
  }

  if (verbose && unvalidated.length > 0) {
    console.log();
    console.log('  Unvalidated files:');
    unvalidated.forEach(f => console.log(`    - ${f}`));
  }

  console.log();
  console.log('═'.repeat(60));

  // Exit with non-zero if below target (useful for CI)
  process.exitCode = coverage >= 90 ? 0 : 1;
}

main();
