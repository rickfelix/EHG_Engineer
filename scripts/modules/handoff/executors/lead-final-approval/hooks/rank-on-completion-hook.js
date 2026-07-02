/**
 * rank-on-completion-hook — SD-LEO-INFRA-GUARANTEE-CLAIMABLE-SD-RANKED-001-C (FR-3)
 *
 * After an SD completes, any dependent/child SD it was blocking may have just become
 * claimable. Trigger an event-driven rank pass so that dependent gets a fresh
 * metadata.dispatch_rank within seconds instead of waiting for the next 15-min
 * coordinator-backlog-rank.mjs cron tick. Fire-and-forget — a failure here must never
 * block or fail the SD completion itself.
 */
import { triggerRankPass } from '../../../../../../lib/coordinator/trigger-rank-pass.mjs';

/**
 * @param {object} sd the completed SD row (has sd_key/id)
 * @param {object} supabase unused directly (trigger-rank-pass spawns its own connection) —
 *   accepted for signature parity with the other lead-final-approval hooks.
 * @returns {Promise<{outcome: string}>}
 */
export async function runRankOnCompletionHook(sd, supabase) { // eslint-disable-line no-unused-vars
  const sdKey = sd?.sd_key || sd?.id;
  const result = triggerRankPass({ reason: 'sd_completed', sdKey });
  return { outcome: result.triggered ? 'triggered' : result.reason };
}
