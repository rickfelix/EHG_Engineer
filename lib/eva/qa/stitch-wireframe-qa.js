/**
 * Stitch Wireframe Fidelity QA — Compare exported PNGs against ASCII wireframes
 *
 * SD: SD-WIREFRAME-FIDELITY-VERIFICATION-VISION-ORCH-001-A
 *
 * Reads blueprint_wireframes artifact for source wireframe specs, pairs each
 * with exported Stitch screen PNGs by name, sends each pair to Claude Sonnet
 * vision for four-dimension fidelity scoring, and persists results as an
 * additive wireframe_fidelity field in the stitch_qa_report artifact.
 *
 * Scoring dimensions:
 *   1. component_presence — Are all wireframe-specified UI elements in the PNG?
 *   2. layout_fidelity — Does spatial arrangement match the wireframe grid?
 *   3. navigation_accuracy — Do links/buttons match the wireframe nav spec?
 *   4. purpose_match — Does the rendered screen serve the wireframe's intent?
 *
 * Error handling:
 * - Missing wireframes artifact → returns { status: 'no_wireframes' }
 * - Missing API key → returns { status: 'vision_api_unavailable' }
 * - Per-screen errors (expired URL, API failure) → that screen marked as error,
 *   others scored normally
 * - The function NEVER throws.
 *
 * @module lib/eva/qa/stitch-wireframe-qa
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_FIDELITY_THRESHOLD = 70;
const FIDELITY_DIMENSIONS = ['component_presence', 'layout_fidelity', 'navigation_accuracy', 'purpose_match'];

// ---------------------------------------------------------------------------
// Test-injectable client loaders (mirrors stitch-vision-qa.js pattern)
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
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for stitch-wireframe-qa');
  }
  _supabaseClient = createClient(url, key);
  return _supabaseClient;
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function logEvent(level, event, details = {}) {
  const entry = JSON.stringify({ event, level, timestamp: new Date().toISOString(), ...details });
  (level === 'warn' ? console.warn : console.info)(`[wireframe-qa] ${entry}`);
}

// ---------------------------------------------------------------------------
// Fidelity scoring prompt
// ---------------------------------------------------------------------------

function buildFidelityPrompt(wireframeSpec) {
  return `You are a wireframe fidelity QA reviewer. Compare the screenshot against this ASCII wireframe specification and score on four dimensions.

WIREFRAME SPECIFICATION:
${wireframeSpec}

Score each dimension from 0 to 100:

1. COMPONENT_PRESENCE — What percentage of UI elements specified in the wireframe are visible in the screenshot? List any missing elements.
2. LAYOUT_FIDELITY — How closely does the spatial arrangement match the wireframe's grid/layout structure? Note any position mismatches.
3. NAVIGATION_ACCURACY — Do the navigation elements (links, buttons, menus) match what the wireframe specifies? List missing or extra nav items.
4. PURPOSE_MATCH — Does the rendered screen serve the same purpose described in the wireframe? Note any intent mismatches.

Respond with valid JSON only, matching this exact schema:
{
  "component_presence": { "score": <0-100>, "findings": ["specific finding"], "missing_elements": ["element name"] },
  "layout_fidelity": { "score": <0-100>, "findings": ["specific finding"], "layout_issues": ["issue description"] },
  "navigation_accuracy": { "score": <0-100>, "findings": ["specific finding"], "missing_nav": ["nav item"] },
  "purpose_match": { "score": <0-100>, "findings": ["specific finding"] }
}

Do NOT include any text before or after the JSON. Do NOT use markdown code fences.`;
}

// ---------------------------------------------------------------------------
// Screen pairing
// ---------------------------------------------------------------------------

/**
 * Pair exported screens with wireframe specs by name matching.
 * @param {Array} wireframes - Array of { name, content } from blueprint_wireframes
 * @param {Array} screens - Array of { screen_id, title, base64|url } from export
 * @returns {{ paired: Array, unpaired_screens: Array, unpaired_wireframes: Array }}
 */
export function pairScreensWithWireframes(wireframes, screens) {
  const paired = [];
  const matchedWireframeNames = new Set();
  const matchedScreenIds = new Set();

  for (const screen of screens) {
    const screenTitle = (screen.title || screen.screen_id || '').toLowerCase().trim();
    const match = wireframes.find(w => {
      const wName = (w.name || '').toLowerCase().trim();
      return wName === screenTitle || wName.includes(screenTitle) || screenTitle.includes(wName);
    });
    if (match) {
      paired.push({ screen, wireframe: match });
      matchedWireframeNames.add(match.name);
      matchedScreenIds.add(screen.screen_id);
    }
  }

  const unpaired_screens = screens.filter(s => !matchedScreenIds.has(s.screen_id));
  const unpaired_wireframes = wireframes.filter(w => !matchedWireframeNames.has(w.name));

  return { paired, unpaired_screens, unpaired_wireframes };
}

// ---------------------------------------------------------------------------
// Per-screen vision scoring
// ---------------------------------------------------------------------------

async function scoreScreenFidelity(client, screenId, base64Image, wireframeSpec) {
  const response = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: base64Image },
          },
          { type: 'text', text: buildFidelityPrompt(wireframeSpec) },
        ],
      },
    ],
  });

  const textBlock = (response.content || []).find(b => b.type === 'text');
  if (!textBlock?.text) {
    throw new Error(`Empty response from vision API for screen ${screenId}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(textBlock.text.trim());
  } catch (err) {
    throw new Error(`Vision API returned non-JSON for screen ${screenId}: ${err.message}`);
  }

  for (const dim of FIDELITY_DIMENSIONS) {
    if (!parsed[dim] || typeof parsed[dim].score !== 'number') {
      throw new Error(`Response missing or malformed dimension '${dim}' for screen ${screenId}`);
    }
  }

  return { parsed, usage: response.usage };
}

// ---------------------------------------------------------------------------
// PNG download helper
// ---------------------------------------------------------------------------

async function downloadPngAsBase64(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`PNG download failed: ${response.status} ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();
  return Buffer.from(buffer).toString('base64');
}

// ---------------------------------------------------------------------------
// Read wireframes artifact
// ---------------------------------------------------------------------------

async function getWireframes(supabase, ventureId) {
  const { data, error } = await supabase
    .from('venture_artifacts')
    .select('metadata, content')
    .eq('venture_id', ventureId)
    .eq('artifact_type', 'blueprint_wireframes')
    .eq('is_current', true)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const wireframes = data.metadata?.wireframes || data.metadata?.screens || [];
  if (wireframes.length > 0) return wireframes;

  if (typeof data.content === 'string') {
    try {
      const parsed = JSON.parse(data.content);
      return parsed.wireframes || parsed.screens || [];
    } catch {
      return [];
    }
  }

  return [];
}

// ---------------------------------------------------------------------------
// Read exported screens
// ---------------------------------------------------------------------------

async function getExportedScreens(supabase, ventureId) {
  const { data, error } = await supabase
    .from('venture_artifacts')
    .select('metadata')
    .eq('venture_id', ventureId)
    .eq('artifact_type', 'stitch_design_export')
    .eq('is_current', true)
    .limit(1)
    .maybeSingle();

  if (error || !data) return [];

  return data.metadata?.screens || data.metadata?.png_files_base64 || [];
}

// ---------------------------------------------------------------------------
// Persist wireframe fidelity to stitch_qa_report
// ---------------------------------------------------------------------------

async function persistWireframeFidelity(supabase, ventureId, fidelityData) {
  const { data: existing } = await supabase
    .from('venture_artifacts')
    .select('id, metadata, version')
    .eq('venture_id', ventureId)
    .eq('artifact_type', 'stitch_qa_report')
    .eq('is_current', true)
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    const updatedMetadata = { ...existing.metadata, wireframe_fidelity: fidelityData };
    const { error } = await supabase
      .from('venture_artifacts')
      .update({ metadata: updatedMetadata })
      .eq('id', existing.id);

    if (error) {
      logEvent('warn', 'wireframe_fidelity_update_failed', { error: error.message, venture_id: ventureId });
      return null;
    }
    return existing.id;
  }

  const { data: inserted, error: insertError } = await supabase
    .from('venture_artifacts')
    .insert({
      venture_id: ventureId,
      artifact_type: 'stitch_qa_report',
      lifecycle_stage: 17,
      title: 'Stitch Wireframe Fidelity QA Report',
      content: `Wireframe fidelity QA for ${fidelityData.screen_count || 0} screens`,
      is_current: true,
      version: 1,
      metadata: { schema_version: 1, wireframe_fidelity: fidelityData },
    })
    .select('id')
    .single();

  if (insertError) {
    logEvent('warn', 'wireframe_fidelity_insert_failed', { error: insertError.message, venture_id: ventureId });
    return null;
  }
  return inserted?.id || null;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Score wireframe fidelity for a venture's exported Stitch screens.
 * Never throws.
 *
 * @param {string} ventureId - Venture UUID
 * @param {Object} [options={}]
 * @param {number} [options.threshold=70] - Fidelity threshold (0-100)
 * @returns {Promise<Object>} Result with status, per-screen scores, aggregate
 */
export async function scoreWireframeFidelity(ventureId, options = {}) {
  const threshold = options.threshold ?? DEFAULT_FIDELITY_THRESHOLD;

  logEvent('info', 'wireframe_qa_started', { venture_id: ventureId, threshold });

  try {
    const supabase = getSupabaseClient();

    const client = getAnthropicClient();
    if (!client) {
      logEvent('warn', 'wireframe_qa_no_api_key', { venture_id: ventureId });
      return { status: 'vision_api_unavailable', screens: [], aggregate: null };
    }

    const wireframes = await getWireframes(supabase, ventureId);
    if (!wireframes || wireframes.length === 0) {
      logEvent('info', 'wireframe_qa_no_wireframes', { venture_id: ventureId });
      return { status: 'no_wireframes', screens: [], aggregate: null };
    }

    const exportedScreens = await getExportedScreens(supabase, ventureId);
    if (exportedScreens.length === 0) {
      logEvent('info', 'wireframe_qa_no_screens', { venture_id: ventureId });
      return { status: 'no_screens', screens: [], aggregate: null };
    }

    const { paired, unpaired_screens, unpaired_wireframes } = pairScreensWithWireframes(wireframes, exportedScreens);

    logEvent('info', 'wireframe_qa_pairing', {
      venture_id: ventureId,
      paired: paired.length,
      unpaired_screens: unpaired_screens.length,
      unpaired_wireframes: unpaired_wireframes.length,
    });

    const screenResults = [];

    for (const { screen, wireframe } of paired) {
      const screenId = screen.screen_id || screen.title || 'unknown';
      try {
        let base64 = screen.base64;
        if (!base64 && screen.url) base64 = await downloadPngAsBase64(screen.url);
        if (!base64 && screen.download_url) base64 = await downloadPngAsBase64(screen.download_url);
        if (!base64) {
          screenResults.push({
            screen_id: screenId, wireframe_name: wireframe.name,
            status: 'error', error: 'No base64 data or download URL available',
            fidelity_score: 0, dimensions: null,
          });
          continue;
        }

        const wireframeSpec = wireframe.content || wireframe.spec || wireframe.ascii || JSON.stringify(wireframe);
        const { parsed, usage } = await scoreScreenFidelity(client, screenId, base64, wireframeSpec);

        const dimScores = FIDELITY_DIMENSIONS.map(d => parsed[d].score);
        const fidelityScore = Math.round(dimScores.reduce((a, b) => a + b, 0) / dimScores.length);

        const result = {
          screen_id: screenId, wireframe_name: wireframe.name,
          status: fidelityScore >= threshold ? 'pass' : 'fail',
          fidelity_score: fidelityScore, threshold, dimensions: parsed, usage,
        };

        if (fidelityScore < threshold) {
          result.missing_elements = parsed.component_presence?.missing_elements || [];
          result.layout_issues = parsed.layout_fidelity?.layout_issues || [];
          result.missing_nav = parsed.navigation_accuracy?.missing_nav || [];
        }

        screenResults.push(result);
        logEvent('info', 'wireframe_qa_screen_scored', { venture_id: ventureId, screen_id: screenId, score: fidelityScore, status: result.status });
      } catch (err) {
        screenResults.push({
          screen_id: screenId, wireframe_name: wireframe.name,
          status: 'error', error: err.message?.slice(0, 500),
          fidelity_score: 0, dimensions: null,
        });
        logEvent('warn', 'wireframe_qa_screen_error', { venture_id: ventureId, screen_id: screenId, error: err.message?.slice(0, 200) });
      }
    }

    for (const screen of unpaired_screens) {
      screenResults.push({
        screen_id: screen.screen_id || screen.title || 'unknown',
        wireframe_name: null, status: 'unpaired', fidelity_score: 0,
        dimensions: null, warning: 'No matching wireframe found for this screen',
      });
    }

    const scoredScreens = screenResults.filter(s => s.status === 'pass' || s.status === 'fail');
    const aggregate = scoredScreens.length > 0
      ? {
        average_fidelity: Math.round(scoredScreens.reduce((a, s) => a + s.fidelity_score, 0) / scoredScreens.length),
        pass_count: scoredScreens.filter(s => s.status === 'pass').length,
        fail_count: scoredScreens.filter(s => s.status === 'fail').length,
        error_count: screenResults.filter(s => s.status === 'error').length,
        unpaired_count: unpaired_screens.length,
        total_screens: screenResults.length,
        threshold,
      }
      : null;

    const fidelityData = {
      status: 'completed', scored_at: new Date().toISOString(),
      screen_count: screenResults.length, threshold, aggregate,
      screens: screenResults, unpaired_wireframes: unpaired_wireframes.map(w => w.name),
    };

    const artifactId = await persistWireframeFidelity(supabase, ventureId, fidelityData);

    logEvent('info', 'wireframe_qa_completed', {
      venture_id: ventureId, screen_count: screenResults.length,
      average_fidelity: aggregate?.average_fidelity, pass_count: aggregate?.pass_count,
      fail_count: aggregate?.fail_count, artifact_id: artifactId,
    });

    return { status: 'completed', screens: screenResults, aggregate, artifact_id: artifactId };
  } catch (err) {
    logEvent('warn', 'wireframe_qa_fatal', { venture_id: ventureId, error: err.message?.slice(0, 500) });
    return { status: 'error', screens: [], aggregate: null, error: err.message?.slice(0, 500) };
  }
}
