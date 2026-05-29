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

// Run.
// QF-20260529-852 (RCA c6a002d5): a CLI entrypoint must terminate deterministically.
// completeQuickFix awaits every durable step (DB write, merge, push, feedback-resolve)
// before it resolves, but the orchestrator used to leave a background handle open (the
// supabase-js auth refresh timer, now disabled at the client) so the loop never drained
// and the process hung to the external ~2-min timeout. On success we set exitCode=0 and
// let the loop drain naturally — a clean exit that avoids the Windows libuv assertion
// (UV_HANDLE_CLOSING) that an immediate process.exit() triggers while a handle is mid-
// teardown. The unref()'d fallback force-exits only if some module still leaves a handle
// open, so the CLI can never hang again. Nothing durable is truncated — it all completed
// before the promise resolved.
completeQuickFix(qfId, options)
  .then(() => {
    process.exitCode = 0;
    setTimeout(() => process.exit(0), 1500).unref();
  })
  .catch((err) => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
