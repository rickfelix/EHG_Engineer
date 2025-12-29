#!/usr/bin/env node

/**
 * Stubbed/Mocked Code Detection Script
 *
 * Purpose: Detect stubbed, mocked, or incomplete code in production files
 *          to prevent shipping unfinished implementations.
 *
 * Usage:
 *   node scripts/detect-stubbed-code.js <SD-ID>
 *   node scripts/detect-stubbed-code.js --all  (check entire codebase)
 *
 * Exit Codes:
 *   0 - No stubbed code found in production files
 *   1 - Stubbed code found in production files (BLOCKING)
 *
 * Part of: PLAN Supervisor Verification (Phase 4)
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve as _resolve } from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

const PATTERNS = {
  // TEST_MODE flags (should only be in test files)
  TEST_MODE: {
    pattern: /TEST_MODE.*true|NODE_ENV.*['"](test|testing)['"]/g,
    severity: 'CRITICAL',
    message: 'TEST_MODE flag found in production code'
  },

  // Mock/Stub markers
  MOCK_MARKERS: {
    pattern: /MOCK:|STUB:|PLACEHOLDER:|DUMMY:|FAKE:/gi,
    severity: 'HIGH',
    message: 'Mock/stub marker found'
  },

  // TODO without SD reference
  TODO_INCOMPLETE: {
    pattern: /\/\/\s*TODO:\s*(?!.*SD-)\s*Implement|\/\/\s*TODO\s*$/gm,
    severity: 'MEDIUM',
    message: 'TODO comment without SD reference (incomplete implementation)'
  },

  // Mock return values
  MOCK_RETURNS: {
    pattern: /return\s*\{[^}]*verdict:\s*['"](?:PASS|FAIL)['"][^}]*\}\s*;?\s*\/\/.*(?:mock|stub|test)/gi,
    severity: 'HIGH',
    message: 'Mock return value with test comment'
  },

  // Empty function bodies
  EMPTY_FUNCTIONS: {
    pattern: /function\s+\w+\s*\([^)]*\)\s*\{\s*\/\*\s*TODO\s*\*\/\s*\}/g,
    severity: 'MEDIUM',
    message: 'Empty function body with TODO'
  },

  // Console.log with mock/stub
  DEBUG_LOGS: {
    pattern: /console\.log\(['"](?:MOCK|STUB|TEST|DEBUG):/gi,
    severity: 'LOW',
    message: 'Debug/mock console.log statement'
  }
};

const PRODUCTION_DIRS = ['lib', 'src', 'scripts'];
const TEST_DIRS = ['tests', 'test', '__tests__'];
const TEST_FILE_PATTERNS = ['.test.js', '.spec.js', '.test.ts', '.spec.ts'];

// ============================================================================
// UTILITIES
// ============================================================================

function isTestFile(filePath) {
  // Check if file is in test directory
  if (TEST_DIRS.some(dir => filePath.includes(`/${dir}/`))) {
    return true;
  }

  // Check if file has test extension
  if (TEST_FILE_PATTERNS.some(ext => filePath.endsWith(ext))) {
    return true;
  }

  return false;
}

function getModifiedFiles(sdId) {
  try {
    // Get files modified in recent commits
    // Look for commits mentioning the SD-ID
    const commits = execSync(
      `git log --grep="${sdId}" --pretty=format:"%H" --max-count=10`,
      { encoding: 'utf-8' }
    ).trim().split('\n').filter(Boolean);

    if (commits.length === 0) {
      console.log(`⚠️  No commits found for ${sdId}, checking all production files...`);
      return getAllProductionFiles();
    }

    // Get all files modified in these commits
    const files = new Set();
    commits.forEach(commit => {
      const commitFiles = execSync(
        `git diff-tree --no-commit-id --name-only -r ${commit}`,
        { encoding: 'utf-8' }
      ).trim().split('\n').filter(Boolean);

      commitFiles.forEach(f => files.add(f));
    });

    return Array.from(files).filter(f =>
      f.endsWith('.js') || f.endsWith('.ts') || f.endsWith('.tsx')
    );
  } catch (error) {
    console.error(`Error getting modified files: ${error.message}`);
    return getAllProductionFiles();
  }
}

function getAllProductionFiles() {
  const files = [];

  PRODUCTION_DIRS.forEach(dir => {
    try {
      const dirFiles = execSync(
        `find ${dir} -type f \\( -name "*.js" -o -name "*.ts" -o -name "*.tsx" \\) 2>/dev/null || true`,
        { encoding: 'utf-8' }
      ).trim().split('\n').filter(Boolean);

      files.push(...dirFiles);
    } catch (_error) {
      // Directory doesn't exist, skip
    }
  });

  return files;
}

function scanFile(filePath, patterns) {
  const findings = [];

  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    Object.entries(patterns).forEach(([patternName, config]) => {
      const { pattern, severity, message } = config;

      lines.forEach((line, index) => {
        pattern.lastIndex = 0; // Reset regex state
        const matches = line.match(pattern);

        if (matches) {
          findings.push({
            file: filePath,
            line: index + 1,
            severity,
            pattern: patternName,
            message,
            snippet: line.trim()
          });
        }
      });
    });
  } catch (error) {
    console.error(`Error reading ${filePath}: ${error.message}`);
  }

  return findings;
}

function categorizeFinding(finding) {
  if (isTestFile(finding.file)) {
    return 'TEST_FILE';
  }
  return 'PRODUCTION_FILE';
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Usage: node scripts/detect-stubbed-code.js <SD-ID>');
  console.error('       node scripts/detect-stubbed-code.js --all');
  process.exit(1);
}

const sdId = args[0];
const checkAll = sdId === '--all';

console.log('\n🔍 STUBBED/MOCKED CODE DETECTION');
console.log('═'.repeat(70));
console.log(`Target: ${checkAll ? 'All production files' : sdId}`);
console.log('');

// Get files to scan
const filesToScan = checkAll ? getAllProductionFiles() : getModifiedFiles(sdId);

console.log(`📁 Scanning ${filesToScan.length} files...`);
console.log('');

// Scan all files
const allFindings = [];
filesToScan.forEach(file => {
  const findings = scanFile(file, PATTERNS);
  allFindings.push(...findings);
});

// Categorize findings
const productionFindings = allFindings.filter(f => categorizeFinding(f) === 'PRODUCTION_FILE');
const testFindings = allFindings.filter(f => categorizeFinding(f) === 'TEST_FILE');

// Report findings
console.log('═'.repeat(70));
console.log('📊 RESULTS');
console.log('═'.repeat(70));

if (productionFindings.length === 0) {
  console.log('✅ NO STUBBED CODE FOUND IN PRODUCTION FILES');
  console.log('');

  if (testFindings.length > 0) {
    console.log(`ℹ️  Found ${testFindings.length} stub(s) in test files (ACCEPTABLE)`);
    console.log('');
  }

  process.exit(0);
}

// BLOCKING: Stubbed code found in production
console.error(`❌ FOUND ${productionFindings.length} STUB(S) IN PRODUCTION FILES`);
console.error('');

// Group by severity
const bySeverity = {
  CRITICAL: productionFindings.filter(f => f.severity === 'CRITICAL'),
  HIGH: productionFindings.filter(f => f.severity === 'HIGH'),
  MEDIUM: productionFindings.filter(f => f.severity === 'MEDIUM'),
  LOW: productionFindings.filter(f => f.severity === 'LOW')
};

['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].forEach(severity => {
  const findings = bySeverity[severity];
  if (findings.length === 0) return;

  console.error(`\n🔴 ${severity} (${findings.length})`);
  console.error('─'.repeat(70));

  findings.forEach(finding => {
    console.error(`\n  File: ${finding.file}:${finding.line}`);
    console.error(`  Pattern: ${finding.pattern}`);
    console.error(`  Message: ${finding.message}`);
    console.error(`  Code: ${finding.snippet}`);
  });
});

console.error('');
console.error('═'.repeat(70));
console.error('⚠️  BLOCKING: Cannot proceed to PLAN→LEAD handoff');
console.error('');
console.error('Required Actions:');
console.error('1. Remove all stubbed/mocked code from production files');
console.error('2. Complete all TODO implementations');
console.error('3. Remove TEST_MODE flags from production code');
console.error('4. OR document in "Known Issues" and create follow-up SD');
console.error('');

process.exit(1);
