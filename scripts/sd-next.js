#!/usr/bin/env node

/**
 * SD Next - Intelligent Strategic Directive Selection
 *
 * Purpose: Help new Claude Code sessions know which SD to work on
 * Owner: LEAD role
 *
 * This is a thin wrapper that delegates to the modular implementation
 * in scripts/modules/sd-next/
 *
 * Features:
 * 1. Multi-session awareness - Shows active sessions and their claims
 * 2. Dependency resolution - Verifies deps are actually completed
 * 3. Progress awareness - Surfaces partially completed SDs
 * 4. Session context - Checks recent git activity for continuity
 * 5. Risk-based ordering - Weights by downstream unblocking
 * 6. Conflict detection - Warns about parallel execution risks
 * 7. Track visibility - Shows parallel execution tracks
 * 8. Parallel opportunities - Proactively suggests opening new terminals
 * 9. AUTO-PROCEED action semantics - Returns structured next-action data (PAT-AUTO-PROCEED-002)
 *
 * @see scripts/modules/sd-next/ for implementation
 */

import { runSDNext, colors } from './modules/sd-next/index.js';

// Main execution
runSDNext()
  .then(result => {
    // PAT-AUTO-PROCEED-002 CAPA: Output structured action data
    // This machine-readable line enables autonomous workflow continuation
    // when AUTO-PROCEED is active. Claude parses this to determine next action
    // without relying on display-only output.
    if (result && result.action !== 'none') {
      console.log(`\nAUTO_PROCEED_ACTION:${JSON.stringify(result)}`);
    }
  })
  .catch(err => {
    console.error(`${colors.red}Error: ${err.message}${colors.reset}`);
    process.exit(1);
  });
