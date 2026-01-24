#!/usr/bin/env node

/**
 * PreCompact Unified Hook
 * SD-LEO-INFRA-UNIFY-CONTEXT-PRESERVATION-001
 *
 * Called by PreCompact PowerShell hook to save comprehensive state.
 * Uses UnifiedStateManager for consistent state format.
 */

import UnifiedStateManager from '../../lib/context/unified-state-manager.js';

async function main() {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const manager = new UnifiedStateManager(projectDir);

  try {
    // Save comprehensive state
    const state = await manager.saveState('precompact', {
      highlights: ['Pre-compaction state captured'],
      actions: ['Restore context after session start']
    });

    // Output formatted state for Claude to see
    console.log('[PRECOMPACT] Comprehensive state saved to .claude/unified-session-state.json');
    console.log('[PRECOMPACT] Trigger: Auto-compaction imminent');
    console.log(`[PRECOMPACT] Branch: ${state.git?.branch || 'unknown'}`);
    if (state.sd?.id) {
      console.log(`[PRECOMPACT] SD: ${state.sd.id}`);
    }
    console.log('[WARNING] COMPACTION ABOUT TO OCCUR - Full state preserved');

  } catch (error) {
    console.error(`[PRECOMPACT] Error saving state: ${error.message}`);
    // Exit 0 to not block compaction
    process.exit(0);
  }
}

main();
