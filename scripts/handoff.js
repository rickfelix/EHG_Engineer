#!/usr/bin/env node
/**
 * LEO Protocol Handoff System - Unified CLI
 *
 * This is the main entry point for all handoff operations.
 * Uses the modular handoff system for improved maintainability.
 *
 * This is a thin wrapper that delegates to the modular implementation
 * in scripts/modules/handoff/cli/
 *
 * Usage:
 *   node scripts/handoff.js execute PLAN-TO-EXEC SD-XXX-001
 *   node scripts/handoff.js list [SD-ID]
 *   node scripts/handoff.js stats
 *
 * @see scripts/modules/handoff/ for implementation
 */

import { main } from './modules/handoff/cli/index.js';

// Execute
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
