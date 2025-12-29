/**
 * QUICKFIX Self-Verification System
 * Double-checks QUICKFIX work to combat overconfidence
 *
 * Philosophy: "Trust, but verify - especially yourself."
 *
 * Enhancement: Self-verification layer
 * Created: 2025-11-17
 */

import { execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

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

/**
 * Check 1: Verify LOC constraint (actual ≤ 50)
 */
async function verifyLOCConstraint(qf, context) {
  const actualLoc = context.actualLoc || qf.actual_loc;

  if (!actualLoc) {
    return {
      passed: false,
      message: 'Actual LOC not measured',
      issue: 'Cannot verify LOC constraint - actual LOC not provided',
      details: 'Run git diff to measure actual lines changed'
    };
  }

  if (actualLoc > 50) {
    return {
      passed: false,
      message: `Actual LOC (${actualLoc}) exceeds limit (50)`,
      issue: 'LOC constraint violated - requires escalation to full SD',
      details: 'This change is too large for quick-fix workflow. Escalate to Strategic Directive.'
    };
  }

  if (actualLoc > 40) {
    return {
      passed: true,
      message: `Actual LOC (${actualLoc}) within limit but approaching threshold`,
      details: `Consider: Is this really a "quick" fix? Estimated was ${qf.estimated_loc || 'N/A'}.`
    };
  }

  return {
    passed: true,
    message: `Actual LOC (${actualLoc}) well within limit (50)`,
    details: `Estimated: ${qf.estimated_loc || 'N/A'}, Actual: ${actualLoc} - good estimation!`
  };
}

/**
 * Check 2: Detect scope creep (did we fix more than we said?)
 */
async function detectScopeCreep(qf, context) {
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

  const unrelatedFiles = filesChanged.filter(file =>
    !mentionedFiles.some(mentioned => file.includes(mentioned))
  );

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
