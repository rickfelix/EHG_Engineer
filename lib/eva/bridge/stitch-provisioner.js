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
    // SD-LEO-INFRA-UNIFIED-GATE-ENFORCEMENT-001: Import stitch-client (has createProject/listScreens),
    // not stitch-adapter (high-level facade without those methods)
    const mod = await import(/* @vite-ignore */ './stitch-client.js');
    _stitchClient = mod;
    return _stitchClient;
  } catch (err) {
    throw new Error(`Cannot load stitch-client: ${err.message}. Ensure stitch-client.js is available.`);
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

  // Color palette — SD-ENRICH-STITCH-PROMPTS-WITH-ORCH-001-A: fix path resolution
  // S11 identity_naming_visual stores colors at visualIdentity.colorPalette (camelCase)
  const colorSource =
    stage11Artifacts?.visualIdentity?.colorPalette ||  // actual S11 path (camelCase)
    stage11Artifacts?.colorPalette ||                   // legacy flat path
    stage11Artifacts?.visual_identity?.color_palette ||  // snake_case fallback
    stage11Artifacts?.visual_identity?.colorPalette ||   // mixed-case fallback
    null;
  if (colorSource) {
    tokens.colors = Array.isArray(colorSource) ? colorSource : [colorSource];
  }

  // Typography — SD-ENRICH-STITCH-PROMPTS-WITH-ORCH-001-A: fix path resolution
  const typoSource =
    stage11Artifacts?.visualIdentity?.typography ||  // actual S11 path
    stage11Artifacts?.typography ||                   // legacy flat path
    stage11Artifacts?.visual_identity?.typography ||  // snake_case fallback
    null;
  if (typoSource) {
    tokens.fonts = Array.isArray(typoSource)
      ? typoSource.map(t => typeof t === 'string' ? t : t.name || t.family || t)
      : [typoSource];
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

// SD-ENRICH-STITCH-PROMPTS-WITH-ORCH-001-A: char count threshold for pre-flight guard
const PROMPT_CHAR_WARN = parseInt(process.env.STITCH_PROMPT_CHAR_WARN || '4000', 10);

function buildScreenPrompt(screen, brandTokens, ventureName) {
  const parts = [];

  parts.push(`Design a ${screen.name || 'screen'} for ${ventureName || 'the application'}.`);

  if (screen.purpose) {
    parts.push(`Purpose: ${screen.purpose}`);
  }

  // --- LAYOUT SECTION: ASCII wireframe structure ---
  if (Array.isArray(screen.ascii_layout) && screen.ascii_layout.length > 0) {
    parts.push('');
    parts.push('Layout reference:');
    parts.push(screen.ascii_layout.join('\n'));
  }

  // --- BRAND SECTION: colors, typography, personality ---
  const brandParts = [];
  if (brandTokens.colors?.length > 0) {
    const colorLines = brandTokens.colors.map(c => {
      if (typeof c === 'string') return c;
      const name = c.name || 'Color';
      const hex = c.hex || c.value || '';
      const usage = c.usage || '';
      return usage ? `${name} (${hex}) - ${usage}` : `${name} (${hex})`;
    });
    brandParts.push(`Colors: ${colorLines.join('; ')}`);
  }
  if (brandTokens.fonts?.length > 0) {
    brandParts.push(`Typography: ${brandTokens.fonts.join(', ')}`);
  }
  if (brandTokens.personality) {
    const personality = typeof brandTokens.personality === 'string'
      ? brandTokens.personality
      : JSON.stringify(brandTokens.personality);
    brandParts.push(`Brand personality: ${personality}`);
  }
  if (brandParts.length > 0) {
    parts.push('');
    parts.push(...brandParts);
  }

  // --- BEHAVIOR SECTION: interactions, states, responsive ---
  const behaviorParts = [];
  if (screen.interaction_notes) behaviorParts.push(`Interactions: ${screen.interaction_notes}`);
  if (screen.error_state) behaviorParts.push(`Error state: ${screen.error_state}`);
  if (screen.empty_state) behaviorParts.push(`Empty state: ${screen.empty_state}`);
  if (screen.responsive_notes) behaviorParts.push(`Responsive: ${screen.responsive_notes}`);
  if (behaviorParts.length > 0) {
    parts.push('');
    parts.push(...behaviorParts);
  }

  // --- CONTEXT SECTION: persona, user stories, components ---
  if (screen.persona) {
    parts.push('');
    parts.push(`Target persona: ${screen.persona}`);
  }
  if (screen.user_stories?.length > 0) {
    parts.push(`User stories: ${screen.user_stories.join('; ')}`);
  } else if (screen.user_story) {
    parts.push(`User story: ${screen.user_story}`);
  }
  if (screen.key_components?.length > 0) {
    parts.push(`Key components: ${screen.key_components.join(', ')}`);
  }

  const prompt = parts.join('\n');

  // Pre-flight char count guard (warn-only)
  if (prompt.length > PROMPT_CHAR_WARN) {
    console.warn(`[stitch-provisioner] Screen "${screen.name}" prompt is ${prompt.length} chars (threshold: ${PROMPT_CHAR_WARN})`);
  }

  return prompt;
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
    // Emit structured fallback event for alert promotion (SD-EVA-FIX-WIREFRAME-CONTRACT-AND-SILENT-DEGRADATION-001)
    try {
      const { logStitchEvent } = await import('./stitch-adapter.js');
      logStitchEvent({ event: 's15_fallback', ventureId, stage: 15, status: 'fallback_ascii' });
    } catch { /* non-fatal — adapter import may fail in test */ }
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

  // Step 6: Fire generateScreens for each prompt (fire-and-forget).
  //
  // Why: API-created empty Stitch projects are non-interactive in the web UI —
  // the chairman can't paste prompts until the project has been "activated" by
  // at least one generate() call. Firing all screens via the API both seeds the
  // project AND saves the chairman from manual copy-paste.
  //
  // Fire-and-forget is required because Stitch's generate_screen_from_text
  // takes 30-60s and often drops the HTTP response mid-stream. stitch-client's
  // generateScreens handles this by catching socket errors and returning "fired"
  // status — the server-side generation proceeds regardless.
  //
  // Known Stitch bug: list_screens returns empty until the project is opened
  // in an authenticated browser. The chairman triggers sync with a one-time
  // click on the "Open in Stitch to Activate Sync" button in Stage 17 UI.
  // Reference: https://discuss.ai.google.dev/t/list-screens-returns-empty-after-generate-screen-from-text-until-project-is-opened-in-browser/123348
  let generationResults = [];
  try {
    console.info(`[stitch-provisioner] Firing ${curationPrompts.length} generate() call(s)...`);
    generationResults = await client.generateScreens(
      project.project_id,
      curationPrompts,
      ventureId
    );
    const fired = generationResults.filter(r => r.status === 'fired').length;
    const returned = generationResults.filter(r => r.status === 'returned').length;
    console.info(`[stitch-provisioner] Generate results: ${returned} returned, ${fired} fired (socket drop)`);
  } catch (err) {
    // Only genuine errors (not socket drops) reach here — log but continue.
    console.error(`[stitch-provisioner] generateScreens fatal error: ${err.message}`);
  }

  // Step 7: Store artifact with curation context
  await storeStitchArtifact(ventureId, project.project_id, project.url, 0);

  // Step 8: Store curation prompts + generation results
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
      generation_results: generationResults,
      status: 'awaiting_curation',
      provisioned_at: new Date().toISOString(),
    },
    source: 'stitch-provisioner',
  });

  console.info(`[stitch-provisioner] Project created: ${project.project_id}`);
  console.info(`[stitch-provisioner] Chairman: open ${project.url} to activate sync and review screens`);
  console.info(`[stitch-provisioner] ${curationPrompts.length} screen prompt(s) saved for reference`);

  return {
    status: 'awaiting_curation',
    project_id: project.project_id,
    url: project.url,
    curation_prompts: curationPrompts,
    generation_results: generationResults,
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
    project_id: artifact.artifact_data.project_id,
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
    provisioned_at: curation.artifact_data.provisioned_at,
  };
}

// Export for testing
export { extractStage11Tokens, extractStage15Screens, buildScreenPrompt, checkGovernanceFlags };
