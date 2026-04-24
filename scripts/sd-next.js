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
import { resolveOwnSession } from '../lib/resolve-own-session.js';

/**
 * Query session settings (auto_proceed + chain_orchestrators) and emit
 * a machine-readable SESSION_SETTINGS line so autonomous flows know
 * both settings without a separate query.
 *
 * SD-LEO-FIX-SESSION-LIFECYCLE-HYGIENE-001 (FR3): strict per-session
 * filter. When CLAUDE_SESSION_ID is set, we ONLY use that session's
 * metadata — never the heartbeat-fallback "newest active session",
 * which was causing peer sessions' settings to leak across
 * `npm run sd:next` invocations. When our own row is missing, fall
 * through to global defaults rather than adopting a peer's config.
 *
 * Observed live 2026-04-24: session `4b15d2aa` with chain=false saw
 * `SESSION_SETTINGS:{..."chain_orchestrators":true}` because a peer
 * session with chain=true had the newer heartbeat — textbook D2 drift.
 */
async function emitSessionSettings() {
  try {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;

    const supabase = createClient(url, key);
    const envSessionId = process.env.CLAUDE_SESSION_ID;

    // Resolve our session. warnOnFallback:false suppresses the noisy warning,
    // but we handle the fallback ourselves below.
    const resolved = await resolveOwnSession(supabase, {
      select: 'metadata, session_id',
      warnOnFallback: false
    });

    // FR3: when CLAUDE_SESSION_ID is explicitly set, we REQUIRE a deterministic
    // match (source='env_var' or 'marker_file'). Any other source — especially
    // heartbeat_fallback — means we'd be reading the wrong session's metadata.
    // Prefer global defaults in that case so chain_orchestrators doesn't leak
    // across CC instances.
    const deterministicSources = new Set(['env_var', 'marker_file']);
    const isOwnSession = envSessionId
      ? deterministicSources.has(resolved.source)
      : true; // without env var, any heartbeat-newest lookup is acceptable legacy behavior
    const data = isOwnSession ? resolved.data : null;

    // Fall back to global defaults from DB for any field missing in our own row.
    let globalChaining = false;
    let globalAutoProceed = true;
    if (!data || data.metadata?.chain_orchestrators === undefined || data.metadata?.auto_proceed === undefined) {
      const { data: globalData } = await supabase.rpc('get_leo_global_defaults');
      if (globalData?.[0]) {
        globalChaining = globalData[0].chain_orchestrators ?? false;
        if (globalData[0].auto_proceed !== undefined) {
          globalAutoProceed = globalData[0].auto_proceed;
        }
      }
    }

    const autoProceed = data?.metadata?.auto_proceed ?? globalAutoProceed;
    const chainOrchestrators = data?.metadata?.chain_orchestrators ?? globalChaining;
    const settings = {
      auto_proceed: autoProceed,
      chain_orchestrators: chainOrchestrators,
    };
    // Telemetry for debugging peer-leak incidents; the envelope itself stays stable.
    if (process.env.LEO_TELEMETRY_DEBUG === '1') {
      console.log(`[sd-next] SESSION_SETTINGS source=${resolved.source} ownSession=${isOwnSession} envSet=${!!envSessionId}`);
    }
    console.log(`SESSION_SETTINGS:${JSON.stringify(settings)}`);
    return settings;
  } catch {
    // Non-fatal — settings query failure doesn't block queue display
    return null;
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
    const sessionSettings = await emitSessionSettings();

    // SD-LEO-INFRA-IMPLEMENT-STANDALONE-AUTO-001: Emit CHAIN_CLAIM instruction
    // when auto_proceed + chain_orchestrators are both enabled and there's a
    // recommended SD to start. This enables programmatic consumers to auto-claim.
    if (result && result.action === 'start' && result.sd_id && sessionSettings) {
      if (sessionSettings.auto_proceed && sessionSettings.chain_orchestrators) {
        console.log(`CHAIN_CLAIM:${result.sd_id}`);
      }
    }
  })
  .catch(err => {
    console.error(`${colors.red}Error: ${err.message}${colors.reset}`);
    process.exit(1);
  });
