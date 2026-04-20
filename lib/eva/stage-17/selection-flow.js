/**
 * Stage 17 Chairman Selection Flow
 *
 * Manages the design selection funnel. Pass 1 narrows archetypes to 2
 * selections and triggers generation of 4 refined variants. Pass 2 produces
 * 1 final approved design per screen. Screen count is dynamic, driven by the
 * wireframe_screens artifact. Desktop sessions inject the approved mobile
 * thumbnail as context.
 *
 * Exports:
 *   submitPass1Selection(ventureId, screenId, selectedIds, supabase)
 *   submitPass2Selection(ventureId, screenId, platform, artifactId, supabase)
 *   isDesignPassComplete(ventureId, supabase)
 *
 * SD-MAN-ORCH-STAGE-DESIGN-REFINEMENT-001-B
 * @module lib/eva/stage-17/selection-flow
 */

import { generateRefinedVariants } from './archetype-generator.js';
import { getTokenConstraints } from './token-manifest.js';
import { writeArtifact } from '../artifact-persistence-service.js';
import { masterDesign } from './design-mastering.js';
import { aggregateStrategyStats } from './strategy-stats.js';

const VALID_PLATFORMS = ['mobile', 'desktop'];

/**
 * Validation error for incorrect selection counts or invalid inputs.
 */
export class SelectionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SelectionError';
  }
}

/**
 * Fetch artifact content by ID.
 *
 * @param {object} supabase
 * @param {string} artifactId
 * @returns {Promise<{ content: string, artifact_data: object, metadata: object, title: string }>}
 */
async function fetchArtifactById(supabase, artifactId) {
  // Handle variant-suffixed IDs from frontend (e.g., "uuid__v1" → artifact uuid, variant index 1)
  let rawId = artifactId;
  let variantIndex = null;
  const suffixMatch = artifactId.match(/^(.+?)__v(\d+)$/);
  if (suffixMatch) {
    rawId = suffixMatch[1];
    variantIndex = parseInt(suffixMatch[2], 10);
  }

  const { data, error } = await supabase
    .from('venture_artifacts')
    .select('id, content, artifact_data, metadata, title, artifact_type')
    .eq('id', rawId)
    .single();

  if (error || !data) throw new Error(`[selection-flow] Artifact ${rawId} not found: ${error?.message}`);

  // If variant-suffixed, extract the specific variant from a multi-variant artifact
  if (variantIndex !== null && data.artifact_data?.variants) {
    const variant = data.artifact_data.variants.find(v => v.variantIndex === variantIndex);
    if (variant) {
      return {
        ...data,
        content: variant.html ?? data.content,
        metadata: { ...data.metadata, strategy_name: variant.strategy_name, variantIndex },
      };
    }
  }

  return data;
}

/**
 * Fetch the approved mobile design artifact for a given screen.
 * Used to inject mobile context when generating desktop archetypes.
 *
 * @param {object} supabase
 * @param {string} ventureId
 * @param {string} screenId
 * @returns {Promise<string|null>} HTML content string or null
 */
async function fetchApprovedMobileHtml(supabase, ventureId, screenId) {
  const { data } = await supabase
    .from('venture_artifacts')
    .select('content')
    .eq('venture_id', ventureId)
    .eq('artifact_type', 'stage_17_approved_mobile')
    .eq('is_current', true)
    .contains('metadata', { screenId })
    .limit(1);

  return data?.[0]?.content ?? null;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Pass 1: Accept exactly 2 selected archetype artifact IDs.
 * Reads their HTML, generates 4 refined variants, and persists them.
 * For desktop sessions, injects the approved mobile design as context.
 *
 * @param {string} ventureId
 * @param {string} screenId - Identifier for the screen being reviewed
 * @param {string[]} selectedIds - Exactly 2 stage_17_archetype artifact IDs
 * @param {object} supabase
 * @param {object} [options]
 * @param {string} [options.platform='mobile'] - 'mobile' or 'desktop'
 * @returns {Promise<{ refinedArtifactIds: string[] }>} 4 stage_17_refined artifact IDs
 * @throws {SelectionError} if selectedIds.length !== 2 or platform invalid
 */
export async function submitPass1Selection(ventureId, screenId, selectedIds, supabase, options = {}) {
  const platform = options.platform ?? 'mobile';

  if (!VALID_PLATFORMS.includes(platform)) {
    throw new SelectionError(`Invalid platform "${platform}". Must be one of: ${VALID_PLATFORMS.join(', ')}`);
  }

  if (!Array.isArray(selectedIds) || selectedIds.length !== 2) {
    throw new SelectionError(
      `Pass 1 requires exactly 2 selections. Got ${Array.isArray(selectedIds) ? selectedIds.length : typeof selectedIds}.`
    );
  }

  // Load selected archetype HTML content
  const [artifact1, artifact2] = await Promise.all([
    fetchArtifactById(supabase, selectedIds[0]),
    fetchArtifactById(supabase, selectedIds[1]),
  ]);

  const selectedHtmls = [
    artifact1.content ?? JSON.stringify(artifact1.artifact_data ?? {}),
    artifact2.content ?? JSON.stringify(artifact2.artifact_data ?? {}),
  ];

  // Load tokens
  const tokens = await getTokenConstraints(ventureId, supabase);

  // Desktop: inject approved mobile thumbnail as context
  let mobileContextHtml = null;
  if (platform === 'desktop') {
    mobileContextHtml = await fetchApprovedMobileHtml(supabase, ventureId, screenId);
  }

  const screenName = artifact1.metadata?.screenName ?? artifact1.artifact_data?.screenName ?? screenId;

  const refinedArtifactIds = await generateRefinedVariants(
    ventureId,
    screenName,
    selectedHtmls,
    tokens,
    supabase,
    { mobileContextHtml }
  );

  return { refinedArtifactIds };
}

/**
 * Pass 2: Select 1 final design from 4 refined variants.
 * Persists the chosen artifact as stage_17_approved_mobile or stage_17_approved_desktop.
 *
 * @param {string} ventureId
 * @param {string} screenId - Identifier for the screen
 * @param {'mobile'|'desktop'} platform
 * @param {string} artifactId - ID of the selected stage_17_refined artifact
 * @param {object} supabase
 * @returns {Promise<{ approvedArtifactId: string }>}
 * @throws {SelectionError} if platform invalid
 */
export async function submitPass2Selection(ventureId, screenId, platform, artifactId, supabase) {
  if (!VALID_PLATFORMS.includes(platform)) {
    throw new SelectionError(`Invalid platform "${platform}". Must be one of: ${VALID_PLATFORMS.join(', ')}`);
  }

  const source = await fetchArtifactById(supabase, artifactId);
  const approvedType = platform === 'mobile' ? 'stage_17_approved_mobile' : 'stage_17_approved_desktop';

  // Retire any existing approval for this screen+platform (supports changing approval)
  let previousApproval = null;
  const { data: existing } = await supabase
    .from('venture_artifacts')
    .select('id, metadata')
    .eq('venture_id', ventureId)
    .eq('artifact_type', approvedType)
    .eq('is_current', true)
    .eq('metadata->>screenId', screenId);

  if (existing?.length > 0) {
    previousApproval = { id: existing[0].id, variantIndex: existing[0].metadata?.variantIndex };
    await supabase
      .from('venture_artifacts')
      .update({ is_current: false })
      .eq('venture_id', ventureId)
      .eq('artifact_type', approvedType)
      .eq('is_current', true)
      .eq('metadata->>screenId', screenId);
    console.log(`[selection-flow] Replaced previous approval for ${screenId} (${approvedType})`);
  }

  const approvedArtifactId = await writeArtifact(supabase, {
    ventureId,
    lifecycleStage: 17,
    artifactType: approvedType,
    title: `${source.metadata?.screenName ?? screenId} — Approved ${platform.charAt(0).toUpperCase() + platform.slice(1)}`,
    content: source.content,
    artifactData: source.artifact_data,
    qualityScore: 90,
    validationStatus: 'validated',
    source: 'stage-17-selection-flow',
    metadata: {
      screenId,
      platform,
      variantIndex: source.metadata?.variantIndex ?? null,
      sourceRefinedArtifactId: artifactId,
      approvedAt: new Date().toISOString(),
      replacedPreviousApproval: !!previousApproval,
      strategy_name: source.metadata?.strategy_name ?? source.artifact_data?.strategy_name ?? null,
      page_type: source.metadata?.pageType ?? source.artifact_data?.pageType ?? null,
    },
  });

  // SD-S17-DESIGN-MASTERY-PIPELINE-ORCH-001-B: run design mastering after approval (non-blocking)
  try {
    await masterDesign(supabase, ventureId, source.content, {
      screenId,
      platform,
      screenName: source.metadata?.screenName ?? screenId,
    });
  } catch (e) {
    console.warn('[selection-flow] Design mastering failed (non-blocking):', e.message);
  }

  // SD-S17-WORKER-STRATEGY-GATE-ORCH-001-A: aggregate strategy stats after all screens approved (fire-and-forget)
  const allComplete = await isDesignPassComplete(ventureId, supabase);
  if (allComplete) {
    aggregateStrategyStats(ventureId, supabase).catch(e => {
      console.warn('[selection-flow] aggregateStrategyStats failed (non-blocking):', e.message);
    });
  }

  return { approvedArtifactId, replaced: !!previousApproval, previousApprovalId: previousApproval?.id ?? null };
}

/**
 * Check whether all design sessions are complete.
 * Compares approved artifact count against the actual screen count
 * from the wireframe_screens artifact (desktop-only = 1 approval per screen).
 *
 * @param {string} ventureId
 * @param {object} supabase
 * @returns {Promise<boolean>}
 */
export async function isDesignPassComplete(ventureId, supabase) {
  // Count actual screens from wireframe_screens artifact
  const { data: wireframeArt } = await supabase
    .from('venture_artifacts')
    .select('artifact_data')
    .eq('venture_id', ventureId)
    .eq('artifact_type', 'wireframe_screens')
    .eq('is_current', true)
    .limit(1)
    .maybeSingle();

  const expectedScreens = wireframeArt?.artifact_data?.screens?.length ?? 0;
  if (expectedScreens === 0) return false;

  const { count, error } = await supabase
    .from('venture_artifacts')
    .select('id', { count: 'exact', head: true })
    .eq('venture_id', ventureId)
    .eq('is_current', true)
    .in('artifact_type', ['stage_17_approved_mobile', 'stage_17_approved_desktop']);

  if (error) throw new Error(`[selection-flow] isDesignPassComplete DB error: ${error.message}`);
  return (count ?? 0) >= expectedScreens;
}
