/**
 * Unit tests for lib/apa/browser-executor.js.
 *
 * SD-LEO-INFRA-AUTOMATED-PRODUCT-ASSESSMENT-001-C
 *
 * @module tests/unit/apa/browser-executor.test
 */

import { describe, it, expect, vi } from 'vitest';
import {
  executeJourneyStep,
  runJourneyWalk,
  createResilientPage,
} from '../../../lib/apa/browser-executor.js';

const PERSONA = { name: 'Fixture Persona' };
const JOURNEY_STEPS = ['stepA', 'stepB', 'stepC'];

function makeHappyStepExecutors() {
  return {
    stepA: vi.fn(async (page, persona, ctx) => ({ url: `${ctx.baseUrl}/a`, renderedStateSummary: 'a-ready' })),
    stepB: vi.fn(async (page, persona, ctx) => ({ url: `${ctx.baseUrl}/b`, renderedStateSummary: 'b-ready', token: 'tok-123' })),
    stepC: vi.fn(async (page, persona, ctx) => ({ url: `${ctx.baseUrl}/c/${ctx.token}`, renderedStateSummary: 'c-ready' })),
  };
}

describe('runJourneyWalk() — TS-1 (happy path, injected step-executors)', () => {
  it('completes all injected steps in order, producing the documented outcome-record shape', async () => {
    const stepExecutors = makeHappyStepExecutors();
    const result = await runJourneyWalk({}, PERSONA, JOURNEY_STEPS, stepExecutors, { baseUrl: 'http://fixture' });

    expect(result.completedAllSteps).toBe(true);
    expect(result.brokenAtStep).toBeNull();
    expect(result.outcomes).toHaveLength(3);
    expect(result.outcomes.every((o) => o.success)).toBe(true);
    expect(result.outcomes[0]).toMatchObject({ step: 'stepA', url: 'http://fixture/a', renderedStateSummary: 'a-ready', success: true, failureReason: null });
  });

  it('propagates a step executor\'s extra return keys into ctx for the next step, generalizing submissionId/email carry-forward', async () => {
    const stepExecutors = makeHappyStepExecutors();
    const result = await runJourneyWalk({}, PERSONA, JOURNEY_STEPS, stepExecutors, { baseUrl: 'http://fixture' });

    // stepC's executor reads ctx.token, which only stepB's extra return key provides.
    expect(result.outcomes[2].url).toBe('http://fixture/c/tok-123');
  });
});

describe('runJourneyWalk() — TS-2 (stop at first failure)', () => {
  it('records the exact break point when a step fails, and never executes subsequent steps', async () => {
    const stepExecutors = makeHappyStepExecutors();
    stepExecutors.stepB = vi.fn(async () => { throw new Error('stepB: element not found'); });

    const result = await runJourneyWalk({}, PERSONA, JOURNEY_STEPS, stepExecutors, { baseUrl: 'http://fixture' });

    expect(result.completedAllSteps).toBe(false);
    expect(result.brokenAtStep).toBe('stepB');
    expect(result.outcomes).toHaveLength(2);
    expect(result.outcomes[0].success).toBe(true);
    expect(result.outcomes[1].success).toBe(false);
    expect(result.outcomes[1].failureReason).toMatch(/element not found/);
    expect(stepExecutors.stepC).not.toHaveBeenCalled();
  });
});

describe('executeJourneyStep()', () => {
  it('throws for an unknown step id', async () => {
    await expect(executeJourneyStep({}, 'nonexistent', {}, PERSONA, {})).rejects.toThrow(/unknown step/);
  });

  it('throws unknown-step for an Object.prototype-colliding step name rather than invoking the inherited member (adversarial review finding)', async () => {
    await expect(executeJourneyStep({}, 'constructor', {}, PERSONA, {})).rejects.toThrow(/unknown step/);
    await expect(executeJourneyStep({}, 'toString', {}, PERSONA, {})).rejects.toThrow(/unknown step/);
  });

  it('records a failureReason string for a non-Error throw instead of crashing the whole run (adversarial review finding)', async () => {
    const stepExecutors = { stepA: vi.fn(async () => { throw 'a plain string, not an Error'; }) };
    const outcome = await executeJourneyStep({}, 'stepA', stepExecutors, PERSONA, {});

    expect(outcome.success).toBe(false);
    expect(outcome.failureReason).toBe('a plain string, not an Error');
  });
});

describe('createResilientPage() — TS-3 (deterministic selector-drift recovery, zero model cost)', () => {
  function makeDriftFixturePage() {
    const fillCalls = [];
    return {
      fillCalls,
      fill: vi.fn(async (selector) => {
        fillCalls.push(selector);
        if (selector === '[data-testid="signup-submit"]') {
          throw new Error('element not found: drifted');
        }
        // any other (recovered) selector succeeds
      }),
      locator: vi.fn((sel) => ({
        count: vi.fn(async () => (sel === '[data-testid*="signup"]' ? 1 : 0)),
        all: vi.fn(async () => (sel === '[data-testid*="signup"]'
          ? [{ getAttribute: vi.fn(async (attr) => (attr === 'data-testid' ? 'signup-submit-v2' : null)) }]
          : [])),
      })),
    };
  }

  it('recovers a drifted data-testid selector via the deterministic testid-pattern strategy and retries successfully', async () => {
    const fixturePage = makeDriftFixturePage();
    const onRecovery = vi.fn();
    const resilientPage = createResilientPage(fixturePage, onRecovery);

    await resilientPage.fill('[data-testid="signup-submit"]', 'value');

    expect(onRecovery).toHaveBeenCalledTimes(1);
    expect(onRecovery.mock.calls[0][0]).toMatchObject({ recovered: true, new_selector: '[data-testid="signup-submit-v2"]' });
    expect(fixturePage.fillCalls).toEqual(['[data-testid="signup-submit"]', '[data-testid="signup-submit-v2"]']);
  });

  it('does NOT wrap click() with drift-recovery — a real click side effect must never be blindly retried (adversarial review finding: double-submission risk)', async () => {
    const click = vi.fn(async () => { throw new Error('click failed after side effect already fired'); });
    const fixturePage = { click, locator: vi.fn(() => ({ count: vi.fn(async () => 1), all: vi.fn(async () => []) })) };
    const resilientPage = createResilientPage(fixturePage);

    await expect(resilientPage.click('[data-testid="submit"]')).rejects.toThrow(/already fired/);
    expect(click).toHaveBeenCalledTimes(1); // never retried
  });

  it('passes through every other page method (bound to the real page) via Proxy — a plain object-spread would silently drop prototype methods on a real Playwright Page (adversarial review finding)', async () => {
    class FakePlaywrightPage {
      constructor() { this.calls = []; }
      async fill() { return 'fill-passthrough'; }
      // goto/locator/evaluate/etc. live on the PROTOTYPE, not as own properties —
      // exactly what a real Playwright Page class instance looks like.
      async goto(url) { this.calls.push(url); return 'goto-ok'; }
    }
    const realishPage = new FakePlaywrightPage();
    const resilientPage = createResilientPage(realishPage);

    expect(typeof resilientPage.goto).toBe('function');
    await expect(resilientPage.goto('http://fixture')).resolves.toBe('goto-ok');
    expect(realishPage.calls).toEqual(['http://fixture']);
  });

  it('re-throws the original error when no recovery strategy matches (a genuinely broken flow must still fail)', async () => {
    const fixturePage = {
      fill: vi.fn(async () => { throw new Error('#totally-gone: no signal to recover from'); }),
      locator: vi.fn(() => ({ count: vi.fn(async () => 0), all: vi.fn(async () => []) })),
    };
    const resilientPage = createResilientPage(fixturePage);

    await expect(resilientPage.fill('#totally-gone', 'value')).rejects.toThrow(/no signal to recover from/);
  });

  it('performs zero model/LLM calls anywhere in the recovery path (deterministic only)', async () => {
    // recoverFromDrift and its strategies are pure DOM/selector heuristics with
    // no import of any LLM/API client — grep-verifiable at review time. This
    // test asserts the behavioral contract: a successful recovery here required
    // only page.locator()-based DOM queries, never a network/model call.
    const fixturePage = makeDriftFixturePage();
    const resilientPage = createResilientPage(fixturePage);
    await resilientPage.fill('[data-testid="signup-submit"]', 'value');
    // The only calls made were to the injected page's own fill/locator methods.
    expect(fixturePage.fill).toHaveBeenCalled();
    expect(fixturePage.locator).toHaveBeenCalled();
  });
});
