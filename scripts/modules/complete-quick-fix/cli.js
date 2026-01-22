/**
 * CLI Utilities for Complete Quick-Fix
 * Part of quick-fix modularization
 */

import readline from 'readline';

/**
 * Prompt user for input
 * @param {string} question - Question to ask
 * @returns {Promise<string>} User's answer
 */
export function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Parse CLI arguments
 * @param {Array} args - Command line arguments
 * @returns {object} Parsed options and qfId
 */
export function parseArguments(args) {
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    return { showHelp: true };
  }

  const qfId = args[0];
  const options = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--commit-sha') {
      options.commitSha = args[++i];
    } else if (arg === '--branch-name') {
      options.branchName = args[++i];
    } else if (arg === '--actual-loc') {
      options.actualLoc = parseInt(args[++i]);
    } else if (arg === '--pr-url') {
      options.prUrl = args[++i];
    } else if (arg === '--skip-tests') {
      options.skipTestRun = true;
    } else if (arg === '--tests-pass') {
      options.testsPass = args[++i].toLowerCase().startsWith('y');
    } else if (arg === '--skip-typecheck') {
      options.skipTypeCheck = true;
    } else if (arg === '--uat-verified') {
      options.uatVerified = args[++i].toLowerCase().startsWith('y');
    } else if (arg === '--verification-notes') {
      options.verificationNotes = args[++i];
    }
  }

  return { qfId, options };
}

/**
 * Display help text
 */
export function displayHelp() {
  console.log(`
LEO Quick-Fix Workflow - Complete Issue

Usage:
  node scripts/complete-quick-fix.js QF-20251117-001
  node scripts/complete-quick-fix.js QF-20251117-001 --commit-sha abc123 --actual-loc 15 --pr-url https://...

Options:
  --commit-sha          Git commit SHA (auto-detected if not provided)
  --branch-name         Git branch name (auto-detected if not provided)
  --actual-loc          Actual lines of code changed (auto-detected from git diff)
  --pr-url              GitHub PR URL (REQUIRED)
  --skip-tests          Skip running tests (use with --tests-pass to use cached results)
  --tests-pass          Use cached test result (requires --skip-tests flag)
  --skip-typecheck      Skip TypeScript verification (not recommended)
  --uat-verified        UAT verified (yes/no, will prompt if not provided)
  --verification-notes  Optional notes about verification
  --help, -h            Show this help

Programmatic Verification:
  The script runs these checks automatically (not self-reported):

  1. Unit tests: npm run test:unit (2 min timeout)
  2. E2E smoke tests: npm run test:e2e --grep="smoke" (5 min timeout)
  3. TypeScript: npx tsc --noEmit (1 min timeout)

  All checks MUST pass. Use --skip-tests or --skip-typecheck ONLY if
  these were just run externally (e.g., in CI pipeline).

Requirements:
  - Both unit and E2E tests MUST pass (programmatically verified)
  - TypeScript MUST compile without errors (programmatically verified)
  - UAT MUST be verified (manual testing)
  - Actual LOC MUST be ≤ 50 (hard cap)
  - PR MUST be created (no direct merge)

Examples:
  node scripts/complete-quick-fix.js QF-20251117-001
  node scripts/complete-quick-fix.js QF-20251117-001 --pr-url https://github.com/org/repo/pull/123
  node scripts/complete-quick-fix.js QF-20251117-001 --skip-tests --tests-pass yes --pr-url https://...
  `);
}

/**
 * Display completion summary
 * @param {object} qf - Quick-fix record
 * @param {number} actualLoc - Actual LOC
 * @param {string} commitSha - Commit SHA
 * @param {string} branchName - Branch name
 * @param {string} prUrl - PR URL
 * @param {Array} filesChanged - List of changed files
 */
export function displayCompletionSummary(qf, actualLoc, commitSha, branchName, prUrl, filesChanged) {
  console.log('✅ Quick-fix completed successfully!\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📊 COMPLETION SUMMARY\n');
  console.log(`   ID:             ${qf.id}`);
  console.log(`   Title:          ${qf.title}`);
  console.log(`   Actual LOC:     ${actualLoc}`);
  console.log(`   Commit:         ${commitSha ? commitSha.substring(0, 7) : 'N/A'}`);
  console.log(`   Branch:         ${branchName || 'N/A'}`);
  console.log(`   PR:             ${prUrl}`);
  console.log('   Tests:          ✅ Passing');
  console.log('   UAT:            ✅ Verified');
  if (filesChanged.length > 0) {
    console.log(`   Files Changed:  ${filesChanged.length}`);
    filesChanged.forEach(file => console.log(`      - ${file}`));
  }
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}
