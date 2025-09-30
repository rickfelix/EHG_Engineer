#!/usr/bin/env node

/**
 * LEO Protocol Pre-commit Hook (Cross-platform)
 * 
 * Ensures compliance with LEO v4.1.2 requirements before commit
 * Works on Windows, Mac, and Linux
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Colors for terminal output (cross-platform)
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  reset: '\x1b[0m'
};

const log = {
  error: (msg) => console.error(`${colors.red}❌ ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  warning: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  info: (msg) => console.log(msg)
};

/**
 * Check for forbidden file patterns
 */
function checkFilesystemDrift() {
  log.info('🔍 Checking for filesystem drift...');

  // Check for PRD files
  const prdDir = path.join(process.cwd(), 'prds');
  if (fs.existsSync(prdDir)) {
    const prdFiles = fs.readdirSync(prdDir)
      .filter(f => f.endsWith('.md') || f.endsWith('.txt'));

    if (prdFiles.length > 0) {
      log.error('PRD markdown files detected!');
      log.info('PRDs must be stored in database only (LEO v4.1.2)');
      log.info('Fix: node scripts/add-prd-to-database.js && rm prds/*.md');
      return false;
    }
  }

  // Check for handoff files
  const handoffPatterns = [
    'handoffs/**/*.md',
    'docs/**/handoff-*.md'
  ];

  for (const pattern of handoffPatterns) {
    try {
      const files = require('glob').sync(pattern);
      if (files.length > 0) {
        log.error('Handoff files detected!');
        log.info('Handoffs must be stored in database only');
        log.info('Fix: Migrate to leo_handoff_tracking table');
        return false;
      }
    } catch {
      // glob not installed, skip this check
    }
  }

  // Check for gate review files (warning only)
  const gatePatterns = ['gates/**/*.json', 'reviews/**/*.md'];
  for (const pattern of gatePatterns) {
    try {
      const files = require('glob').sync(pattern);
      if (files.length > 0) {
        log.warning('Gate review files detected - consider migrating to database');
      }
    } catch {
      // glob not installed, skip
    }
  }

  log.success('Filesystem drift check passed');
  return true;
}

/**
 * Check module boundaries using ESLint
 */
function checkModuleBoundaries() {
  log.info('🔍 Checking module boundaries...');

  // Get staged files
  let stagedFiles;
  try {
    stagedFiles = execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf8' })
      .split('\n')
      .filter(f => f && (f.endsWith('.js') || f.endsWith('.jsx') || f.endsWith('.ts') || f.endsWith('.tsx')));
  } catch {
    log.warning('Could not get staged files');
    return true;
  }

  if (stagedFiles.length === 0) {
    log.success('No JS/TS files to check');
    return true;
  }

  // Check if ESLint is available
  try {
    execSync('npx eslint --version', { stdio: 'ignore' });
  } catch {
    log.warning('ESLint not configured - skipping boundary check');
    return true;
  }

  // Run ESLint on staged files
  try {
    execSync(`npx eslint ${stagedFiles.join(' ')} --max-warnings 0`, { stdio: 'ignore' });
    log.success('Module boundary check passed');
    return true;
  } catch {
    log.error('Module boundary violations detected!');
    log.info('LEO Engineering and EHG App modules must remain separate');
    log.info(`Run: npx eslint ${stagedFiles.join(' ')}`);
    return false;
  }
}

/**
 * Check for duplicate service files (existing check)
 */
function checkDuplicateServices() {
  log.info('🔍 Checking for duplicate service files...');

  const srcServicesDir = path.join(process.cwd(), 'src', 'services');
  const libDashboardDir = path.join(process.cwd(), 'lib', 'dashboard-legacy');

  if (!fs.existsSync(srcServicesDir) || !fs.existsSync(libDashboardDir)) {
    return true;
  }

  const duplicates = [];
  const libFiles = fs.readdirSync(libDashboardDir)
    .filter(f => f.endsWith('.js') && !f.includes('.deprecated'));

  for (const file of libFiles) {
    const srcPath = path.join(srcServicesDir, file);
    if (fs.existsSync(srcPath)) {
      duplicates.push(file);
    }
  }

  if (duplicates.length > 0) {
    log.error('Duplicate service files detected!');
    log.info('The following files exist in both src/services/ and lib/dashboard-legacy/:');
    duplicates.forEach(f => log.info(`  - ${f}`));
    log.info('\nTo fix this:');
    log.info('1. Choose which version to keep');
    log.info('2. Delete or rename the duplicate');
    log.info('3. Update all imports to use the correct path');
    return false;
  }

  log.success('No duplicate service files');
  return true;
}

/**
 * Run full drift check if available
 */
function runFullDriftCheck() {
  const driftCheckPath = path.join(process.cwd(), 'dist', 'tools', 'gates', 'drift-check.js');
  
  if (fs.existsSync(driftCheckPath)) {
    log.info('🔍 Running full drift check...');
    
    try {
      execSync(`node ${driftCheckPath}`, { stdio: 'inherit' });
      log.success('Full drift check passed');
      return true;
    } catch {
      log.error('Drift check failed!');
      log.info(`Run: node ${driftCheckPath}`);
      return false;
    }
  }
  
  return true;
}

/**
 * Main execution
 */
function main() {
  console.log('🔍 Running LEO Protocol compliance checks...');
  console.log('═'.repeat(50));

  const checks = [
    checkFilesystemDrift,
    checkModuleBoundaries,
    checkDuplicateServices,
    runFullDriftCheck
  ];

  for (const check of checks) {
    if (!check()) {
      console.log('\n' + '═'.repeat(50));
      log.error('Pre-commit checks failed!');
      process.exit(1);
    }
  }

  console.log('\n' + '═'.repeat(50));
  log.success('All LEO Protocol checks passed!');
  process.exit(0);
}

// Handle errors gracefully
process.on('uncaughtException', (err) => {
  log.error(`Unexpected error: ${err.message}`);
  process.exit(1);
});

// Run main
main();