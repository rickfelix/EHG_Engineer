#!/usr/bin/env node
/**
 * Ship Preflight Verification CLI
 *
 * Pre-ship verification gate that ensures all code is ready for shipping:
 * 1. Branch Verification - No unmerged branches for current SD
 * 2. State Reconciliation - Database SD status matches git state
 * 3. Multi-Repo Coordination - Related branches across repos identified
 *
 * Usage:
 *   node scripts/ship-preflight.js                    # Auto-detect SD from branch
 *   node scripts/ship-preflight.js SD-XXX-001         # Explicit SD ID
 *   node scripts/ship-preflight.js --create-prs       # Auto-create missing PRs
 *   node scripts/ship-preflight.js --fix              # Auto-fix state mismatches
 *   node scripts/ship-preflight.js --json             # JSON output for automation
 *   node scripts/ship-preflight.js --reconcile-only   # Only run state reconciliation
 *   node scripts/ship-preflight.js --multi-repo       # Only run multi-repo coordination
 *
 * @module ship-preflight
 * @version 1.0.0
 */

import { execSync } from 'child_process';
import { ShippingPreflightVerifier } from './modules/shipping/ShippingPreflightVerifier.js';
import { SDGitStateReconciler } from './modules/shipping/SDGitStateReconciler.js';
import { MultiRepoCoordinator } from './modules/shipping/MultiRepoCoordinator.js';

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    sdId: null,
    createPrs: false,
    fix: false,
    json: false,
    reconcileOnly: false,
    multiRepoOnly: false,
    verbose: false,
    help: false
  };

  for (const arg of args) {
    if (arg === '--create-prs') {
      options.createPrs = true;
    } else if (arg === '--fix') {
      options.fix = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--reconcile-only') {
      options.reconcileOnly = true;
    } else if (arg === '--multi-repo') {
      options.multiRepoOnly = true;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (!arg.startsWith('-')) {
      options.sdId = arg;
    }
  }

  return options;
}

// Extract SD ID from current git branch
function extractSDFromBranch() {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf8',
      timeout: 5000
    }).trim();

    // Match SD-XXX-NNN pattern
    const match = branch.match(/SD-[A-Z]+-\d+/i);
    if (match) {
      return match[0].toUpperCase();
    }

    return null;
  } catch {
    return null;
  }
}

// Print help message
function printHelp() {
  console.log(`
Ship Preflight Verification CLI

Usage:
  node scripts/ship-preflight.js [SD-ID] [options]

Arguments:
  SD-ID                  Strategic Directive ID (e.g., SD-LEO-001)
                         If not provided, auto-detects from current branch

Options:
  --create-prs           Auto-create PRs for branches with commits but no PR
  --fix                  Auto-fix state mismatches (revert status, etc.)
  --json                 Output results as JSON for automation
  --reconcile-only       Only run state reconciliation check
  --multi-repo           Only run multi-repo coordination check
  --verbose, -v          Enable verbose output
  --help, -h             Show this help message

Examples:
  node scripts/ship-preflight.js                        # Auto-detect SD
  node scripts/ship-preflight.js SD-LEO-001             # Explicit SD
  node scripts/ship-preflight.js --create-prs           # Create missing PRs
  node scripts/ship-preflight.js SD-LEO-001 --fix       # Fix mismatches
  node scripts/ship-preflight.js --json                 # JSON output

Exit codes:
  0 - All checks passed
  1 - Checks failed (blocking issues found)
  2 - Checks passed with warnings
`);
}

// Main execution
async function main() {
  const options = parseArgs();

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  // Get SD ID
  let sdId = options.sdId || extractSDFromBranch();

  if (!sdId) {
    console.log('❌ Could not determine SD ID.');
    console.log('   Provide SD ID as argument or run from an SD feature branch.');
    console.log('   Usage: node scripts/ship-preflight.js SD-XXX-001');
    process.exit(1);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('  SHIP PREFLIGHT VERIFICATION');
  console.log('═'.repeat(60));
  console.log(`\n  SD: ${sdId}`);
  console.log(`  Time: ${new Date().toISOString()}`);

  const results = {
    sdId,
    branchVerification: null,
    stateReconciliation: null,
    multiRepoCoordination: null,
    overallPassed: true,
    hasWarnings: false
  };

  try {
    // Step 1: Branch Verification (unless reconcile-only or multi-repo-only)
    if (!options.reconcileOnly && !options.multiRepoOnly) {
      const verifier = new ShippingPreflightVerifier(sdId, {
        verbose: options.verbose,
        createMissingPRs: options.createPrs
      });

      results.branchVerification = await verifier.verify();

      if (!results.branchVerification.passed) {
        results.overallPassed = false;
      }

      // Create missing PRs if requested
      if (options.createPrs && results.branchVerification.unmergedBranches.length > 0) {
        console.log('\n📝 Creating missing PRs...');
        await verifier.createMissingPRs();
      }
    }

    // Step 2: State Reconciliation (unless multi-repo-only)
    if (!options.multiRepoOnly) {
      const reconciler = new SDGitStateReconciler(sdId, {
        verbose: options.verbose,
        autoFix: options.fix
      });

      results.stateReconciliation = await reconciler.reconcile();

      if (!results.stateReconciliation.passed) {
        if (results.stateReconciliation.mismatches?.length > 0) {
          results.overallPassed = false;
        } else if (results.stateReconciliation.warnings?.length > 0) {
          results.hasWarnings = true;
        }
      }

      // Execute auto-fixes if requested
      if (options.fix && results.stateReconciliation.autoFixOptions?.length > 0) {
        console.log('\n🔧 Executing auto-fixes...');
        for (const fix of results.stateReconciliation.autoFixOptions) {
          await reconciler.executeAutoFix(fix);
        }
      }
    }

    // Step 3: Multi-Repo Coordination (unless reconcile-only)
    if (!options.reconcileOnly) {
      const coordinator = new MultiRepoCoordinator(sdId, {
        verbose: options.verbose,
        autoCreatePRs: options.createPrs
      });

      results.multiRepoCoordination = await coordinator.coordinate();

      if (!results.multiRepoCoordination.passed) {
        results.hasWarnings = true;
      }
    }

    // Output results
    if (options.json) {
      console.log('\n' + JSON.stringify(results, null, 2));
    } else {
      printSummary(results);
    }

    // Exit with appropriate code
    if (!results.overallPassed) {
      process.exit(1);
    } else if (results.hasWarnings) {
      process.exit(2);
    } else {
      process.exit(0);
    }

  } catch (error) {
    console.error(`\n❌ Error during preflight verification: ${error.message}`);
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Print summary
function printSummary(results) {
  console.log('\n' + '═'.repeat(60));
  console.log('  PREFLIGHT SUMMARY');
  console.log('═'.repeat(60));

  const checks = [];

  if (results.branchVerification) {
    checks.push({
      name: 'Branch Verification',
      passed: results.branchVerification.passed,
      details: results.branchVerification.passed
        ? 'No unmerged branches'
        : `${results.branchVerification.openPRs.length} open PRs, ${results.branchVerification.unmergedBranches.length} unmerged`
    });
  }

  if (results.stateReconciliation) {
    const hasIssues = results.stateReconciliation.mismatches?.length > 0;
    const hasWarnings = results.stateReconciliation.warnings?.length > 0;
    checks.push({
      name: 'State Reconciliation',
      passed: !hasIssues,
      warning: hasWarnings,
      details: hasIssues
        ? `${results.stateReconciliation.mismatches.length} mismatch(es)`
        : hasWarnings
          ? `${results.stateReconciliation.warnings.length} warning(s)`
          : 'States consistent'
    });
  }

  if (results.multiRepoCoordination) {
    checks.push({
      name: 'Multi-Repo Coordination',
      passed: results.multiRepoCoordination.passed,
      details: results.multiRepoCoordination.passed
        ? `${results.multiRepoCoordination.branches.length} branch(es) coordinated`
        : `${results.multiRepoCoordination.coordinationPlan.length} action(s) needed`
    });
  }

  for (const check of checks) {
    const icon = check.passed ? '✅' : (check.warning ? '⚠️ ' : '❌');
    console.log(`\n  ${icon} ${check.name}`);
    console.log(`     ${check.details}`);
  }

  // Overall result
  console.log('\n' + '-'.repeat(60));
  if (results.overallPassed && !results.hasWarnings) {
    console.log('  ✅ RESULT: PROCEED');
    console.log('     All preflight checks passed');
  } else if (results.overallPassed && results.hasWarnings) {
    console.log('  ⚠️  RESULT: PROCEED WITH WARNINGS');
    console.log('     Review warnings before shipping');
  } else {
    console.log('  ❌ RESULT: BLOCKED');
    console.log('     Resolve issues before shipping');
  }
  console.log('');
}

// Run main
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
