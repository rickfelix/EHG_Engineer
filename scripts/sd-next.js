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
import { createClient } from '@supabase/supabase-js';

/**
 * Query session settings (auto_proceed + chain_orchestrators) and emit
 * a machine-readable SESSION_SETTINGS line so autonomous flows know
 * both settings without a separate query.
 */
async function emitSessionSettings() {
  try {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return;

    const supabase = createClient(url, key);
    const { data } = await supabase
      .from('claude_sessions')
      .select('metadata')
      .eq('status', 'active')
      .order('heartbeat_at', { ascending: false })
      .limit(1)
      .single();

    const autoProceed = data?.metadata?.auto_proceed ?? true;
    const chainOrchestrators = data?.metadata?.chain_orchestrators ?? false;
    console.log(`SESSION_SETTINGS:${JSON.stringify({ auto_proceed: autoProceed, chain_orchestrators: chainOrchestrators })}`);
  } catch {
    // Non-fatal — settings query failure doesn't block queue display
  }
}

// Main execution
runSDNext()
  .then(async (result) => {
    // PAT-AUTO-PROCEED-002 CAPA: Output structured action data
    // This machine-readable line enables autonomous workflow continuation
    // when AUTO-PROCEED is active. Claude parses this to determine next action
    // without relying on display-only output.
    if (result && result.action !== 'none') {
      console.log(`\nAUTO_PROCEED_ACTION:${JSON.stringify(result)}`);
    }

    // Emit session settings so autonomous flows see both auto_proceed
    // AND chain_orchestrators without a separate query.
    await emitSessionSettings();
  })
  .catch(err => {
    console.error(`${colors.red}Error: ${err.message}${colors.reset}`);
    process.exit(1);
  });
