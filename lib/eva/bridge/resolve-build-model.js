/**
 * resolve-build-model — the single ARBITER for which build path a venture takes at Stage 19.
 *
 * SD-LEO-INFRA-RECONCILE-VENTURE-BUILD-001 (RCA 813d4c3d): the venture-build "model schism".
 * Before this, TWO paths competed with no arbiter, each independently reading
 * `venture_stage_work.advisory_data.build_method` and defaulting to 'replit_agent':
 *   - the S19 entry gate (stage-execution-worker.js ~1191), and
 *   - the S19 post-stage bridge hook skip-guard (~2948).
 * Plus a THIRD bypass: importReplitBuild (replit-reentry-adapter.js) wrote S20/21/22 directly,
 * skipping S19 entirely. The seeded path silently won for every new venture → the LEO-SD bridge
 * produced 0 SDs (CronLinter, Canvas AI). This function is the one place that decides.
 *
 * Models:
 *   'leo_bridge'  — build the venture via the LEO-SD bridge (orchestrator + child SDs routed by
 *                   target_application), the same machinery EHG_Engineer uses to build EHG. SSOT goal.
 *   'seeded_repo' — seed CLAUDE.md/docs/build-tasks.md into the venture repo + a Replit Agent builds;
 *                   S20 Code Quality Gate validates. (The FINALIZE-CLAUDE-CODE-001 path.)
 *
 * Resolution precedence (explicit wins; safe default):
 *   1. ventures.build_model, when explicitly 'leo_bridge' | 'seeded_repo' (the SSOT field).
 *   2. legacy venture_stage_work.advisory_data.build_method ('replit_agent' => 'seeded_repo';
 *      'leo_bridge' => 'leo_bridge') — backward-compat for in-flight ventures.
 *   3. DEFAULT_BUILD_MODEL — 'seeded_repo'. NOTE: the chairman SSOT intent is 'leo_bridge', but the
 *      default is intentionally held at 'seeded_repo' until the venture-build EXEC loop (clone the
 *      venture repo locally + route child-SD EXEC into it + push back) is wired — flipping the
 *      default before that loop exists would create SD trees that cannot auto-build (a regression
 *      vs. the seeded path that does build). Flip DEFAULT_BUILD_MODEL to 'leo_bridge' as the final
 *      convergence step once the EXEC loop ships.
 *
 * @module lib/eva/bridge/resolve-build-model
 */

export const BUILD_MODELS = Object.freeze(['leo_bridge', 'seeded_repo']);

/** Held at seeded_repo until the venture-build EXEC loop is wired (see module doc). */
export const DEFAULT_BUILD_MODEL = 'seeded_repo';

/**
 * Resolve the build model for a venture at Stage 19. Pure.
 *
 * @param {Object} args
 * @param {string|null} [args.ventureBuildModel] - ventures.build_model (the SSOT column)
 * @param {string|null} [args.legacyBuildMethod] - venture_stage_work.advisory_data.build_method
 * @returns {'leo_bridge'|'seeded_repo'}
 */
export function resolveBuildModel({ ventureBuildModel = null, legacyBuildMethod = null } = {}) {
  // 1. Explicit SSOT field wins.
  if (ventureBuildModel === 'leo_bridge' || ventureBuildModel === 'seeded_repo') {
    return ventureBuildModel;
  }
  // 2. Legacy per-stage signal (backward-compat for in-flight ventures).
  if (legacyBuildMethod === 'replit_agent' || legacyBuildMethod === 'seeded_repo') return 'seeded_repo';
  if (legacyBuildMethod === 'leo_bridge') return 'leo_bridge';
  // 3. Safe default (see module doc — chairman SSOT is leo_bridge, gated on the EXEC loop).
  return DEFAULT_BUILD_MODEL;
}

/** True when the venture should build via the LEO-SD bridge (create orchestrator + child SDs). */
export function isLeoBridge(args) { return resolveBuildModel(args) === 'leo_bridge'; }

/** True when the venture should build via the seeded-repo + Replit-Agent + S20 path. */
export function isSeededRepo(args) { return resolveBuildModel(args) === 'seeded_repo'; }

export default { resolveBuildModel, isLeoBridge, isSeededRepo, BUILD_MODELS, DEFAULT_BUILD_MODEL };
