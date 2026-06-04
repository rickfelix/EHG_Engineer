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
      // QF-20260604-479: explicit override to complete a QF with an EMPTY branch diff
      // (false-completion guard). The ONLY way past the guard; NOT bypassable by --force-complete.
      'allow-empty-diff':   { type: 'boolean' },
      // SD-FDBK-ENH-SOURCE-LOC-CAP-001: bypass ONLY the source-LOC cap (not tests/compliance/self-verify)
      'over-cap-reason':    { type: 'string' },
      'non-interactive':    { type: 'boolean' },
      'auto-pr':            { type: 'boolean' },
      // QF-20260511-258: bypass resolver-freshness stale-branch guard. Requires reason.
      'allow-stale-branch': { type: 'boolean' },
      // QF-20260524-587: granular WARN-verdict compliance bypass. Requires reason.
      'accept-compliance-warn': { type: 'boolean' },
      // SD-FDBK-ENH-COMPLETE-QUICK-FIX-001: granular low-confidence self-verify bypass. Requires reason.
      'accept-low-confidence': { type: 'boolean' },
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

  // QF-20260511-258: --allow-stale-branch REQUIRES --reason for the same audit
  // reason. Bypassing the resolver-freshness gate without a logged reason re-opens
  // the silent-no-op class the gate exists to prevent.
  if (values['allow-stale-branch'] && !values['reason']) {
    throw new Error(
      '[ALLOW_STALE_BRANCH_NO_REASON] --allow-stale-branch requires --reason "<text>". ' +
      'Bypassing the resolver-freshness gate produces a silent auto-resolver no-op; ' +
      'the reason is recorded in verification_notes as a structured audit trail.'
    );
  }

  // SD-FDBK-ENH-SOURCE-LOC-CAP-001: --over-cap-reason requires a non-empty justification.
  // It bypasses ONLY the source-LOC cap (validateLOC + self-verifier Check 1), NOT the
  // failing-tests / compliance / scope-creep gates, and is recorded in verification_notes.
  if (values['over-cap-reason'] !== undefined && !String(values['over-cap-reason']).trim()) {
    throw new Error(
      '[OVER_CAP_REASON_REQUIRED] --over-cap-reason requires a non-empty "<text>" justification. ' +
      'It bypasses ONLY the source-LOC cap (not tests/compliance/self-verification) and is recorded in verification_notes.'
    );
  }

  // QF-20260524-587: --accept-compliance-warn REQUIRES --reason. It clears ONLY the
  // WARN-verdict compliance prompt (so completion works under --non-interactive) and does
  // NOT bypass FAIL-verdict, the LOC cap, or self-verification — unlike --force-complete.
  if (values['accept-compliance-warn'] && !values['reason']) {
    throw new Error(
      '[ACCEPT_COMPLIANCE_WARN_NO_REASON] --accept-compliance-warn requires --reason "<text>". ' +
      'It clears ONLY the WARN-verdict compliance prompt (not FAIL/LOC/self-verification) and is recorded in verification_notes.'
    );
  }

  // SD-FDBK-ENH-COMPLETE-QUICK-FIX-001: --accept-low-confidence REQUIRES --reason. It clears ONLY the
  // self-verification LOW-CONFIDENCE proceed-anyway prompt (so completion works under --non-interactive)
  // and does NOT bypass verification blockers, the LOC cap, or compliance — unlike --force-complete.
  if (values['accept-low-confidence'] && !values['reason']) {
    throw new Error(
      '[ACCEPT_LOW_CONFIDENCE_NO_REASON] --accept-low-confidence requires --reason "<text>". ' +
      'It clears ONLY the low-confidence self-verification prompt (not blockers/LOC/compliance) and is recorded in verification_notes.'
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
    overCapReason:     values['over-cap-reason']   || undefined,
    acceptComplianceWarn: values['accept-compliance-warn'] || false,
    acceptLowConfidence: values['accept-low-confidence'] || false,
    nonInteractive:    values['non-interactive'] || false,
    // QF-20260509-407: --auto-pr opt-in flag, plus auto-enable under --non-interactive
    // when no --pr-url provided. Eliminates the mid-run prompt-then-throw pattern
    // (the prompt() wrapper rejects under non-interactive but only AFTER several
    // setup steps have already run).
    autoPr:            values['auto-pr'] || (values['non-interactive'] && !values['pr-url']) || false,
    // QF-20260511-258: stale-branch guard bypass. Reason is the same --reason field
    // (so audit trails stay unified). When set without --reason, the FORCE_COMPLETE
    // check above would not trigger; we require --reason explicitly here too.
    allowStaleBranch:       values['allow-stale-branch'] || false,
    allowStaleBranchReason: values['allow-stale-branch'] ? values['reason'] : undefined,
    // QF-20260604-479: empty-diff guard override + its audit reason (shares --reason)
    allowEmptyDiff:         values['allow-empty-diff'] || false,
    allowEmptyDiffReason:   values['allow-empty-diff'] ? values['reason'] : undefined
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
                        When set without --pr-url, --auto-pr is auto-enabled to avoid mid-run prompt failure.
  --auto-pr             Auto-create the PR via 'gh pr create' if --pr-url is not provided.
                        Implicit under --non-interactive when no --pr-url.
  --allow-stale-branch  Bypass the QF-258 resolver-freshness gate. REQUIRES --reason.
                        Use only when shipping is the right call despite worker being
                        forked before a resolver-relevant fix landed in main. The
                        auto-resolver will likely no-op for this completion.
  --accept-compliance-warn  Clear ONLY the WARN-verdict compliance prompt (so completion
                        works under --non-interactive). REQUIRES --reason. Does NOT bypass
                        FAIL-verdict, the LOC cap, or self-verification — narrower and safer
                        than --force-complete. Recorded in verification_notes.
  --accept-low-confidence   Clear ONLY the self-verification LOW-CONFIDENCE proceed-anyway prompt
                        (so completion works under --non-interactive). REQUIRES --reason. Does NOT
                        bypass verification blockers, the LOC cap, or compliance — narrower and safer
                        than --force-complete. Recorded in verification_notes.
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
