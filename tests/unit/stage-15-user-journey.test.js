/**
 * Unit tests for stage-15-user-journey.js (SD-LEO-INFRA-FIRST-CLASS-USER-001).
 *
 * Covers the PRD's TS-1 through TS-8 test scenarios plus the corrected design-doc behaviors
 * (multiple journeys per persona, DAG requires, durable step_id carry-forward + tombstones).
 * All pure/injectable functions — zero live Supabase/LLM dependencies.
 */

import { describe, it, expect } from 'vitest';
import {
  slugify,
  computeStepId,
  computeJourneyId,
  computeStoryRef,
  personaMatches,
  clusterStoriesByGoal,
  mapStoryToScreen,
  buildStepsForGoalCluster,
  assignDurableStepIds,
  isValidDag,
  computeCoverageSelfcheck,
  generateUserJourneys,
} from '../../lib/eva/stage-templates/analysis-steps/stage-15-user-journey.js';

const noopLogger = { log() {}, warn() {}, error() {} };

function persona(name) {
  return { name, demographics: {}, goals: [], painPoints: [] };
}

function story({ id, as_a, i_want_to, so_that, acceptance_criteria }) {
  return { id, as_a, i_want_to, so_that, acceptance_criteria: acceptance_criteria || [] };
}

function screen({ screen_id, screen_name, description, page_type }) {
  return { screen_id, screen_name, description, deviceType: 'DESKTOP', page_type: page_type || null };
}

describe('slugify', () => {
  it('lowercases, hyphenates, strips special chars, caps length', () => {
    expect(slugify('Sign Up Now!')).toBe('sign-up-now');
    expect(slugify('  spaced   out ')).toBe('spaced-out');
    expect(slugify('', 10)).toBe('x');
  });
});

describe('computeStepId / computeJourneyId', () => {
  it('produces a content-slugged, non-positional step_id', () => {
    const id = computeStepId({ personaName: 'Founder', goal: 'sign up', screenRef: 'scr-1', action: 'submit form' });
    expect(id).toMatch(/^stp-[0-9a-f]{4}-submit-form$/);
  });

  it('is deterministic: identical inputs produce identical IDs', () => {
    const a = computeStepId({ personaName: 'Founder', goal: 'sign up', screenRef: 'scr-1', action: 'submit form' });
    const b = computeStepId({ personaName: 'Founder', goal: 'sign up', screenRef: 'scr-1', action: 'submit form' });
    expect(a).toBe(b);
  });

  it('journey_id is stable per (persona, goal)', () => {
    expect(computeJourneyId('Founder', 'Sign Up')).toBe('jny-founder-sign-up');
  });
});

describe('clusterStoriesByGoal', () => {
  it('groups a persona\'s stories by epic (one journey per persona+goal, TS-1 correction)', () => {
    const pack = {
      epics: [
        { name: 'Onboarding', description: 'Get started', stories: [story({ id: 'S1', as_a: 'Founder', i_want_to: 'sign up' })] },
        { name: 'Reporting', description: 'See results', stories: [story({ id: 'S2', as_a: 'Founder', i_want_to: 'view dashboard' })] },
        { name: 'Admin', description: 'Manage team', stories: [story({ id: 'S3', as_a: 'Admin', i_want_to: 'invite users' })] },
      ],
    };
    const clusters = clusterStoriesByGoal(pack, 'Founder');
    expect(clusters).toHaveLength(2);
    expect(clusters.map((c) => c.goalName)).toEqual(['Onboarding', 'Reporting']);
  });

  it('returns empty array when no stories are attributed to the persona', () => {
    const pack = { epics: [{ name: 'Admin', stories: [story({ id: 'S1', as_a: 'Admin', i_want_to: 'x' })] }] };
    expect(clusterStoriesByGoal(pack, 'Founder')).toEqual([]);
  });
});

describe('mapStoryToScreen', () => {
  const screens = [
    screen({ screen_id: 'scr-1', screen_name: 'Sign Up', description: 'Create an account form' }),
    screen({ screen_id: 'scr-2', screen_name: 'Dashboard', description: 'View analytics and reports' }),
  ];

  it('maps a story to the best-matching screen by keyword overlap', () => {
    const s = story({ id: 'S1', as_a: 'Founder', i_want_to: 'sign up create account', so_that: 'I can start' });
    const matched = mapStoryToScreen(s, screens, [], 'Founder');
    expect(matched.screen_id).toBe('scr-1');
  });

  it('returns null (orphan) when no screen clears the minimum score — never fabricates a screen', () => {
    const s = story({ id: 'S1', as_a: 'Founder', i_want_to: 'zzz completely unrelated zzz' });
    expect(mapStoryToScreen(s, screens, [], 'Founder')).toBeNull();
  });

  it('uses the injectable override only when the deterministic pass finds nothing', () => {
    const s = story({ id: 'S1', as_a: 'Founder', i_want_to: 'zzz completely unrelated zzz' });
    const override = () => screens[1];
    expect(mapStoryToScreen(s, screens, [], 'Founder', { mapStoryToScreenOverride: override }).screen_id).toBe('scr-2');
  });
});

describe('buildStepsForGoalCluster', () => {
  it('orders auth-flavored steps first (deterministic precedence)', () => {
    const screens = [
      screen({ screen_id: 'scr-dash', screen_name: 'Dashboard', description: 'view analytics reports' }),
      screen({ screen_id: 'scr-signup', screen_name: 'Sign Up', description: 'sign up create account form' }),
    ];
    const cluster = {
      goalName: 'Onboarding',
      goalDescription: 'Get started',
      stories: [
        story({ id: 'S1', as_a: 'Founder', i_want_to: 'view dashboard analytics reports', so_that: 'track progress' }),
        story({ id: 'S2', as_a: 'Founder', i_want_to: 'sign up create account', so_that: 'access the app' }),
      ],
    };
    const { steps, orphanStoryIds } = buildStepsForGoalCluster('Founder', cluster, screens, []);
    expect(orphanStoryIds).toEqual([]);
    expect(steps).toHaveLength(2);
    expect(steps[0].screen_ref).toBe('scr-signup'); // auth step ordered first
    expect(steps[1].requires).toContain(steps[0].__provisionalId); // DAG edge, not a flat list
  });

  it('emits an orphan_story_id (not a fabricated step) when no screen covers a story (TS-3)', () => {
    const cluster = { goalName: 'Onboarding', goalDescription: '', stories: [story({ id: 'S1', as_a: 'Founder', i_want_to: 'totally unmapped goal xyz' })] };
    const { steps, orphanStoryIds } = buildStepsForGoalCluster('Founder', cluster, [], []);
    expect(steps).toEqual([]);
    expect(orphanStoryIds).toEqual(['S1']);
  });
});

describe('assignDurableStepIds', () => {
  it('mints fresh step_ids with empty requires when there is no prior version', () => {
    const newSteps = [{ __provisionalId: 'p1', goal: 'sign up', screen_ref: 'scr-1', action: 'submit', requires: [], seq: 10, story_refs: [] }];
    const { steps, tombstones } = assignDurableStepIds(newSteps, null, 'Founder', 1);
    expect(steps).toHaveLength(1);
    expect(steps[0].step_id).toMatch(/^stp-/);
    expect(tombstones).toEqual([]);
  });

  it('carries forward a step_id when (goal, screen_ref, action) matches the prior version (design doc §2.2)', () => {
    const priorStepId = computeStepId({ personaName: 'Founder', goal: 'sign up', screenRef: 'scr-1', action: 'submit' });
    const priorJourney = { steps: [{ step_id: priorStepId, goal: 'sign up', screen_ref: 'scr-1', action: 'submit' }], tombstones: [] };
    const newSteps = [{ __provisionalId: 'p1', goal: 'sign up', screen_ref: 'scr-1', action: 'submit', requires: [], seq: 10, story_refs: [] }];
    const { steps } = assignDurableStepIds(newSteps, priorJourney, 'Founder', 2);
    expect(steps[0].step_id).toBe(priorStepId); // carried forward, not a fresh mint
  });

  it('tombstones a removed step instead of silently dropping it (design doc §2.3)', () => {
    const removedId = 'stp-aaaa-removed-step';
    const priorJourney = { steps: [{ step_id: removedId, goal: 'old goal', screen_ref: 'scr-x', action: 'old action' }], tombstones: [] };
    const { tombstones } = assignDurableStepIds([], priorJourney, 'Founder', 2);
    expect(tombstones).toHaveLength(1);
    expect(tombstones[0].step_id).toBe(removedId);
    expect(tombstones[0].removed_at_version).toBe(2);
  });

  it('preserves tombstones across multiple regenerations (never reused, never dropped)', () => {
    const priorJourney = { steps: [], tombstones: [{ step_id: 'stp-old-1', goal: 'g', removed_at_version: 1 }] };
    const { tombstones } = assignDurableStepIds([], priorJourney, 'Founder', 3);
    expect(tombstones).toEqual([{ step_id: 'stp-old-1', goal: 'g', removed_at_version: 1 }]);
  });
});

describe('isValidDag', () => {
  it('accepts a valid acyclic requires graph', () => {
    const steps = [
      { step_id: 'a', requires: [] },
      { step_id: 'b', requires: ['a'] },
      { step_id: 'c', requires: ['a', 'b'] },
    ];
    expect(isValidDag(steps)).toBe(true);
  });

  it('rejects a cycle', () => {
    const steps = [
      { step_id: 'a', requires: ['b'] },
      { step_id: 'b', requires: ['a'] },
    ];
    expect(isValidDag(steps)).toBe(false);
  });
});

describe('computeCoverageSelfcheck', () => {
  it('flags unreachable screens as a finding-worthy gap (dead UI)', () => {
    const screens = [{ screen_id: 'scr-1' }, { screen_id: 'scr-2' }];
    const journeys = [{ steps: [{ screen_ref: 'scr-1' }], orphan_story_ids: [] }];
    const cov = computeCoverageSelfcheck(journeys, 1, screens);
    expect(cov.unreachable_screens).toEqual(['scr-2']);
    expect(cov.screens_reached).toBe(1);
    expect(cov.screens_total).toBe(2);
  });

  it('a fully-covered venture produces zero orphans and a clean dag', () => {
    const screens = [{ screen_id: 'scr-1' }];
    const journeys = [{ steps: [{ screen_ref: 'scr-1', step_id: 's1', requires: [] }], orphan_story_ids: [] }];
    const cov = computeCoverageSelfcheck(journeys, 1, screens);
    expect(cov.orphan_stories).toEqual([]);
    expect(cov.stories_covered).toBe(1);
    expect(cov.dag_valid).toBe(true);
  });
});

describe('generateUserJourneys (integration of the pure pieces)', () => {
  const screens = [
    screen({ screen_id: 'scr-signup', screen_name: 'Sign Up', description: 'sign up create account form' }),
    screen({ screen_id: 'scr-dash', screen_name: 'Dashboard', description: 'view analytics reports dashboard' }),
  ];
  const userStoryPack = {
    epics: [
      {
        name: 'Onboarding',
        description: 'Get started',
        stories: [
          story({ id: 'S1', as_a: 'Founder', i_want_to: 'sign up create account', so_that: 'access the app' }),
          story({ id: 'S2', as_a: 'Founder', i_want_to: 'view dashboard analytics reports', so_that: 'track progress' }),
        ],
      },
    ],
  };

  it('TS-1: emits one journey per (persona, goal), each step DAG-valid and traceable to a real story+screen', async () => {
    const ctx = {
      logger: noopLogger,
      stage10Data: { customerPersonas: [persona('Founder')] },
      userStoryPack,
      wireframeScreensPayload: { screens, ia_sitemap: { pages: [] } },
    };
    const result = await generateUserJourneys(ctx);
    expect(result.journeys).toHaveLength(1);
    const journey = result.journeys[0];
    expect(journey.journey_id).toBe('jny-founder-onboarding');
    expect(journey.steps.length).toBeGreaterThan(0);
    expect(isValidDag(journey.steps)).toBe(true);
    for (const step of journey.steps) {
      expect(screens.map((s) => s.screen_id)).toContain(step.screen_ref);
    }
  });

  it('TS-4: zero personas produces a finding, never a fabricated default persona/journey', async () => {
    const ctx = { logger: noopLogger, stage10Data: { customerPersonas: [] }, userStoryPack, wireframeScreensPayload: { screens, ia_sitemap: { pages: [] } } };
    const result = await generateUserJourneys(ctx);
    expect(result.journeys).toEqual([]);
    expect(result.findings.some((f) => f.type === 'PERSONA_PROVENANCE_MISSING')).toBe(true);
  });

  it('a persona with a goal whose story has no matching screen produces a STEP_COVERAGE_MISSING finding (TS-3)', async () => {
    const packWithOrphan = {
      epics: [{ name: 'Weird', description: '', stories: [story({ id: 'S9', as_a: 'Founder', i_want_to: 'totally unrelated unmapped xyz' })] }],
    };
    const ctx = { logger: noopLogger, stage10Data: { customerPersonas: [persona('Founder')] }, userStoryPack: packWithOrphan, wireframeScreensPayload: { screens, ia_sitemap: { pages: [] } } };
    const result = await generateUserJourneys(ctx);
    expect(result.findings.some((f) => f.type === 'STEP_COVERAGE_MISSING')).toBe(true);
  });

  it('TS-2: regenerating an unchanged venture preserves every step_id byte-for-byte', async () => {
    const ctx = {
      logger: noopLogger,
      stage10Data: { customerPersonas: [persona('Founder')] },
      userStoryPack,
      wireframeScreensPayload: { screens, ia_sitemap: { pages: [] } },
    };
    const first = await generateUserJourneys(ctx);
    const firstIds = first.journeys[0].steps.map((s) => s.step_id);

    const second = await generateUserJourneys({ ...ctx, priorJourneys: first.journeys });
    const secondIds = second.journeys[0].steps.map((s) => s.step_id);
    expect(secondIds).toEqual(firstIds);
    expect(second.journeys[0].version).toBe(2);
    expect(second.journeys[0].tombstones).toEqual([]);
  });
});

// ============================================================================================
// SD-LEO-INFRA-FIX-STAGE-JOURNEY-001 -- FR-1..FR-4: story provenance, route resolution, flow
// coverage, and the realistic (measured-shape, deliberately-crafted) fixture that exercises them.
// The fixture below is DERIVED FROM the MEASURED AltifyAI producer shape (scripts/one-off/
// fix-stage-journey-001-fixture-snapshot.json: stories with no id, screens with page_type:null,
// ia_sitemap.pages with real paths) but deliberately adjusted per FR-4 (a)-(f) to exercise both
// the resolvable and unresolvable branches of FR-2/FR-3 -- the raw measured data alone cannot
// (TESTING T-2/T-4/R-1/R-2/R-7: the raw data's one no-match screen is never reached, and its 4
// real flows are all uncoverable, so a verbatim fixture would leave every new branch untested).
// ============================================================================================

describe('computeStoryRef (FR-1)', () => {
  it('returns story.id verbatim when present', () => {
    expect(computeStoryRef(story({ id: 'S1', as_a: 'x', i_want_to: 'y', so_that: 'z' }))).toBe('S1');
  });
  it('returns a deterministic sty-<8hex> pointer when id is absent, computed only over as_a/i_want_to/so_that', () => {
    const s = story({ as_a: 'Creator', i_want_to: 'upload a file', so_that: 'process it' });
    const ref1 = computeStoryRef(s);
    const ref2 = computeStoryRef(s);
    expect(ref1).toBe(ref2);
    expect(ref1).toMatch(/^sty-[0-9a-f]{8}$/);
  });
  it('a story with different as_a/i_want_to/so_that content produces a different pointer', () => {
    const a = computeStoryRef(story({ as_a: 'Creator', i_want_to: 'upload a file', so_that: 'process it' }));
    const b = computeStoryRef(story({ as_a: 'Creator', i_want_to: 'download a file', so_that: 'archive it' }));
    expect(a).not.toBe(b);
  });
  it('editing acceptance_criteria alone does NOT change the pointer (deliberate continuity tradeoff, TESTING T-8)', () => {
    const before = computeStoryRef(story({ as_a: 'Creator', i_want_to: 'upload', so_that: 'process', acceptance_criteria: ['old AC'] }));
    const after = computeStoryRef(story({ as_a: 'Creator', i_want_to: 'upload', so_that: 'process', acceptance_criteria: ['new AC', 'another'] }));
    expect(before).toBe(after);
  });
});

describe('personaMatches (bidirectional substring, FR-3)', () => {
  it('matches "The Busy Content Creator" (journey-shaped) against "Busy Content Creator" (flow-shaped) -- the real measured mismatch (TESTING T-3)', () => {
    expect(personaMatches('The Busy Content Creator', 'Busy Content Creator')).toBe(true);
    expect(personaMatches('Busy Content Creator', 'The Busy Content Creator')).toBe(true);
  });
  it('does not match unrelated personas', () => {
    expect(personaMatches('Busy Content Creator', 'E-commerce Product Manager')).toBe(false);
  });
});

/** FR-4 fixture: one persona with 2 journeys (epics), 5 screens, ia_sitemap with pages + 4 flows
 * covering all six required deliberate constructions (a)-(f). */
function buildFr4Fixture() {
  const screens = [
    screen({ screen_id: 'scr-landing', screen_name: 'Landing', description: 'The landing page introduces the product and its value proposition' }),
    screen({ screen_id: 'scr-dashboard', screen_name: 'Dashboard', description: 'The dashboard shows an overview after the user logs in' }),
    screen({ screen_id: 'scr-upload', screen_name: 'Upload', description: 'Upload a file for processing' }),
    screen({ screen_id: 'scr-review', screen_name: 'Review', description: 'Review the results of processing for accuracy' }),
    // (a) REACHED screen with NO matching ia_sitemap page (deliberately, TESTING T-2).
    screen({ screen_id: 'scr-settings', screen_name: 'Settings', description: 'Adjust settings and preferences' }),
  ];
  const iaPages = [
    { name: 'Landing', path: '/' },
    { name: 'Dashboard', path: '/dashboard' },
    { name: 'Upload', path: '/upload' },
    { name: 'Review', path: '/review' },
    // 'Login' is an IA page with NO corresponding screen -- used by flows (e)/(f) to exercise
    // FLOW_STEP_UNRESOLVED without a screen ever existing for it (measured real-data shape).
    { name: 'Login', path: '/login' },
    // NOTE: no page named 'Settings' -- (a)'s deliberate mismatch.
  ];
  const userStoryPack = {
    epics: [
      {
        name: 'Onboarding',
        stories: [
          story({ as_a: 'Alex the Creator', i_want_to: 'view the landing page', so_that: 'I understand the product', acceptance_criteria: ['Given I visit the site, Then I see the landing page'] }),
          story({ as_a: 'Alex the Creator', i_want_to: 'see my dashboard', so_that: 'I can start working', acceptance_criteria: ['Given I am logged in, Then I see an overview'] }),
        ],
      },
      {
        name: 'Work',
        stories: [
          story({ as_a: 'Alex the Creator', i_want_to: 'upload a file for processing', so_that: 'I can process it', acceptance_criteria: ['Given a file, Then it uploads'] }),
          story({ as_a: 'Alex the Creator', i_want_to: 'review the results of processing', so_that: 'I can verify accuracy', acceptance_criteria: ['Given results, Then I can review them'] }),
          story({ as_a: 'Alex the Creator', i_want_to: 'adjust settings and preferences', so_that: 'I can customize my experience', acceptance_criteria: ['Given settings, Then I can adjust them'] }),
        ],
      },
    ],
  };
  // (b) persona has 2+ journeys (one per epic -- the real, universal shape).
  const personas = [persona('Alex the Creator')];
  const userFlows = [
    // (c) COVERED, >=3 resolvable steps in correct order (kills the trivial 1-step case, TESTING R-2).
    { name: 'Core Work Flow', persona: 'Alex the Creator', steps: ['Dashboard', 'Upload', 'Review'] },
    // (d) UNCOVERED due to WRONG ORDER of the same otherwise-resolvable steps (TESTING R-2).
    { name: 'Reordered Flow', persona: 'Alex the Creator', steps: ['Upload', 'Dashboard', 'Review'] },
    // (e) UNCOVERED because its resolvable steps are never all reached in order, AND separately
    // contains an unresolvable step (Login has no screen) that raises its OWN finding without
    // itself causing the uncoverage (TESTING R-7b -- mirrors measured flows 2/3 exactly).
    { name: 'Review Then Dashboard Flow', persona: 'Alex the Creator', steps: ['Login', 'Review', 'Dashboard'] },
    // (f) the R-7 discriminator: HAS an unresolvable step (Login) but its resolvable steps DO
    // form a correct ordered subsequence -- expected COVERED, with a FLOW_STEP_UNRESOLVED finding
    // and explicitly NO FLOW_COVERAGE_MISSING for this flow. This is the ONLY flow shape under
    // which a correct implementation and an auto-fail-on-unresolvable-step implementation differ.
    { name: 'Login Then Work Flow', persona: 'Alex the Creator', steps: ['Login', 'Dashboard', 'Upload'] },
  ];
  return {
    ctx: {
      logger: noopLogger,
      stage10Data: { customerPersonas: personas },
      userStoryPack,
      wireframeScreensPayload: { screens, ia_sitemap: { pages: iaPages, user_flows: userFlows } },
    },
    screens, iaPages, userFlows,
  };
}

describe('FR-2: route resolution via ia_sitemap.pages[].path (not page_type/EVA_SURFACE_AWARE_ENABLED)', () => {
  it('resolves real routes for screens with a matching IA page, and null + ROUTE_UNRESOLVED for the deliberately-unmatched REACHED screen', async () => {
    const { ctx } = buildFr4Fixture();
    const result = await generateUserJourneys(ctx);
    const allSteps = result.journeys.flatMap((j) => j.steps);

    const dashboardStep = allSteps.find((s) => s.screen_ref === 'scr-dashboard');
    expect(dashboardStep.route).toBe('/dashboard');
    const uploadStep = allSteps.find((s) => s.screen_ref === 'scr-upload');
    expect(uploadStep.route).toBe('/upload');

    const settingsStep = allSteps.find((s) => s.screen_ref === 'scr-settings');
    expect(settingsStep).toBeDefined(); // reached -- a story maps to it
    expect(settingsStep.route).toBeNull();
    const routeFinding = result.findings.find((f) => f.type === 'ROUTE_UNRESOLVED' && f.screen_ref === 'scr-settings');
    expect(routeFinding).toBeDefined();
    expect(routeFinding.screen_name).toBe('Settings');
  });

  it('never reads screen.page_type or depends on EVA_SURFACE_AWARE_ENABLED (TR-1)', async () => {
    const { ctx } = buildFr4Fixture();
    // Every screen in the fixture has page_type: null (screen() helper default) -- if the
    // generator still read page_type, every route would be null. It is not.
    const result = await generateUserJourneys(ctx);
    const nonNullRoutes = result.journeys.flatMap((j) => j.steps).filter((s) => s.route !== null);
    expect(nonNullRoutes.length).toBeGreaterThan(0);
  });
});

describe('FR-1: story provenance in the generated artifact', () => {
  it('story_refs and orphan_story_ids are sty- content pointers, never composite pipe strings or slugified text', async () => {
    const { ctx } = buildFr4Fixture();
    const result = await generateUserJourneys(ctx);
    const allSteps = result.journeys.flatMap((j) => j.steps);
    for (const step of allSteps) {
      expect(step.story_refs[0]).toMatch(/^sty-[0-9a-f]{8}$/);
      expect(step.story_refs[0]).not.toContain('|');
    }
    for (const journey of result.journeys) {
      for (const ref of journey.generated_from.stories) {
        expect(ref).toMatch(/^sty-[0-9a-f]{8}$/);
      }
    }
  });

  it('calling generateUserJourneys twice on identical input produces IDENTICAL story_refs and routes (determinism)', async () => {
    const { ctx } = buildFr4Fixture();
    const first = await generateUserJourneys(ctx);
    const second = await generateUserJourneys(ctx);
    const firstRefs = first.journeys.flatMap((j) => j.steps.map((s) => s.story_refs[0]));
    const secondRefs = second.journeys.flatMap((j) => j.steps.map((s) => s.story_refs[0]));
    expect(secondRefs).toEqual(firstRefs);
    const firstRoutes = first.journeys.flatMap((j) => j.steps.map((s) => s.route));
    const secondRoutes = second.journeys.flatMap((j) => j.steps.map((s) => s.route));
    expect(secondRoutes).toEqual(firstRoutes);
  });
});

describe('FR-3: user_flows coverage -- concatenated multi-journey persona sequence, exact ordered subsequence', () => {
  it('a persona with 2+ journeys is compared against the CONCATENATION of all of them, in emission order (TESTING R-1)', async () => {
    const { ctx } = buildFr4Fixture();
    const result = await generateUserJourneys(ctx);
    expect(result.journeys.length).toBe(2); // one per epic -- (b)'s 2+-journeys-per-persona requirement
    expect(result.journeys.every((j) => j.persona_ref === 'Alex the Creator')).toBe(true);
    // 'Core Work Flow' steps span BOTH journeys (Dashboard is in journey 1, Upload/Review in
    // journey 2) -- it can only be COVERED if the two journeys' steps are concatenated.
    expect(result.coverage_selfcheck.uncovered_flows).not.toContain('Core Work Flow');
  });

  it('(c) a flow with >=3 resolvable steps in correct order is COVERED', async () => {
    const { ctx } = buildFr4Fixture();
    const result = await generateUserJourneys(ctx);
    expect(result.coverage_selfcheck.uncovered_flows).not.toContain('Core Work Flow');
    expect(result.findings.some((f) => f.type === 'FLOW_COVERAGE_MISSING' && f.flow_name === 'Core Work Flow')).toBe(false);
  });

  it('(d) a flow whose resolvable steps are present but in the WRONG order is UNCOVERED -- proves the subsequence check enforces order, not multiset membership (TESTING R-2)', async () => {
    const { ctx } = buildFr4Fixture();
    const result = await generateUserJourneys(ctx);
    expect(result.coverage_selfcheck.uncovered_flows).toContain('Reordered Flow');
    expect(result.findings.some((f) => f.type === 'FLOW_COVERAGE_MISSING' && f.flow_name === 'Reordered Flow')).toBe(true);
  });

  it('(e) a flow uncovered because its resolvable steps are never all reached in order, which ALSO contains an unresolvable step whose finding does NOT itself cause the uncoverage (TESTING R-7b)', async () => {
    const { ctx } = buildFr4Fixture();
    const result = await generateUserJourneys(ctx);
    expect(result.coverage_selfcheck.uncovered_flows).toContain('Review Then Dashboard Flow');
    expect(result.findings.some((f) => f.type === 'FLOW_STEP_UNRESOLVED' && f.flow_name === 'Review Then Dashboard Flow' && f.page_name === 'Login')).toBe(true);
  });

  it('(f) THE DISCRIMINATOR (TESTING R-7): a flow WITH an unresolvable step whose resolvable steps DO form a correct ordered subsequence is COVERED, with a FLOW_STEP_UNRESOLVED finding and explicitly NO FLOW_COVERAGE_MISSING -- proves an unresolvable step alone never fails a flow', async () => {
    const { ctx } = buildFr4Fixture();
    const result = await generateUserJourneys(ctx);
    expect(result.coverage_selfcheck.uncovered_flows).not.toContain('Login Then Work Flow');
    expect(result.findings.some((f) => f.type === 'FLOW_STEP_UNRESOLVED' && f.flow_name === 'Login Then Work Flow' && f.page_name === 'Login')).toBe(true);
    expect(result.findings.some((f) => f.type === 'FLOW_COVERAGE_MISSING' && f.flow_name === 'Login Then Work Flow')).toBe(false);
  });

  it('flows_total/flows_covered/uncovered_flows are correct against the fixture\'s known answer: 4 total, 2 covered (c,f), 2 uncovered (d,e)', async () => {
    const { ctx } = buildFr4Fixture();
    const result = await generateUserJourneys(ctx);
    expect(result.coverage_selfcheck.flows_total).toBe(4);
    expect(result.coverage_selfcheck.flows_covered).toBe(2);
    expect(result.coverage_selfcheck.uncovered_flows.sort()).toEqual(['Reordered Flow', 'Review Then Dashboard Flow'].sort());
  });

  it('the zero-personas early return populates flows_total/flows_covered/uncovered_flows correctly rather than silently omitting them (TESTING R-6)', async () => {
    const { ctx } = buildFr4Fixture();
    const zeroPersonaCtx = { ...ctx, stage10Data: { customerPersonas: [] } };
    const result = await generateUserJourneys(zeroPersonaCtx);
    expect(result.coverage_selfcheck.flows_total).toBe(4);
    expect(result.coverage_selfcheck.flows_covered).toBe(0);
    expect(result.coverage_selfcheck.uncovered_flows.length).toBe(4);
  });

  it('a flow whose real order is the REVERSE of the journey is UNCOVERED even when every visited screen has an unresolved (null) route (regression: null must not satisfy null via route-string equality -- EXEC review finding, live data measures 14/14 null routes)', async () => {
    const screens = [
      screen({ screen_id: 'scr-alpha', screen_name: 'Alpha', description: 'The alpha destination screen, with no matching IA page' }),
      screen({ screen_id: 'scr-beta', screen_name: 'Beta', description: 'The beta destination screen, with no matching IA page' }),
    ];
    // Deliberately NO iaPages at all -- both screens' routes resolve to null (route-space collision).
    const iaPages = [];
    const userStoryPack = {
      epics: [{
        name: 'Null-Route Epic',
        stories: [
          story({ as_a: 'Nullperson', i_want_to: 'view the alpha destination screen', so_that: 'alpha is confirmed visited first', acceptance_criteria: ['Given nothing, Then alpha'] }),
          story({ as_a: 'Nullperson', i_want_to: 'view the beta destination screen', so_that: 'beta is confirmed visited second', acceptance_criteria: ['Given alpha, Then beta'] }),
        ],
      }],
    };
    const personas = [persona('Nullperson')];
    // Flow demands the EXACT REVERSE of the real journey order (Beta before Alpha).
    const userFlows = [{ name: 'Reversed Null-Route Flow', persona: 'Nullperson', steps: ['Beta', 'Alpha'] }];
    const ctx = {
      logger: noopLogger,
      stage10Data: { customerPersonas: personas },
      userStoryPack,
      wireframeScreensPayload: { screens, ia_sitemap: { pages: iaPages, user_flows: userFlows } },
    };

    const result = await generateUserJourneys(ctx);
    const journeySteps = result.journeys.flatMap((j) => j.steps);
    // Sanity: both screens really were reached, both really do have a null (unresolved) route,
    // and the real visit order is Alpha then Beta (story order -- neither is auth-flavored).
    expect(journeySteps.map((s) => s.screen_ref).sort()).toEqual(['scr-alpha', 'scr-beta']);
    expect(journeySteps.every((s) => s.route === null)).toBe(true);
    const alphaIdx = journeySteps.findIndex((s) => s.screen_ref === 'scr-alpha');
    const betaIdx = journeySteps.findIndex((s) => s.screen_ref === 'scr-beta');
    expect(alphaIdx).toBeLessThan(betaIdx);

    // The flow's demanded order (Beta, Alpha) is the REVERSE of the actual journey (Alpha, Beta)
    // -- it must be UNCOVERED. Pre-fix, isOrderedSubsequence([null, null], [null, null]) matched
    // regardless of which physical screen each null belonged to, reporting a false COVERED.
    expect(result.coverage_selfcheck.uncovered_flows).toContain('Reversed Null-Route Flow');
    expect(result.findings.some((f) => f.type === 'FLOW_COVERAGE_MISSING' && f.flow_name === 'Reversed Null-Route Flow')).toBe(true);
    // Both flow steps ARE resolvable screens (they exist) -- but with unresolved routes, so each
    // raises its own FLOW_STEP_UNRESOLVED finding, the same treatment as a step with no screen at all.
    expect(
      result.findings
        .filter((f) => f.type === 'FLOW_STEP_UNRESOLVED' && f.flow_name === 'Reversed Null-Route Flow')
        .map((f) => f.page_name)
        .sort()
    ).toEqual(['Alpha', 'Beta']);
  });
});
