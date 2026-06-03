/**
 * QUICKFIX Self-Verification System
 * Double-checks QUICKFIX work to combat overconfidence
 *
 * Philosophy: "Trust, but verify - especially yourself."
 *
 * Enhancement: Self-verification layer
 * Created: 2025-11-17
 */

import { createSupabaseClient } from './supabase-client.js';
import { execSync } from 'child_process';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createSupabaseClient();

/**
 * Self-Verification Checklist
 * Validates QUICKFIX work before marking complete
 *
 * @param {string} qfId - Quick-fix ID
 * @param {Object} context - Verification context
 * @returns {Promise<Object>} Verification results
 */
export async function runSelfVerification(qfId, context = {}) {
  console.log('\n🔍 QUICKFIX Self-Verification\n');
  console.log('   Philosophy: "Trust, but verify - especially yourself."\n');

  const verificationResults = {
    passed: true,
    confidence: 100,
    checks: [],
    warnings: [],
    blockers: [],
    recommendations: []
  };

  // Load quick-fix data
  const { data: qf, error } = await supabase
    .from('quick_fixes')
    .select('*')
    .eq('id', qfId)
    .single();

  if (error || !qf) {
    return {
      passed: false,
      confidence: 0,
      blockers: ['Quick-fix record not found']
    };
  }

  console.log(`   Quick-Fix: ${qf.title}\n`);

  // === CHECK 1: LOC Constraint Validation ===
  console.log('📏 Check 1: LOC Constraint Validation\n');

  const locCheck = await verifyLOCConstraint(qf, context);
  verificationResults.checks.push(locCheck);

  if (!locCheck.passed) {
    verificationResults.passed = false;
    verificationResults.blockers.push(locCheck.issue);
  }

  console.log(`   ${locCheck.passed ? '✅' : '❌'} ${locCheck.message}`);
  if (locCheck.details) {
    console.log(`      ${locCheck.details}`);
  }
  console.log();

  // === CHECK 2: Scope Creep Detection ===
  console.log('🎯 Check 2: Scope Creep Detection\n');

  const scopeCheck = await detectScopeCreep(qf, context);
  verificationResults.checks.push(scopeCheck);

  if (!scopeCheck.passed) {
    verificationResults.warnings.push(scopeCheck.issue);
    verificationResults.confidence = Math.min(verificationResults.confidence, 70);
  }

  console.log(`   ${scopeCheck.passed ? '✅' : '⚠️ '} ${scopeCheck.message}`);
  if (scopeCheck.details) {
    console.log(`      ${scopeCheck.details}`);
  }
  console.log();

  // === CHECK 3: Test Coverage Reality Check ===
  console.log('🧪 Check 3: Test Coverage Reality Check\n');

  const testCheck = await verifyTestCoverage(qf, context);
  verificationResults.checks.push(testCheck);

  if (!testCheck.passed) {
    verificationResults.passed = false;
    verificationResults.blockers.push(testCheck.issue);
  }

  console.log(`   ${testCheck.passed ? '✅' : '❌'} ${testCheck.message}`);
  if (testCheck.details) {
    console.log(`      ${testCheck.details}`);
  }
  console.log();

  // === CHECK 4: Did We Actually Fix The Issue? ===
  console.log('🎯 Check 4: Issue Resolution Verification\n');

  const resolutionCheck = await verifyIssueResolution(qf, context);
  verificationResults.checks.push(resolutionCheck);

  if (!resolutionCheck.passed) {
    verificationResults.warnings.push(resolutionCheck.issue);
    verificationResults.confidence = Math.min(verificationResults.confidence, 60);
  }

  console.log(`   ${resolutionCheck.passed ? '✅' : '⚠️ '} ${resolutionCheck.message}`);
  if (resolutionCheck.details) {
    console.log(`      ${resolutionCheck.details}`);
  }
  console.log();

  // === CHECK 5: Unintended Consequences ===
  console.log('⚠️  Check 5: Unintended Consequences Scan\n');

  const consequencesCheck = await scanUnintendedConsequences(qf, context);
  verificationResults.checks.push(consequencesCheck);

  if (!consequencesCheck.passed) {
    verificationResults.warnings.push(consequencesCheck.issue);
    verificationResults.confidence = Math.min(verificationResults.confidence, 75);
  }

  console.log(`   ${consequencesCheck.passed ? '✅' : '⚠️ '} ${consequencesCheck.message}`);
  if (consequencesCheck.details) {
    console.log(`      ${consequencesCheck.details}`);
  }
  console.log();

  // === CHECK 6: Overconfidence Detection ===
  console.log('🤔 Check 6: Overconfidence Detection\n');

  const confidenceCheck = detectOverconfidence(qf, context, verificationResults);
  verificationResults.checks.push(confidenceCheck);

  if (!confidenceCheck.passed) {
    verificationResults.confidence = Math.min(verificationResults.confidence, confidenceCheck.adjustedConfidence);
    verificationResults.warnings.push(confidenceCheck.issue);
  }

  console.log(`   ${confidenceCheck.passed ? '✅' : '⚠️ '} ${confidenceCheck.message}`);
  if (confidenceCheck.details) {
    console.log(`      ${confidenceCheck.details}`);
  }
  console.log();

  // === FINAL VERDICT ===
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (verificationResults.passed && verificationResults.warnings.length === 0) {
    console.log(`✅ VERIFICATION PASSED (${verificationResults.confidence}% confidence)\n`);
    console.log('   All checks passed. Safe to complete quick-fix.\n');
  } else if (verificationResults.passed && verificationResults.warnings.length > 0) {
    console.log(`⚠️  VERIFICATION PASSED WITH WARNINGS (${verificationResults.confidence}% confidence)\n`);
    console.log(`   ${verificationResults.warnings.length} warning(s) detected:\n`);
    verificationResults.warnings.forEach((w, i) => {
      console.log(`   ${i + 1}. ${w}`);
    });
    console.log('\n   You can proceed, but review warnings carefully.\n');
  } else {
    console.log('❌ VERIFICATION FAILED\n');
    console.log(`   ${verificationResults.blockers.length} blocker(s) detected:\n`);
    verificationResults.blockers.forEach((b, i) => {
      console.log(`   ${i + 1}. ${b}`);
    });
    console.log('\n   Cannot complete until blockers resolved.\n');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  return verificationResults;
}

import { QF_HARD_LOC_CAP, computeNetSourceLoc } from '../scripts/modules/complete-quick-fix/verification.js';

/**
 * Check 1: Verify LOC constraint against the QF source-LOC cap.
 *
 * QF-20260511-056: applies the cap to source-only LOC (test LOC excluded),
 * matching the policy already used by scripts/modules/complete-quick-fix/verification.js.
 * Falls back to combined actualLoc only when no source/test split is available.
 */
export async function verifyLOCConstraint(qf, context) {
  const sourceLoc = context.actualSourceLoc ?? qf.actual_source_loc ?? null;
  const testLoc = context.actualTestLoc ?? qf.actual_test_loc ?? null;
  const actualLoc = context.actualLoc || qf.actual_loc;
  const measured = sourceLoc ?? actualLoc;
  const splitAvailable = sourceLoc !== null;

  if (measured === null || measured === undefined) {
    return {
      passed: false,
      message: 'Source LOC not measured',
      issue: 'Cannot verify LOC constraint - source LOC not provided',
      details: 'Run git diff to measure source-only lines changed'
    };
  }

  // SD-FDBK-ENH-COMPLETE-QUICK-FIX-002: cap on NET source LOC (raw minus pure whole-file
  // deletions) via the shared helper, matching validateLOC — so a dead-code-removal QF that
  // passes validateLOC is not independently re-blocked here. Only discount when a source
  // split is available (deletion LOC is part of the split); the actualLoc fallback stays raw.
  const netMeasured = splitAvailable ? computeNetSourceLoc(measured, context.sourceDeletionLoc) : measured;
  const deletionLoc = measured - netMeasured;
  // Preserve the original label for the common no-deletion path; only surface "Net" when
  // pure-deletion LOC was actually discounted (keeps existing message contracts intact).
  const label = splitAvailable ? (deletionLoc > 0 ? 'Net source LOC' : 'Source LOC') : 'Actual LOC';
  const suffix = (splitAvailable && testLoc !== null ? ` (test: ${testLoc}, excluded)` : '') + (deletionLoc > 0 ? `, ${deletionLoc} pure-deletion excluded` : '');

  // SD-FDBK-ENH-SOURCE-LOC-CAP-001: --over-cap-reason demotes the over-cap result from
  // a self-verification BLOCKER to a non-blocking warning. This is the source-LOC cap
  // ONLY — the scope-creep (Check 2), test-coverage (Check 3), and other checks still
  // enforce normally. The orchestrator threads context.overCapReason alongside the
  // validateLOC flag so a single --over-cap-reason clears BOTH enforcement points.
  if (netMeasured > QF_HARD_LOC_CAP && context.overCapReason) {
    return {
      passed: true,
      message: `${label} (${netMeasured}) exceeds limit (${QF_HARD_LOC_CAP}) — bypassed via --over-cap-reason${suffix}`,
      details: `Over-cap bypass authorized: "${context.overCapReason}". Source-LOC cap only; tests/compliance/scope-creep gates still enforce.`
    };
  }

  if (netMeasured > QF_HARD_LOC_CAP) {
    return {
      passed: false,
      message: `${label} (${netMeasured}) exceeds limit (${QF_HARD_LOC_CAP})${suffix}`,
      issue: 'LOC constraint violated - requires escalation to full SD',
      details: 'This change is too large for quick-fix workflow. Escalate to Strategic Directive.'
    };
  }

  if (netMeasured > QF_HARD_LOC_CAP * 0.8) {
    return {
      passed: true,
      message: `${label} (${netMeasured}) within limit but approaching threshold${suffix}`,
      details: `Consider: Is this really a "quick" fix? Estimated was ${qf.estimated_loc || 'N/A'}.`
    };
  }

  return {
    passed: true,
    message: `${label} (${netMeasured}) well within limit (${QF_HARD_LOC_CAP})${suffix}`,
    details: `Estimated: ${qf.estimated_loc || 'N/A'}, ${label}: ${netMeasured} - good estimation!`
  };
}

/**
 * Check 2: Detect scope creep (did we fix more than we said?)
 */
// QF-20260524-488 / feedback e0cf303f: a test file co-located with the production
// file it covers is in-scope, not scope creep. Match common test paths and reduce a
// path to the production base name it covers (strip a .test/.spec marker + extension).
const TEST_PATH_RE = /(\.test\.|\.spec\.|(^|\/)__tests__\/|(^|\/)tests?\/)/i;
function coveredBaseName(file) {
  const leaf = (file || '').split('/').pop() || '';
  return leaf.replace(/\.(test|spec)\.[^.]+$/i, '').replace(/\.[^.]+$/, '');
}

// QF-20260524-272 / feedback f5577d22: a test is frequently named after the BUG
// TOPIC (e.g. `auto-route-phase-count.test.js`) rather than the production file it
// exercises (`auto-route-decider.js`), so the exact base-name match (above) misses
// it and the cohesive prod+test pair false-flags as scope creep. Relate a test to
// in-scope work by a shared TOPIC token or directory segment too. Generic structural
// tokens are excluded so a genuinely unrelated test still flags (CONTROL tests).
const GENERIC_PATH_TOKENS = new Set([
  'test', 'tests', 'spec', 'specs', 'unit', 'e2e', 'src', 'lib', 'libs',
  'scripts', 'script', 'modules', 'module', 'components', 'component',
  'index', 'utils', 'util', 'main', 'json', 'tsx', 'jsx'
]);
function topicTokens(nameOrPath) {
  return (nameOrPath || '')
    .toLowerCase()
    .split(/[/\\\-_.]+/)
    .filter(t => t.length >= 4 && !GENERIC_PATH_TOKENS.has(t));
}
function dirSegments(file) {
  const parts = (file || '').split(/[/\\]/);
  parts.pop(); // drop the leaf file name
  return parts
    .map(seg => seg.toLowerCase())
    .filter(seg => seg.length >= 4 && !GENERIC_PATH_TOKENS.has(seg));
}

export async function detectScopeCreep(qf, context) {
  const filesChanged = context.filesChanged || [];

  // Check if we changed more files than expected
  if (filesChanged.length > 3) {
    return {
      passed: false,
      message: `Too many files changed (${filesChanged.length})`,
      issue: 'Scope creep detected - quick-fixes should touch 1-3 files max',
      details: `Files: ${filesChanged.join(', ')}`
    };
  }

  // Check if we changed files unrelated to the issue
  const issueDescription = `${qf.title} ${qf.description}`.toLowerCase();
  const mentionedFiles = issueDescription.match(/[a-zA-Z0-9_-]+\.(tsx?|jsx?|js|css|sql)/g) || [];

  // QF-20260524-488 / feedback e0cf303f + QF-20260524-272 / feedback f5577d22: a
  // changed test file is in-scope when (a) the production base name it covers matches
  // a changed non-test file or a mentioned file, OR (b) it shares a topic token or
  // directory segment with the changed-production / mentioned set. A cohesive
  // prod+test pair is not scope creep; genuinely unrelated files (including a test for
  // an unrelated module) are still flagged. Production-file detection stays strict.
  const prodFiles = filesChanged.filter(f => !TEST_PATH_RE.test(f));
  const changedProdBases = new Set(prodFiles.map(coveredBaseName));
  const mentionedBases = new Set(mentionedFiles.map(coveredBaseName));
  // Topic pool: tokens from in-scope production + explicitly-mentioned file names.
  const topicPool = new Set();
  for (const base of [...changedProdBases, ...mentionedBases]) {
    for (const t of topicTokens(base)) topicPool.add(t);
  }
  // Directory pool: meaningful directory segments of changed production files.
  const dirPool = new Set();
  for (const f of prodFiles) {
    for (const seg of dirSegments(f)) dirPool.add(seg);
  }
  const testIsInScope = (file) => {
    const base = coveredBaseName(file);
    if (changedProdBases.has(base) || mentionedBases.has(base)) return true; // sibling base name
    if (topicTokens(base).some(t => topicPool.has(t))) return true;          // shared topic token
    if (dirSegments(file).some(seg => dirPool.has(seg))) return true;        // shared topic directory
    return false;
  };
  const unrelatedFiles = filesChanged.filter(file => {
    if (mentionedFiles.some(mentioned => file.includes(mentioned))) return false;
    if (TEST_PATH_RE.test(file) && testIsInScope(file)) return false;
    return true;
  });

  if (unrelatedFiles.length > 0 && mentionedFiles.length > 0) {
    return {
      passed: false,
      message: 'Changed files not mentioned in issue description',
      issue: 'Possible scope creep - changed unrelated files',
      details: `Unrelated: ${unrelatedFiles.join(', ')}`
    };
  }

  return {
    passed: true,
    message: `Scope appropriate (${filesChanged.length} files changed)`,
    details: filesChanged.length > 0 ? `Files: ${filesChanged.join(', ')}` : null
  };
}

/**
 * Check 3: Verify test coverage claim
 */
async function verifyTestCoverage(qf, context) {
  const testsPass = context.testsPass !== undefined ? context.testsPass : qf.tests_passing;

  if (testsPass === null || testsPass === undefined) {
    return {
      passed: false,
      message: 'Test status unknown',
      issue: 'Cannot verify tests passing - no test execution recorded',
      details: 'Run: npm run test:unit && npm run test:e2e'
    };
  }

  if (!testsPass) {
    return {
      passed: false,
      message: 'Tests are failing',
      issue: 'Test suite not passing - cannot complete',
      details: 'Fix test failures before completing quick-fix'
    };
  }

  // Double-check by actually running tests (if not in context)
  if (!context.testsVerifiedRecently) {
    try {
      console.log('      Running verification tests...');

      execSync('npm run test:unit', { stdio: 'pipe', timeout: 30000 });
      execSync('npm run test:e2e', { stdio: 'pipe', timeout: 60000 });

      return {
        passed: true,
        message: 'Tests verified passing (double-checked)',
        details: 'Both unit and E2E tests confirmed passing'
      };

    } catch (err) {
      return {
        passed: false,
        message: 'Test verification failed',
        issue: 'Tests claimed to pass but verification run failed',
        details: `Error: ${err.message.substring(0, 100)}`
      };
    }
  }

  return {
    passed: true,
    message: 'Tests confirmed passing',
    details: 'Both unit and E2E smoke tests verified'
  };
}

/**
 * Check 4: Did we actually fix the issue?
 */
async function verifyIssueResolution(qf, context) {
  const uatVerified = context.uatVerified !== undefined ? context.uatVerified : qf.uat_verified;

  if (!uatVerified) {
    return {
      passed: false,
      message: 'UAT verification missing',
      issue: 'User has not confirmed fix works',
      details: 'Manually test the fix and verify it resolves the issue'
    };
  }

  // Check if issue description and fix align
  const _issueType = qf.type;
  const filesChanged = context.filesChanged || [];

  // Heuristic: If issue is "onClick undefined" but no .tsx/.jsx files changed, suspicious
  if (qf.description?.toLowerCase().includes('onclick') || qf.description?.toLowerCase().includes('event handler')) {
    const hasReactFiles = filesChanged.some(f => f.endsWith('.tsx') || f.endsWith('.jsx'));
    if (!hasReactFiles && filesChanged.length > 0) {
      return {
        passed: false,
        message: 'Fix doesn\'t match issue type',
        issue: 'Issue mentions event handlers but no React files changed',
        details: 'Verify you fixed the right issue'
      };
    }
  }

  return {
    passed: true,
    message: 'Issue resolution verified by UAT',
    details: 'User confirmed fix resolves the issue'
  };
}

/**
 * Check 5: Scan for unintended consequences
 */
async function scanUnintendedConsequences(qf, context) {
  const warnings = [];

  // Check if we introduced new console errors
  if (context.consoleErrors && context.consoleErrors.length > 0) {
    warnings.push(`New console errors detected: ${context.consoleErrors.length}`);
  }

  // Check if we broke other tests
  if (context.testFailures && context.testFailures.length > 0) {
    warnings.push(`Other tests now failing: ${context.testFailures.join(', ')}`);
  }

  // Check if we changed critical files (auth, security, database)
  const filesChanged = context.filesChanged || [];
  const criticalFiles = filesChanged.filter(f =>
    f.includes('auth') ||
    f.includes('security') ||
    f.includes('permission') ||
    f.includes('.sql') ||
    f.includes('migration')
  );

  if (criticalFiles.length > 0) {
    warnings.push(`Critical files modified: ${criticalFiles.join(', ')}`);
  }

  if (warnings.length > 0) {
    return {
      passed: false,
      message: `${warnings.length} potential unintended consequence(s)`,
      issue: warnings.join('; '),
      details: 'Review carefully - may need escalation to full SD'
    };
  }

  return {
    passed: true,
    message: 'No obvious unintended consequences detected',
    details: 'Change appears isolated and safe'
  };
}

/**
 * Check 6: Detect overconfidence
 */
function detectOverconfidence(qf, context, verificationResults) {
  const flags = [];

  // Flag 1: LOC underestimated by >50%
  if (qf.estimated_loc && context.actualLoc) {
    const underestimation = ((context.actualLoc - qf.estimated_loc) / qf.estimated_loc) * 100;
    if (underestimation > 50) {
      flags.push(`LOC underestimated by ${Math.round(underestimation)}%`);
    }
  }

  // Flag 2: Multiple warnings already raised
  if (verificationResults.warnings.length >= 2) {
    flags.push(`${verificationResults.warnings.length} warnings raised during verification`);
  }

  // Flag 3: Changed files don't match description
  const scopeCheck = verificationResults.checks.find(c => c.message.includes('Scope'));
  if (scopeCheck && !scopeCheck.passed) {
    flags.push('Scope creep detected');
  }

  // Flag 4: Critical severity but treated as quick-fix
  if (qf.severity === 'critical') {
    flags.push('Critical severity issue treated as quick-fix');
  }

  if (flags.length >= 2) {
    return {
      passed: false,
      message: 'Overconfidence detected',
      issue: `Multiple red flags: ${flags.join('; ')}`,
      details: 'Consider escalating to full SD for proper review',
      adjustedConfidence: 60
    };
  }

  if (flags.length === 1) {
    return {
      passed: true,
      message: 'Minor confidence concern',
      details: flags[0],
      adjustedConfidence: 80
    };
  }

  return {
    passed: true,
    message: 'No overconfidence detected',
    details: 'Estimations and execution aligned well'
  };
}
