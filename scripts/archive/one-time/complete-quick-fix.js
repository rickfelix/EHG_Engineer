#!/usr/bin/env node

/**
 * Complete Quick-Fix
 * Mark quick-fix as completed with verification
 *
 * This is a thin wrapper that delegates to the modular implementation
 * in scripts/modules/complete-quick-fix/
 *
 * Usage:
 *   node scripts/complete-quick-fix.js QF-20251117-001
 *   node scripts/complete-quick-fix.js QF-20251117-001 --commit-sha abc123 --actual-loc 15
 *
 * Requirements for completion:
 * - Both unit and E2E tests passing
 * - UAT verified (manual confirmation)
 * - Actual LOC <= 50 (hard cap)
 * - PR created (always required)
 *
 * @see scripts/modules/complete-quick-fix/ for implementation
 */

import { completeQuickFix, parseArguments, displayHelp } from './modules/complete-quick-fix/index.js';

// CLI argument parsing
const args = process.argv.slice(2);
const { showHelp, qfId, options } = parseArguments(args);

if (showHelp) {
  displayHelp();
  process.exit(0);
}

// Run
completeQuickFix(qfId, options).catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
