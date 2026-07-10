/**
 * Stage 0 Path Router
 *
 * Routes venture creation to the appropriate path handler based on
 * user selection. All three paths produce a PathOutput that feeds
 * into the synthesis step.
 *
 * Part of SD-LEO-ORCH-STAGE-INTELLIGENT-VENTURE-001-B
 */

import { executeCompetitorTeardown } from './paths/competitor-teardown.js';
import { executeBlueprintBrowse } from './paths/blueprint-browse.js';
import { executeDiscoveryMode, listDiscoveryStrategies } from './paths/discovery-mode.js';
import { executeVentureReseeding } from './paths/venture-reseeding.js';
import { validatePathOutput } from './interfaces.js';
import { resolveActivePosture } from './profile-service.js';
import { screenPathOutput } from './anti-goal-filter.js';

/**
 * Available entry paths for venture creation.
 */
export const ENTRY_PATHS = Object.freeze({
  COMPETITOR_TEARDOWN: 'competitor_teardown',
  BLUEPRINT_BROWSE: 'blueprint_browse',
  DISCOVERY_MODE: 'discovery_mode',
  // SD-LEO-INFRA-CLEAN-CLONE-LAUNCH-001-A: reseed a new venture from an existing
  // venture's durable thesis and re-run S0->S19 fresh (the clean-clone mechanism).
  SEEDED_FROM_VENTURE: 'seeded_from_venture',
});

/**
 * Path display metadata for CLI presentation.
 */
export const PATH_OPTIONS = [
  {
    key: ENTRY_PATHS.COMPETITOR_TEARDOWN,
    label: 'Analyze a competitor',
    description: 'Deep analysis of competitor products, deconstruct and rebuild with automation advantage',
    shortcut: '1',
  },
  {
    key: ENTRY_PATHS.BLUEPRINT_BROWSE,
    label: 'Browse venture blueprints',
    description: 'Select from pre-made venture templates and customize',
    shortcut: '2',
  },
  {
    key: ENTRY_PATHS.DISCOVERY_MODE,
    label: 'Find me opportunities',
    description: 'AI-driven research pipeline generates ranked venture candidates',
    shortcut: '3',
  },
  {
    key: ENTRY_PATHS.SEEDED_FROM_VENTURE,
    label: 'Reseed from an existing venture',
    description: 'Clean clone: seed a new venture from an existing venture\'s durable thesis and re-run S0->S19 fresh',
    shortcut: '4',
  },
];

/**
 * Route to the appropriate path handler based on the selected path.
 *
 * @param {string} pathKey - Which path to execute (from ENTRY_PATHS)
 * @param {Object} params - Path-specific parameters
 * @param {Object} deps - Injected dependencies (supabase, logger)
 * @returns {Promise<Object>} Validated PathOutput
 */
export async function routePath(pathKey, params = {}, deps = {}) {
  const { logger = console } = deps;

  let result;

  switch (pathKey) {
    case ENTRY_PATHS.COMPETITOR_TEARDOWN:
      result = await executeCompetitorTeardown(params, deps);
      break;

    case ENTRY_PATHS.BLUEPRINT_BROWSE:
      result = await executeBlueprintBrowse(params, deps);
      break;

    case ENTRY_PATHS.DISCOVERY_MODE:
      result = await executeDiscoveryMode(params, deps);
      break;

    case ENTRY_PATHS.SEEDED_FROM_VENTURE:
      result = await executeVentureReseeding(params, deps);
      break;

    default:
      throw new Error(`Unknown entry path: ${pathKey}. Valid paths: ${Object.values(ENTRY_PATHS).join(', ')}`);
  }

  if (!result) {
    return null; // Path returned null (e.g., no blueprints available)
  }

  // Validate path output conforms to interface
  const validation = validatePathOutput(result);
  if (!validation.valid) {
    logger.warn(`   Path output validation warnings: ${validation.errors.join(', ')}`);
  }

  // SD-LEO-INFRA-STAGE0-POSTURE-SUCCESSOR-001 (CH-3, ALL-PATHS): anti-goal screen at
  // the router choke point — EVERY entry path's output is checked against the active
  // posture's anti-goals, so a chairman-pre-excluded candidate cannot proceed to
  // synthesis regardless of which path produced it. The disqualification (reason,
  // matched field/text) is recorded ON the output — auditable, never a silent drop.
  // Posture resolution is fail-closed by design (spec R2); its error propagates.
  if (deps.supabase) {
    const posture = await resolveActivePosture({ supabase: deps.supabase, logger });
    const disqualification = screenPathOutput(result, posture);
    if (disqualification) {
      logger.warn(`   Anti-goal screen: '${result.suggested_name}' disqualified — ${disqualification.reason}`);
      return {
        ...result,
        anti_goal_disqualification: { ...disqualification, posture_version: posture.posture_version },
      };
    }
  }

  return result;
}

export { listDiscoveryStrategies };
