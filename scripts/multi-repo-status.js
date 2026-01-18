#!/usr/bin/env node
/**
 * Multi-Repo Status Check CLI
 *
 * Scans all EHG repositories for uncommitted changes before shipping.
 * Uses the centralized lib/multi-repo module for all operations.
 *
 * Usage:
 *   node scripts/multi-repo-status.js              # Check all repos
 *   node scripts/multi-repo-status.js --json       # JSON output
 *   node scripts/multi-repo-status.js --quiet      # Only show if issues found
 *   node scripts/multi-repo-status.js --sd SD-XXX  # Check repos for specific SD
 *
 * Exit codes:
 *   0 - No uncommitted changes found
 *   1 - Uncommitted changes found in one or more repos
 *
 * @module multi-repo-status
 * @version 2.0.0 - Now uses centralized lib/multi-repo module
 */

import {
  checkUncommittedChanges,
  checkSDRepoStatus,
  formatStatusForDisplay,
  formatSDStatusForDisplay
} from '../lib/multi-repo/index.js';

// Parse arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    json: false,
    quiet: false,
    help: false,
    sdId: null
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--quiet') {
      options.quiet = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--sd' && args[i + 1]) {
      options.sdId = args[i + 1];
      i++;
    } else if (arg.startsWith('--sd=')) {
      options.sdId = arg.split('=')[1];
    } else if (arg.match(/^SD-[A-Z]+-\d+$/i)) {
      options.sdId = arg.toUpperCase();
    }
  }

  return options;
}

// Print help
function printHelp() {
  console.log(`
Multi-Repo Status Check CLI

Scans all EHG repositories for uncommitted changes.
Uses centralized lib/multi-repo module.

Usage:
  node scripts/multi-repo-status.js              # Check all repos
  node scripts/multi-repo-status.js --json       # JSON output
  node scripts/multi-repo-status.js --quiet      # Only show if issues found
  node scripts/multi-repo-status.js --sd SD-XXX  # Check repos for specific SD
  node scripts/multi-repo-status.js --help       # Show this help

Exit codes:
  0 - No uncommitted changes found
  1 - Uncommitted changes found in one or more repos

Examples:
  node scripts/multi-repo-status.js
  node scripts/multi-repo-status.js --sd SD-QUALITY-UI-001
  node scripts/multi-repo-status.js --json --quiet
`);
}

// Main
async function main() {
  const options = parseArgs();

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  // SD-specific check
  if (options.sdId) {
    const sdStatus = checkSDRepoStatus({ sd_key: options.sdId });

    if (options.json) {
      console.log(JSON.stringify(sdStatus, null, 2));
    } else if (!options.quiet || sdStatus.hasUncommittedWork) {
      console.log(formatSDStatusForDisplay(sdStatus));
    }

    process.exit(sdStatus.hasUncommittedWork ? 1 : 0);
  }

  // General repo check
  const status = checkUncommittedChanges(true); // primaryOnly = true

  if (options.json) {
    console.log(JSON.stringify(status, null, 2));
  } else if (!options.quiet || status.hasChanges) {
    console.log(formatStatusForDisplay(status));
  }

  process.exit(status.hasChanges ? 1 : 0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
