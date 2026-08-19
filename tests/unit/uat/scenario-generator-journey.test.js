/**
 * Unit tests for lib/uat/scenario-generator.js's generateJourneyScenarios() —
 * SD-LEO-INFRA-VENTURE-JOURNEY-UAT-001 FR-2. Scoped to the new journey-step path only;
 * the pre-existing SD/user_stories path (generateScenarios()) is untouched by this SD.
 *
 * @module tests/unit/uat/scenario-generator-journey.test
 */

import { describe, it, expect } from 'vitest';
import { generateJourneyScenarios } from '../../../lib/uat/scenario-generator.js';

const REAL_STEP = {
  step_id: 'stp-f5cc-define-my-primary-ni',
  journey_id: 'jny-niche-content-so-niche-profile-setup',
  persona_ref: 'Niche Content Solopreneur',
  seq: 10,
  goal: 'define my primary niche and target audience',
  screen_ref: 'screen-3',
  route: null,
  action: 'define my primary niche and target audience',
  expected_outcome: null,
  requires: [],
};

describe('generateJourneyScenarios()', () => {
  it('returns [] for non-array input rather than throwing', () => {
    expect(generateJourneyScenarios(null)).toEqual([]);
    expect(generateJourneyScenarios(undefined)).toEqual([]);
    expect(generateJourneyScenarios('not-an-array')).toEqual([]);
  });

  it('returns [] for an empty array', () => {
    expect(generateJourneyScenarios([])).toEqual([]);
  });

  it('maps a real (goal-level-prose) step into a GWT scenario without fabricating concrete UI language', () => {
    const [scenario] = generateJourneyScenarios([REAL_STEP]);

    expect(scenario.id).toBe('stp-f5cc-define-my-primary-ni');
    expect(scenario.source).toBe('journey_step');
    expect(scenario.sourceId).toBe('stp-f5cc-define-my-primary-ni');
    expect(scenario.given).toMatch(/Niche Content Solopreneur is attempting to/);
    expect(scenario.when).toBe('define my primary niche and target audience');
    // No expected_outcome on this real row -- must fall back honestly, not fabricate one.
    expect(scenario.then).toBe('the step completes successfully');
    expect(scenario.routeContext).toEqual({ path: null, screenRef: 'screen-3' });
    expect(scenario.labels).toEqual(['journey-step', 'jny-niche-content-so-niche-profile-setup']);
  });

  it('uses expected_outcome for `then` and passCriteria when present', () => {
    const step = { ...REAL_STEP, expected_outcome: 'the niche profile is saved' };
    const [scenario] = generateJourneyScenarios([step]);

    expect(scenario.then).toBe('the niche profile is saved');
    expect(scenario.passCriteria).toEqual(['the niche profile is saved']);
  });

  it('defaults persona/given gracefully when persona_ref is missing', () => {
    const step = { ...REAL_STEP, persona_ref: null };
    const [scenario] = generateJourneyScenarios([step]);
    expect(scenario.given).toMatch(/^a user is attempting to/);
  });

  it('preserves input order and produces one scenario per step', () => {
    const stepB = { ...REAL_STEP, step_id: 'stp-b', goal: 'second step' };
    const scenarios = generateJourneyScenarios([REAL_STEP, stepB]);
    expect(scenarios.map((s) => s.id)).toEqual(['stp-f5cc-define-my-primary-ni', 'stp-b']);
  });

  it('defaults priority to HIGH — journey steps are core flows, not optional edge cases', () => {
    const [scenario] = generateJourneyScenarios([REAL_STEP]);
    expect(scenario.priority).toBe('HIGH');
    expect(scenario.priorityScore).toBe(75);
  });

  it('drops journey_id from labels when absent, without leaving a falsy entry', () => {
    const step = { ...REAL_STEP, journey_id: null };
    const [scenario] = generateJourneyScenarios([step]);
    expect(scenario.labels).toEqual(['journey-step']);
  });
});
