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
 * Resolution precedence (explicit wins; leo_bridge default):
 *   1. ventures.build_model, when explicitly 'leo_bridge' | 'seeded_repo' (the SSOT field).
 *   2. legacy venture_stage_work.advisory_data.build_method ('replit_agent' => 'seeded_repo';
 *      'leo_bridge' => 'leo_bridge') — backward-compat for in-flight ventures.
 *   3. DEFAULT_BUILD_MODEL — 'leo_bridge' (SD-LEO-INFRA-VENTURE-BUILD-EXEC-001 FR-5). The EXEC loop
 *      (clone the venture repo to applications.local_path + route per-SD worktrees inside it off the
 *      venture origin/main) shipped and was pilot-proven on CronLinter, so the chairman SSOT default
 *      is now active. seeded_repo survives ONLY as an EXPLICIT, logged opt-out via precedence 1/2 —
 *      it is never selected silently when build_model is unset.
 *
 * @module lib/eva/bridge/resolve-build-model
 */

export const BUILD_MODELS = Object.freeze(['leo_bridge', 'seeded_repo']);

/**
 * leo_bridge is THE canonical venture build path. SD-LEO-INFRA-VENTURE-BUILD-EXEC-001 flipped
 * the default off 'seeded_repo' once the EXEC loop shipped + was pilot-proven on CronLinter
 * (ensureVentureClone clones the venture repo to applications.local_path; resolve-sd-workdir
 * routes the per-SD worktree INSIDE that clone off the venture origin/main, DB-first). seeded_repo
 * is now a DEMOTED, EXPLICIT, LOGGED opt-out — taken ONLY when ventures.build_model='seeded_repo'
 * or legacy build_method='replit_agent' is set (both logged by the S19 worker), never silently.
 */
export const DEFAULT_BUILD_MODEL = 'leo_bridge';

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
  // 3. Default = leo_bridge (the EXEC loop shipped + pilot-proven; see module doc). seeded_repo
  //    is never reached here — it requires an explicit, logged opt-out via precedence 1/2.
  return DEFAULT_BUILD_MODEL;
}

/** True when the venture should build via the LEO-SD bridge (create orchestrator + child SDs). */
export function isLeoBridge(args) { return resolveBuildModel(args) === 'leo_bridge'; }

/** True when the venture should build via the seeded-repo + Replit-Agent + S20 path. */
export function isSeededRepo(args) { return resolveBuildModel(args) === 'seeded_repo'; }

export default { resolveBuildModel, isLeoBridge, isSeededRepo, BUILD_MODELS, DEFAULT_BUILD_MODEL };
