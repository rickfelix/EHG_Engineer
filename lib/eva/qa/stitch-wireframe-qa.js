/**
 * Stitch Wireframe Fidelity QA — 4-dimension scoring engine
 *
 * SD: SD-WIREFRAME-FIDELITY-QA-WITH-ORCH-001-A
 *
 * Compares exported Stitch PNG screenshots against S15 ASCII wireframe
 * specifications using Claude Sonnet vision API. Scores each screen on
 * 4 dimensions: component_presence, layout_fidelity, navigation_accuracy,
 * screen_purpose_match. Persists results as additive wireframe_fidelity
 * field on the stitch_qa_report artifact.
 *
 * Never throws — returns degraded result on any error.
 *
 * @module lib/eva/qa/stitch-wireframe-qa
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';
const PER_SCREEN_TIMEOUT_MS = 30_000;
const DIMENSIONS = ['component_presence', 'layout_fidelity', 'navigation_accuracy', 'screen_purpose_match'];

// ---------------------------------------------------------------------------
// Client loaders (test-injectable)
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
  if (!url || !key) return null;
  _supabaseClient = createClient(url, key);
  return _supabaseClient;
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function log(level, event, details = {}) {
  const entry = JSON.stringify({ event, level, timestamp: new Date().toISOString(), ...details });
  (level === 'warn' ? console.warn : console.info)(`[wireframe-qa] ${entry}`);
}

// ---------------------------------------------------------------------------
// Screen-to-wireframe pairing
// ---------------------------------------------------------------------------

export function pairScreensToWireframes(screens, wireframes) {
  const pairs = [];
  const usedWireframeIndices = new Set();

  for (let i = 0; i < screens.length; i++) {
    const screen = screens[i];
    const screenName = (screen.screen_id || screen.name || `screen_${i}`).toLowerCase().replace(/[^a-z0-9]/g, '');

    // Try exact name match first
    let matchIdx = wireframes.findIndex((wf, idx) => {
      if (usedWireframeIndices.has(idx)) return false;
      const wfName = (wf.name || wf.screen_name || `wireframe_${idx}`).toLowerCase().replace(/[^a-z0-9]/g, '');
      return screenName === wfName || screenName.includes(wfName) || wfName.includes(screenName);
    });

    if (matchIdx === -1) {
      // Index fallback
      matchIdx = i < wireframes.length ? i : -1;
      if (matchIdx !== -1 && !usedWireframeIndices.has(matchIdx)) {
        log('warn', 'wireframe_name_mismatch', {
          screen: screen.screen_id || screen.name,
          wireframe: wireframes[matchIdx]?.name,
          fallback: 'index',
        });
      }
    }

    if (matchIdx !== -1 && !usedWireframeIndices.has(matchIdx)) {
      usedWireframeIndices.add(matchIdx);
      pairs.push({
        screen,
        wireframe: wireframes[matchIdx],
        screen_name: screen.screen_id || screen.name || `screen_${i}`,
        wireframe_name: wireframes[matchIdx].name || wireframes[matchIdx].screen_name || `wireframe_${matchIdx}`,
      });
    } else {
      pairs.push({
        screen,
        wireframe: null,
        screen_name: screen.screen_id || screen.name || `screen_${i}`,
        wireframe_name: null,
      });
      log('warn', 'wireframe_unmatched_screen', { screen: screen.screen_id || screen.name });
    }
  }

  const unpaired = wireframes.length - usedWireframeIndices.size;
  if (unpaired > 0) {
    log('warn', 'wireframe_unpaired_wireframes', { count: unpaired });
  }

  return pairs;
}

// ---------------------------------------------------------------------------
// Vision scoring prompt
// ---------------------------------------------------------------------------

function buildFidelityPrompt(wireframeSpec) {
  return `You are a wireframe fidelity QA reviewer. Compare the screenshot against this ASCII wireframe specification:

---WIREFRAME---
${wireframeSpec}
---END WIREFRAME---

Score the screenshot on 4 dimensions (0-100 each):

1. COMPONENT_PRESENCE — Are all UI components from the wireframe present? (buttons, forms, navigation bars, headers, footers, input fields, cards, etc.)
2. LAYOUT_FIDELITY — Does the spatial arrangement match the wireframe zones? (header at top, sidebar left/right, content area proportions, grid structure)
3. NAVIGATION_ACCURACY — Do links, menus, and navigation elements match the wireframe nav structure? (menu items, link destinations, breadcrumbs, tabs)
4. SCREEN_PURPOSE_MATCH — Does the screen serve the function described in the wireframe? (dashboard shows data, form collects input, list displays items)

Also list any specific components from the wireframe that are MISSING in the screenshot.

Respond with valid JSON only:
{
  "component_presence": <0-100>,
  "layout_fidelity": <0-100>,
  "navigation_accuracy": <0-100>,
  "screen_purpose_match": <0-100>,
  "missing_elements": ["element1", "element2"],
  "notes": "brief observation"
}

Do NOT include text before or after the JSON.`;
}

// ---------------------------------------------------------------------------
// Per-screen vision call
// ---------------------------------------------------------------------------

async function scoreScreen(client, base64Image, wireframeSpec) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PER_SCREEN_TIMEOUT_MS);

  try {
    const response = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64Image } },
          { type: 'text', text: buildFidelityPrompt(wireframeSpec) },
        ],
      }],
    });

    clearTimeout(timeout);
    const text = response.content?.[0]?.text || '';
    const parsed = JSON.parse(text);

    // Validate dimension scores
    for (const dim of DIMENSIONS) {
      if (typeof parsed[dim] !== 'number' || parsed[dim] < 0 || parsed[dim] > 100) {
        parsed[dim] = 0;
      }
    }

    return {
      status: 'scored',
      dimensions: {
        component_presence: parsed.component_presence,
        layout_fidelity: parsed.layout_fidelity,
        navigation_accuracy: parsed.navigation_accuracy,
        screen_purpose_match: parsed.screen_purpose_match,
      },
      score: Math.round(DIMENSIONS.reduce((sum, d) => sum + parsed[d], 0) / DIMENSIONS.length),
      missing_elements: Array.isArray(parsed.missing_elements) ? parsed.missing_elements : [],
      notes: typeof parsed.notes === 'string' ? parsed.notes : '',
    };
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      return { status: 'api_timeout', dimensions: null, score: null, missing_elements: [], notes: 'Vision API timed out' };
    }
    return { status: 'api_error', dimensions: null, score: null, missing_elements: [], notes: err.message || String(err) };
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Score wireframe fidelity for a venture's exported screens.
 *
 * @param {string} ventureId
 * @param {string} projectId
 * @param {Object} [options]
 * @param {Array} [options.png_files_base64] - Pre-loaded PNGs [{screen_id, base64}]
 * @param {Array} [options.wireframes] - Pre-loaded wireframe specs [{name, content}]
 * @returns {Promise<Object>} Fidelity result (never throws)
 */
export async function scoreWireframeFidelity(ventureId, projectId, options = {}) {
  try {
    const client = getAnthropicClient();
    if (!client) {
      log('warn', 'vision_api_unavailable', { venture_id: ventureId });
      return { status: 'vision_api_unavailable', overall_score: null, screens: [] };
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      log('warn', 'supabase_unavailable', { venture_id: ventureId });
      return { status: 'supabase_unavailable', overall_score: null, screens: [] };
    }

    // Load PNG files (from options or from artifact)
    let pngFiles = options.png_files_base64;
    if (!pngFiles) {
      const { data: exportArtifact } = await supabase
        .from('venture_artifacts')
        .select('metadata')
        .eq('venture_id', ventureId)
        .eq('artifact_type', 'stitch_design_export')
        .eq('is_current', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      pngFiles = exportArtifact?.metadata?.png_files_base64;
      if (!pngFiles || pngFiles.length === 0) {
        log('warn', 'no_png_files', { venture_id: ventureId });
        return { status: 'no_png_files', overall_score: null, screens: [] };
      }
    }

    // Load wireframe specs (from options or from artifact)
    let wireframes = options.wireframes;
    if (!wireframes) {
      const { data: wfArtifact } = await supabase
        .from('venture_artifacts')
        .select('metadata, content')
        .eq('venture_id', ventureId)
        .eq('artifact_type', 'blueprint_wireframes')
        .eq('is_current', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      // Try metadata.wireframes, then metadata.screens, then parse content
      wireframes = wfArtifact?.metadata?.wireframes
        || wfArtifact?.metadata?.screens
        || [];

      if (wireframes.length === 0 && wfArtifact?.content) {
        // Content may be a string with wireframe specs — treat as single wireframe
        wireframes = [{ name: 'full_blueprint', content: wfArtifact.content }];
      }

      if (wireframes.length === 0) {
        log('warn', 'no_wireframes', { venture_id: ventureId });
        return { status: 'no_wireframes', overall_score: null, screens: [] };
      }
    }

    // Pair screens to wireframes
    const pairs = pairScreensToWireframes(pngFiles, wireframes);

    // Score each pair sequentially
    const screenResults = [];
    for (const pair of pairs) {
      if (!pair.wireframe) {
        screenResults.push({
          screen_name: pair.screen_name,
          wireframe_name: null,
          status: 'no_wireframe_match',
          dimensions: null,
          score: null,
          missing_elements: [],
          notes: 'No wireframe matched for this screen',
        });
        continue;
      }

      const wireframeContent = pair.wireframe.content || pair.wireframe.ascii || JSON.stringify(pair.wireframe);
      const base64 = pair.screen.base64 || pair.screen.data;

      if (!base64) {
        screenResults.push({
          screen_name: pair.screen_name,
          wireframe_name: pair.wireframe_name,
          status: 'download_failed',
          dimensions: null,
          score: null,
          missing_elements: [],
          notes: 'No base64 image data available',
        });
        continue;
      }

      log('info', 'scoring_screen', { screen: pair.screen_name, wireframe: pair.wireframe_name });
      const result = await scoreScreen(client, base64, wireframeContent);

      screenResults.push({
        screen_name: pair.screen_name,
        wireframe_name: pair.wireframe_name,
        ...result,
      });
    }

    // Compute overall score (average of scored screens)
    const scoredScreens = screenResults.filter(s => typeof s.score === 'number');
    const overall_score = scoredScreens.length > 0
      ? Math.round(scoredScreens.reduce((sum, s) => sum + s.score, 0) / scoredScreens.length)
      : null;

    const fidelityResult = {
      status: 'completed',
      overall_score,
      screens: screenResults,
      scored_at: new Date().toISOString(),
      model: ANTHROPIC_MODEL,
      screen_count: pngFiles.length,
      wireframe_count: wireframes.length,
    };

    // Persist wireframe_fidelity in stitch_qa_report
    await persistFidelityResult(supabase, ventureId, fidelityResult);

    log('info', 'scoring_complete', { venture_id: ventureId, overall_score, screens: screenResults.length });
    return fidelityResult;
  } catch (err) {
    log('warn', 'scoring_failed', { venture_id: ventureId, error: err.message || String(err) });
    return { status: 'degraded', overall_score: null, screens: [], error: err.message || String(err) };
  }
}

// ---------------------------------------------------------------------------
// Artifact persistence
// ---------------------------------------------------------------------------

async function persistFidelityResult(supabase, ventureId, fidelityResult) {
  try {
    // Check for existing stitch_qa_report
    const { data: existing } = await supabase
      .from('venture_artifacts')
      .select('id, metadata, version')
      .eq('venture_id', ventureId)
      .eq('artifact_type', 'stitch_qa_report')
      .eq('is_current', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (existing) {
      // Additive merge: keep existing metadata, add wireframe_fidelity
      const mergedMetadata = { ...existing.metadata, wireframe_fidelity: fidelityResult };
      const newVersion = (existing.version || 1) + 1;

      // Flip old version
      await supabase
        .from('venture_artifacts')
        .update({ is_current: false })
        .eq('id', existing.id);

      // Insert new version
      await supabase.from('venture_artifacts').insert({
        venture_id: ventureId,
        artifact_type: 'stitch_qa_report',
        lifecycle_stage: 17,
        is_current: true,
        version: newVersion,
        title: `Stitch Design QA Report (v${newVersion})`,
        content: `Vision QA + Wireframe Fidelity — overall fidelity: ${fidelityResult.overall_score ?? 'N/A'}%`,
        metadata: mergedMetadata,
      });
    } else {
      // Create new stitch_qa_report with wireframe_fidelity only
      await supabase.from('venture_artifacts').insert({
        venture_id: ventureId,
        artifact_type: 'stitch_qa_report',
        lifecycle_stage: 17,
        is_current: true,
        version: 1,
        title: 'Stitch Design QA Report (wireframe fidelity)',
        content: `Wireframe Fidelity QA — overall fidelity: ${fidelityResult.overall_score ?? 'N/A'}%`,
        metadata: { schema_version: 1, wireframe_fidelity: fidelityResult },
      });
    }

    log('info', 'fidelity_persisted', { venture_id: ventureId });
  } catch (err) {
    log('warn', 'fidelity_persist_failed', { venture_id: ventureId, error: err.message || String(err) });
  }
}
