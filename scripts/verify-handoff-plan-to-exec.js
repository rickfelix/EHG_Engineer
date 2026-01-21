#!/usr/bin/env node

/**
 * PLAN → EXEC Handoff Verification Script
 * LEO Protocol v4.1.2 - Critical Quality Gate
 *
 * ENFORCES: PRD must meet quality standards before EXEC phase begins
 * PREVENTS: Incomplete or low-quality PRDs reaching implementation
 * RETURNS: To PLAN with specific improvement requirements if validation fails
 *
 * This is a thin wrapper that delegates to the modular implementation
 * in scripts/modules/handoff/verifiers/plan-to-exec/
 *
 * @see scripts/modules/handoff/verifiers/plan-to-exec/ for implementation
 */

import { PlanToExecVerifier, main } from './modules/handoff/verifiers/plan-to-exec/index.js';

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export default PlanToExecVerifier;
