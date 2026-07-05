/**
 * Unit tests for lib/eva/journey-walk-driver.js.
 *
 * SD-LEO-INFRA-POST-BUILD-ARTIFACT-001-E
 *
 * @module tests/unit/eva/journey-walk-driver.test
 */

import { describe, it, expect, vi } from 'vitest';
import {
  waitForServerReady,
  startLocalMarketLensServer,
  runJourneyWalk,
} from '../../../lib/eva/journey-walk-driver.js';
import { generatePersonaFromArtifact } from '../../../lib/eva/persona-generator.js';

const PERSONA = generatePersonaFromArtifact({
  personas: [{
    name: 'Test Persona',
    demographics: { industry: 'Technology' },
    goals: ['Validate an idea fast'],
    painPoints: ['Too much uncertainty'],
  }],
});

/** A fake Playwright-like page that succeeds every step, matching the real
 *  MarketLens app's rendered content/URLs. */
function makeHappyPathPage() {
  let currentUrl = '';
  const locatorText = {
    'h1': 'Validate your idea in minutes',
    '#signup-message': 'Account created — welcome to MarketLens!',
    'body': 'Your persona and willingness-to-pay analysis is complete.',
  };
  return {
    goto: vi.fn(async (url) => { currentUrl = url; }),
    fill: vi.fn(async () => {}),
    click: vi.fn(async (selector) => {
      if (selector === 'button[type="submit"]' && currentUrl.endsWith('/app/login')) currentUrl = 'http://localhost:3001/app';
      if (selector === 'form[action="/app/generate"] button[type="submit"]') currentUrl = 'http://localhost:3001/app/results/sub-123';
    }),
    waitForURL: vi.fn(async () => {}),
    waitForFunction: vi.fn(async () => {}),
    url: vi.fn(() => currentUrl),
    locator: vi.fn((sel) => ({
      first: () => ({ textContent: async () => locatorText[sel] }),
      textContent: async () => locatorText[sel] || 'ok',
    })),
  };
}

describe('runJourneyWalk() — TS-3 (broken step is recorded precisely, walk stops)', () => {
  it('completes all 5 steps on the happy path', async () => {
    const page = makeHappyPathPage();
    const result = await runJourneyWalk(page, PERSONA, { baseUrl: 'http://localhost:3001' });

    expect(result.completedAllSteps).toBe(true);
    expect(result.brokenAtStep).toBeNull();
    expect(result.outcomes).toHaveLength(5);
    expect(result.outcomes.every((o) => o.success)).toBe(true);
  });

  it('records the exact break point when a step fails, and does not continue past it', async () => {
    const page = makeHappyPathPage();
    // Force the "submit" step to fail. signup's step internally fills 4 fields
    // (register email/password, then login email/password) before submit's first
    // fill (productDescription) is the 5th call.
    let fillCalls = 0;
    page.fill = vi.fn(async () => {
      fillCalls += 1;
      if (fillCalls === 5) throw new Error('productDescription field not found (route broken)');
    });

    const result = await runJourneyWalk(page, PERSONA, { baseUrl: 'http://localhost:3001' });

    expect(result.completedAllSteps).toBe(false);
    expect(result.brokenAtStep).toBe('submit');
    // land + signup succeeded, submit failed, results/feedback never attempted.
    expect(result.outcomes).toHaveLength(3);
    expect(result.outcomes[0].success).toBe(true);
    expect(result.outcomes[1].success).toBe(true);
    expect(result.outcomes[2].success).toBe(false);
    expect(result.outcomes[2].failureReason).toMatch(/route broken/);
  });
});

describe('waitForServerReady() / startLocalMarketLensServer() — TS-4 (graceful degradation)', () => {
  it('returns true once the health endpoint responds ok', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true });
    const ready = await waitForServerReady({
      baseUrl: 'http://localhost:3001', healthPath: '/api/health',
      timeoutMs: 5000, pollIntervalMs: 10, fetchFn, sleepFn: async () => {},
    });
    expect(ready).toBe(true);
  });

  it('returns false (never throws) when the server never becomes ready within the timeout', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const sleepFn = async () => {};
    const ready = await waitForServerReady({
      baseUrl: 'http://localhost:3001', healthPath: '/api/health',
      timeoutMs: 50, pollIntervalMs: 10, fetchFn, sleepFn,
    });
    expect(ready).toBe(false);
  });

  it('startLocalMarketLensServer returns ready:false (not a crash, not a false pass) when the server never becomes ready', async () => {
    const spawnFn = vi.fn(() => ({ kill: vi.fn() }));
    const fetchFn = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await startLocalMarketLensServer({
      repoPath: '/fake/path', spawnFn, fetchFn, sleepFn: async () => {},
    });
    expect(result.ready).toBe(false);
    expect(result.process).toBeNull();
  });

  it('startLocalMarketLensServer returns ready:true with the process handle when the server becomes ready', async () => {
    const killFn = vi.fn();
    const spawnFn = vi.fn(() => ({ kill: killFn }));
    const fetchFn = vi.fn().mockResolvedValue({ ok: true });
    const result = await startLocalMarketLensServer({
      repoPath: '/fake/path', spawnFn, fetchFn, sleepFn: async () => {},
    });
    expect(result.ready).toBe(true);
    expect(result.process).toBeTruthy();
    expect(killFn).not.toHaveBeenCalled();
  });
});
