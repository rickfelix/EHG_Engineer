/**
 * Stage 15 sub-step — User Journey synthesis
 * SD-LEO-INFRA-FIRST-CLASS-USER-001
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
  const personaLower = String(personaName || '').toLowerCase();
  const clusters = [];
  for (const epic of epics) {
    const stories = (epic?.stories || []).filter((story) => {
      const asA = String(story?.as_a || story?.persona || '').toLowerCase();
      if (!asA) return false;
      return asA.includes(personaLower) || personaLower.includes(asA);
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
    const iaPage = (iaPages || []).find((p) => String(p.name || '').toLowerCase() === String(screen.screen_name || '').toLowerCase());
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
 * @returns {{steps: Array, orphanStoryIds: Array<string>}}
 */
export function buildStepsForGoalCluster(personaName, goalCluster, screens, iaPages, opts = {}) {
  const mapped = [];
  const orphanStoryIds = [];
  for (const story of goalCluster.stories) {
    const screen = mapStoryToScreen(story, screens, iaPages, personaName, opts);
    if (!screen) {
      orphanStoryIds.push(story.id || story.title || story.name || slugify(storyGoalText(story), 32));
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
  authFirst.forEach((entry, idx) => {
    const goal = entry.story.i_want_to || entry.story.title || entry.story.name || storyGoalText(entry.story);
    const action = entry.story.i_want_to || entry.story.title || 'proceed';
    const screenRef = entry.screen.screen_id;
    const provisionalKey = { goal: String(goal), screenRef: String(screenRef), action: String(action) };
    const auth = isAuthStep(storyGoalText(entry.story)) || isAuthStep(entry.screen.screen_name);
    const requires = idx > 0 ? [steps[idx - 1].__provisionalId] : [];
    if (!auth) requires.push(...authStepIds.filter((id) => !requires.includes(id)));
    const provisionalId = `${provisionalKey.goal}|${provisionalKey.screenRef}|${provisionalKey.action}`;
    steps.push({
      __provisionalId: provisionalId,
      seq: (idx + 1) * 10,
      goal: String(goal),
      screen_ref: String(screenRef),
      route: entry.screen.page_type ? `/${slugify(entry.screen.page_type, 24)}` : null,
      action: String(action),
      expected_outcome: String(entry.story.so_that || entry.story.acceptance_criteria?.[0] || 'goal achieved'),
      side_effects_claimed: entry.story.acceptance_criteria ? entry.story.acceptance_criteria.slice(1) : [],
      requires,
      story_refs: [entry.story.id || provisionalId],
    });
    if (auth) authStepIds.push(provisionalId);
  });

  return { steps, orphanStoryIds };
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

/**
 * Venture-level completeness self-check (design doc §4). Written by the generator; a consuming
 * gate independently re-verifies it, per the generator-writes/gate-reads registry primitive.
 */
export function computeCoverageSelfcheck(journeys, totalStories, screens) {
  const orphanStories = journeys.flatMap((j) => j.orphan_story_ids || []);
  const reachedScreenIds = new Set(journeys.flatMap((j) => j.steps.map((s) => s.screen_ref)));
  const allScreenIds = (screens || []).map((s) => s.screen_id);
  const unreachableScreens = allScreenIds.filter((id) => !reachedScreenIds.has(id));
  const journeysReachingExit = journeys.filter((j) => j.steps.length > 0).length;
  const dagValid = journeys.every((j) => isValidDag(j.steps));

  return {
    stories_total: totalStories,
    stories_covered: totalStories - orphanStories.length,
    orphan_stories: orphanStories,
    screens_total: allScreenIds.length,
    screens_reached: allScreenIds.length - unreachableScreens.length,
    unreachable_screens: unreachableScreens,
    journeys_reaching_exit_success: `${journeysReachingExit}/${journeys.length}`,
    dag_valid: dagValid,
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
  const priorJourneys = ctx.priorJourneys || [];
  const opts = { mapStoryToScreenOverride: ctx.mapStoryToScreenOverride };

  if (personas.length === 0) {
    logger.warn('[Stage15-UserJourney] No Stage-10 personas available — skipping (finding emitted, not fabricated)');
    return {
      journeys: [],
      coverage_selfcheck: computeCoverageSelfcheck([], 0, screens),
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

      const { steps: rawSteps, orphanStoryIds } = buildStepsForGoalCluster(persona.name, cluster, screens, iaPages, opts);
      const { steps, tombstones } = assignDurableStepIds(rawSteps, priorJourney, persona.name, newVersion);

      if (orphanStoryIds.length > 0) {
        findings.push({ type: 'STEP_COVERAGE_MISSING', persona: persona.name, journey_id: journeyId, orphan_story_ids: orphanStoryIds });
      }

      journeys.push({
        journey_id: journeyId,
        version: newVersion,
        persona_ref: persona.name,
        generated_from: {
          stories: cluster.stories.map((s) => s.id || s.title || s.name).filter(Boolean),
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

  const coverage_selfcheck = computeCoverageSelfcheck(journeys, totalStories, screens);
  logger.log('[Stage15-UserJourney] Journey synthesis complete', {
    journeyCount: journeys.length,
    findingCount: findings.length,
    dagValid: coverage_selfcheck.dag_valid,
  });

  return { journeys, coverage_selfcheck, findings };
}
