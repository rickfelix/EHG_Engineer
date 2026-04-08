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
import { writeArtifact } from '../artifact-persistence-service.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ---------------------------------------------------------------------------
// Stitch Client Loader (via stitch-adapter.js facade)
// SD-LEO-FIX-GOOGLE-STITCH-PIPELINE-001-C: Route through adapter, not client
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
  try {
    const mod = await import(/* @vite-ignore */ './stitch-adapter.js');
    _stitchClient = mod;
    return _stitchClient;
  } catch (err) {
    throw new Error(`Cannot load stitch-adapter: ${err.message}. Ensure stitch-adapter.js is available.`);
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
  try {
    await writeArtifact(supabase, {
      ventureId,
      lifecycleStage: 15,
      artifactType: 'stitch_project',
      title: 'Stitch Design Project',
      artifactData: {
        project_id: projectId,
        url: projectUrl,
        screen_count: screenCount,
        provisioned_at: new Date().toISOString(),
      },
      source: 'stitch-provisioner',
    });
  } catch (err) {
    console.error(`[stitch-provisioner] Failed to store artifact: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Provision a Stitch design project from Stage 11+15 artifacts.
 *
 * Hybrid workflow: Creates the project via API, then the chairman
 * generates and curates screens in the Stitch web UI. The pipeline
 * polls for screens and exports when ready.
 *
 * @param {string} ventureId - Venture UUID
 * @param {Object} stage11Artifacts - Stage 11 visual identity data
 * @param {Object} stage15Artifacts - Stage 15 wireframe/screen data
 * @param {Object} [options] - Additional options
 * @param {string} [options.ventureName] - Venture name for prompts
 * @returns {Promise<{status: string, project_id?: string, url?: string, curation_prompts?: string[]}>}
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

  // Step 4: Build curation prompts (chairman uses these in Stitch web UI)
  const curationPrompts = screens.map(screen =>
    buildScreenPrompt(screen, brandTokens, options.ventureName)
  );

  // Step 5: Create project via stitch-client (API call — works reliably)
  const client = await getStitchClient();
  const ventureName = options.ventureName || 'Venture';

  const project = await client.createProject({
    name: ventureName,
    ventureId,
  });

  // Step 6: Store artifact with curation context
  await storeStitchArtifact(ventureId, project.project_id, project.url, 0);

  // Step 7: Store curation prompts so chairman can copy-paste into Stitch UI
  await writeArtifact(supabase, {
    ventureId,
    lifecycleStage: 15,
    artifactType: 'stitch_curation',
    title: 'Stitch Curation Prompts',
    artifactData: {
      project_id: project.project_id,
      url: project.url,
      brand_tokens: brandTokens,
      screen_prompts: curationPrompts.map((prompt, i) => ({
        screen_name: screens[i]?.name || `Screen ${i + 1}`,
        prompt,
      })),
      status: 'awaiting_curation',
      provisioned_at: new Date().toISOString(),
    },
    source: 'stitch-provisioner',
  });

  console.info(`[stitch-provisioner] Project created: ${project.project_id}`);
  console.info(`[stitch-provisioner] Chairman: open ${project.url} to generate and curate screens`);
  console.info(`[stitch-provisioner] ${curationPrompts.length} screen prompt(s) saved for reference`);

  return {
    status: 'awaiting_curation',
    project_id: project.project_id,
    url: project.url,
    curation_prompts: curationPrompts,
  };
}

/**
 * Check if chairman has generated screens in the Stitch project.
 * Called by the pipeline to determine if curation is complete.
 *
 * @param {string} ventureId - Venture UUID
 * @returns {Promise<{ready: boolean, screen_count: number, project_id?: string}>}
 */
export async function checkCurationStatus(ventureId) {
  const { data: artifact } = await supabase
    .from('venture_artifacts')
    .select('artifact_data')
    .eq('venture_id', ventureId)
    .eq('artifact_type', 'stitch_project')
    .single();

  if (!artifact?.artifact_data?.project_id) {
    return { ready: false, screen_count: 0, reason: 'no_project' };
  }

  const client = await getStitchClient();
  const screens = await client.listScreens(artifact.artifact_data.project_id);

  if (screens.length === 0) {
    return { ready: false, screen_count: 0, project_id: artifact.artifact_data.project_id };
  }

  // Update project artifact with screen count
  await writeArtifact(supabase, {
    ventureId,
    lifecycleStage: 15,
    artifactType: 'stitch_project',
    title: 'Stitch Design Project',
    artifactData: { ...artifact.artifact_data, screen_count: screens.length, curation_checked_at: new Date().toISOString() },
    source: 'stitch-provisioner',
  });

  // Mark curation as complete
  await writeArtifact(supabase, {
    ventureId,
    lifecycleStage: 15,
    artifactType: 'stitch_curation',
    title: 'Stitch Curation Prompts',
    artifactData: { status: 'curation_complete', screen_count: screens.length, completed_at: new Date().toISOString() },
    source: 'stitch-provisioner',
  });

  return {
    ready: true,
    screen_count: screens.length,
    project_id: artifact.data.project_id,
    screens: screens.map(s => ({ id: s.screen_id, name: s.name })),
  };
}

/**
 * Non-blocking hook for Stage 15 post-completion.
 *
 * Creates a Stitch project and saves curation prompts. The chairman
 * then opens the project in Stitch web UI to generate and curate screens.
 * The pipeline checks curation status at Stage 17 before proceeding.
 *
 * @param {string} ventureId - Venture UUID
 * @param {Object} stageData - Stage 15 completion data
 */
export async function postStage15Hook(ventureId, stageData) {
  try {
    // Fetch venture name for project naming
    const { data: venture } = await supabase
      .from('ventures')
      .select('name')
      .eq('id', ventureId)
      .single();

    // Fetch Stage 11 artifacts (visual identity)
    const { data: s11 } = await supabase
      .from('venture_stage_work')
      .select('advisory_data')
      .eq('venture_id', ventureId)
      .eq('lifecycle_stage', 11)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const result = await provisionStitchProject(
      ventureId,
      s11?.advisory_data || {},
      stageData?.advisory_data || stageData || {},
      { ventureName: venture?.name }
    );

    return result;
  } catch (err) {
    console.error(`[stitch-provisioner] Post-Stage-15 hook failed (non-blocking): ${err.message}`);
    return { status: 'error', error: err.message };
  }
}

/**
 * Get curation context for the chairman dashboard.
 *
 * Returns everything the chairman needs to curate screens:
 * - Stitch project URL (one click to open)
 * - Screen prompts to paste into Stitch UI
 * - Brand tokens for reference
 * - Current curation status
 *
 * @param {string} ventureId - Venture UUID
 * @returns {Promise<Object|null>} Curation context or null if not provisioned
 */
export async function getCurationContext(ventureId) {
  const { data: curation } = await supabase
    .from('venture_artifacts')
    .select('artifact_data')
    .eq('venture_id', ventureId)
    .eq('artifact_type', 'stitch_curation')
    .single();

  if (!curation?.artifact_data) return null;

  // Check for screens (may have been curated since last check)
  const status = await checkCurationStatus(ventureId);

  return {
    project_url: curation.artifact_data.url,
    project_id: curation.artifact_data.project_id,
    status: status.ready ? 'screens_ready' : 'awaiting_curation',
    screen_count: status.screen_count,
    brand_tokens: curation.artifact_data.brand_tokens,
    screen_prompts: curation.artifact_data.screen_prompts,
    provisioned_at: curation.data.provisioned_at,
  };
}

// Export for testing
export { extractStage11Tokens, extractStage15Screens, buildScreenPrompt, checkGovernanceFlags };
