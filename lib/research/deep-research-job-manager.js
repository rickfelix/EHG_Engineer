/**
 * Deep Research Async Job Manager
 * SD-LEO-FEAT-DEEP-RESEARCH-API-001 (FR-002)
 *
 * Manages long-running deep research calls (30s-5min) with:
 * - Parallel provider execution
 * - Per-provider timeout with graceful cancellation
 * - Status tracking via deep_research_results table
 * - Budget pre-check before submission
 */

import { v4 as uuidv4 } from 'uuid';
import { checkBudget, estimateCost, recordCost } from './deep-research-budget.js';
import { createPendingRecord, saveResult, writeSynthesisFile } from './deep-research-storage.js';

const DEFAULT_TIMEOUT_MS = 300000; // 5 minutes
const POLL_INTERVAL_MS = 5000;

/**
 * @typedef {Object} DeepResearchJob
 * @property {string} sessionId - Unique session ID grouping all provider calls
 * @property {string} query - The research question
 * @property {Object} options - Research options
 */

/**
 * Execute a deep research job across all providers.
 *
 * @param {Object} params
 * @param {string} params.query - Research question
 * @param {Object} params.adapters - Provider adapter instances { anthropic, openai, google }
 * @param {string} params.systemPrompt - System prompt for research
 * @param {string} params.userPrompt - User prompt with question + context
 * @param {Object} [params.deepOptions] - Per-provider deep mode options
 * @param {string} [params.triggerSource='manual'] - What triggered this research
 * @param {string} [params.sdKey] - SD key for linkage
 * @param {string} [params.ventureId] - Venture ID for linkage
 * @param {number} [params.timeoutMs] - Timeout per provider
 * @returns {Promise<Object>} Research results with per-provider data
 */
export async function executeDeepResearch({
  query,
  adapters,
  systemPrompt,
  userPrompt,
  deepOptions = {},
  triggerSource = 'manual',
  sdKey,
  ventureId,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const sessionId = uuidv4();
  const providerNames = Object.keys(adapters);
  const startTime = Date.now();

  console.log(`\n🔬 Deep Research Session: ${sessionId}`);
  console.log(`   Query: ${query.slice(0, 80)}...`);
  console.log(`   Providers: ${providerNames.join(', ')}`);

  // Pre-submission budget check for each provider
  const budgetResults = {};
  for (const name of providerNames) {
    const estimated = estimateCost(name);
    const check = await checkBudget(name, estimated);
    budgetResults[name] = check;
    if (!check.allowed) {
      console.log(`   ⚠️  ${name}: Budget blocked — ${check.reason}`);
    }
  }

  const allowedProviders = providerNames.filter(n => budgetResults[n].allowed);
  if (allowedProviders.length === 0) {
    return {
      success: false,
      sessionId,
      error: 'All providers blocked by budget controls',
      budgetResults,
      durationMs: Date.now() - startTime,
    };
  }

  // Execute research calls in parallel with timeout
  const results = await Promise.allSettled(
    allowedProviders.map(name => executeProviderCall({
      name,
      adapter: adapters[name],
      systemPrompt,
      userPrompt,
      options: deepOptions[name] || {},
      timeoutMs,
      sessionId,
      query,
      triggerSource,
      sdKey,
      ventureId,
    }))
  );

  // Collect results
  const successes = [];
  const failures = [];
  const providersStatus = {};

  results.forEach((result, i) => {
    const name = allowedProviders[i];
    if (result.status === 'fulfilled' && result.value.status === 'completed') {
      successes.push(result.value);
      providersStatus[name] = {
        status: 'OK',
        model: result.value.model,
        durationMs: result.value.durationMs,
        costUsd: result.value.costUsd,
      };
    } else {
      const error = result.status === 'rejected'
        ? result.reason?.message
        : result.value?.errorMessage || 'Unknown error';
      failures.push({ provider: name, error });
      providersStatus[name] = { status: 'FAILED', error };
    }
  });

  // Write synthesis file if we have results
  let synthesisPath = null;
  if (successes.length > 0) {
    synthesisPath = writeSynthesisFile(query, {}, successes);
  }

  console.log(`   ✅ ${successes.length} succeeded, ${failures.length} failed (${Date.now() - startTime}ms)`);

  return {
    success: successes.length > 0,
    sessionId,
    query,
    successes,
    failures,
    providersStatus,
    budgetResults,
    synthesisPath,
    providersUsed: successes.length,
    providersFailed: failures.length,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Execute a single provider's deep research call with timeout and storage.
 * @private
 */
async function executeProviderCall({
  name,
  adapter,
  systemPrompt,
  userPrompt,
  options,
  timeoutMs,
  sessionId,
  query,
  triggerSource,
  sdKey,
  ventureId,
}) {
  const model = options.model || adapter.model || name;
  const callStart = Date.now();

  // Create pending DB record
  const recordId = await createPendingRecord({
    query,
    provider: name,
    model,
    triggerSource,
    sdKey,
    ventureId,
    researchSessionId: sessionId,
  });

  try {
    // Execute with timeout
    const callPromise = adapter.complete(systemPrompt, userPrompt, {
      maxTokens: 3000,
      ...options,
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
    );

    const response = await Promise.race([callPromise, timeoutPromise]);

    const durationMs = Date.now() - callStart;
    const costUsd = estimateCost(name, response.usage?.input_tokens, response.usage?.output_tokens);

    // Record cost
    await recordCost(name, costUsd);

    // Save completed result
    await saveResult({
      recordId,
      query,
      provider: name,
      model: response.model || model,
      response: response.content,
      thinking: response.thinking || null,
      costUsd,
      durationMs,
      tokensUsed: response.usage || {},
      status: 'completed',
      triggerSource,
      sdKey,
      ventureId,
      researchSessionId: sessionId,
    });

    return {
      provider: name,
      model: response.model || model,
      content: response.content,
      thinking: response.thinking || null,
      response: response.content,
      data: tryParseJSON(response.content),
      durationMs,
      costUsd,
      usage: response.usage,
      status: 'completed',
    };
  } catch (error) {
    const durationMs = Date.now() - callStart;
    const status = error.message?.includes('Timeout') ? 'timeout' : 'failed';

    // Save failed result
    await saveResult({
      recordId,
      query,
      provider: name,
      model,
      response: '',
      costUsd: 0,
      durationMs,
      status,
      errorMessage: error.message,
      triggerSource,
      sdKey,
      ventureId,
      researchSessionId: sessionId,
    });

    return { provider: name, model, status, errorMessage: error.message, durationMs };
  }
}

/**
 * Try to parse JSON from a response string.
 * @private
 */
function tryParseJSON(content) {
  try {
    const match = content?.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch { /* ignore */ }
  return { raw_response: content };
}
