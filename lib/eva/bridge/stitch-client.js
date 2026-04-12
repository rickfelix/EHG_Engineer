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
// SDK Loader (lazy, abstraction seam for swapping tools)
// ---------------------------------------------------------------------------

let _sdk = null;
let _sdkLoader = null;

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
export async function generateScreens(projectId, prompts, ventureId) {
  if (ventureId) {
    await consumeBudget(ventureId, prompts.length);
  }

  // Deep research (2026-04-12): Google's Stitch MCP generation takes 45-90s server-side.
  // The GFE drops TCP after ~30-60s, but the server ALWAYS completes the generation.
  // listScreens() returns empty until the project is opened in a browser (confirmed bug).
  //
  // Pattern: Fire → Close → Assume Success
  //   1. Fire generate() with a fresh client — expect socket drop as normal
  //   2. Close the client immediately (transport is tainted after any error)
  //   3. Mark as "fired" — the server completes generation regardless
  //   4. No polling (listScreens is broken until browser activation)
  //   5. 3s delay between screens to avoid Google throttling (~3 req/min)
  const INTER_SCREEN_DELAY_MS = 3_000;

  const results = [];
  const apiKey = getApiKey();
  const sdk = await getSDK();

  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i];
    const label = `[${i + 1}/${prompts.length}]`;

    try {
      const client = new sdk.Stitch(new sdk.StitchToolClient({ apiKey, timeout: 120_000 }));
      const project = client.project(projectId);
      try {
        const screen = await project.generate(prompt);
        const screenId = screen?.id || screen?.screen_id;
        console.info(`[stitch-client] ${label} returned directly: ${screenId}`);
        results.push({ prompt: prompt.slice(0, 60), status: 'returned', screen_id: screenId, name: screen?.name || prompt.substring(0, 30) });
      } catch (err) {
        const msg = err.message || '';
        const isTransport = /fetch failed|socket|ECONNRESET|other side closed|Already connected/i.test(msg);
        if (isTransport) {
          // Socket drop = normal. Server completes generation regardless.
          console.info(`[stitch-client] ${label} fired (socket dropped — server processing)`);
          results.push({ prompt: prompt.slice(0, 60), status: 'fired' });
        } else {
          console.error(`[stitch-client] ${label} error: ${msg.slice(0, 120)}`);
          results.push({ prompt: prompt.slice(0, 60), status: 'fired', error: msg });
        }
      }
      try { await client.close(); } catch { /* ignore */ }
    } catch (outerErr) {
      console.error(`[stitch-client] ${label} unexpected: ${outerErr.message}`);
      results.push({ prompt: prompt.slice(0, 60), status: 'fired', error: outerErr.message });
    }

    // Delay between screens to avoid Google throttling
    if (i < prompts.length - 1) {
      await new Promise(r => setTimeout(r, INTER_SCREEN_DELAY_MS));
    }
  }

  return results;
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
 * Export a screen as PNG image (returns download URL).
 * @param {string} screenId - Screen ID to export
 * @param {Object} [options] - Export options
 * @param {string} options.projectId - Project ID (required)
 * @returns {Promise<string>} Image download URL
 */
export async function exportScreenImage(screenId, options = {}) {
  const apiKey = getApiKey();
  const sdk = await getSDK();
  const client = new sdk.Stitch(new sdk.StitchToolClient({ apiKey }));
  try {
    const project = client.project(options.projectId);
    const screen = await project.getScreen(screenId);
    const result = await screen.getImage();
    if (typeof result !== 'string') {
      throw new StitchValidationError('exportScreenImage: expected URL string');
    }
    return result;
  } finally {
    try { await client.close(); } catch { /* ignore */ }
  }
}

/**
 * List all screens in a project.
 * @param {string} projectId - Stitch project ID
 * @returns {Promise<Array<{screen_id: string, name: string}>>}
 */
export async function listScreens(projectId) {
  return instrumentedCall('listScreens', async () => {
    const client = await getClient();
    const project = client.project(projectId);
    const screens = await project.screens();
    if (!Array.isArray(screens)) {
      throw new StitchValidationError('listScreens: expected array of screens');
    }
    return screens.map(s => ({
      screen_id: s.id || s.screen_id,
      name: s.name,
      dimensions: s.dimensions || null,
      created_at: s.created_at || null,
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
