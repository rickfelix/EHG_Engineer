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
