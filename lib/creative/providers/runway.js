// SD-LEO-FEAT-RUNWAY-CLIENT-IMPLEMENT-001 — real RunwayML REST client, replacing the honest
// ProviderNotConfiguredError-only stub now that RUNWAY_API_KEY is provisioned (2026-07-12).
// RunwayML is PRIMARY for both image and video (chairman ruling 2026-07-10).
//
// RunwayML's API is task-based/async: POST /v1/text_to_image or /v1/text_to_video returns a
// task id immediately; the caller polls GET /v1/tasks/{id} until a terminal status. Verified
// against RunwayML's own first-party @runwayml/sdk-node TypeScript source (base URL
// api.runwayml.com, Authorization: Bearer <key>, X-Runway-Version: 2024-11-06, exact field
// names) rather than guessed — implemented via raw fetch (no new SDK dependency) to match
// lib/creative/providers/gemini.js's established pattern in this codebase.

import { TaskFailedError, ProviderNotConfiguredError } from '../errors.js';

// Confirmed live against the real API (2026-07-12): api.runwayml.com returns 401
// "Incorrect hostname for API key" — the public generation API host is api.dev.runwayml.com.
const RUNWAY_HOST = 'https://api.dev.runwayml.com';
const RUNWAY_VERSION = '2024-11-06';
const IMAGE_MODEL = 'gen4_image';
const VIDEO_MODEL = 'gen4.5';
const DEFAULT_POLL_INTERVAL_MS = 3000;
const DEFAULT_MAX_POLL_ATTEMPTS = 60; // ~3 minutes at the default interval

export function isRunwayConfigured() {
  return Boolean(process.env.RUNWAY_API_KEY || process.env.RUNWAYML_API_KEY);
}

function getApiKey() {
  return process.env.RUNWAY_API_KEY || process.env.RUNWAYML_API_KEY;
}

function authHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    'X-Runway-Version': RUNWAY_VERSION,
    'Content-Type': 'application/json',
  };
}

/**
 * POST to a RunwayML generation endpoint, returning the created task id.
 * @throws {TaskFailedError} on a network failure or a non-2xx response
 */
async function createRunwayTask(endpoint, body, { fetchImpl, apiKey, capability }) {
  let response;
  try {
    response = await fetchImpl(`${RUNWAY_HOST}/v1/${endpoint}`, {
      method: 'POST',
      headers: authHeaders(apiKey),
      body: JSON.stringify(body),
    });
  } catch (cause) {
    throw new TaskFailedError(`RunwayML ${endpoint} request failed`, {
      provider: 'runway', capability, code: 'NETWORK_ERROR', cause,
    });
  }

  if (!response.ok) {
    const responseBody = await response.text().catch(() => '');
    throw new TaskFailedError(`RunwayML ${endpoint} failed (${response.status})`, {
      provider: 'runway', capability, code: `HTTP_${response.status}`, cause: responseBody,
    });
  }

  const data = await response.json();
  return data.id;
}

/**
 * Poll GET /v1/tasks/{id} on a bounded interval until a terminal status is reached.
 * @throws {TaskFailedError} on FAILED status, a poll-request failure, or exceeding maxPollAttempts
 */
async function pollRunwayTask(taskId, { fetchImpl, apiKey, capability, pollIntervalMs, maxPollAttempts, sleepImpl }) {
  for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
    let response;
    try {
      response = await fetchImpl(`${RUNWAY_HOST}/v1/tasks/${taskId}`, {
        method: 'GET',
        headers: authHeaders(apiKey),
      });
    } catch (cause) {
      throw new TaskFailedError('RunwayML task poll request failed', {
        provider: 'runway', capability, code: 'NETWORK_ERROR', cause,
      });
    }

    if (!response.ok) {
      const responseBody = await response.text().catch(() => '');
      throw new TaskFailedError(`RunwayML task poll failed (${response.status})`, {
        provider: 'runway', capability, code: `HTTP_${response.status}`, cause: responseBody,
      });
    }

    const task = await response.json();

    if (task.status === 'SUCCEEDED') return task;

    if (task.status === 'FAILED') {
      throw new TaskFailedError(task.failure || 'RunwayML task failed', {
        provider: 'runway', capability, code: task.failureCode || 'TASK_FAILED', cause: task,
      });
    }

    if (task.status === 'CANCELLED') {
      throw new TaskFailedError('RunwayML task was cancelled', {
        provider: 'runway', capability, code: 'TASK_CANCELLED', cause: task,
      });
    }

    // PENDING / THROTTLED / RUNNING — keep polling.
    await sleepImpl(pollIntervalMs);
  }

  throw new TaskFailedError('RunwayML task did not complete within the polling budget', {
    provider: 'runway', capability, code: 'POLL_TIMEOUT',
  });
}

function buildRequestBody(capability, spec, constraints) {
  if (capability === 'image') {
    const body = { model: IMAGE_MODEL, promptText: spec.prompt, ratio: constraints.ratio || '1920:1080' };
    if (constraints.referenceImages) body.referenceImages = constraints.referenceImages;
    return { endpoint: 'text_to_image', body };
  }
  if (capability === 'video') {
    const body = { model: VIDEO_MODEL, promptText: spec.prompt, ratio: constraints.ratio || '1280:720', duration: constraints.duration || 5 };
    return { endpoint: 'text_to_video', body };
  }
  throw new TaskFailedError(`RunwayML adapter does not support capability "${capability}"`, {
    provider: 'runway', capability, code: 'CAPABILITY_UNSUPPORTED',
  });
}

/**
 * @param {{capability: 'image'|'video', spec: {prompt: string}, constraints?: object}} params
 * @param {{fetchImpl?: typeof fetch, sleepImpl?: (ms: number) => Promise<void>, pollIntervalMs?: number, maxPollAttempts?: number}} [deps]
 * @returns {Promise<{asset: object, provenance: object, cost: number|null}>}
 */
export async function generateWithRunway({ capability, spec, constraints = {} }, deps = {}) {
  if (!isRunwayConfigured()) {
    throw new ProviderNotConfiguredError('runway', capability);
  }

  const apiKey = getApiKey();
  const fetchImpl = deps.fetchImpl || fetch;
  const sleepImpl = deps.sleepImpl || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const maxPollAttempts = deps.maxPollAttempts ?? DEFAULT_MAX_POLL_ATTEMPTS;

  const { endpoint, body } = buildRequestBody(capability, spec, constraints);

  const taskId = await createRunwayTask(endpoint, body, { fetchImpl, apiKey, capability });
  const task = await pollRunwayTask(taskId, { fetchImpl, apiKey, capability, pollIntervalMs, maxPollAttempts, sleepImpl });

  return {
    asset: { kind: 'generated', capability, url: task.output[0], raw: task.output },
    provenance: { provider: 'runway', model: capability === 'image' ? IMAGE_MODEL : VIDEO_MODEL, request_id: taskId, generated_at: new Date().toISOString(), prompt: spec.prompt },
    cost: null, // RunwayML per-generation pricing not yet wired to the spend-envelope model
  };
}
