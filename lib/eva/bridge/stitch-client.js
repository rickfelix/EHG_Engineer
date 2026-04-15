/**
 * Stitch Client - SDK Abstraction Layer for Google Stitch
 * SD-LEO-INFRA-GOOGLE-STITCH-DESIGN-001-A
 *
 * Wraps @google/stitch-sdk with auth, retry, circuit breaker,
 * rate limiting, and response schema validation.
 *
 * @module eva/bridge/stitch-client
 * @version 1.0.0
 */

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const RETRY_MAX = 2;
const RETRY_BASE_DELAY_MS = 15_000;
const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_COOLDOWN_MS = 60_000;
const BUDGET_PER_VENTURE = 50;
const BUDGET_WARN_THRESHOLD = 0.8; // 80%

// ---------------------------------------------------------------------------
// Supabase client (for budget persistence in venture_artifacts)
// ---------------------------------------------------------------------------

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ---------------------------------------------------------------------------
// Stitch Generation Metrics (SD-STITCH-GENERATION-OBSERVABILITY-AND-ORCH-001-B)
// ---------------------------------------------------------------------------

/**
 * Record a screen generation metric. Fire-and-forget — never blocks generation.
 */
async function recordMetric({ ventureId, screenName, deviceType, promptText, status, attemptCount, durationMs, errorCategory, errorMessage }) {
  try {
    const promptHash = promptText
      ? createHash('sha256').update(promptText).digest('hex').slice(0, 16)
      : null;
    await supabase.from('stitch_generation_metrics').insert({
      venture_id: ventureId || null,
      screen_name: screenName || 'unknown',
      device_type: deviceType || 'DESKTOP',
      prompt_char_count: promptText ? promptText.length : 0,
      prompt_hash: promptHash,
      status,
      attempt_count: attemptCount,
      duration_ms: durationMs,
      error_category: errorCategory || null,
      error_message: errorMessage || null,
      sdk_version: _sdk ? 'stitch-sdk' : 'unknown'
    });
  } catch (err) {
    console.warn(`[stitch-client] metrics insert failed (non-blocking): ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// SDK Loader (lazy, abstraction seam for swapping tools)
// ---------------------------------------------------------------------------

let _sdk = null;
let _sdkLoader = null;
let _cachedTools = null; // SD-WIREFRAME-FIDELITY-QA-WITH-ORCH-001-D: listTools() cache

/**
 * Set a custom SDK loader (for testing or tool-swapping).
 * @param {Function} loader - Async function returning the SDK module
 */
export function setSDKLoader(loader) {
  _sdkLoader = loader;
  _sdk = null; // clear cache so next getSDK uses new loader
  _stitchInstance = null; // clear cached client
}

async function getSDK() {
  if (_sdk) return _sdk;
  try {
    if (_sdkLoader) {
      _sdk = await _sdkLoader();
    } else {
      // Dynamic import — only resolved at runtime, not build time
      const modPath = '@google/stitch-sdk';
      const mod = await import(/* @vite-ignore */ modPath);
      _sdk = mod.default || mod;
    }
    return _sdk;
  } catch (err) {
    throw new StitchSDKError(`Failed to load @google/stitch-sdk: ${err.message}`);
  }
}

/**
 * Discover available Stitch MCP tools. Results cached per process lifetime.
 * SD: SD-WIREFRAME-FIDELITY-QA-WITH-ORCH-001-D
 * @returns {Promise<string[]>} Array of tool names, or empty array on failure
 */
export async function discoverTools() {
  if (_cachedTools) return _cachedTools;
  try {
    const sdk = await getSDK();
    const apiKey = getApiKey();
    const client = new sdk.StitchToolClient({ apiKey, timeout: 30_000 });
    const toolsRaw = await client.listTools();
    // QF-20260412-732: SDK may return {tools:[...]} wrapper, not bare array
    const tools = Array.isArray(toolsRaw) ? toolsRaw : (toolsRaw?.tools || []);
    const toolNames = tools.map(t => t.name || t).filter(Boolean);
    _cachedTools = toolNames;
    console.info(`[stitch-client] Available Stitch tools (${toolNames.length}): ${toolNames.join(', ')}`);
    try { await client.close(); } catch { /* ignore */ }
    return toolNames;
  } catch (err) {
    console.warn(`[stitch-client] listTools() failed (non-fatal): ${err.message}`);
    _cachedTools = [];
    return [];
  }
}

// ---------------------------------------------------------------------------
// Custom Errors
// ---------------------------------------------------------------------------

export class StitchAuthError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StitchAuthError';
  }
}

export class StitchValidationError extends Error {
  constructor(message, fieldErrors = []) {
    super(message);
    this.name = 'StitchValidationError';
    this.fieldErrors = fieldErrors;
  }
}

export class StitchBudgetExceededError extends Error {
  constructor(ventureId, used, limit) {
    super(`Generation budget exceeded for venture ${ventureId}: ${used}/${limit}`);
    this.name = 'StitchBudgetExceededError';
    this.ventureId = ventureId;
    this.used = used;
    this.limit = limit;
  }
}

export class StitchCircuitOpenError extends Error {
  constructor(resetAt) {
    super(`Circuit breaker is OPEN. Resets at ${new Date(resetAt).toISOString()}`);
    this.name = 'StitchCircuitOpenError';
    this.resetAt = resetAt;
  }
}

export class StitchSDKError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StitchSDKError';
  }
}

// ---------------------------------------------------------------------------
// Circuit Breaker
// ---------------------------------------------------------------------------

const circuitBreaker = {
  state: 'CLOSED',       // CLOSED | OPEN | HALF_OPEN
  failureCount: 0,
  lastFailureAt: null,
  resetAt: null,

  recordSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
    this.resetAt = null;
  },

  recordFailure() {
    this.failureCount++;
    this.lastFailureAt = Date.now();
    if (this.failureCount >= CIRCUIT_BREAKER_THRESHOLD) {
      this.state = 'OPEN';
      this.resetAt = Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS;
      console.warn(`[stitch-client] Circuit breaker OPEN after ${this.failureCount} failures. Resets at ${new Date(this.resetAt).toISOString()}`);
    }
  },

  canAttempt() {
    if (this.state === 'CLOSED') return true;
    if (this.state === 'OPEN' && Date.now() >= this.resetAt) {
      this.state = 'HALF_OPEN';
      console.info('[stitch-client] Circuit breaker HALF_OPEN — allowing test call');
      return true;
    }
    if (this.state === 'HALF_OPEN') return true;
    return false;
  },

  getState() {
    // Auto-transition if cooldown elapsed
    if (this.state === 'OPEN' && Date.now() >= this.resetAt) {
      this.state = 'HALF_OPEN';
    }
    return {
      state: this.state,
      failureCount: this.failureCount,
      resetAt: this.resetAt,
    };
  },

  reset() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.lastFailureAt = null;
    this.resetAt = null;
  }
};

// ---------------------------------------------------------------------------
// Rate Limiter (per-venture token bucket)
// ---------------------------------------------------------------------------

const budgetCache = new Map(); // ventureId → { used: number }

async function loadBudget(ventureId) {
  if (budgetCache.has(ventureId)) return budgetCache.get(ventureId);

  const { data } = await supabase
    .from('venture_artifacts')
    .select('artifact_data')
    .eq('venture_id', ventureId)
    .eq('artifact_type', 'stitch_budget')
    .single();

  const budget = { used: data?.artifact_data?.used || 0 };
  budgetCache.set(ventureId, budget);
  return budget;
}

async function persistBudget(ventureId, budget) {
  await supabase
    .from('venture_artifacts')
    .upsert({
      venture_id: ventureId,
      artifact_type: 'stitch_budget',
      artifact_data: { used: budget.used, limit: BUDGET_PER_VENTURE, updated_at: new Date().toISOString() },
    }, { onConflict: 'venture_id,artifact_type' });
}

async function consumeBudget(ventureId, count = 1) {
  const budget = await loadBudget(ventureId);
  if (budget.used + count > BUDGET_PER_VENTURE) {
    throw new StitchBudgetExceededError(ventureId, budget.used, BUDGET_PER_VENTURE);
  }
  budget.used += count;

  const pct = budget.used / BUDGET_PER_VENTURE;
  if (pct >= BUDGET_WARN_THRESHOLD) {
    console.warn(`[stitch-client] Budget warning: venture ${ventureId} at ${Math.round(pct * 100)}% (${budget.used}/${BUDGET_PER_VENTURE})`);
  }

  budgetCache.set(ventureId, budget);
  await persistBudget(ventureId, budget);
  return budget;
}

// ---------------------------------------------------------------------------
// Retry Logic
// ---------------------------------------------------------------------------

function isTransientError(err) {
  if (err instanceof StitchAuthError) return false;
  if (err instanceof StitchValidationError) return false;
  if (err instanceof StitchBudgetExceededError) return false;
  const status = err.status || err.statusCode;
  if (status && status >= 400 && status < 500) return false;
  return true;
}

async function withRetry(fn, label) {
  let lastError;
  for (let attempt = 1; attempt <= RETRY_MAX; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isTransientError(err)) throw err;

      // SD-LEO-INFRA-UNIFIED-GATE-ENFORCEMENT-001 follow-up: reset the cached
      // Stitch client before retry. After a socket drop the internal MCP
      // transport enters a broken "already connected" state — every subsequent
      // call fails until we create a fresh StitchToolClient instance.
      const isTransportError = /fetch failed|socket|ECONNRESET|other side closed|Already connected/i.test(err.message || '');
      if (isTransportError) {
        await resetClient();
      }

      if (attempt < RETRY_MAX) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.warn(`[stitch-client] ${label} attempt ${attempt} failed, retrying in ${delay}ms: ${err.message}`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// Response Validation
// ---------------------------------------------------------------------------

export function validateResponse(response, requiredFields, context) {
  if (!response || typeof response !== 'object') {
    throw new StitchValidationError(`${context}: expected object, got ${typeof response}`);
  }
  const missing = requiredFields.filter(f => !(f in response));
  if (missing.length > 0) {
    throw new StitchValidationError(
      `${context}: missing required fields: ${missing.join(', ')}`,
      missing.map(f => ({ field: f, error: 'missing' }))
    );
  }
}

// ---------------------------------------------------------------------------
// Circuit-Breaker Wrapper
// ---------------------------------------------------------------------------

async function withCircuitBreaker(fn, _label) {
  if (!circuitBreaker.canAttempt()) {
    throw new StitchCircuitOpenError(circuitBreaker.resetAt);
  }

  try {
    const result = await fn();
    circuitBreaker.recordSuccess();
    return result;
  } catch (err) {
    circuitBreaker.recordFailure();
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

const metrics = {
  operations: {},

  record(op, latencyMs, success) {
    if (!this.operations[op]) {
      this.operations[op] = { count: 0, errors: 0, totalLatencyMs: 0 };
    }
    this.operations[op].count++;
    this.operations[op].totalLatencyMs += latencyMs;
    if (!success) this.operations[op].errors++;
  },

  getSummary() {
    const summary = {};
    for (const [op, data] of Object.entries(this.operations)) {
      summary[op] = {
        count: data.count,
        errors: data.errors,
        avgLatencyMs: data.count > 0 ? Math.round(data.totalLatencyMs / data.count) : 0,
        errorRate: data.count > 0 ? (data.errors / data.count).toFixed(3) : '0.000',
      };
    }
    summary.circuitBreaker = circuitBreaker.getState();
    return summary;
  },

  reset() {
    this.operations = {};
  }
};

// ---------------------------------------------------------------------------
// Instrumented call wrapper
// ---------------------------------------------------------------------------

async function instrumentedCall(opName, fn) {
  const start = Date.now();
  let success = true;
  try {
    return await withCircuitBreaker(() => withRetry(fn, opName), opName);
  } catch (err) {
    success = false;
    throw err;
  } finally {
    metrics.record(opName, Date.now() - start, success);
  }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function getApiKey() {
  const key = process.env.STITCH_API_KEY;
  if (!key) throw new StitchAuthError('STITCH_API_KEY is not set in environment');
  return key;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Stitch Client (authenticated instance, cached as singleton)
// ---------------------------------------------------------------------------

let _stitchInstance = null;

/**
 * Get an authenticated Stitch client instance.
 * Creates a StitchToolClient with the API key, then wraps it in a Stitch domain class.
 *
 * SD-LEO-INFRA-UNIFIED-GATE-ENFORCEMENT-001 follow-up: Always create a fresh
 * instance. The MCP transport inside the SDK enters a broken "still connected"
 * state after any socket drop, and caching the instance causes cascading
 * "Already connected to a transport" errors across every subsequent call.
 * Fresh instance per call is simpler than trying to reset an opaque internal
 * transport state, and the instance creation cost is negligible.
 */
async function getClient() {
  const apiKey = getApiKey();
  const sdk = await getSDK();
  const toolClient = new sdk.StitchToolClient({ apiKey });
  _stitchInstance = new sdk.Stitch(toolClient);
  return _stitchInstance;
}

/**
 * Reset the cached Stitch client. Call after a socket drop or transport error
 * so the next call gets a fresh StitchToolClient with a fresh MCP transport.
 *
 * The underlying MCP transport enters a broken "still connected" state when
 * a fetch fails mid-request. Without reset, the next call errors with
 * "Already connected to a transport. Call close() before connecting to a new transport."
 */
async function resetClient() {
  if (_stitchInstance) {
    try {
      // Try to close the transport gracefully if the SDK exposes it
      const internal = _stitchInstance.client || _stitchInstance._client;
      if (internal && typeof internal.close === 'function') {
        await internal.close().catch(() => {});
      }
    } catch {
      // ignore — we're discarding it anyway
    }
  }
  _stitchInstance = null;
}

/**
 * Check Stitch API health and authentication.
 * @returns {Promise<{healthy: boolean, latency_ms: number, api_version: string}>}
 */
export async function healthCheck() {
  const start = Date.now();
  return instrumentedCall('healthCheck', async () => {
    const client = await getClient();
    const projects = await client.projects();
    return {
      healthy: true,
      latency_ms: Date.now() - start,
      api_version: '0.0.3',
      project_count: projects.length,
    };
  });
}

/**
 * Create a Stitch design project.
 * @param {Object} options - Project creation options
 * @param {string} options.name - Project name
 * @param {Object} options.brandTokens - Brand identity tokens (colors, fonts, personality)
 * @param {string[]} options.screenDescriptions - Text descriptions of screens to generate
 * @param {string} [options.ventureId] - Venture ID for budget tracking
 * @returns {Promise<{project_id: string, url: string}>}
 */
export async function createProject(options) {
  if (options.ventureId) {
    await consumeBudget(options.ventureId, 1);
  }
  return instrumentedCall('createProject', async () => {
    const client = await getClient();
    const project = await client.createProject(options.name || 'Untitled');
    const projectId = project.id || project.projectId;
    if (!projectId) {
      throw new StitchValidationError('createProject: no project ID returned', [{ field: 'id', error: 'missing' }]);
    }
    return {
      project_id: projectId,
      url: `https://stitch.withgoogle.com/projects/${projectId}`,
    };
  });
}

/**
 * Generate design screens from text prompts.
 *
 * FIRE-AND-FORGET PATTERN: Stitch's generate tool takes 30-60s server-side
 * and often drops the HTTP response mid-stream (socket close from the LB).
 * The server still completes the generation successfully. Retrying the call
 * would cause a duplicate generation AND hit the "Already connected to a
 * transport" SDK bug. Instead we:
 *   1. Fire each generate() call once with a FRESH client
 *   2. Catch socket-drop errors and log them (the work is still happening)
 *   3. Return a "fired" list — caller polls listScreens() to detect completion
 *
 * @param {string} projectId - Stitch project ID
 * @param {string[]} prompts - Text prompts for screen generation
 * @param {string} [ventureId] - Venture ID for budget tracking
 * @returns {Promise<Array<{prompt: string, status: 'returned'|'fired', screen_id?: string, name?: string, error?: string}>>}
 */
/**
 * Generate screens in a Stitch project.
 * @param {string} projectId - Stitch project ID
 * @param {Array<string|{text: string, deviceType?: string}>} prompts - Prompt strings or objects with deviceType
 * @param {string} [ventureId] - Venture ID for budget tracking
 */
export async function generateScreens(projectId, prompts, ventureId) {
  if (ventureId) {
    await consumeBudget(ventureId, prompts.length);
  }

  // 2026-04-15 v2: Fire-then-poll pattern.
  //
  // Google's GFE (Global Front-End) drops TCP connections after ~60s regardless
  // of client-side timeout settings. Both the SDK's project.generate() (SSE) and
  // the raw callTool('generate_screen_from_text') (JSON-RPC POST) hit the same
  // endpoint and the same 60s LB limit. The MCP SDK's DEFAULT_REQUEST_TIMEOUT_MSEC
  // is 60000ms, and even when we override it, the GFE kills the connection first.
  //
  // However, Stitch ALWAYS completes generation server-side even after the client
  // connection drops. The Stitch tool docs confirm this: "If the tool call fails
  // due to connection error, the generation process may still succeed."
  //
  // The fix: fire each generate call (accept the 60s timeout), then poll
  // get_project to discover screen IDs after generation completes server-side.
  // listScreens() is permanently broken (returns {} — confirmed Stitch bug), but
  // get_project returns screenInstances[] with all screen IDs.
  const FIRE_DELAY_MS = parseInt(process.env.STITCH_SCREEN_DELAY_MS || '5000', 10);
  const POLL_INTERVAL_MS = parseInt(process.env.STITCH_POLL_INTERVAL_MS || '30000', 10);
  const POLL_MAX_WAIT_MS = parseInt(process.env.STITCH_POLL_MAX_WAIT_MS || '600000', 10); // 10 min

  const results = [];
  const apiKey = getApiKey();
  const sdk = await getSDK();
  const modelId = process.env.STITCH_MODEL_ID || 'GEMINI_3_FLASH';
  let consecutiveQuotaErrors = 0;

  // Phase 0: Snapshot existing screens before we fire any generation calls.
  const baselineScreenIds = await _getProjectScreenIds(sdk, apiKey, projectId);
  console.info(`[stitch-client] Baseline: ${baselineScreenIds.size} existing screen(s) in project`);

  // Phase 1: FIRE — send all generate calls. Each will timeout at ~60s due to
  // Google's GFE, but generation continues server-side. We do NOT retry on
  // transport errors here — retrying would cause duplicate screens.
  let firedCount = 0;
  let quotaAborted = false;

  for (let i = 0; i < prompts.length; i++) {
    const rawPrompt = prompts[i];
    const promptText = typeof rawPrompt === 'string' ? rawPrompt : rawPrompt.text;
    const deviceType = typeof rawPrompt === 'object' ? rawPrompt.deviceType : undefined;
    const screenName = typeof rawPrompt === 'object' ? (rawPrompt.name || promptText.substring(0, 30)) : promptText.substring(0, 30);
    const label = `[${i + 1}/${prompts.length}]`;

    if (deviceType) {
      console.info(`[stitch-client] ${label} deviceType: ${deviceType}`);
    }

    const fireStart = Date.now();
    const toolClient = new sdk.StitchToolClient({ apiKey, timeout: 180_000 });
    try {
      const params = { projectId, prompt: promptText, modelId };
      if (deviceType) params.deviceType = deviceType;

      const result = await toolClient.callTool('generate_screen_from_text', params);

      // If callTool returns before the 60s GFE timeout (rare but possible for
      // simple screens), we can capture the screen ID directly.
      const screen = result?.outputComponents?.[0]?.design?.screens?.[0];
      const screenId = screen?.id || screen?.screenId || screen?.screen_id;
      if (screenId) {
        console.info(`[stitch-client] ${label} returned directly: ${screenId}`);
        results.push({ prompt: promptText.slice(0, 60), status: 'returned', screen_id: screenId, name: screen?.name || screenName, deviceType, attempt: 1 });
        recordMetric({ ventureId, screenName, deviceType, promptText, status: 'success', attemptCount: 1, durationMs: Date.now() - fireStart });
        firedCount++;
      } else {
        // callTool returned but no screen ID in response — treat as fired
        console.info(`[stitch-client] ${label} returned without screen ID — will poll`);
        results.push({ prompt: promptText.slice(0, 60), status: 'fired', deviceType, attempt: 1 });
        recordMetric({ ventureId, screenName, deviceType, promptText, status: 'fired', attemptCount: 1, durationMs: Date.now() - fireStart });
        firedCount++;
      }
    } catch (err) {
      const msg = err.message || '';
      const isTransport = /fetch failed|socket|ECONNRESET|other side closed|timed out/i.test(msg);
      const isQuota = /resource has been exhausted|check quota/i.test(msg);

      if (isQuota) {
        console.error(`[stitch-client] ${label} QUOTA EXHAUSTED: ${msg.slice(0, 120)}`);
        results.push({ prompt: promptText.slice(0, 60), status: 'error', error: msg, deviceType, attempt: 1 });
        recordMetric({ ventureId, screenName, deviceType, promptText, status: 'error', attemptCount: 1, durationMs: Date.now() - fireStart, errorCategory: 'quota_exhausted', errorMessage: msg.slice(0, 500) });
        consecutiveQuotaErrors++;
      } else if (isTransport) {
        // Expected: GFE kills connection at ~60s. Generation continues server-side.
        // Do NOT retry — that would create a duplicate screen.
        console.info(`[stitch-client] ${label} fired (GFE timeout after ${Date.now() - fireStart}ms — generation continues server-side)`);
        results.push({ prompt: promptText.slice(0, 60), status: 'fired', deviceType, attempt: 1 });
        recordMetric({ ventureId, screenName, deviceType, promptText, status: 'fired', attemptCount: 1, durationMs: Date.now() - fireStart });
        consecutiveQuotaErrors = 0;
        firedCount++;
      } else {
        console.error(`[stitch-client] ${label} unexpected error: ${msg.slice(0, 120)}`);
        results.push({ prompt: promptText.slice(0, 60), status: 'error', error: msg, deviceType, attempt: 1 });
        recordMetric({ ventureId, screenName, deviceType, promptText, status: 'error', attemptCount: 1, durationMs: Date.now() - fireStart, errorCategory: 'sdk_error', errorMessage: msg.slice(0, 500) });
        consecutiveQuotaErrors = 0;
        firedCount++;
      }
    } finally {
      try { await toolClient.close(); } catch { /* ignore */ }
    }

    // Fail-fast: abort remaining after 2 consecutive quota errors
    if (consecutiveQuotaErrors >= 2) {
      console.error(`[stitch-client] Aborting: ${consecutiveQuotaErrors} consecutive quota errors`);
      for (let j = i + 1; j < prompts.length; j++) {
        const sp = prompts[j];
        const st = typeof sp === 'string' ? sp : sp.text;
        results.push({ prompt: (st || '').slice(0, 60), status: 'skipped_quota', error: 'Daily credits exhausted', deviceType: typeof sp === 'object' ? sp.deviceType : undefined });
      }
      quotaAborted = true;
      break;
    }

    // Brief delay between fires to avoid hammering the API
    if (i < prompts.length - 1) {
      await new Promise(r => setTimeout(r, FIRE_DELAY_MS));
    }
  }

  // Phase 2: POLL — use get_project to discover screen IDs for fired screens.
  // Skip polling if all screens were returned directly or quota-aborted.
  const firedResults = results.filter(r => r.status === 'fired');
  if (firedResults.length > 0 && !quotaAborted) {
    console.info(`[stitch-client] Phase 2: polling get_project for ${firedResults.length} fired screen(s)...`);
    const expectedTotal = baselineScreenIds.size + firedCount;
    const pollStart = Date.now();
    let lastKnownCount = baselineScreenIds.size;

    while (Date.now() - pollStart < POLL_MAX_WAIT_MS) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

      const currentScreenIds = await _getProjectScreenIds(sdk, apiKey, projectId);
      const newScreenIds = [...currentScreenIds].filter(id => !baselineScreenIds.has(id));

      if (newScreenIds.length > lastKnownCount - baselineScreenIds.size) {
        console.info(`[stitch-client] Poll: ${newScreenIds.length}/${firedCount} new screen(s) detected`);
        lastKnownCount = baselineScreenIds.size + newScreenIds.length;
      }

      if (newScreenIds.length >= firedCount) {
        // All screens accounted for — assign IDs to fired results
        console.info(`[stitch-client] All ${firedCount} screen(s) confirmed via get_project`);
        _assignScreenIdsToFiredResults(results, newScreenIds, ventureId);
        break;
      }

      const elapsed = Math.round((Date.now() - pollStart) / 1000);
      console.info(`[stitch-client] Poll: ${newScreenIds.length}/${firedCount} screens after ${elapsed}s, waiting...`);
    }

    // Final check if poll timed out
    const stillFired = results.filter(r => r.status === 'fired');
    if (stillFired.length > 0) {
      // Do one last poll attempt
      const finalScreenIds = await _getProjectScreenIds(sdk, apiKey, projectId);
      const finalNew = [...finalScreenIds].filter(id => !baselineScreenIds.has(id));
      if (finalNew.length > 0) {
        console.info(`[stitch-client] Final poll: ${finalNew.length} new screen(s) — assigning to remaining fired results`);
        _assignScreenIdsToFiredResults(results, finalNew, ventureId);
      }

      const remaining = results.filter(r => r.status === 'fired');
      if (remaining.length > 0) {
        console.warn(`[stitch-client] ${remaining.length} screen(s) still unconfirmed after ${POLL_MAX_WAIT_MS / 1000}s — screens may still be generating in Stitch`);
      }
    }
  }

  const confirmed = results.filter(r => r.status === 'confirmed' || r.status === 'returned').length;
  const fired = results.filter(r => r.status === 'fired').length;
  const errors = results.filter(r => r.status === 'error').length;
  console.info(`[stitch-client] Generation complete: ${confirmed} confirmed, ${fired} unconfirmed, ${errors} errors`);

  return results;
}

/**
 * Get screen IDs from a Stitch project via get_project.
 * Returns only real screen IDs (filters out DESIGN_SYSTEM_INSTANCE entries).
 * @private
 */
async function _getProjectScreenIds(sdk, apiKey, projectId) {
  const toolClient = new sdk.StitchToolClient({ apiKey, timeout: 30_000 });
  try {
    const result = await toolClient.callTool('get_project', {
      name: `projects/${projectId}`
    });
    const instances = result?.screenInstances || [];
    // Filter to real screens (have sourceScreen), exclude design system instances
    const screenIds = new Set(
      instances
        .filter(s => s.sourceScreen && s.type !== 'DESIGN_SYSTEM_INSTANCE')
        .map(s => s.id)
        .filter(Boolean)
    );
    return screenIds;
  } catch (err) {
    console.warn(`[stitch-client] get_project failed: ${err.message}`);
    return new Set();
  } finally {
    try { await toolClient.close(); } catch { /* ignore */ }
  }
}

/**
 * Assign discovered screen IDs to fired results that don't yet have an ID.
 * Updates results in-place: status 'fired' → 'confirmed', adds screen_id.
 * Records success metrics for each confirmed screen.
 * @private
 */
function _assignScreenIdsToFiredResults(results, newScreenIds, ventureId) {
  // Already-assigned IDs (from direct returns or prior poll rounds)
  const assignedIds = new Set(results.filter(r => r.screen_id).map(r => r.screen_id));
  const availableIds = newScreenIds.filter(id => !assignedIds.has(id));

  let idIdx = 0;
  for (const result of results) {
    if (result.status === 'fired' && idIdx < availableIds.length) {
      result.screen_id = availableIds[idIdx++];
      result.status = 'confirmed';
      console.info(`[stitch-client] Confirmed: ${result.prompt?.slice(0, 40)} → ${result.screen_id}`);
      recordMetric({
        ventureId,
        screenName: result.prompt || 'unknown',
        deviceType: result.deviceType,
        promptText: result.prompt,
        status: 'confirmed',
        attemptCount: 1,
        durationMs: 0, // not meaningful for poll-confirmed screens
      });
    }
  }
}

/**
 * Build site structure from a Stitch project.
 * Maps screens to routes and returns design HTML for each page.
 * SD: SD-WIREFRAME-FIDELITY-QA-WITH-ORCH-001-G
 *
 * @param {string} projectId - Stitch project ID
 * @returns {Promise<Array<{route: string, screenId: string, html: string, title: string}>|null>}
 */
export async function buildSite(projectId) {
  try {
    const apiKey = getApiKey();
    const sdk = await getSDK();
    const client = new sdk.Stitch(new sdk.StitchToolClient({ apiKey, timeout: 60_000 }));
    const project = client.project(projectId);
    const result = await project.buildSite();
    try { await client.close(); } catch { /* ignore */ }

    if (!result || !Array.isArray(result.pages)) {
      console.warn('[stitch-client] buildSite returned no pages');
      return null;
    }

    console.info(`[stitch-client] buildSite: ${result.pages.length} page(s) mapped`);
    return result.pages.map(p => ({
      route: p.route || p.path || '/',
      screenId: p.screenId || p.screen_id || p.id,
      html: p.html || p.content || '',
      title: p.title || p.name || p.route || 'Untitled',
    }));
  } catch (err) {
    const msg = err.message || '';
    const isTransport = /fetch failed|socket|ECONNRESET|other side closed/i.test(msg);
    if (isTransport) {
      console.info('[stitch-client] buildSite fired (socket dropped)');
    } else {
      console.warn(`[stitch-client] buildSite failed (non-fatal): ${msg}`);
    }
    return null;
  }
}

/**
 * Export a screen as self-contained HTML (returns download URL).
 * @param {string} screenId - Screen ID to export
 * @param {string} projectId - Project ID
 * @returns {Promise<string>} HTML download URL
 */
export async function exportScreenHtml(screenId, projectId) {
  // Use fresh client — shared getClient() may have broken transport from prior socket drops
  const apiKey = getApiKey();
  const sdk = await getSDK();
  const client = new sdk.Stitch(new sdk.StitchToolClient({ apiKey }));
  try {
    const project = client.project(projectId);
    const screen = await project.getScreen(screenId);
    const result = await screen.getHtml();
    if (typeof result !== 'string') {
      throw new StitchValidationError('exportScreenHtml: expected URL string');
    }
    return result;
  } finally {
    try { await client.close(); } catch { /* ignore */ }
  }
}

/**
 * Export a screen as PNG image (returns Buffer of PNG data).
 * The SDK returns a download URL; this function fetches the binary.
 * @param {string} screenId - Screen ID to export
 * @param {Object} [options] - Export options
 * @param {string} options.projectId - Project ID (required)
 * @returns {Promise<Buffer>} PNG image binary data
 */
export async function exportScreenImage(screenId, options = {}) {
  const apiKey = getApiKey();
  const sdk = await getSDK();
  const client = new sdk.Stitch(new sdk.StitchToolClient({ apiKey }));
  try {
    const project = client.project(options.projectId);
    const screen = await project.getScreen(screenId);
    const url = await screen.getImage();
    if (typeof url !== 'string') {
      throw new StitchValidationError('exportScreenImage: expected URL string from SDK');
    }
    // SDK returns a download URL — fetch the actual binary
    const response = await fetch(url);
    if (!response.ok) {
      throw new StitchValidationError(`exportScreenImage: fetch failed (${response.status})`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } finally {
    try { await client.close(); } catch { /* ignore */ }
  }
}

/**
 * Edit an existing screen with a targeted prompt.
 * Uses fire-and-assume-success pattern (same as generate).
 * SD: SD-WIREFRAME-FIDELITY-QA-WITH-ORCH-001-F
 *
 * @param {string} screenId - Screen ID to edit
 * @param {string} editPrompt - Targeted edit instruction
 * @param {string} projectId - Project ID
 * @returns {Promise<{status: string, screen_id?: string, error?: string}>}
 */
export async function editScreen(screenId, editPrompt, projectId) {
  try {
    const apiKey = getApiKey();
    const sdk = await getSDK();
    const client = new sdk.Stitch(new sdk.StitchToolClient({ apiKey, timeout: 120_000 }));
    const project = client.project(projectId);
    try {
      const screen = await project.getScreen(screenId);
      const edited = await screen.edit(editPrompt);
      const editedId = edited?.id || edited?.screen_id || screenId;
      console.info(`[stitch-client] editScreen: ${editedId} edited successfully`);
      try { await client.close(); } catch { /* ignore */ }
      return { status: 'edited', screen_id: editedId };
    } catch (err) {
      const msg = err.message || '';
      const isTransport = /fetch failed|socket|ECONNRESET|other side closed|Already connected/i.test(msg);
      if (isTransport) {
        console.info('[stitch-client] editScreen: fired (socket dropped — server processing)');
        try { await client.close(); } catch { /* ignore */ }
        return { status: 'fired', screen_id: screenId };
      }
      console.warn(`[stitch-client] editScreen error: ${msg.slice(0, 120)}`);
      try { await client.close(); } catch { /* ignore */ }
      return { status: 'error', screen_id: screenId, error: msg };
    }
  } catch (outerErr) {
    console.warn(`[stitch-client] editScreen unexpected: ${outerErr.message}`);
    return { status: 'error', screen_id: screenId, error: outerErr.message };
  }
}

/**
 * List all screens in a project.
 * Uses get_project (returns screenInstances[]) instead of list_screens which is
 * permanently broken (Stitch server-side bug — returns {} regardless).
 * @param {string} projectId - Stitch project ID
 * @returns {Promise<Array<{screen_id: string, name: string}>>}
 */
export async function listScreens(projectId) {
  return instrumentedCall('listScreens', async () => {
    const apiKey = getApiKey();
    const sdk = await getSDK();
    const screenIds = await _getProjectScreenIds(sdk, apiKey, projectId);
    // Return in the same shape callers expect
    return [...screenIds].map(id => ({
      screen_id: id,
      name: `projects/${projectId}/screens/${id}`,
      title: null,
      device_type: null,
      dimensions: null,
      created_at: null,
    }));
  });
}

/**
 * Get generation budget for a venture.
 * @param {string} ventureId - Venture ID
 * @returns {Promise<{used: number, limit: number, remaining: number}>}
 */
export async function getGenerationBudget(ventureId) {
  const budget = await loadBudget(ventureId);
  return {
    used: budget.used,
    limit: BUDGET_PER_VENTURE,
    remaining: BUDGET_PER_VENTURE - budget.used,
  };
}

// ---------------------------------------------------------------------------
// Testing & Diagnostics Exports
// ---------------------------------------------------------------------------

export function getMetrics() {
  return metrics.getSummary();
}

export function getCircuitBreakerState() {
  return circuitBreaker.getState();
}

export function resetCircuitBreaker() {
  circuitBreaker.reset();
}

export function resetMetrics() {
  metrics.reset();
}

export { BUDGET_PER_VENTURE, CIRCUIT_BREAKER_THRESHOLD, CIRCUIT_BREAKER_COOLDOWN_MS };
