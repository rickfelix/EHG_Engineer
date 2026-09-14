/**
 * Stage 15 sub-step — User Journey synthesis
 * SD-LEO-INFRA-FIRST-CLASS-USER-001, fixed by SD-LEO-INFRA-FIX-STAGE-JOURNEY-001
 *
 * Synthesizes one ordered end-to-end journey per (persona, primary goal) cluster from artifacts
 * that already exist by this point in Stage 15: the user-story pack (epics = goal clusters),
 * wireframe screens, and the IA sitemap (embedded in wireframe_screens.ia_sitemap). Runs strictly
 * after those three so every input is available -- never invents a persona, story, or screen that
 * isn't in the venture's own artifact corpus (absence is surfaced as a finding, never fabricated).
 *
 * Schema + design rationale: docs/design/user-journey-artifact-schema.md (Solomon, 2026-07-07).
 * Pure/injectable functions throughout (TR-2) so this is unit-testable with zero live dependencies.
 */

import crypto from 'crypto';

const AUTH_KEYWORDS = ['login', 'log in', 'sign in', 'signin', 'sign up', 'signup', 'authenticate', 'register', 'password', 'verify'];

/** Lowercase, hyphenate, strip non-alphanumerics, cap length. */
export function slugify(text, maxLen = 24) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, maxLen) || 'x';
}

/** Content-slugged step_id: stp-<4hex>-<action-slug>. Never positional. */
export function computeStepId({ personaName, goal, screenRef, action }) {
  const content = `${personaName}|${goal}|${screenRef}|${action}`;
  const hex = crypto.createHash('sha256').update(content).digest('hex').slice(0, 4);
  return `stp-${hex}-${slugify(action, 20)}`;
}

/** journey_id: jny-<persona-slug>-<goal-slug>. Stable per (persona, primary goal). */
export function computeJourneyId(personaName, goalName) {
  return `jny-${slugify(personaName, 16)}-${slugify(goalName, 24)}`;
}

/**
 * SD-LEO-INFRA-FIX-STAGE-JOURNEY-001 FR-1: content-derived story pointer, sty-<8hex> over ONLY
 * {as_a, i_want_to, so_that} -- deliberately EXCLUDES acceptance_criteria and any other
 * mutable/derived field, so editing acceptance criteria (a common, expected workflow action) does
 * not silently break story_refs continuity across regenerations. Returns story.id verbatim when
 * present (backward-compatible with any future producer that emits one). This is a deliberate
 * LOCAL design tradeoff (matching this file's own step_id carry-forward rule), NOT mandated by
 * ratification df3186e6 (which asks for a pointer to carry a version/hash of the WHOLE overwritable
 * record) -- hashing a chosen field subset means the pointer does NOT change when an excluded field
 * changes. story_refs does not detect acceptance_criteria drift; this is accepted, not hidden.
 */
export function computeStoryRef(story) {
  if (story?.id) return story.id;
  const content = `${story?.as_a || ''}|${story?.i_want_to || ''}|${story?.so_that || ''}`;
  const hex = crypto.createHash('sha256').update(content).digest('hex').slice(0, 8);
  return `sty-${hex}`;
}

/** Bidirectional case-insensitive substring match -- the persona-matching rule used throughout
 * this file (originally clusterStoriesByGoal's own inline rule; extracted so FR-3's flow/journey
 * persona matching reuses the identical rule rather than risking drift). */
export function personaMatches(a, b) {
  const aLower = String(a || '').toLowerCase();
  const bLower = String(b || '').toLowerCase();
  if (!aLower || !bLower) return false;
  return aLower.includes(bLower) || bLower.includes(aLower);
}

/**
 * Cluster a persona's stories by primary goal. Deterministic: epics already ARE goal clusters
 * (the user-story-pack generator groups stories into epics = cohesive goal groupings), so this
 * assigns one journey per (persona, epic) rather than requiring a separate LLM clustering pass.
 * A story is attributed to a persona by matching its `as_a` field (or fallback text fields)
 * against the persona name (case-insensitive substring match, either direction).
 *
 * @param {{epics?: Array}} userStoryPack
 * @param {string} personaName
 * @returns {Array<{goalName: string, goalDescription: string, stories: Array}>}
 */
export function clusterStoriesByGoal(userStoryPack, personaName) {
  const epics = userStoryPack?.epics || [];
  const clusters = [];
  for (const epic of epics) {
    const stories = (epic?.stories || []).filter((story) => {
      const asA = String(story?.as_a || story?.persona || '');
      if (!asA) return false;
      return personaMatches(asA, personaName);
    });
    if (stories.length === 0) continue;
    clusters.push({
      goalName: epic.name || epic.title || `goal-${clusters.length + 1}`,
      goalDescription: epic.description || epic.name || epic.title || '',
      stories,
    });
  }
  return clusters;
}

function storyGoalText(story) {
  return String(story?.i_want_to || story?.title || story?.story || story?.name || story?.description || '').toLowerCase();
}

function storyOutcomeText(story) {
  return String(story?.so_that || story?.acceptance_criteria?.[0] || story?.description || '').toLowerCase();
}

function keywordOverlapScore(a, b) {
  const wordsA = new Set(String(a).split(/\W+/).filter((w) => w.length > 2));
  const wordsB = new Set(String(b).split(/\W+/).filter((w) => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let hits = 0;
  for (const w of wordsA) if (wordsB.has(w)) hits++;
  return hits / Math.min(wordsA.size, wordsB.size);
}

/**
 * Map a story to the best-matching wireframe screen for a persona. Deterministic keyword-overlap
 * heuristic (screen name/description vs story goal/outcome text), optionally boosted when the IA
 * sitemap independently lists the persona against a page with matching name/purpose. Returns null
 * (an orphan) when nothing clears the minimum score -- never fabricates a screen reference.
 *
 * `mapStoryToScreenOverride` is an injectable fallback (e.g. an LLM call) for genuinely ambiguous
 * cases; defaults to null (deterministic-only), per TR-3's bounded-fallback requirement.
 */
export function mapStoryToScreen(story, screens, iaPages, personaName, opts = {}) {
  const { minScore = 0.15, mapStoryToScreenOverride = null } = opts;
  const goalText = storyGoalText(story);
  const outcomeText = storyOutcomeText(story);
  const combined = `${goalText} ${outcomeText}`;

  let best = null;
  let bestScore = 0;
  for (const screen of screens || []) {
    const screenText = `${screen.screen_name || ''} ${screen.description || ''}`.toLowerCase();
    let score = keywordOverlapScore(combined, screenText);
    const iaPage = findPageByName(screen.screen_name, iaPages);
    if (iaPage?.persona_relevance?.some((p) => String(p).toLowerCase() === String(personaName).toLowerCase())) {
      score += 0.1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = screen;
    }
  }
  if (best && bestScore >= minScore) return best;
  if (typeof mapStoryToScreenOverride === 'function') {
    const fallback = mapStoryToScreenOverride(story, screens, personaName);
    if (fallback) return fallback;
  }
  return null;
}

function isAuthStep(text) {
  const lower = String(text || '').toLowerCase();
  return AUTH_KEYWORDS.some((kw) => lower.includes(kw));
}

/** Find an ia_sitemap page by name (case-insensitive), or null. Shared by FR-2's route resolution
 * and FR-3's flow-step resolution -- the single seam both features match through. */
function findPageByName(name, iaPages) {
  return (iaPages || []).find((p) => String(p.name || '').toLowerCase() === String(name || '').toLowerCase()) || null;
}

/** Find a wireframe screen by name (case-insensitive), or null. Used by FR-3 to determine whether
 * a flow.step (an IA page name) corresponds to an ACTUAL screen at all (distinct from "does an IA
 * page exist" -- several IA pages, e.g. 'Login', have no corresponding screen). */
function findScreenByName(name, screens) {
  return (screens || []).find((s) => String(s.screen_name || '').toLowerCase() === String(name || '').toLowerCase()) || null;
}

/**
 * SD-LEO-INFRA-FIX-STAGE-JOURNEY-001 FR-2: resolve a screen's route from ia_sitemap.pages[].path
 * via case-insensitive name match -- NEVER from screen.page_type (flag-gated, null by construction
 * on every live venture today) or process.env.EVA_SURFACE_AWARE_ENABLED. Returns null when no page
 * matches (never fabricate); the caller decides whether that null is worth a finding (only when the
 * screen is actually reached by a step -- see buildStepsForGoalCluster).
 */
function resolveScreenRoute(screen, iaPages) {
  const page = findPageByName(screen.screen_name, iaPages);
  return page ? page.path : null;
}

/**
 * Build the ordered step list for one (persona, goal) cluster. Deterministic: auth-flavored
 * stories (login/signup) are ordered first (auth-before-authenticated-screens per the design
 * doc's precedence rules); the rest follow story order within the epic. `requires` forms a simple
 * DAG chain (each step requires its immediate predecessor, plus every auth step it follows) --
 * a valid, real DAG; richer branch detection is a documented follow-up (see PRD improvement
 * notes), not a blocker for correct, testable delivery of the core artifact.
 *
 * Steps whose story has no covering screen are OMITTED from the step list and instead recorded
 * as orphan_stories in the caller's coverage self-check -- absence is a finding, never a
 * fabricated screen reference.
 *
 * @returns {{steps: Array, orphanStoryIds: Array<string>, routeFindings: Array}}
 */
export function buildStepsForGoalCluster(personaName, goalCluster, screens, iaPages, opts = {}) {
  const mapped = [];
  const orphanStoryIds = [];
  for (const story of goalCluster.stories) {
    const screen = mapStoryToScreen(story, screens, iaPages, personaName, opts);
    if (!screen) {
      orphanStoryIds.push(computeStoryRef(story));
      continue;
    }
    mapped.push({ story, screen });
  }

  // auth-flavored steps first (deterministic precedence), then story order.
  const authFirst = [...mapped].sort((a, b) => {
    const aAuth = isAuthStep(storyGoalText(a.story)) || isAuthStep(a.screen.screen_name);
    const bAuth = isAuthStep(storyGoalText(b.story)) || isAuthStep(b.screen.screen_name);
    if (aAuth === bAuth) return 0;
    return aAuth ? -1 : 1;
  });

  const steps = [];
  const authStepIds = [];
  const routeFindings = [];
  authFirst.forEach((entry, idx) => {
    const goal = entry.story.i_want_to || entry.story.title || entry.story.name || storyGoalText(entry.story);
    const action = entry.story.i_want_to || entry.story.title || 'proceed';
    const screenRef = entry.screen.screen_id;
    const provisionalKey = { goal: String(goal), screenRef: String(screenRef), action: String(action) };
    const auth = isAuthStep(storyGoalText(entry.story)) || isAuthStep(entry.screen.screen_name);
    const requires = idx > 0 ? [steps[idx - 1].__provisionalId] : [];
    if (!auth) requires.push(...authStepIds.filter((id) => !requires.includes(id)));
    const provisionalId = `${provisionalKey.goal}|${provisionalKey.screenRef}|${provisionalKey.action}`;
    // FR-2: route resolved from ia_sitemap.pages[].path, never screen.page_type/EVA_SURFACE_AWARE_ENABLED.
    const route = resolveScreenRoute(entry.screen, iaPages);
    if (route === null) {
      routeFindings.push({ type: 'ROUTE_UNRESOLVED', persona: personaName, screen_ref: String(screenRef), screen_name: entry.screen.screen_name });
    }
    steps.push({
      __provisionalId: provisionalId,
      seq: (idx + 1) * 10,
      goal: String(goal),
      screen_ref: String(screenRef),
      route,
      action: String(action),
      expected_outcome: String(entry.story.so_that || entry.story.acceptance_criteria?.[0] || 'goal achieved'),
      side_effects_claimed: entry.story.acceptance_criteria ? entry.story.acceptance_criteria.slice(1) : [],
      requires,
      story_refs: [computeStoryRef(entry.story)],
    });
    if (auth) authStepIds.push(provisionalId);
  });

  return { steps, orphanStoryIds, routeFindings };
}

/**
 * Assign durable step_ids, carrying forward any step whose (goal, screen_ref, action) matches a
 * step in the prior version (immutability rule, design doc §2.2). Requires arrays (which
 * reference provisional keys) are remapped to the final step_id namespace. Steps present in the
 * prior version but absent from the new set move to `tombstones` (§2.3) -- never silently dropped,
 * never reused.
 *
 * @param {Array} newSteps - output of buildStepsForGoalCluster (with __provisionalId + requires-of-provisionalIds)
 * @param {{steps?: Array, tombstones?: Array}} [priorJourney]
 * @param {string} personaName
 * @param {number} newVersion
 * @returns {{steps: Array, tombstones: Array}}
 */
export function assignDurableStepIds(newSteps, priorJourney, personaName, newVersion) {
  const priorSteps = priorJourney?.steps || [];
  const priorByKey = new Map(priorSteps.map((s) => [`${s.goal}|${s.screen_ref}|${s.action}`, s]));
  const matchedPriorIds = new Set();

  const provisionalToFinal = new Map();
  const finalized = newSteps.map((s) => {
    const key = `${s.goal}|${s.screen_ref}|${s.action}`;
    const priorMatch = priorByKey.get(key);
    const step_id = priorMatch
      ? priorMatch.step_id
      : computeStepId({ personaName, goal: s.goal, screenRef: s.screen_ref, action: s.action });
    if (priorMatch) matchedPriorIds.add(priorMatch.step_id);
    provisionalToFinal.set(s.__provisionalId, step_id);
    return { ...s, step_id };
  });

  const steps = finalized.map(({ __provisionalId, requires, ...rest }) => ({
    ...rest,
    requires: requires.map((r) => provisionalToFinal.get(r)).filter(Boolean),
  }));

  const newlyTombstoned = priorSteps
    .filter((s) => !matchedPriorIds.has(s.step_id))
    .map((s) => ({ step_id: s.step_id, goal: s.goal, removed_at_version: newVersion }));
  const tombstones = [...(priorJourney?.tombstones || []), ...newlyTombstoned];

  return { steps, tombstones };
}

/** Detects cycles in the `requires` DAG via DFS. Returns true if valid (acyclic). */
export function isValidDag(steps) {
  const byId = new Map(steps.map((s) => [s.step_id, s]));
  const state = new Map(); // 0=unvisited,1=in-progress,2=done
  const visit = (id) => {
    if (state.get(id) === 2) return true;
    if (state.get(id) === 1) return false; // cycle
    state.set(id, 1);
    const step = byId.get(id);
    for (const dep of step?.requires || []) {
      if (byId.has(dep) && !visit(dep)) return false;
    }
    state.set(id, 2);
    return true;
  };
  return steps.every((s) => visit(s.step_id));
}

/** Ordered-subsequence check: does `needle` (array) appear, in order, within `haystack` (array)?
 * Comparison is by strict equality of elements (routes, here). Empty needle is NOT considered a
 * match by callers -- they guard length > 0 themselves, since a flow with zero resolvable steps
 * has nothing to prove coverage of. */
function isOrderedSubsequence(needle, haystack) {
  let i = 0;
  for (const h of haystack) {
    if (i < needle.length && h === needle[i]) i++;
  }
  return i === needle.length;
}

/**
 * SD-LEO-INFRA-FIX-STAGE-JOURNEY-001 FR-3: evaluate one user_flow's coverage against the
 * already-generated journeys. PERSONA MATCH: bidirectional substring (personaMatches) between
 * flow.persona and each journey's persona_ref. COMPARISON SEQUENCE: the CONCATENATION of every
 * persona-matching journey's steps, in the journeys array's own emission order (journeys.push
 * happens inside generateUserJourneys' persona->cluster loop and the array is never re-sorted, so
 * this is single-valued -- a persona with multiple journeys, the universal real shape, is not an
 * edge case). RESOLUTION: a flow.step (an IA page name) is "resolvable" only if an ACTUAL screen
 * exists with that name (not merely an IA page -- several IA pages, e.g. 'Login', have no screen
 * at all). An unresolvable step raises its OWN finding and is excluded from the subsequence check
 * -- it does NOT by itself fail the flow's coverage (a flow can be COVERED while still containing
 * an unresolvable step, if every RESOLVABLE step is present in order). A step whose screen DOES
 * exist but whose route does NOT resolve (resolveScreenRoute returns null) is treated the same way
 * -- also excluded, also raises FLOW_STEP_UNRESOLVED -- because the comparison below is by route
 * identity, and a null route is not an identity. Without this, two independently-unresolved routes
 * (null on both the flow side and the journey side -- the norm on live data, where every screen's
 * route is null until an IA page happens to match) would satisfy `null === null` and let an
 * out-of-order or never-visited flow read as COVERED. The same filter applies to the journey side
 * of the comparison (concatenatedRoutes) for the identical reason; those steps already carry their
 * own ROUTE_UNRESOLVED finding from buildStepsForGoalCluster, so no duplicate finding is raised here.
 * @returns {{covered: boolean, stepFindings: Array}}
 */
function computeFlowCoverage(flow, journeys, screens, iaPages) {
  const stepFindings = [];
  const resolvableRoutes = [];
  for (const pageName of flow.steps || []) {
    const screen = findScreenByName(pageName, screens);
    if (!screen) {
      stepFindings.push({ type: 'FLOW_STEP_UNRESOLVED', flow_name: flow.name, page_name: pageName });
      continue;
    }
    const route = resolveScreenRoute(screen, iaPages);
    if (route === null) {
      stepFindings.push({ type: 'FLOW_STEP_UNRESOLVED', flow_name: flow.name, page_name: pageName });
      continue;
    }
    resolvableRoutes.push(route);
  }
  const matchingJourneys = journeys.filter((j) => personaMatches(j.persona_ref, flow.persona));
  const concatenatedRoutes = matchingJourneys.flatMap((j) => j.steps.map((s) => s.route)).filter((route) => route !== null);
  const covered = resolvableRoutes.length > 0 && isOrderedSubsequence(resolvableRoutes, concatenatedRoutes);
  return { covered, stepFindings };
}

/**
 * Venture-level completeness self-check (design doc §4). Written by the generator; a consuming
 * gate independently re-verifies it, per the generator-writes/gate-reads registry primitive.
 *
 * SD-LEO-INFRA-FIX-STAGE-JOURNEY-001 FR-3: `flowsCtx` ({flows, screens, iaPages}) is a new,
 * explicit 4th parameter -- when omitted, flows_total/flows_covered/uncovered_flows are computed
 * over an empty flow set (0/0/[]), never silently undefined. computeCoverageSelfcheck and
 * buildStepsForGoalCluster have zero callers outside this file and its own test file, so both
 * signature changes are fully contained.
 */
export function computeCoverageSelfcheck(journeys, totalStories, screens, flowsCtx) {
  const orphanStories = journeys.flatMap((j) => j.orphan_story_ids || []);
  const reachedScreenIds = new Set(journeys.flatMap((j) => j.steps.map((s) => s.screen_ref)));
  const allScreenIds = (screens || []).map((s) => s.screen_id);
  const unreachableScreens = allScreenIds.filter((id) => !reachedScreenIds.has(id));
  const journeysReachingExit = journeys.filter((j) => j.steps.length > 0).length;
  const dagValid = journeys.every((j) => isValidDag(j.steps));

  const flows = flowsCtx?.flows || [];
  const iaPages = flowsCtx?.iaPages || [];
  const flowResults = flows.map((flow) => ({ flow, ...computeFlowCoverage(flow, journeys, screens, iaPages) }));
  const flows_total = flows.length;
  const flows_covered = flowResults.filter((r) => r.covered).length;
  const uncovered_flows = flowResults.filter((r) => !r.covered).map((r) => r.flow.name);

  return {
    stories_total: totalStories,
    stories_covered: totalStories - orphanStories.length,
    orphan_stories: orphanStories,
    screens_total: allScreenIds.length,
    screens_reached: allScreenIds.length - unreachableScreens.length,
    unreachable_screens: unreachableScreens,
    journeys_reaching_exit_success: `${journeysReachingExit}/${journeys.length}`,
    dag_valid: dagValid,
    flows_total,
    flows_covered,
    uncovered_flows,
  };
}

/**
 * Main entry point, called from the Stage-15 orchestrator after user-story-pack, IA, and
 * wireframes have all run.
 *
 * @param {Object} ctx
 * @param {{customerPersonas?: Array}} [ctx.stage10Data] - Stage 10 personas (identity_persona_brand)
 * @param {Object} [ctx.userStoryPack] - this tick's blueprint_user_story_pack result
 * @param {{screens?: Array, ia_sitemap?: Object}} [ctx.wireframeScreensPayload] - this tick's wireframe_screens payload
 * @param {Array<{steps: Array, tombstones: Array, journey_id: string, version: number}>} [ctx.priorJourneys] - last-persisted journeys, for step_id carry-forward
 * @param {Function} [ctx.mapStoryToScreenOverride] - injectable LLM fallback for ambiguous story->screen mapping
 * @param {Object} [ctx.logger]
 * @returns {Promise<{journeys: Array, coverage_selfcheck: Object, findings: Array}|null>}
 */
export async function generateUserJourneys(ctx) {
  const logger = ctx.logger || console;
  const personas = ctx.stage10Data?.customerPersonas || [];
  const userStoryPack = ctx.userStoryPack;
  const screens = ctx.wireframeScreensPayload?.screens || [];
  const iaPages = ctx.wireframeScreensPayload?.ia_sitemap?.pages || [];
  // FR-3: read alongside .pages -- ia_sitemap.user_flows was never read anywhere in this file before.
  const userFlows = ctx.wireframeScreensPayload?.ia_sitemap?.user_flows || [];
  const priorJourneys = ctx.priorJourneys || [];
  const opts = { mapStoryToScreenOverride: ctx.mapStoryToScreenOverride };
  const flowsCtx = { flows: userFlows, screens, iaPages };

  if (personas.length === 0) {
    logger.warn('[Stage15-UserJourney] No Stage-10 personas available — skipping (finding emitted, not fabricated)');
    return {
      journeys: [],
      coverage_selfcheck: computeCoverageSelfcheck([], 0, screens, flowsCtx),
      findings: [{ type: 'PERSONA_PROVENANCE_MISSING', reason: 'No identity_persona_brand personas found for this venture' }],
    };
  }

  const journeys = [];
  const findings = [];
  let totalStories = 0;

  for (const persona of personas) {
    const clusters = clusterStoriesByGoal(userStoryPack, persona.name);
    if (clusters.length === 0) {
      findings.push({ type: 'PERSONA_JOURNEY_MISSING', persona: persona.name, reason: 'No stories attributed to this persona in the story pack' });
      continue;
    }
    for (const cluster of clusters) {
      totalStories += cluster.stories.length;
      const journeyId = computeJourneyId(persona.name, cluster.goalName);
      const priorJourney = priorJourneys.find((j) => j.journey_id === journeyId) || null;
      const newVersion = (priorJourney?.version || 0) + 1;

      const { steps: rawSteps, orphanStoryIds, routeFindings } = buildStepsForGoalCluster(persona.name, cluster, screens, iaPages, opts);
      const { steps, tombstones } = assignDurableStepIds(rawSteps, priorJourney, persona.name, newVersion);

      if (orphanStoryIds.length > 0) {
        findings.push({ type: 'STEP_COVERAGE_MISSING', persona: persona.name, journey_id: journeyId, orphan_story_ids: orphanStoryIds });
      }
      // FR-2: ROUTE_UNRESOLVED findings, one per reached-but-unmatched screen, onto the SAME
      // top-level findings array (there is no separate 'journey-level' findings array).
      for (const rf of routeFindings) {
        findings.push({ ...rf, journey_id: journeyId });
      }

      journeys.push({
        journey_id: journeyId,
        version: newVersion,
        persona_ref: persona.name,
        generated_from: {
          stories: cluster.stories.map((s) => computeStoryRef(s)),
          wireframes: [...new Set(steps.map((s) => s.screen_ref))],
        },
        entry_conditions: [`${persona.name} begins: ${cluster.goalDescription || cluster.goalName}`],
        exit_success: steps.length > 0 ? steps[steps.length - 1].expected_outcome : 'no steps synthesized',
        steps,
        tombstones,
        orphan_story_ids: orphanStoryIds,
      });
    }
  }

  // FR-3: flow coverage findings (FLOW_STEP_UNRESOLVED, FLOW_COVERAGE_MISSING), computed once here
  // via the same computeFlowCoverage() helper computeCoverageSelfcheck uses for its aggregate
  // counts below -- one shared computation, two call sites, no risk of the counts and the findings
  // disagreeing.
  for (const flow of userFlows) {
    const { covered, stepFindings } = computeFlowCoverage(flow, journeys, screens, iaPages);
    for (const sf of stepFindings) findings.push(sf);
    if (!covered) {
      findings.push({ type: 'FLOW_COVERAGE_MISSING', persona: flow.persona, flow_name: flow.name });
    }
  }

  const coverage_selfcheck = computeCoverageSelfcheck(journeys, totalStories, screens, flowsCtx);
  logger.log('[Stage15-UserJourney] Journey synthesis complete', {
    journeyCount: journeys.length,
    findingCount: findings.length,
    dagValid: coverage_selfcheck.dag_valid,
  });

  return { journeys, coverage_selfcheck, findings };
}
