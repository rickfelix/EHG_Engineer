/**
 * CLI Utilities for Complete Quick-Fix
 * Part of quick-fix modularization
 *
 * SD-FDBK-INFRA-FIX-COMPLETION-LIFECYCLE-001:
 *   - parseArguments rewritten to use node:util parseArgs (Node 18+ stdlib, zero dep)
 *   - Added --force-complete --reason audit-trailed bypass for self-verification + LOC cap
 *   - Added --non-interactive flag (fail-fast on any prompt instead of hanging under piped stdin)
 *   - Added --actual-source-loc / --actual-test-loc explicit overrides (source-only cap policy)
 */

import readline from 'readline';
import { parseArgs } from 'node:util';

/**
 * Module-level non-interactive state. Set by parseArguments when --non-interactive is passed.
 * prompt() checks this and fails-fast instead of opening readline (which wedges under piped stdin).
 */
let _nonInteractiveMode = false;

/** Test-only setter (not exported as default). */
export function _setNonInteractiveMode(value) {
  _nonInteractiveMode = Boolean(value);
}

/** Test-only getter. */
export function _getNonInteractiveMode() {
  return _nonInteractiveMode;
}

/**
 * Prompt user for input. Fails-fast in non-interactive mode.
 *
 * @param {string} question - Question to ask
 * @returns {Promise<string>} User's answer
 * @throws {Error} If non-interactive mode is set
 */
export function prompt(question) {
  if (_nonInteractiveMode) {
    return Promise.reject(new Error(
      `[NON_INTERACTIVE] Refusing to prompt under --non-interactive mode. Question was: ${question.trim()}. ` +
      `Pass the value explicitly via CLI flag (e.g., --uat-verified yes, --verification-notes "...", --force-complete --reason "...").`
    ));
  }

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
 * Parse CLI arguments via node:util parseArgs.
 *
 * @param {Array} args - Command line arguments (process.argv.slice(2))
 * @returns {object} { showHelp?: bool, qfId?: string, options?: object }
 */
export function parseArguments(args) {
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    return { showHelp: true };
  }

  const { values, positionals } = parseArgs({
    args,
    options: {
      'commit-sha':         { type: 'string' },
      'branch-name':        { type: 'string' },
      'actual-loc':         { type: 'string' },
      'actual-source-loc':  { type: 'string' },
      'actual-test-loc':    { type: 'string' },
      'pr-url':             { type: 'string' },
      'skip-tests':         { type: 'boolean' },
      'tests-pass':         { type: 'string' },
      'skip-typecheck':     { type: 'boolean' },
      'uat-verified':       { type: 'string' },
      'verification-notes': { type: 'string' },
      'force-complete':     { type: 'boolean' },
      'reason':             { type: 'string' },
      'non-interactive':    { type: 'boolean' },
      'help':               { type: 'boolean', short: 'h' }
    },
    allowPositionals: true,
    strict: true
  });

  if (positionals.length === 0) {
    return { showHelp: true };
  }

  const qfId = positionals[0];

  // SD-FDBK-INFRA-FIX-COMPLETION-LIFECYCLE-001 FR-2: --force-complete REQUIRES --reason
  if (values['force-complete'] && !values['reason']) {
    throw new Error(
      '[FORCE_COMPLETE_NO_REASON] --force-complete requires --reason "<text>". ' +
      'The reason is recorded in verification_notes as a structured audit trail.'
    );
  }

  // FR-3: persist --non-interactive so prompt() can fail-fast
  if (values['non-interactive']) {
    _nonInteractiveMode = true;
  }

  const options = {
    commitSha:         values['commit-sha'],
    branchName:        values['branch-name'],
    actualLoc:         values['actual-loc']        != null ? parseInt(values['actual-loc'], 10) : undefined,
    actualSourceLoc:   values['actual-source-loc'] != null ? parseInt(values['actual-source-loc'], 10) : undefined,
    actualTestLoc:     values['actual-test-loc']   != null ? parseInt(values['actual-test-loc'], 10) : undefined,
    prUrl:             values['pr-url'],
    skipTestRun:       values['skip-tests']       || false,
    testsPass:         values['tests-pass']       != null ? values['tests-pass'].toLowerCase().startsWith('y') : undefined,
    skipTypeCheck:     values['skip-typecheck']   || false,
    uatVerified:       values['uat-verified']     != null ? values['uat-verified'].toLowerCase().startsWith('y') : undefined,
    verificationNotes: values['verification-notes'],
    forceComplete:     values['force-complete']   || false,
    reason:            values['reason'],
    nonInteractive:    values['non-interactive'] || false
  };

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
  --actual-loc          Total LOC changed (auto-detected from git diff)
  --actual-source-loc   Source-only LOC override (excludes test files; cap policy applies here)
  --actual-test-loc     Test-only LOC override (separate sanity cap; not policy-relevant)
  --pr-url              GitHub PR URL (REQUIRED)
  --skip-tests          Skip running tests (trusts CI; testsPass=true by default)
  --tests-pass          Override testsPass explicitly (yes/no); optional with --skip-tests
  --skip-typecheck      Skip TypeScript verification (not recommended)
  --uat-verified        UAT verified (yes/no, will prompt if not provided)
  --verification-notes  Optional notes about verification
  --force-complete      Bypass self-verification + LOC-cap blocks; sets quick_fixes.force_completed=true.
                        REQUIRES --reason "<text>". Used for already-merged PRs or audit-trailed exceptions.
  --reason              Required with --force-complete. Recorded in verification_notes JSON audit trail.
  --non-interactive     Fail-fast on any prompt (instead of hanging under piped stdin). Use in CI / scripts.
  --help, -h            Show this help

Programmatic Verification:
  The script runs these checks automatically (not self-reported):

  1. Unit tests: npm run test:unit (2 min timeout)
  2. E2E smoke tests: npm run test:e2e --grep="smoke" (5 min timeout)
  3. TypeScript: npx tsc --noEmit (1 min timeout)

  All checks MUST pass. Use --skip-tests or --skip-typecheck ONLY if
  these were just run externally (e.g., in CI pipeline).

Requirements:
  - Both unit and E2E tests MUST pass (programmatically verified) — bypass via --force-complete
  - TypeScript MUST compile without errors (programmatically verified)
  - UAT MUST be verified (manual testing) — bypass via --force-complete
  - Actual source LOC MUST be ≤ 75 (Tier-2 hard cap; bypass via --force-complete)
  - PR MUST be created (no direct merge)

Examples:
  node scripts/complete-quick-fix.js QF-20251117-001
  node scripts/complete-quick-fix.js QF-20251117-001 --pr-url https://github.com/org/repo/pull/123
  node scripts/complete-quick-fix.js QF-20251117-001 --skip-tests --tests-pass yes --pr-url https://...
  node scripts/complete-quick-fix.js QF-20251117-001 --force-complete --reason "PR already merged sha abc1234" --non-interactive --pr-url https://...
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
