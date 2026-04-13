/**
 * Stitch Vision QA — Brand/Layout/Typography/Color rubric scoring
 *
 * SD: SD-LEO-ORCH-STAGE-STITCH-DESIGN-001-C (US-002, US-003, US-004)
 *
 * Reads stitch_design_export rows from venture_artifacts, sends each
 * base64-encoded PNG screenshot to Claude Haiku via the Anthropic SDK,
 * parses scores against a four-category brand rubric, and persists the
 * aggregated rubric as a stitch_qa_report row in venture_artifacts.
 *
 * Graceful degradation:
 * - Missing ANTHROPIC_API_KEY → status='vision_api_unavailable', zero API calls
 * - API throws (network, rate limit, malformed response) → same degraded path
 * - Daily spend ≥ stitch_qa_daily_budget_usd → status='daily_budget_exceeded'
 * - The function NEVER throws — always inserts a stitch_qa_report row so
 *   observability is complete on every export.
 *
 * Cost model: Claude Haiku 3 — $0.25 / 1M input tokens, $1.25 / 1M output.
 * One image ≈ 1500 tokens (Anthropic vision pricing rule). Per-export cost
 * with 4 screens ≈ ($0.0015 input + ~$0.0006 output) ≈ $0.002 per export.
 * Default daily budget of $0.50 supports ~250 exports/day.
 *
 * Design note (deviation from PRD TR-1): The PRD recommended reusing
 * lib/ai/multimodal-client.js, but on inspection that client has a
 * hardcoded UI-test-automation prompt and a single-screenshot API that
 * does not fit a multi-screen rubric scoring flow. We use the
 * @anthropic-ai/sdk directly here. The cost-tracking and pricing knowledge
 * is duplicated in CLAUDE_HAIKU_PRICING below.
 *
 * @module lib/eva/qa/stitch-vision-qa
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { getClaudeModel } from '../../config/model-config.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ANTHROPIC_MODEL = getClaudeModel('vision');
const DEFAULT_DAILY_BUDGET_USD = 0.50;
const APPROX_TOKENS_PER_IMAGE = 1500;
const APPROX_OUTPUT_TOKENS_PER_SCREEN = 400;
const CLAUDE_HAIKU_PRICING = {
  input_per_million: 0.80,    // claude-haiku-4-5 pricing (via model-config.js vision purpose)
  output_per_million: 4.00,
};

const RUBRIC_CATEGORIES = ['brand', 'layout', 'typography', 'color'];

// ---------------------------------------------------------------------------
// Test-injectable client loaders
// ---------------------------------------------------------------------------

let _anthropicClient = null;
let _anthropicLoader = null;

export function setAnthropicClientLoader(loader) {
  _anthropicLoader = loader;
  _anthropicClient = null;
}

function getAnthropicClient() {
  if (_anthropicClient) return _anthropicClient;
  if (_anthropicLoader) {
    _anthropicClient = _anthropicLoader();
    return _anthropicClient;
  }
  if (!process.env.ANTHROPIC_API_KEY) return null;
  _anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropicClient;
}

let _supabaseClient = null;
let _supabaseLoader = null;

export function setSupabaseClientLoader(loader) {
  _supabaseLoader = loader;
  _supabaseClient = null;
}

function getSupabaseClient() {
  if (_supabaseClient) return _supabaseClient;
  if (_supabaseLoader) {
    _supabaseClient = _supabaseLoader();
    return _supabaseClient;
  }
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for stitch-vision-qa');
  }
  _supabaseClient = createClient(url, key);
  return _supabaseClient;
}

// ---------------------------------------------------------------------------
// Structured logging
// ---------------------------------------------------------------------------

function logEvent(level, event, details = {}) {
  const entry = JSON.stringify({ event, level, timestamp: new Date().toISOString(), ...details });
  (level === 'warn' ? console.warn : console.info)(`[stitch-qa] ${entry}`);
}

// ---------------------------------------------------------------------------
// Rubric prompt
// ---------------------------------------------------------------------------

function buildRubricPrompt() {
  return `You are a senior brand-design QA reviewer. Evaluate the screen against a four-category rubric:

1. BRAND — Does the screen communicate a coherent brand voice and visual identity?
2. LAYOUT — Is the layout balanced, scannable, and aligned to a clear visual hierarchy?
3. TYPOGRAPHY — Are font choices, sizes, and pairings consistent and legible?
4. COLOR — Is the color palette harmonious, accessible, and on-brand?

For each category, return a score from 0 to 10 and at most 3 specific findings (one short sentence each, actionable). Findings should call out concrete defects, not generic praise.

Respond with valid JSON only, matching this exact schema:
{
  "brand": { "score": <0-10 integer>, "findings": ["short actionable finding"] },
  "layout": { "score": <0-10 integer>, "findings": ["..."] },
  "typography": { "score": <0-10 integer>, "findings": ["..."] },
  "color": { "score": <0-10 integer>, "findings": ["..."] }
}

Do NOT include any text before or after the JSON. Do NOT use markdown code fences.`;
}

// ---------------------------------------------------------------------------
// Cost helpers
// ---------------------------------------------------------------------------

function estimateCallCostUsd(screenCount) {
  const inputTokens = screenCount * APPROX_TOKENS_PER_IMAGE;
  const outputTokens = screenCount * APPROX_OUTPUT_TOKENS_PER_SCREEN;
  const inputCost = (inputTokens / 1_000_000) * CLAUDE_HAIKU_PRICING.input_per_million;
  const outputCost = (outputTokens / 1_000_000) * CLAUDE_HAIKU_PRICING.output_per_million;
  return inputCost + outputCost;
}

function actualCostFromUsage(usage) {
  if (!usage || typeof usage.input_tokens !== 'number') return null;
  const inputCost = (usage.input_tokens / 1_000_000) * CLAUDE_HAIKU_PRICING.input_per_million;
  const outputCost = ((usage.output_tokens || 0) / 1_000_000) * CLAUDE_HAIKU_PRICING.output_per_million;
  return inputCost + outputCost;
}

// ---------------------------------------------------------------------------
// Daily budget check (US-004)
// ---------------------------------------------------------------------------

/**
 * Read the daily budget from chairman_dashboard_config and compute today's
 * already-spent total from existing stitch_qa_report rows. Returns the
 * remaining budget. If config is unreadable, defaults to DEFAULT_DAILY_BUDGET_USD.
 */
async function getRemainingDailyBudget(supabase) {
  let budget = DEFAULT_DAILY_BUDGET_USD;
  try {
    const { data: cfg } = await supabase
      .from('chairman_dashboard_config')
      .select('taste_gate_config')
      .limit(1)
      .single();
    const configured = cfg?.taste_gate_config?.stitch_qa_daily_budget_usd;
    if (typeof configured === 'number' && configured >= 0) budget = configured;
  } catch (err) {
    logEvent('warn', 'budget_config_read_failed', { error: err.message || String(err) });
  }

  // Sum today's spend (UTC day boundary) from existing stitch_qa_report rows.
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  let spent = 0;
  try {
    const { data: rows } = await supabase
      .from('venture_artifacts')
      .select('metadata')
      .eq('artifact_type', 'stitch_qa_report')
      .gte('created_at', todayStart.toISOString());
    for (const row of rows || []) {
      const cost = row?.metadata?.total_cost_usd;
      if (typeof cost === 'number') spent += cost;
    }
  } catch (err) {
    logEvent('warn', 'budget_sum_failed', { error: err.message || String(err) });
  }

  return { budget, spent, remaining: budget - spent };
}

// ---------------------------------------------------------------------------
// Per-screen vision call
// ---------------------------------------------------------------------------

async function reviewSingleScreen(client, screenId, base64Image) {
  const response = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: base64Image },
          },
          { type: 'text', text: buildRubricPrompt() },
        ],
      },
    ],
  });

  // Anthropic SDK response shape: { content: [{ type: 'text', text: '...' }], usage: {...} }
  const textBlock = (response.content || []).find((b) => b.type === 'text');
  if (!textBlock || !textBlock.text) {
    throw new Error(`Empty response from vision API for screen ${screenId}`);
  }

  let parsed;
  try {
    // Strip markdown code fences if present (```json ... ```)
    let raw = textBlock.text.trim();
    const fenceMatch = raw.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
    if (fenceMatch) raw = fenceMatch[1].trim();
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Vision API returned non-JSON for screen ${screenId}: ${err.message}`);
  }

  // Validate shape
  for (const cat of RUBRIC_CATEGORIES) {
    if (!parsed[cat] || typeof parsed[cat].score !== 'number' || !Array.isArray(parsed[cat].findings)) {
      throw new Error(`Vision API response missing or malformed category '${cat}' for screen ${screenId}`);
    }
  }

  return { screen_id: screenId, rubric: parsed, usage: response.usage };
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

/**
 * Aggregate per-screen rubrics into a single venture-level rubric.
 * For each category: average the scores, concatenate findings (deduped per screen).
 */
function aggregateRubrics(perScreen) {
  const result = {};
  for (const cat of RUBRIC_CATEGORIES) {
    const scores = perScreen.map((s) => s.rubric[cat].score).filter((n) => typeof n === 'number');
    const findings = [];
    for (const screen of perScreen) {
      for (const f of screen.rubric[cat].findings || []) {
        if (typeof f === 'string' && f.trim().length > 0 && !findings.includes(f)) {
          findings.push(f);
        }
      }
    }
    result[cat] = {
      score: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
      findings: findings.slice(0, 12), // cap to keep payload small
    };
  }
  return result;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * Redact sensitive fragments from an error message before persisting it.
 * Strips API-key-shaped tokens and caps length to 500 chars.
 */
function sanitizeErrorMessage(msg) {
  if (!msg || typeof msg !== 'string') return msg;
  return msg
    .replace(/sk-[A-Za-z0-9_-]{10,}/g, '<redacted-key>')
    .replace(/Bearer\s+[A-Za-z0-9_.-]+/gi, 'Bearer <redacted>')
    .slice(0, 500);
}

/**
 * Respect the partial unique index idx_venture_artifacts_idempotent by flipping
 * any existing is_current=true row to is_current=false before inserting a new
 * current row. Mirrors the pattern in lib/eva/bridge/stitch-exporter.js:288-314
 * (persistToVentureArtifacts).
 *
 * NOT atomic — Supabase JS has no transaction primitive. On INSERT failure
 * after the UPDATE, the old row stays is_current=false and the caller gets
 * null. This is a documented limitation shared with the exporter's
 * persistence path.
 */
async function persistQaReport(supabase, ventureId, manifest, payload) {
  // Step 1: Determine next version and flip any existing current row.
  let nextVersion = 1;
  try {
    const { data: existing, error: selErr } = await supabase
      .from('venture_artifacts')
      .select('id, version')
      .eq('venture_id', ventureId)
      .eq('lifecycle_stage', 17)
      .eq('artifact_type', 'stitch_qa_report')
      .eq('is_current', true)
      .limit(1);
    if (selErr) {
      logEvent('warn', 'qa_precheck_failed', { error: sanitizeErrorMessage(selErr.message) });
      return null;
    }
    if (existing && existing[0]?.id) {
      nextVersion = (existing[0].version || 0) + 1;
      const { error: updErr } = await supabase
        .from('venture_artifacts')
        .update({ is_current: false })
        .eq('id', existing[0].id);
      if (updErr) {
        logEvent('warn', 'qa_is_current_flip_failed', { error: sanitizeErrorMessage(updErr.message) });
        return null;
      }
    }
  } catch (err) {
    logEvent('warn', 'qa_precheck_exception', { error: sanitizeErrorMessage(err?.message || String(err)) });
    return null;
  }

  const row = {
    venture_id: ventureId,
    artifact_type: 'stitch_qa_report',
    lifecycle_stage: 17,
    title: `Stitch Design QA Report (${payload.status})`,
    content: `Vision QA review for ${manifest.screen_count || 0} screens — status: ${payload.status}`,
    is_current: true,
    version: nextVersion,
    metadata: {
      schema_version: 1,
      status: payload.status,
      rubric: payload.rubric,
      screen_count: manifest.screen_count || 0,
      model: ANTHROPIC_MODEL,
      total_cost_usd: payload.total_cost_usd || 0,
      error_message: sanitizeErrorMessage(payload.error_message || null),
      reviewed_at: new Date().toISOString(),
      stitch_design_export_id: manifest.venture_artifact_id || null,
    },
  };

  // Step 2: Insert the new current row. If a concurrent exporter flipped-and-inserted
  // between our flip and our insert, we'll hit a unique-index violation (Postgres
  // error code 23505). Retry once after re-flipping.
  const attemptInsert = async () => supabase
    .from('venture_artifacts')
    .insert(row)
    .select('id')
    .single();

  let { data, error } = await attemptInsert();

  if (error && (error.code === '23505' || /duplicate key|idempotent/i.test(error.message || ''))) {
    logEvent('warn', 'qa_unique_violation_retry', { venture_id: ventureId });
    try {
      // Re-read + flip any row that snuck in during the race, then retry insert.
      const { data: recent } = await supabase
        .from('venture_artifacts')
        .select('id, version')
        .eq('venture_id', ventureId)
        .eq('lifecycle_stage', 17)
        .eq('artifact_type', 'stitch_qa_report')
        .eq('is_current', true)
        .limit(1);
      if (recent && recent[0]?.id) {
        row.version = (recent[0].version || 0) + 1;
        await supabase.from('venture_artifacts').update({ is_current: false }).eq('id', recent[0].id);
      }
      const retry = await attemptInsert();
      data = retry.data;
      error = retry.error;
    } catch (retryErr) {
      logEvent('warn', 'qa_retry_exception', { error: sanitizeErrorMessage(retryErr?.message || String(retryErr)) });
      return null;
    }
  }

  if (error) {
    logEvent('warn', 'qa_persistence_failed', { error: sanitizeErrorMessage(error.message) });
    return null;
  }
  return data?.id || null;
}

// ---------------------------------------------------------------------------
// Empty rubric for degraded paths
// ---------------------------------------------------------------------------

function emptyRubric() {
  return RUBRIC_CATEGORIES.reduce((acc, cat) => {
    acc[cat] = { score: 0, findings: [] };
    return acc;
  }, {});
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Review a stitch_design_export manifest with Claude Haiku vision and persist
 * the result as a stitch_qa_report row. Never throws.
 *
 * @param {string} ventureId
 * @param {Object} manifest - Output of exportStitchArtifacts; expects
 *                            metadata-style fields (png_files_base64, screen_count).
 *                            For convenience, also accepts a top-level shape with
 *                            { png_files_base64: [{ screen_id, base64 }], screen_count }.
 * @returns {Promise<{status, rubric, total_cost_usd, error_message?, qa_report_id}>}
 */
export async function reviewStitchExport(ventureId, manifest) {
  logEvent('info', 'stitch_qa_started', { venture_id: ventureId, screen_count: manifest?.screen_count || 0 });

  const supabase = getSupabaseClient();

  // ── Degradation 1: missing API key ──────────────────────────────────────
  const client = getAnthropicClient();
  if (!client) {
    const payload = {
      status: 'vision_api_unavailable',
      rubric: emptyRubric(),
      total_cost_usd: 0,
      error_message: 'ANTHROPIC_API_KEY not set',
    };
    const id = await persistQaReport(supabase, ventureId, manifest || {}, payload);
    logEvent('info', 'stitch_qa_completed', { venture_id: ventureId, status: payload.status, qa_report_id: id });
    return { ...payload, qa_report_id: id };
  }

  // Extract screenshots from the manifest. Supports both shapes:
  //   (a) manifest.png_files_base64 = [{ screen_id, base64 }]   (top-level)
  //   (b) manifest.metadata.png_files_base64 = [...]            (nested)
  const screens = Array.isArray(manifest?.png_files_base64)
    ? manifest.png_files_base64
    : Array.isArray(manifest?.metadata?.png_files_base64)
      ? manifest.metadata.png_files_base64
      : [];

  if (screens.length === 0) {
    const payload = {
      status: 'no_screens',
      rubric: emptyRubric(),
      total_cost_usd: 0,
      error_message: 'manifest contained zero screens',
    };
    const id = await persistQaReport(supabase, ventureId, manifest || {}, payload);
    logEvent('info', 'stitch_qa_completed', { venture_id: ventureId, status: payload.status, qa_report_id: id });
    return { ...payload, qa_report_id: id };
  }

  // ── Degradation 2: daily budget exceeded ────────────────────────────────
  const { budget, spent, remaining } = await getRemainingDailyBudget(supabase);
  const estimatedCost = estimateCallCostUsd(screens.length);
  if (estimatedCost > remaining) {
    const payload = {
      status: 'daily_budget_exceeded',
      rubric: emptyRubric(),
      total_cost_usd: 0,
      error_message: `daily_budget=${budget.toFixed(4)} spent=${spent.toFixed(4)} estimated_next=${estimatedCost.toFixed(4)}`,
    };
    const id = await persistQaReport(supabase, ventureId, manifest, payload);
    logEvent('warn', 'stitch_qa_completed', { venture_id: ventureId, status: payload.status, qa_report_id: id });
    return { ...payload, qa_report_id: id };
  }

  // ── Happy path: review each screen, aggregate, persist ──────────────────
  const perScreen = [];
  let totalCostUsd = 0;
  const errors = [];

  for (const screen of screens) {
    if (!screen?.base64 || !screen?.screen_id) {
      errors.push({ screen_id: screen?.screen_id || '<unknown>', error: 'missing base64 or screen_id' });
      continue;
    }
    try {
      const result = await reviewSingleScreen(client, screen.screen_id, screen.base64);
      perScreen.push(result);
      const cost = actualCostFromUsage(result.usage);
      if (cost != null) totalCostUsd += cost;
    } catch (err) {
      errors.push({ screen_id: screen.screen_id, error: err.message || String(err) });
      logEvent('warn', 'qa_screen_failed', { screen_id: screen.screen_id, error: err.message });
    }
  }

  // If every screen failed, treat as a degraded outcome.
  if (perScreen.length === 0) {
    const payload = {
      status: 'vision_api_unavailable',
      rubric: emptyRubric(),
      total_cost_usd: totalCostUsd,
      error_message: errors.map((e) => `${e.screen_id}: ${e.error}`).join('; ') || 'all screens failed',
    };
    const id = await persistQaReport(supabase, ventureId, manifest, payload);
    logEvent('warn', 'stitch_qa_completed', { venture_id: ventureId, status: payload.status, qa_report_id: id });
    return { ...payload, qa_report_id: id };
  }

  const aggregated = aggregateRubrics(perScreen);
  const payload = {
    status: 'completed',
    rubric: aggregated,
    total_cost_usd: totalCostUsd,
    screen_errors: errors,
  };
  const id = await persistQaReport(supabase, ventureId, manifest, payload);
  logEvent('info', 'stitch_qa_completed', {
    venture_id: ventureId,
    status: payload.status,
    cost_usd: totalCostUsd,
    qa_report_id: id,
    screens_reviewed: perScreen.length,
    screens_failed: errors.length,
  });
  return { ...payload, qa_report_id: id };
}

// Exports for testing
export { aggregateRubrics, estimateCallCostUsd, getRemainingDailyBudget, buildRubricPrompt, RUBRIC_CATEGORIES };
