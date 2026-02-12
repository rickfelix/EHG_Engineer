#!/usr/bin/env node

/**
 * LLM Model Audit Script
 *
 * Scans the codebase for hardcoded LLM model references that bypass
 * the centralized configuration in lib/config/model-config.js.
 *
 * Usage:
 *   npm run llm:audit
 *   node scripts/llm-audit.js
 *   node scripts/llm-audit.js --strict  # Exit with code 1 if violations found
 *
 * This script is part of SD-LLM-CONFIG-CENTRAL-001
 * @see docs/reference/MODEL-VERSION-UPGRADE-RUNBOOK.md
 */

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Files/directories to exclude from audit
const EXCLUDED_PATHS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  // Config files that legitimately contain model names
  'lib/config/model-config.js',
  'config/phase-model-config.json',
  // Documentation files
  'docs/',
  '*.md',
  // Test fixtures that might have hardcoded values for mocking
  'tests/fixtures/',
  'tests/mocks/',
  // SD creation scripts (contain metadata about models, not runtime usage)
  'scripts/create-sd-',
  // Archive/deprecated scripts
  'scripts/archive/',
];

// Patterns that indicate hardcoded model references
const HARDCODED_PATTERNS = [
  // Direct model assignment in constructors/variables
  { pattern: 'this.model.*=.*gpt-', description: 'this.model = gpt-* hardcoded' },
  { pattern: 'this.model.*=.*claude-', description: 'this.model = claude-* hardcoded' },
  { pattern: 'model:.*gpt-', description: 'model: gpt-* property hardcoded' },
  { pattern: 'model:.*claude-', description: 'model: claude-* property hardcoded' },
];

// Known exceptions that are acceptable
const EXCEPTIONS = [
  { file: 'tests/e2e/fixtures/llm-ux-oracle.ts', reason: 'Test fixture for mocking' },
  { file: 'lib/intelligent-impact-analyzer.js', reason: 'Uses claude-haiku which is in config' },
  { file: 'server.js', reason: 'Legacy endpoints - to be migrated' },
  { file: 'src/services/enhancement-pipeline-stages.js', reason: 'Legacy pipeline - to be migrated' },
];

function isExcluded(filePath) {
  return EXCLUDED_PATHS.some(excluded => {
    if (excluded.endsWith('/')) {
      return filePath.includes(excluded);
    }
    if (excluded.startsWith('*')) {
      return filePath.endsWith(excluded.slice(1));
    }
    return filePath.includes(excluded);
  });
}

function isException(filePath) {
  return EXCEPTIONS.find(e => filePath.includes(e.file));
}

function runGrep(pattern) {
  try {
    const cmd = `grep -rn "${pattern}" --include="*.js" --include="*.mjs" --include="*.ts" --include="*.tsx" "${rootDir}" 2>/dev/null || true`;
    const output = execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
    return output.trim().split('\n').filter(line => line.trim());
  } catch (_error) {
    return [];
  }
}

function main() {
  const isStrict = process.argv.includes('--strict');

  console.log('');
  console.log('LLM Model Audit - Scanning for Hardcoded Model References');
  console.log('═'.repeat(60));
  console.log('');

  let violations = [];
  let exceptions = [];
  let excluded = [];

  for (const { pattern, description } of HARDCODED_PATTERNS) {
    const matches = runGrep(pattern);

    for (const match of matches) {
      if (!match.includes(':')) continue;

      const [filePath, ...rest] = match.split(':');
      const lineNum = rest[0];
      const content = rest.slice(1).join(':').trim();

      // Make path relative for display
      const relPath = filePath.replace(rootDir + '/', '');

      if (isExcluded(relPath)) {
        excluded.push({ file: relPath, line: lineNum, content, description });
        continue;
      }

      const exception = isException(relPath);
      if (exception) {
        exceptions.push({ file: relPath, line: lineNum, content, description, reason: exception.reason });
        continue;
      }

      violations.push({ file: relPath, line: lineNum, content, description });
    }
  }

  // Report violations
  if (violations.length > 0) {
    console.log('VIOLATIONS FOUND');
    console.log('─'.repeat(60));
    console.log('These files have hardcoded model references that should use');
    console.log('getOpenAIModel() or getClaudeModel() from lib/config/model-config.js');
    console.log('');

    violations.forEach(v => {
      console.log(`  ${v.file}:${v.line}`);
      console.log(`    ${v.description}`);
      console.log(`    ${v.content.substring(0, 80)}${v.content.length > 80 ? '...' : ''}`);
      console.log('');
    });
  } else {
    console.log('No violations found!');
    console.log('');
  }

  // Report exceptions
  if (exceptions.length > 0) {
    console.log('');
    console.log('KNOWN EXCEPTIONS (not violations)');
    console.log('─'.repeat(60));
    exceptions.forEach(e => {
      console.log(`  ${e.file}:${e.line} - ${e.reason}`);
    });
    console.log('');
  }

  // Summary
  console.log('');
  console.log('SUMMARY');
  console.log('─'.repeat(60));
  console.log(`  Violations:  ${violations.length}`);
  console.log(`  Exceptions:  ${exceptions.length}`);
  console.log(`  Excluded:    ${excluded.length} (config/docs/test files)`);
  console.log('');

  if (violations.length > 0) {
    console.log('ACTION REQUIRED:');
    console.log('1. Import: import { getOpenAIModel } from "../../lib/config/model-config.js"');
    console.log('2. Replace: this.model = getOpenAIModel("validation") // or classification, generation, fast');
    console.log('');
    console.log('See: docs/reference/MODEL-VERSION-UPGRADE-RUNBOOK.md');
    console.log('');
  }

  if (isStrict && violations.length > 0) {
    console.log('STRICT MODE: Exiting with code 1 due to violations');
    process.exit(1);
  }

  process.exit(0);
}

main();
