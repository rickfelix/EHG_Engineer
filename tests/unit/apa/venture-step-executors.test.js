/**
 * Unit tests for lib/apa/venture-step-executors.js.
 *
 * SD-LEO-INFRA-VENTURE-JOURNEY-UAT-001 FR-2.
 *
 * @module tests/unit/apa/venture-step-executors.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  registerVenture,
  getVentureRegistration,
  getTestCredential,
  buildStepExecutor,
} from '../../../lib/apa/venture-step-executors.js';

function makeMockPage({ locatorCounts = {}, gotoResponses = {} } = {}) {
  const calls = { goto: [], fill: [], click: [] };
  return {
    calls,
    async goto(url) {
      calls.goto.push(url);
      const configured = gotoResponses[url];
      if (configured === undefined) return { status: () => 200 };
      return configured;
    },
    locator(selector) {
      const count = Object.prototype.hasOwnProperty.call(locatorCounts, selector) ? locatorCounts[selector] : 0;
      return {
        count: async () => count,
        click: async () => { calls.click.push(selector); },
      };
    },
    async fill(selector, value) { calls.fill.push([selector, value]); },
    async click(selector) { calls.click.push(selector); },
    url: () => 'http://fixture/current',
  };
}

describe('getTestCredential()', () => {
  const ENV_KEY = 'VENTURE_UAT_TEST_ACCOUNT_TESTVENTURE';
  afterEach(() => { delete process.env[ENV_KEY]; });

  it('returns null when unset', () => {
    expect(getTestCredential('TESTVENTURE')).toBeNull();
  });

  it('returns null on malformed JSON rather than throwing', () => {
    process.env[ENV_KEY] = '{not json';
    expect(getTestCredential('TESTVENTURE')).toBeNull();
  });

  it('returns null when email/password are missing', () => {
    process.env[ENV_KEY] = JSON.stringify({ email: 'x@example.com' });
    expect(getTestCredential('TESTVENTURE')).toBeNull();
  });

  it('parses a well-formed credential', () => {
    process.env[ENV_KEY] = JSON.stringify({ email: 'x@example.com', password: 'secret' });
    expect(getTestCredential('TESTVENTURE')).toEqual({ email: 'x@example.com', password: 'secret' });
  });

  it('is case-insensitive on ventureKey', () => {
    process.env[ENV_KEY] = JSON.stringify({ email: 'x@example.com', password: 'secret' });
    expect(getTestCredential('testventure')).toEqual({ email: 'x@example.com', password: 'secret' });
  });
});

describe('getVentureRegistration()', () => {
  it('returns an empty-but-shaped default for an unregistered venture', () => {
    expect(getVentureRegistration('NOT-REGISTERED-XYZ')).toEqual({ preflightChecks: [], stepOverrides: {} });
  });

  it('returns the registered venture config, case-insensitively', () => {
    registerVenture('CaseTest', { preflightChecks: [{ name: 'x', run: async () => ({}) }], stepOverrides: {} });
    expect(getVentureRegistration('casetest').preflightChecks).toHaveLength(1);
  });
});

describe('buildStepExecutor() fallback — no registered override', () => {
  const step = { step_id: 'stp-abc123-do-a-thing', goal: 'do a thing' };
  const ENV_KEY = 'VENTURE_UAT_TEST_ACCOUNT_FALLBACKVENTURE';
  afterEach(() => { delete process.env[ENV_KEY]; });

  it('reports "auth required" honestly when no test credential is configured — never attempts registration', async () => {
    const executor = buildStepExecutor(step, 'FALLBACKVENTURE');
    const page = makeMockPage();

    await expect(executor(page, {}, { baseUrl: 'http://fixture', authenticated: false }))
      .rejects.toThrow(/auth required.*no test credential configured/i);
    // Never navigated anywhere in pursuit of registering an account.
    expect(page.calls.goto).toHaveLength(0);
    expect(page.calls.fill).toHaveLength(0);
  });

  it('signs in (never registers) when a credential is configured, then honestly reports no verified UI mapping', async () => {
    process.env[ENV_KEY] = JSON.stringify({ email: 'tester@example.com', password: 'pw' });
    const executor = buildStepExecutor(step, 'FALLBACKVENTURE');
    const page = makeMockPage({ locatorCounts: { 'text=Already have an account? Sign in': 1 } });

    await expect(executor(page, {}, { baseUrl: 'http://fixture', authenticated: false }))
      .rejects.toThrow(/authenticated, but no verified UI mapping/i);

    expect(page.calls.goto).toEqual(['http://fixture/register']);
    expect(page.calls.click).toContain('text=Already have an account? Sign in');
    expect(page.calls.fill).toContainEqual(['input[name="emailAddress"], input[type="email"]', 'tester@example.com']);
    expect(page.calls.fill).toContainEqual(['input[name="password"], input[type="password"]', 'pw']);
  });

  it('does not re-attempt auth when ctx.authenticated is already true', async () => {
    const executor = buildStepExecutor(step, 'FALLBACKVENTURE');
    const page = makeMockPage();

    await expect(executor(page, {}, { baseUrl: 'http://fixture', authenticated: true }))
      .rejects.toThrow(/no verified UI mapping/i);
    expect(page.calls.goto).toHaveLength(0);
  });
});

describe('buildStepExecutor() — explicit stepOverrides take precedence', () => {
  it('uses the registered override instead of the generic fallback', async () => {
    const overrideFn = vi.fn(async () => ({ url: 'http://fixture/verified', renderedStateSummary: 'hand-verified step' }));
    registerVenture('OVERRIDE-TEST', { preflightChecks: [], stepOverrides: { 'stp-known': overrideFn } });

    const executor = buildStepExecutor({ step_id: 'stp-known', goal: 'known step' }, 'OVERRIDE-TEST');
    const result = await executor(makeMockPage(), {}, { baseUrl: 'http://fixture' });

    expect(overrideFn).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ url: 'http://fixture/verified', renderedStateSummary: 'hand-verified step' });
  });
});

describe('ALTIFYAI registration — grounded in FR-0 live evidence', () => {
  it('registers 4 preflight checks and zero step overrides (no fine-grained selector work done yet)', () => {
    const config = getVentureRegistration('ALTIFYAI');
    expect(config.preflightChecks.map((c) => c.name)).toEqual(['land', 'signupFormRenders', 'uploadScreenAbsent', 'feedbackWidget']);
    expect(config.stepOverrides).toEqual({});
  });

  it('land preflight passes when the "Start free" CTA renders', async () => {
    const { preflightChecks } = getVentureRegistration('ALTIFYAI');
    const land = preflightChecks.find((c) => c.name === 'land');
    const page = makeMockPage({ locatorCounts: { 'text=Start free': 1 } });

    const result = await land.run(page, { baseUrl: 'http://altifyai.fixture' });
    expect(result.renderedStateSummary).toMatch(/Start free/);
  });

  it('land preflight fails when the CTA is absent (regression guard)', async () => {
    const { preflightChecks } = getVentureRegistration('ALTIFYAI');
    const land = preflightChecks.find((c) => c.name === 'land');
    const page = makeMockPage({ locatorCounts: { 'text=Start free': 0 } });

    await expect(land.run(page, { baseUrl: 'http://altifyai.fixture' })).rejects.toThrow(/no "Start free"/);
  });

  it('uploadScreenAbsent passes (matches FR-0 finding) when /upload does not resolve to a real page', async () => {
    const { preflightChecks } = getVentureRegistration('ALTIFYAI');
    const check = preflightChecks.find((c) => c.name === 'uploadScreenAbsent');
    const page = makeMockPage({ gotoResponses: { 'http://altifyai.fixture/upload': { status: () => 404 } } });

    const result = await check.run(page, { baseUrl: 'http://altifyai.fixture' });
    expect(result.renderedStateSummary).toMatch(/no upload route mounted/);
  });

  it('uploadScreenAbsent fails loudly if AltifyAI ever ships the upload screen (premise went stale)', async () => {
    const { preflightChecks } = getVentureRegistration('ALTIFYAI');
    const check = preflightChecks.find((c) => c.name === 'uploadScreenAbsent');
    const page = makeMockPage({ gotoResponses: { 'http://altifyai.fixture/upload': { status: () => 200 } } });

    await expect(check.run(page, { baseUrl: 'http://altifyai.fixture' })).rejects.toThrow(/re-verify against App\.jsx/);
  });
});
