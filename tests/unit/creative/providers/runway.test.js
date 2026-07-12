/**
 * SD-LEO-FEAT-RUNWAY-CLIENT-IMPLEMENT-001 — real RunwayML client unit tests.
 * HTTP layer mocked only, never the config gate (TEST-MASKING rule): TS-1 verifies the
 * unconfigured path without touching process.env inside a mock.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateWithRunway, isRunwayConfigured } from '../../../../lib/creative/providers/runway.js';
import { ProviderNotConfiguredError, TaskFailedError } from '../../../../lib/creative/errors.js';

const ORIGINAL_KEY = process.env.RUNWAY_API_KEY;
const ORIGINAL_KEY_ALT = process.env.RUNWAYML_API_KEY;

function jsonResponse(body, ok = true, status = 200) {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) };
}

function fetchQueue(responses) {
  const calls = [];
  const queue = [...responses];
  const fetchImpl = vi.fn(async (url, opts) => {
    calls.push({ url, opts });
    const next = queue.shift();
    if (next instanceof Error) throw next;
    return next;
  });
  fetchImpl.calls = calls;
  return fetchImpl;
}

const noopSleep = async () => {};

beforeEach(() => {
  process.env.RUNWAY_API_KEY = 'test-key';
  delete process.env.RUNWAYML_API_KEY;
});

afterEach(() => {
  process.env.RUNWAY_API_KEY = ORIGINAL_KEY;
  process.env.RUNWAYML_API_KEY = ORIGINAL_KEY_ALT;
  vi.restoreAllMocks();
});

describe('generateWithRunway (TS-1..TS-9)', () => {
  it('TS-1: throws ProviderNotConfiguredError when no key is set, with zero fetch calls', async () => {
    delete process.env.RUNWAY_API_KEY;
    delete process.env.RUNWAYML_API_KEY;
    expect(isRunwayConfigured()).toBe(false);

    const fetchImpl = fetchQueue([]);
    await expect(
      generateWithRunway({ capability: 'image', spec: { prompt: 'test' } }, { fetchImpl, sleepImpl: noopSleep })
    ).rejects.toBeInstanceOf(ProviderNotConfiguredError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('TS-2: configured image generation resolves to {asset,provenance,cost} on first poll SUCCEEDED', async () => {
    const fetchImpl = fetchQueue([
      jsonResponse({ id: 'task-abc' }),
      jsonResponse({ id: 'task-abc', status: 'SUCCEEDED', output: ['https://runway.example/out.png'] }),
    ]);

    const result = await generateWithRunway(
      { capability: 'image', spec: { prompt: 'a red apple' } },
      { fetchImpl, sleepImpl: noopSleep }
    );

    expect(result.provenance.provider).toBe('runway');
    expect(result.provenance.request_id).toBe('task-abc');
    expect(result.asset.url).toBe('https://runway.example/out.png');

    const createCall = fetchImpl.calls[0];
    expect(createCall.url).toBe('https://api.dev.runwayml.com/v1/text_to_image');
    const body = JSON.parse(createCall.opts.body);
    expect(body.model).toBe('gen4_image');
    expect(body.promptText).toBe('a red apple');
    expect(createCall.opts.headers.Authorization).toBe('Bearer test-key');
    expect(createCall.opts.headers['X-Runway-Version']).toBe('2024-11-06');
  });

  it('TS-3: polls until SUCCEEDED across multiple RUNNING responses', async () => {
    const fetchImpl = fetchQueue([
      jsonResponse({ id: 'task-xyz' }),
      jsonResponse({ id: 'task-xyz', status: 'RUNNING', progress: 0.3 }),
      jsonResponse({ id: 'task-xyz', status: 'RUNNING', progress: 0.7 }),
      jsonResponse({ id: 'task-xyz', status: 'SUCCEEDED', output: ['https://runway.example/final.png'] }),
    ]);

    const result = await generateWithRunway(
      { capability: 'image', spec: { prompt: 'test' } },
      { fetchImpl, sleepImpl: noopSleep }
    );

    expect(fetchImpl).toHaveBeenCalledTimes(4); // 1 create + 3 polls
    expect(result.asset.url).toBe('https://runway.example/final.png');
  });

  it('TS-4: configured video generation uses text_to_video with a distinct request body', async () => {
    const fetchImpl = fetchQueue([
      jsonResponse({ id: 'task-vid' }),
      jsonResponse({ id: 'task-vid', status: 'SUCCEEDED', output: ['https://runway.example/out.mp4'] }),
    ]);

    const result = await generateWithRunway(
      { capability: 'video', spec: { prompt: 'a bouncing ball' } },
      { fetchImpl, sleepImpl: noopSleep }
    );

    expect(result.asset.capability).toBe('video');
    expect(result.provenance.provider).toBe('runway');

    const createCall = fetchImpl.calls[0];
    expect(createCall.url).toBe('https://api.dev.runwayml.com/v1/text_to_video');
    const body = JSON.parse(createCall.opts.body);
    expect(body.model).toBe('gen4.5');
  });

  it('TS-5: FAILED task status throws TaskFailedError carrying failureCode/failure', async () => {
    const fetchImpl = fetchQueue([
      jsonResponse({ id: 'task-fail' }),
      jsonResponse({ id: 'task-fail', status: 'FAILED', failure: 'Content policy violation', failureCode: 'CONTENT_POLICY' }),
    ]);

    await expect(
      generateWithRunway({ capability: 'image', spec: { prompt: 'test' } }, { fetchImpl, sleepImpl: noopSleep })
    ).rejects.toMatchObject({
      constructor: TaskFailedError,
      code: 'CONTENT_POLICY',
      message: 'Content policy violation',
    });
  });

  it('TS-6: non-2xx HTTP response on create throws TaskFailedError(code=HTTP_<status>)', async () => {
    const fetchImpl = fetchQueue([jsonResponse({ error: 'rate limited' }, false, 429)]);

    await expect(
      generateWithRunway({ capability: 'image', spec: { prompt: 'test' } }, { fetchImpl, sleepImpl: noopSleep })
    ).rejects.toMatchObject({ code: 'HTTP_429' });
  });

  it('TS-7: fetch rejection (network error) on create throws TaskFailedError(code=NETWORK_ERROR)', async () => {
    const fetchImpl = fetchQueue([new Error('ECONNRESET')]);

    await expect(
      generateWithRunway({ capability: 'image', spec: { prompt: 'test' } }, { fetchImpl, sleepImpl: noopSleep })
    ).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });

  it('TS-8: task stuck at RUNNING beyond maxPollAttempts throws TaskFailedError(code=POLL_TIMEOUT)', async () => {
    const responses = [jsonResponse({ id: 'task-stuck' })];
    for (let i = 0; i < 5; i++) responses.push(jsonResponse({ id: 'task-stuck', status: 'RUNNING', progress: 0.1 }));
    const fetchImpl = fetchQueue(responses);

    await expect(
      generateWithRunway(
        { capability: 'image', spec: { prompt: 'test' } },
        { fetchImpl, sleepImpl: noopSleep, maxPollAttempts: 5 }
      )
    ).rejects.toMatchObject({ code: 'POLL_TIMEOUT' });
  });

  it('TS-9: generateAsset("video", spec, {}) routes through the unmodified routing layer to Runway', async () => {
    const fetchImpl = fetchQueue([
      jsonResponse({ id: 'task-route' }),
      jsonResponse({ id: 'task-route', status: 'SUCCEEDED', output: ['https://runway.example/routed.mp4'] }),
    ]);
    vi.stubGlobal('fetch', fetchImpl);

    const { generateAsset } = await import('../../../../lib/creative/generate-asset.js');
    const result = await generateAsset('video', { prompt: 'a routed video' }, {});

    expect(result.provenance.provider).toBe('runway');
    expect(result.asset.url).toBe('https://runway.example/routed.mp4');
  });
});
