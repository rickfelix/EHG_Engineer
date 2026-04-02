/**
 * Stitch Provisioner - Post-Stage-15 Design Project Provisioning
 * SD-LEO-INFRA-GOOGLE-STITCH-DESIGN-001-B
 *
 * Provisions a Google Stitch design project from EVA pipeline artifacts.
 * Reads Stage 11 (visual identity) and Stage 15 (wireframe) data,
 * constructs text prompts, and calls stitch-client to create project
 * and generate design screens.
 *
 * Guarded by governance flags in chairman_dashboard_config.taste_gate_config.
 *
 * @module eva/bridge/stitch-provisioner
 * @version 1.0.0
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ---------------------------------------------------------------------------
// Stitch Client Loader (lazy, supports test injection)
// ---------------------------------------------------------------------------

let _stitchClient = null;
let _stitchClientLoader = null;

export function setStitchClientLoader(loader) {
  _stitchClientLoader = loader;
  _stitchClient = null;
}

async function getStitchClient() {
  if (_stitchClient) return _stitchClient;
  if (_stitchClientLoader) {
    _stitchClient = await _stitchClientLoader();
    return _stitchClient;
  }
  // Default: try to load from EHG repo's bridge directory
  try {
    const mod = await import(/* @vite-ignore */ '../../ehg/lib/eva/bridge/stitch-client.js');
    _stitchClient = mod;
    return _stitchClient;
  } catch {
    // Fallback: try relative path in same repo
    try {
      const mod = await import(/* @vite-ignore */ './stitch-client.js');
      _stitchClient = mod;
      return _stitchClient;
    } catch (err) {
      throw new Error(`Cannot load stitch-client: ${err.message}. Ensure @google/stitch-sdk is available.`);
    }
  }
}

// ---------------------------------------------------------------------------
// Governance Flag Check
// ---------------------------------------------------------------------------

async function checkGovernanceFlags() {
  const { data, error } = await supabase
    .from('chairman_dashboard_config')
    .select('taste_gate_config')
    .limit(1)
    .single();

  if (error || !data?.taste_gate_config) {
    return { enabled: false, reason: 'governance_config_unavailable' };
  }

  const config = data.taste_gate_config;

  if (!config.stitch_enabled) {
    return { enabled: false, reason: 'stitch_disabled' };
  }
  if (!config.stitch_auto_provision) {
    return { enabled: false, reason: 'auto_provision_disabled' };
  }

  return { enabled: true, config };
}

// ---------------------------------------------------------------------------
// Artifact Readers
// ---------------------------------------------------------------------------

function extractStage11Tokens(stage11Artifacts) {
  const tokens = {};

  // Color palette
  if (stage11Artifacts?.colorPalette) {
    tokens.colors = Array.isArray(stage11Artifacts.colorPalette)
      ? stage11Artifacts.colorPalette
      : [stage11Artifacts.colorPalette];
  } else if (stage11Artifacts?.visual_identity?.color_palette) {
    tokens.colors = stage11Artifacts.visual_identity.color_palette;
  }

  // Typography
  if (stage11Artifacts?.typography) {
    tokens.fonts = Array.isArray(stage11Artifacts.typography)
      ? stage11Artifacts.typography.map(t => typeof t === 'string' ? t : t.name || t.family)
      : [stage11Artifacts.typography];
  } else if (stage11Artifacts?.visual_identity?.typography) {
    tokens.fonts = [stage11Artifacts.visual_identity.typography];
  }

  // Brand expression / personality
  if (stage11Artifacts?.brandExpression) {
    tokens.personality = stage11Artifacts.brandExpression;
  } else if (stage11Artifacts?.brand_expression) {
    tokens.personality = stage11Artifacts.brand_expression;
  } else if (stage11Artifacts?.visual_identity?.brand_personality) {
    tokens.personality = stage11Artifacts.visual_identity.brand_personality;
  }

  return tokens;
}

function extractStage15Screens(stage15Artifacts) {
  // Try screens array directly
  if (Array.isArray(stage15Artifacts?.screens)) {
    return stage15Artifacts.screens;
  }
  // Try wireframes.screens
  if (Array.isArray(stage15Artifacts?.wireframes?.screens)) {
    return stage15Artifacts.wireframes.screens;
  }
  // Try navigation_flows as screen source
  if (Array.isArray(stage15Artifacts?.navigation_flows)) {
    return stage15Artifacts.navigation_flows.map(flow => ({
      name: flow.name || flow.screen_name,
      purpose: flow.purpose || flow.description,
      key_components: flow.components || [],
    }));
  }

  return [];
}

// ---------------------------------------------------------------------------
// Prompt Construction
// ---------------------------------------------------------------------------

function buildScreenPrompt(screen, brandTokens, ventureName) {
  const parts = [];

  parts.push(`Design a ${screen.name || 'screen'} for ${ventureName || 'the application'}.`);

  if (screen.purpose) {
    parts.push(`Purpose: ${screen.purpose}`);
  }

  // Brand tokens
  if (brandTokens.colors?.length > 0) {
    parts.push(`Color palette: ${brandTokens.colors.slice(0, 5).join(', ')}`);
  }
  if (brandTokens.fonts?.length > 0) {
    parts.push(`Typography: ${brandTokens.fonts.join(', ')}`);
  }
  if (brandTokens.personality) {
    const personality = typeof brandTokens.personality === 'string'
      ? brandTokens.personality
      : JSON.stringify(brandTokens.personality);
    parts.push(`Brand personality: ${personality}`);
  }

  // Screen components
  if (screen.key_components?.length > 0) {
    parts.push(`Key components: ${screen.key_components.join(', ')}`);
  }

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Artifact Storage
// ---------------------------------------------------------------------------

async function storeStitchArtifact(ventureId, projectId, projectUrl, screenCount) {
  const { error } = await supabase
    .from('venture_artifacts')
    .upsert({
      venture_id: ventureId,
      artifact_type: 'stitch_project',
      data: {
        project_id: projectId,
        url: projectUrl,
        screen_count: screenCount,
        provisioned_at: new Date().toISOString(),
      },
    }, { onConflict: 'venture_id,artifact_type' });

  if (error) {
    console.error(`[stitch-provisioner] Failed to store artifact: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Provision a Stitch design project from Stage 11+15 artifacts.
 *
 * @param {string} ventureId - Venture UUID
 * @param {Object} stage11Artifacts - Stage 11 visual identity data
 * @param {Object} stage15Artifacts - Stage 15 wireframe/screen data
 * @param {Object} [options] - Additional options
 * @param {string} [options.ventureName] - Venture name for prompts
 * @returns {Promise<{status: string, project_id?: string, url?: string, screens?: number}>}
 */
export async function provisionStitchProject(ventureId, stage11Artifacts, stage15Artifacts, options = {}) {
  // Step 1: Check governance flags
  const governance = await checkGovernanceFlags();
  if (!governance.enabled) {
    console.info(`[stitch-provisioner] Skipping: ${governance.reason}`);
    return { status: 'no_op', reason: governance.reason };
  }

  // Step 2: Extract brand tokens from Stage 11
  const brandTokens = extractStage11Tokens(stage11Artifacts);

  // Step 3: Extract screens from Stage 15
  const screens = extractStage15Screens(stage15Artifacts);
  if (screens.length === 0) {
    console.warn('[stitch-provisioner] No screens found in Stage 15 artifacts');
    return { status: 'no_op', reason: 'no_screens' };
  }

  // Step 4: Build prompts
  const prompts = screens.map(screen =>
    buildScreenPrompt(screen, brandTokens, options.ventureName)
  );

  // Step 5: Create project via stitch-client
  const client = await getStitchClient();

  const project = await client.createProject({
    name: `${options.ventureName || ventureId} - Design Screens`,
    brandTokens,
    screenDescriptions: prompts,
    ventureId,
  });

  // Step 6: Generate screens
  const generatedScreens = await client.generateScreens(
    project.project_id,
    prompts,
    ventureId
  );

  // Step 7: Store artifact
  await storeStitchArtifact(
    ventureId,
    project.project_id,
    project.url,
    generatedScreens.length
  );

  console.info(`[stitch-provisioner] Project provisioned: ${project.project_id} (${generatedScreens.length} screens)`);

  return {
    status: 'provisioned',
    project_id: project.project_id,
    url: project.url,
    screens: generatedScreens.length,
  };
}

/**
 * Non-blocking hook for Stage 15 post-completion.
 * Catches all errors to prevent blocking stage progression.
 *
 * @param {string} ventureId - Venture UUID
 * @param {Object} stageData - Stage 15 completion data
 */
export async function postStage15Hook(ventureId, stageData) {
  try {
    // Fetch Stage 11 artifacts
    const { data: s11 } = await supabase
      .from('venture_stage_work')
      .select('advisory_data')
      .eq('venture_id', ventureId)
      .eq('stage_number', 11)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const result = await provisionStitchProject(
      ventureId,
      s11?.advisory_data || {},
      stageData?.advisory_data || stageData || {},
      { ventureName: stageData?.venture_name }
    );

    // Log result to advisory_data for visibility
    if (result.status !== 'no_op') {
      await supabase
        .from('venture_stage_work')
        .update({
          advisory_data: supabase.rpc ? undefined : {
            ...stageData?.advisory_data,
            stitch_provisioning: result,
          },
        })
        .eq('venture_id', ventureId)
        .eq('stage_number', 15)
        .order('created_at', { ascending: false })
        .limit(1);
    }

    return result;
  } catch (err) {
    console.error(`[stitch-provisioner] Post-Stage-15 hook failed (non-blocking): ${err.message}`);
    return { status: 'error', error: err.message };
  }
}

// Export for testing
export { extractStage11Tokens, extractStage15Screens, buildScreenPrompt, checkGovernanceFlags };
