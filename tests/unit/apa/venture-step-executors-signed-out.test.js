/**
 * Unit tests for the signed-out journey coverage additions to
 * lib/apa/venture-step-executors.js — SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-C (FR-3).
 *
 * TESTING/LEAD-validation finding: signed-out coverage was genuinely absent, and the fix must
 * NOT fabricate new unverified DOM selectors (the exact blind-guard mistake this file's own
 * header already refuses to make). getSignedOutJourneySteps/buildSignedOutStepExecutor reuse
 * ONLY the already-verified preflightChecks — these tests confirm that reuse, and confirm the
 * signed-out executor never attempts auth.
 */
import { describe, it, expect } from 'vitest';
import {
  getSignedOutJourneySteps,
  buildSignedOutStepExecutor,
  registerVenture,
} from '../../../lib/apa/venture-step-executors.js';

describe('getSignedOutJourneySteps', () => {
  it('derives journey steps ONLY from the venture\'s registered preflightChecks (AltifyAI)', () => {
    const steps = getSignedOutJourneySteps('ALTIFYAI');
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.every((s) => s.step_id.startsWith('signed-out:'))).toBe(true);
    expect(steps.map((s) => s.goal)).toEqual(expect.arrayContaining(['land', 'signupFormRenders', 'uploadScreenAbsent', 'feedbackWidget']));
  });

  it('returns an empty array for a venture with no registration (never fabricates steps)', () => {
    expect(getSignedOutJourneySteps('NO-SUCH-VENTURE')).toEqual([]);
  });
});

describe('buildSignedOutStepExecutor', () => {
  it('executes the matching preflightCheck and returns its result, without any auth attempt', async () => {
    const calls = [];
    registerVenture('TESTVENTURE-SO', {
      preflightChecks: [
        { name: 'land', async run(page, ctx) { calls.push('land-ran'); return { url: ctx.baseUrl, renderedStateSummary: 'ok' }; } },
      ],
    });
    const executor = buildSignedOutStepExecutor({ step_id: 'signed-out:land' }, 'TESTVENTURE-SO');
    const page = {}; // never touched for auth — a real page object isn't needed since the
                       // preflightCheck itself owns all page interaction
    const result = await executor(page, { type: 'signedOut' }, { baseUrl: 'http://fixture' });
    expect(calls).toEqual(['land-ran']);
    expect(result.renderedStateSummary).toBe('ok');
  });

  it('fails honestly (does not fall through to the auth-attempting fallback) when no matching preflightCheck exists', async () => {
    registerVenture('TESTVENTURE-SO2', { preflightChecks: [] });
    const executor = buildSignedOutStepExecutor({ step_id: 'signed-out:nonexistent' }, 'TESTVENTURE-SO2');
    await expect(executor({}, { type: 'signedOut' }, { baseUrl: 'http://fixture' })).rejects.toThrow(/no verified signed-out mapping/);
  });

  it('AltifyAI: a real signed-out step executes its underlying preflightCheck against a mock page', async () => {
    const steps = getSignedOutJourneySteps('ALTIFYAI');
    const landStep = steps.find((s) => s.goal === 'land');
    const executor = buildSignedOutStepExecutor(landStep, 'ALTIFYAI');
    const page = {
      async goto(url) { this.lastUrl = url; return { status: () => 200 }; },
      locator() { return { count: async () => 1 }; },
    };
    const result = await executor(page, { type: 'signedOut' }, { baseUrl: 'http://altifyai.fixture' });
    expect(result.url).toBe('http://altifyai.fixture');
    expect(result.renderedStateSummary).toMatch(/landing page rendered/);
  });
});
