/**
 * AutoChainExecutor — Post-completion SD auto-chaining
 *
 * Orchestrates the flow after an SD completes: reads session settings,
 * finds next workable SD via QueueSelector, performs atomic claim swap
 * via ClaimSwapper, and returns chain instructions.
 *
 * Part of SD-LEO-INFRA-IMPLEMENT-STANDALONE-AUTO-001
 */

import { selectNextSD } from './queue-selector.js';
import { swapClaim, refreshHeartbeat } from './claim-swapper.js';

const MAX_CHAIN_DEPTH = 10;
const MAX_CLAIM_RETRIES = 3;

/**
 * Exit codes for chain break conditions
 */
export const EXIT_CODES = {
  CHAIN_SUCCESS: 'CHAIN_SUCCESS',
  EXIT_EMPTY_QUEUE: 'EXIT_EMPTY_QUEUE',
  EXIT_ALL_CLAIMED: 'EXIT_ALL_CLAIMED',
  EXIT_MAX_DEPTH: 'EXIT_MAX_DEPTH',
  EXIT_CHAINING_DISABLED: 'EXIT_CHAINING_DISABLED',
  EXIT_DB_ERROR: 'EXIT_DB_ERROR',
  EXIT_NO_SESSION: 'EXIT_NO_SESSION'
};

/**
 * Execute auto-chain logic after SD completion.
 *
 * @param {object} supabase - Supabase client
 * @param {object} params
 * @param {string} params.completedSdId - UUID of the just-completed SD
 * @param {string} params.completedSdKey - sd_key of the just-completed SD
 * @param {string} params.sessionId - Current session ID
 * @param {boolean} params.chainEnabled - Whether chain_orchestrators is true
 * @param {boolean} params.autoProceed - Whether auto_proceed is true
 * @param {number} [params.chainDepth] - Current chain depth (for recursion safety)
 * @param {string[]} [params.chainHistory] - sd_keys already completed in this chain
 * @param {boolean} [params.orchestratorsOnly] - Only chain to top-level SDs
 * @returns {Promise<AutoChainResult>}
 */
export async function executeAutoChain(supabase, params) {
  const {
    completedSdId,
    completedSdKey,
    sessionId,
    chainEnabled,
    autoProceed,
    chainDepth = 0,
    chainHistory = [],
    orchestratorsOnly = true
  } = params;

  // Guard: both settings must be enabled
  if (!autoProceed || !chainEnabled) {
    return buildResult(EXIT_CODES.EXIT_CHAINING_DISABLED, null, {
      reason: !autoProceed ? 'auto_proceed is disabled' : 'chain_orchestrators is disabled'
    });
  }

  // Guard: max chain depth
  if (chainDepth >= MAX_CHAIN_DEPTH) {
    console.log(`   ⚠️  Chain depth ${chainDepth} reached max (${MAX_CHAIN_DEPTH})`);
    return buildResult(EXIT_CODES.EXIT_MAX_DEPTH, null, {
      reason: `Max chain depth ${MAX_CHAIN_DEPTH} reached`,
      chainDepth
    });
  }

  // Guard: session ID required for claiming
  if (!sessionId) {
    return buildResult(EXIT_CODES.EXIT_NO_SESSION, null, {
      reason: 'No session ID available for claiming'
    });
  }

  // Keep heartbeat alive during selection
  await refreshHeartbeat(supabase, sessionId);

  // Build exclusion list: completed SD + chain history (prevents loops)
  const excludeKeys = [...chainHistory, completedSdKey].filter(Boolean);

  // Retry loop: try up to MAX_CLAIM_RETRIES candidates
  for (let attempt = 1; attempt <= MAX_CLAIM_RETRIES; attempt++) {
    const { sd: nextSD, reason: selectReason } = await selectNextSD(supabase, {
      excludeSdId: completedSdId,
      excludeSdKeys: excludeKeys,
      orchestratorsOnly
    });

    if (!nextSD) {
      const exitCode = selectReason.includes('claimed')
        ? EXIT_CODES.EXIT_ALL_CLAIMED
        : EXIT_CODES.EXIT_EMPTY_QUEUE;
      console.log(`   🔗 CHAIN: No next SD available (${selectReason})`);
      return buildResult(exitCode, null, { reason: selectReason });
    }

    // Attempt atomic claim swap
    const swapResult = await swapClaim(supabase, {
      sessionId,
      oldSdKey: completedSdKey,
      newSdKey: nextSD.sd_key
    });

    if (swapResult.success) {
      console.log(`   🔗 CHAIN: Auto-continuing to ${nextSD.sd_key}`);
      console.log(`   📍 Next: ${nextSD.title}`);
      console.log(`   🔒 Claimed: ${nextSD.sd_key} (auto-chain depth ${chainDepth + 1})`);

      return buildResult(EXIT_CODES.CHAIN_SUCCESS, nextSD, {
        chainDepth: chainDepth + 1,
        chainHistory: [...excludeKeys, nextSD.sd_key],
        attempt
      });
    }

    // Swap failed — add this SD to exclusion and retry with next candidate
    console.log(`   ⚠️  Claim attempt ${attempt}/${MAX_CLAIM_RETRIES}: ${nextSD.sd_key} — ${swapResult.reason}`);
    excludeKeys.push(nextSD.sd_key);
  }

  // All retries exhausted
  console.log('   🔗 CHAIN: All candidates exhausted after retries');
  return buildResult(EXIT_CODES.EXIT_ALL_CLAIMED, null, {
    reason: `All candidates exhausted after ${MAX_CLAIM_RETRIES} attempts`
  });
}

/**
 * @typedef {object} AutoChainResult
 * @property {string} exitCode - One of EXIT_CODES
 * @property {boolean} chainContinue - Whether to continue to next SD
 * @property {object|null} nextSD - The next SD to work on (or null)
 * @property {string|null} nextSdKey - sd_key of next SD
 * @property {string|null} nextSdId - UUID of next SD
 * @property {string} reason - Human-readable explanation
 * @property {number} chainDepth - Current chain depth
 * @property {string[]} chainHistory - sd_keys completed in this chain
 */

function buildResult(exitCode, nextSD, meta = {}) {
  return {
    exitCode,
    chainContinue: exitCode === EXIT_CODES.CHAIN_SUCCESS,
    nextSD: nextSD || null,
    nextSdKey: nextSD?.sd_key || null,
    nextSdId: nextSD?.id || null,
    reason: meta.reason || exitCode,
    chainDepth: meta.chainDepth || 0,
    chainHistory: meta.chainHistory || [],
    attempt: meta.attempt || 0
  };
}
