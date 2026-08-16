/**
 * lib/agent-readiness/audit-runner.js
 * SD-LEO-FEAT-AGENT-READINESS-SERVICE-001 FR-1 / US-002.
 *
 * Copies the parallel fan-out PATTERN from lib/research/research-engine.js (getAllAdapters() +
 * Promise.allSettled) but does NOT call runResearch() — it hardcodes RESEARCH_SYSTEM_PROMPT
 * (research-engine.js:79), has no systemPrompt param (research-engine.js:55), and returns a
 * synthesized consensus instead of raw per-model answers.
 *
 * TWO FIRSTHAND CORRECTIONS to the PRD/prior sub-agent citations, verified by reading this file
 * directly rather than trusting a secondhand summary:
 *
 * 1. getAllAdapters(options) (provider-adapters.js:952) does NOT forward `options` to the adapter
 *    constructors — anthropic/openai/google are constructed with NO arguments, so
 *    getAllAdapters({fallbackEnabled:false}) would silently do nothing. This runner uses
 *    getProviderAdapter(family, {fallbackEnabled:false}) per family instead, which DOES forward
 *    options (provider-adapters.js:927-943).
 *
 * 2. provider-adapters.js has NO caching of any kind (grepped: zero "cache" occurrences). The 30-min
 *    response cache that TR-2/the migration comments cite lives in lib/llm/client-factory.js, which
 *    is a SEPARATE calling path that research-engine.js/provider-adapters.js never uses (verified:
 *    research-engine.js imports getAllAdapters from provider-adapters.js only, not client-factory.js).
 *    There is no cacheTTLMs option to pass here because there is nothing to disable — cache_hit is
 *    always written as `false`, truthfully, not because a flag was set. The DB CHECK
 *    (agent_readiness_audit_sample_no_cache) remains correct defense-in-depth for if a future
 *    implementation routes through a caching client; it is not currently a live failure mode via
 *    this call path.
 *
 * fallbackEnabled:false is real and DOES matter here: GoogleAdapter (provider-adapters.js:579,:749)
 * and OllamaAdapter (:794,:886) fall back to a DIFFERENT model on retryable errors when enabled
 * (default true). AnthropicAdapter/OpenAIAdapter retry the SAME model on error (no cross-model
 * substitution either way) — fallbackEnabled:false is passed to all four uniformly for defense in
 * depth and because it is a documented, forwarded option only on Google/Ollama.
 *
 * Model set entries MUST be in "family:model" form (e.g. "anthropic:claude-opus-5") — explicit
 * rather than guessed from a bare model string, which would require a brittle name-sniffing heuristic.
 */

import { getProviderAdapter } from '../sub-agents/vetting/provider-adapters.js';
import { runBounded } from './concurrency-limiter.js';
import { writeSample } from './sample-writer.js';
import { registerAuditRun } from './run-registry.js';
import { preflightBudgetCheck, recordActualCost } from './budget-guard.js';
import { estimateCost } from '../research/deep-research-budget.js';
import { resolvePromptSet, promptCountFor } from './prompt-sets.js';

const AUDIT_SYSTEM_PROMPT =
  'You are answering as a knowledgeable assistant helping someone evaluate a business or vendor. ' +
  'Answer directly and honestly based on what you know. If you are not confident the business ' +
  'exists or you have no information about it, say so plainly rather than guessing.';

const adapterCache = new Map();

function familyModel(entry) {
  const idx = entry.indexOf(':');
  if (idx < 0) throw new Error(`Model set entry must be "family:model" form, got: ${entry}`);
  return { family: entry.slice(0, idx), model: entry.slice(idx + 1) };
}

function getAuditAdapter(family) {
  if (!adapterCache.has(family)) {
    adapterCache.set(family, getProviderAdapter(family, { fallbackEnabled: false }));
  }
  return adapterCache.get(family);
}

/**
 * Extract a coarse found/recommended signal from a raw model response. Deliberately simple and
 * auditable rather than a second LLM call judging the first — a judge call would itself need the
 * same no-fallback/no-cache discipline and would double the cost/risk surface for a binary signal.
 */
function classifyResponse(text) {
  const lower = String(text || '').toLowerCase();
  const found = !/\b(don'?t have (any )?information|not familiar|no information|cannot find|couldn'?t find|not aware of)\b/.test(lower);
  const recommended = found && /\b(recommend|trustworthy|credible|reputable|good (option|choice|fit)|worth (considering|trying))\b/.test(lower);
  return { found, recommended };
}

/**
 * Run one full audit (before or after llm.txt) and persist it.
 * @param {object} params
 * @param {string} params.ventureUrl
 * @param {string} params.ventureLabel - human-readable name interpolated into prompts
 * @param {'before'|'after'} params.runType
 * @param {string} params.stageTag - REQUIRED, see run-registry.js STAGE_TAGS
 * @param {string} [params.promptSetId]
 * @param {string[]} params.modelSet - "family:model" entries, e.g. ["anthropic:claude-opus-5"]
 * @param {number} [params.samplesPerCell]
 * @param {number} [params.pinnedTemperature]
 * @param {number} [params.concurrency]
 * @returns {Promise<{auditRunId:string, expectedSampleCount:number, written:number, refused:number}>}
 */
export async function runAudit({
  ventureUrl,
  ventureLabel,
  runType,
  stageTag,
  promptSetId = 'buyer-intent-generic-v1',
  modelSet,
  samplesPerCell = 5,
  pinnedTemperature = 0.7,
  concurrency = Number(process.env.AUDIT_CONCURRENCY) || 3
}) {
  const prompts = resolvePromptSet(promptSetId, ventureLabel);
  const promptCount = promptCountFor(promptSetId);

  const budget = await preflightBudgetCheck({
    promptCount,
    modelSet,
    samplesPerCell
  });
  if (!budget.allowed) {
    throw new Error(`Audit run refused by budget guard: ${budget.reason} (estimated $${budget.estimatedCostUsd.toFixed(4)} vs cap $${budget.capUsd})`);
  }

  const { id: auditRunId, expected_sample_count: expectedSampleCount } = await registerAuditRun({
    ventureUrl,
    runType,
    promptSetId,
    promptCount,
    modelSet,
    samplesPerCell,
    pinnedTemperature,
    stageTag
  });

  const cells = [];
  for (const entry of modelSet) {
    const { family, model } = familyModel(entry);
    for (let p = 0; p < prompts.length; p++) {
      for (let s = 1; s <= samplesPerCell; s++) {
        cells.push({ family, model, prompt: prompts[p], sampleIndex: s });
      }
    }
  }

  let actualCostUsd = 0;
  const tasks = cells.map((cell) => async () => {
    const adapter = getAuditAdapter(cell.family);
    let result;
    try {
      result = await adapter.complete(AUDIT_SYSTEM_PROMPT, cell.prompt, {
        model: cell.model,
        temperature: pinnedTemperature,
        maxTokens: 400
      });
    } catch (err) {
      // AC-002-4 / AC-003-3: a persistently-failing sample writes NOTHING — it is a gap, not a
      // fabricated row. Never substitute a different model's answer here.
      return { skipped: true, reason: err.message, cell };
    }

    // result.model on these adapters is the model actually used for the call — since
    // fallbackEnabled:false is set, this must equal cell.model by construction; recorded from the
    // real result rather than assumed, per US-003 AC-003-2.
    const actualModel = result.model || cell.model;
    const { found, recommended } = classifyResponse(result.content);
    // Family-aware, not a hardcoded rate: caught by adversarial review on PR #7113 — the prior
    // version hardcoded a fixed 0.01/0.03-per-1K rate (matching only the openai COST_ESTIMATES
    // entry) regardless of which family actually served the call.
    const approxCostUsd = estimateCost(cell.family, result.usage?.inputTokens || 0, result.usage?.outputTokens || 0);
    actualCostUsd += approxCostUsd;

    const write = await writeSample({
      auditRunId,
      prompt: cell.prompt,
      requestedModel: cell.model,
      actualResponderModel: actualModel,
      cacheHit: false, // truthful: this call path (provider-adapters.js) has no caching at all
      sampleIndex: cell.sampleIndex,
      found,
      recommended,
      rawResponse: result.content
    });
    return write.written ? { skipped: false } : { skipped: true, reason: write.reason, cell };
  });

  const results = await runBounded(tasks, concurrency);
  await recordActualCost(actualCostUsd);

  const written = results.filter((r) => r.status === 'fulfilled' && r.value.skipped === false).length;
  const refused = results.length - written;

  return { auditRunId, expectedSampleCount, written, refused };
}

export const _internal = { familyModel, classifyResponse, AUDIT_SYSTEM_PROMPT };
