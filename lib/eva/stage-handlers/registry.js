/**
 * SD-ARCH-HOTSPOT-STAGE-WORKER-001 (FR-3): externalized stage-handler registry.
 *
 * Externalizes the worker's internal _postStageHookRegistry Map (the pattern the
 * file already used — SD-LEO-INFRA-CENTRALIZED-POST-STAGE-001) into the same
 * registry shape proven by lib/sweep/pass-registry.cjs on the SWEEP door: a keyed
 * map of handler modules, a single runner, and an env kill-switch.
 *
 * ADDING A STAGE = one handler module in lib/eva/stage-handlers/ + one entry here.
 *
 * FAILURE POSTURE: uniformly FAIL-SOFT, matching the worker's _runPostStageHooks
 * contract verbatim ("Non-fatal: failures log warnings but never block
 * advancement") — no handler here is abort-class, unlike the sweep registry's
 * critical-rethrow passes. If a future stage handler must abort advancement, add
 * a `critical` flag AND the rethrow branch together (see pass-registry.cjs).
 *
 * KILL-SWITCH: STAGE_HANDLER_REGISTRY=off makes the worker dispatch through its
 * internal Map directly. Both paths call the SAME handler modules (single
 * implementation — the switch toggles dispatch mechanism, never behavior).
 *
 * S19 is deliberately ABSENT: its hook (_postStageHook_S19_Bridge) delegates into
 * deep worker state (_runS19Bridge) and stays in the worker's internal Map per the
 * PRD's conditional-relocation clause.
 */
import * as s11 from './s11.js';
import * as s15 from './s15.js';
import * as s17 from './s17.js';

/** @type {Map<number, { execute(ctx: object): Promise<void> }>} */
export const STAGE_HANDLERS = new Map([
  [11, s11],
  [15, s15],
  [17, s17],
]);

export function isRegistryEnabled(env = process.env) {
  return env.STAGE_HANDLER_REGISTRY !== 'off';
}

/**
 * Run the handler for a completed stage. Returns true when a handler existed
 * (fired or failed-soft), false when no handler is registered for the stage.
 * ctx: { supabase, logger, ventureId, ensureS17StrategySelected } — the exact
 * surface the relocated hooks consume (enumerated at extraction, FR-2).
 */
export async function runStageHandler(completedStage, ctx) {
  const handler = STAGE_HANDLERS.get(completedStage);
  if (!handler) return false;
  try {
    await handler.execute(ctx);
    ctx.logger.log(`[Worker] Post-stage handler fired for S${completedStage} (venture ${ctx.ventureId})`);
  } catch (err) {
    // Fail-soft parity with _runPostStageHooks: warn, never block advancement.
    ctx.logger.warn(`[Worker] Post-stage handler S${completedStage} failed (non-fatal): ${err.message}`);
  }
  return true;
}

export default { STAGE_HANDLERS, runStageHandler, isRegistryEnabled };
