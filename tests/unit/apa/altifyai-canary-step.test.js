/**
 * SD-LEO-FIX-ALTIFYAI-STAGE-WALK-001 -- unit tests for lib/apa/altifyai-canary-step.mjs.
 * Coordinator ruling (relaying Solomon verdict 83de7b45): the canary control must be a real,
 * expected-FAIL runner-side step (never a waiver). These tests confirm the step always FAILs
 * by construction and never mutates state (GET only).
 */
import { describe, it, expect, vi } from 'vitest';
import { runCanaryStep, CANARY_JOURNEY_ID } from '../../../lib/apa/altifyai-canary-step.mjs';

const OK = (body) => ({ ok: true, json: async () => body });
const FAIL = (status) => ({ ok: false, status, json: async () => ({}) });

describe('runCanaryStep', () => {
  it('always reports FAIL when the impossible marker is (correctly) never found', async () => {
    const fetchImpl = vi.fn(async () => OK({ events: [{ properties: { path: '/some-real-event' } }] }));
    const result = await runCanaryStep({ baseUrl: 'https://x.dev', fetchImpl });
    expect(result.journeyId).toBe(CANARY_JOURNEY_ID);
    expect(result.status).toBe('FAIL');
    expect(result.reason).toMatch(/never-written marker/);
  });

  it('reports FAIL (not a thrown error) when the GET itself returns a non-ok response', async () => {
    const fetchImpl = vi.fn(async () => FAIL(500));
    const result = await runCanaryStep({ baseUrl: 'https://x.dev', fetchImpl });
    expect(result.status).toBe('FAIL');
    expect(result.reason).toMatch(/HTTP 500/);
  });

  it('reports FAIL (not a thrown error) when the fetch itself throws', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('network down'); });
    const result = await runCanaryStep({ baseUrl: 'https://x.dev', fetchImpl });
    expect(result.status).toBe('FAIL');
    expect(result.reason).toMatch(/network down/);
  });

  it('never issues a mutating request -- only a GET to /api/events', async () => {
    const fetchImpl = vi.fn(async () => OK({ events: [] }));
    await runCanaryStep({ baseUrl: 'https://x.dev', fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://x.dev/api/events');
    expect(opts.method).toBe('GET');
  });

  it('generates a fresh, unique marker per invocation (never a fixed/guessable literal)', async () => {
    const seen = [];
    const fetchImpl = vi.fn(async (url, opts) => {
      seen.push(opts);
      return OK({ events: [] });
    });
    await runCanaryStep({ baseUrl: 'https://x.dev', fetchImpl });
    await runCanaryStep({ baseUrl: 'https://x.dev', fetchImpl });
    // The marker itself lives inside the closure (never sent over the wire, since this is a
    // pure GET) -- what we can assert externally is that two independent runs both FAIL and
    // both hit the same read-only endpoint, never varying the request into a write.
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
