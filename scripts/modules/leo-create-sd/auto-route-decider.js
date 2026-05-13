/**
 * auto-route-decider.js — pure FR-003 auto-route decision logic
 *
 * SD-FDBK-REFAC-LEO-CREATE-003-001
 *
 * Extracted from scripts/leo-create-sd.js:2290-2318. Decides whether
 * `leo-create-sd.js --vision-key X --arch-key Y` should auto-route to the
 * orchestrator creator (multi-child SD) or fall through to single-SD creation.
 *
 * **Pure function** — no I/O, no process.exit, no console.log. Caller fetches
 * archPlan and brainstormSession via Supabase and passes them in. Returns a
 * decision object; caller performs the side effects (telemetry, execSync,
 * exit codes).
 *
 * **Two layers** added on top of the original phase-heading heuristic:
 *
 *   Layer A — locked_decisions intent gate. If chairman has locked
 *   "no split" / "single SD" / "one Tier-3 SD" intent in
 *   `brainstorm_sessions.metadata.locked_decisions` (JSONB array), veto the
 *   orchestrator route. Only consulted when `structuredPhaseCount === 0`
 *   (gates against compound-phrase FPs like
 *   "Split into 3 PRs but do not split DB layer" in plans with structured
 *   phases — validation-agent WARNING-2).
 *
 *   Layer B — PR-staged content-only disambiguator. When the only phase
 *   signal is the content regex (no structured implementation_phases) AND
 *   every matched heading contains /PR-\d+/, treat the headings as PR-staged
 *   implementation phases (not SD-decomposable phases) and skip auto-route.
 *
 * **Kill switches** for hotfix recovery (default ON):
 *   - LEO_AUTO_ROUTE_LAYER_A=off → bypass Layer A
 *   - LEO_AUTO_ROUTE_LAYER_B=off → bypass Layer B
 *
 * @see PRD-SD-FDBK-REFAC-LEO-CREATE-003-001
 * @see feedback 4c9eb37f-3835-4175-8ba2-c8407dc3aee2
 */

/**
 * Regex matching chairman intent to NOT decompose into multiple SDs.
 * Hits: "no split", "no-split", "single SD", "single-SD", "one Tier-3 SD",
 *       "do not split", "do-not split", "keep one", "keep as one".
 * Misses (intentional false-negatives — safer to default to orchestrator):
 *       "we should not split this until v2"
 *       "consider splitting later"
 */
export const SINGLE_SD_INTENT_REGEX =
  /(?:no\s+split|no-split|single[\s-]+sd|one\s+tier-?\d+\s+sd|do\s+not\s+split|do-not\s+split|keep\s+(?:as\s+)?one)/i;

/**
 * Layer B heading regex — broader than the original line-2302 anchor.
 * Original /^##?\s*(...)/ matched H1/H2 only and stopped at the digit. We
 * match H2/H3/H4 AND capture the rest of the line so PR_N_PATTERN can be
 * tested against the full heading (testing-agent narrow-detector finding).
 */
export const LAYER_B_HEADING_REGEX =
  /^#{2,4}\s*(?:Phase|Implementation Phase|Step)\s+\d[^\n\r]*/gim;

/**
 * PR-N pattern. When EVERY matched heading contains this, Layer B fires.
 */
export const PR_N_PATTERN = /PR-\d+/;

/**
 * Compute structured + content phase counts from an arch plan.
 *
 * @param {Object|null} archPlan - Row from eva_architecture_plans
 * @returns {{ structuredPhaseCount: number, contentMatches: string[] }}
 */
export function countArchPhases(archPlan) {
  const structuredPhaseCount =
    archPlan?.sections?.implementation_phases?.length || 0;
  const contentMatches = archPlan?.content
    ? archPlan.content.match(LAYER_B_HEADING_REGEX) || []
    : [];
  return { structuredPhaseCount, contentMatches };
}

/**
 * Test whether the locked_decisions JSONB array on a brainstorm session
 * contains a chairman-locked single-SD intent.
 *
 * @param {Object|null} brainstormSession - Row from brainstorm_sessions (or null)
 * @returns {boolean}
 */
export function hasLockedSingleSdIntent(brainstormSession) {
  if (!brainstormSession) return false;
  const locked = brainstormSession?.metadata?.locked_decisions;
  if (!Array.isArray(locked) || locked.length === 0) return false;
  const joined = locked.filter((s) => typeof s === 'string').join(' ');
  return SINGLE_SD_INTENT_REGEX.test(joined);
}

/**
 * Test whether every content-heading match looks like a PR-staged phase.
 *
 * @param {string[]} contentMatches
 * @returns {boolean} true iff matches.length > 0 AND every match contains /PR-\d+/
 */
export function allHeadingsArePrStaged(contentMatches) {
  if (!Array.isArray(contentMatches) || contentMatches.length === 0) return false;
  return contentMatches.every((m) => PR_N_PATTERN.test(m));
}

/**
 * Decide whether to auto-route to the orchestrator creator.
 *
 * @param {Object} args
 * @param {Object|null} args.archPlan - Row from eva_architecture_plans, or null
 * @param {Object|null} args.brainstormSession - Row from brainstorm_sessions matching metadata->>plan_key = archKey (or null)
 * @param {string} args.archKey - The --arch-key flag value (for telemetry)
 * @param {string} args.visionKey - The --vision-key flag value (for telemetry)
 * @param {string} args.title - The SD title (for telemetry)
 * @param {Object} [args.options]
 * @param {boolean} [args.options.forceOrchestrator] - --force-orchestrator override
 * @param {Object} [args.env] - Override env var read (for tests); defaults to process.env
 * @returns {{
 *   route: 'orchestrator' | 'single',
 *   layer_a_signal: 'absent' | 'locked-decision-veto' | 'kill-switch',
 *   layer_b_signal: 'absent' | 'pr-staged-phases' | 'kill-switch',
 *   override: null | 'force-orchestrator' | 'LEO_AUTO_ROUTE_LAYER_A=off' | 'LEO_AUTO_ROUTE_LAYER_B=off',
 *   reason: string,
 *   telemetry: Object
 * }}
 */
export function shouldAutoRouteToOrchestrator({
  archPlan,
  brainstormSession,
  archKey,
  visionKey,
  title,
  options = {},
  env = process.env,
} = {}) {
  const { structuredPhaseCount, contentMatches } = countArchPhases(archPlan);
  const contentPhaseCount = contentMatches.length;
  const hasMultipleStructured = structuredPhaseCount >= 2;
  const hasMultipleContent = contentPhaseCount >= 2;

  // --force-orchestrator override always wins (when there is something to route).
  if (options.forceOrchestrator) {
    if (hasMultipleStructured || hasMultipleContent) {
      return decision({
        route: 'orchestrator',
        layer_a_signal: 'absent',
        layer_b_signal: 'absent',
        override: 'force-orchestrator',
        reason: '--force-orchestrator override; routing despite any locked-decision veto',
        structuredPhaseCount,
        contentPhaseCount,
        archKey,
        visionKey,
        title,
      });
    }
  }

  // Baseline: if neither structured nor content phases hit threshold, fall through to single.
  if (!hasMultipleStructured && !hasMultipleContent) {
    return decision({
      route: 'single',
      layer_a_signal: 'absent',
      layer_b_signal: 'absent',
      override: null,
      reason: 'no phase signal detected; single-SD path',
      structuredPhaseCount,
      contentPhaseCount,
      archKey,
      visionKey,
      title,
    });
  }

  // Layer A: only when no structured phases (avoid compound-FP per WARNING-2).
  const layerAKillSwitch = String(env.LEO_AUTO_ROUTE_LAYER_A || '').toLowerCase() === 'off';
  let layer_a_signal = 'absent';
  let layerAOverride = null;
  if (layerAKillSwitch) {
    layer_a_signal = 'kill-switch';
    layerAOverride = 'LEO_AUTO_ROUTE_LAYER_A=off';
  } else if (structuredPhaseCount === 0 && hasLockedSingleSdIntent(brainstormSession)) {
    layer_a_signal = 'locked-decision-veto';
  }

  if (layer_a_signal === 'locked-decision-veto') {
    return decision({
      route: 'single',
      layer_a_signal,
      layer_b_signal: 'absent',
      override: null,
      reason:
        'chairman locked single-SD intent in brainstorm_sessions.metadata.locked_decisions; auto-route vetoed',
      structuredPhaseCount,
      contentPhaseCount,
      archKey,
      visionKey,
      title,
    });
  }

  // Layer B: only fires when no structured phases AND every content heading is PR-staged.
  const layerBKillSwitch = String(env.LEO_AUTO_ROUTE_LAYER_B || '').toLowerCase() === 'off';
  let layer_b_signal = 'absent';
  if (layerBKillSwitch) {
    layer_b_signal = 'kill-switch';
  } else if (structuredPhaseCount === 0 && allHeadingsArePrStaged(contentMatches)) {
    layer_b_signal = 'pr-staged-phases';
  }

  if (layer_b_signal === 'pr-staged-phases') {
    return decision({
      route: 'single',
      layer_a_signal,
      layer_b_signal,
      override: null,
      reason: 'all phase headings are PR-staged (contain PR-N); treating as PR-staged implementation, not SD-decomposable phases',
      structuredPhaseCount,
      contentPhaseCount,
      archKey,
      visionKey,
      title,
    });
  }

  // Default: route to orchestrator (preserves pre-refactor behavior).
  return decision({
    route: 'orchestrator',
    layer_a_signal,
    layer_b_signal,
    override: layerAOverride,
    reason: `${structuredPhaseCount || contentPhaseCount} phases detected; auto-routing to orchestrator creator`,
    structuredPhaseCount,
    contentPhaseCount,
    archKey,
    visionKey,
    title,
  });
}

/**
 * Build the decision return value, including telemetry payload.
 * @private
 */
function decision({
  route,
  layer_a_signal,
  layer_b_signal,
  override,
  reason,
  structuredPhaseCount,
  contentPhaseCount,
  archKey,
  visionKey,
  title,
}) {
  const telemetry = {
    route,
    layer_a_signal,
    layer_b_signal,
    override,
    structured_phase_count: structuredPhaseCount,
    content_phase_count: contentPhaseCount,
    reason,
    archKey: archKey || null,
    visionKey: visionKey || null,
    title: title || null,
    timestamp: new Date().toISOString(),
  };
  return { route, layer_a_signal, layer_b_signal, override, reason, telemetry };
}
