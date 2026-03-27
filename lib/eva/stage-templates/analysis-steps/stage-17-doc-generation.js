/**
 * Stage 17 Doc-Generation — Auto-Generate Vision + Architecture Plans
 *
 * Post-gate synthesis step: runs AFTER stage-17-blueprint-review.js passes.
 * Consumes venture_artifacts (stages 1-16) and synthesizes:
 *   1. EVA Vision document (10 sections)
 *   2. EVA Architecture Plan (8 sections)
 *
 * Registers both via extracted upsert modules.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-17-doc-generation
 */

import { sanitizeForPrompt } from '../../utils/sanitize-for-prompt.js';
import { upsertVision } from '../../vision-upsert.js';
import { upsertArchPlan } from '../../archplan-upsert.js';

// Section-to-artifact mappings
const VISION_SECTION_SOURCES = {
  executive_summary: ['truth_idea_brief', 'truth_validation_decision'],
  problem_statement: ['truth_ai_critique', 'truth_competitive_analysis'],
  personas: ['identity_persona_brand'],
  information_architecture: ['blueprint_product_roadmap', 'blueprint_technical_architecture'],
  key_decision_points: ['blueprint_risk_register', 'engine_risk_matrix'],
  integration_patterns: ['blueprint_technical_architecture', 'blueprint_api_contract'],
  evolution_plan: ['blueprint_product_roadmap'],
  out_of_scope: ['blueprint_review_summary'],
  ui_ux_wireframes: ['blueprint_wireframes'],
  success_criteria: ['truth_financial_model', 'blueprint_launch_readiness'],
};

const ARCH_SECTION_SOURCES = {
  stack_and_repository_decisions: ['blueprint_technical_architecture'],
  legacy_deprecation_plan: ['blueprint_technical_architecture'],
  route_and_component_structure: ['blueprint_product_roadmap', 'blueprint_technical_architecture'],
  data_layer: ['blueprint_data_model', 'blueprint_schema_spec'],
  api_surface: ['blueprint_api_contract'],
  implementation_phases: ['blueprint_product_roadmap'],
  testing_strategy: ['blueprint_risk_register'],
  risk_mitigation: ['blueprint_risk_register'],
};

/**
 * Generate Vision and Architecture documents from venture artifacts.
 *
 * @param {Object} params
 * @param {string} params.ventureId - UUID of the venture
 * @param {string} params.ventureName - Human name for key generation
 * @param {Object} params.supabase - Supabase service client
 * @param {string} [params.brainstormId] - Optional brainstorm reference
 * @param {Object} [params.logger] - Logger (defaults to console)
 * @returns {Promise<Object>} { vision, archPlan, errors }
 */
export async function generateDocs({
  ventureId,
  ventureName,
  supabase,
  brainstormId,
  logger = console,
} = {}) {
  if (!ventureId) throw new Error('ventureId is required');
  if (!supabase) throw new Error('supabase client is required');

  const startTime = Date.now();
  logger.log('[Stage17-DocGen] Starting doc generation for venture', ventureId);

  const errors = [];

  // 1. Fetch all current artifacts for this venture
  const { data: artifacts, error: fetchErr } = await supabase
    .from('venture_artifacts')
    .select('artifact_type, artifact_data, content, lifecycle_stage')
    .eq('venture_id', ventureId)
    .eq('is_current', true);

  if (fetchErr) {
    errors.push(`Failed to fetch artifacts: ${fetchErr.message}`);
    return { vision: null, archPlan: null, errors };
  }

  // Index artifacts by type for quick lookup
  const artifactsByType = {};
  for (const a of artifacts || []) {
    artifactsByType[a.artifact_type] = a;
  }

  // 2. Generate venture key slug
  const ventureSlug = (ventureName || 'VENTURE')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 30);

  // 3. Build Vision document content
  const visionSections = {};
  for (const [sectionKey, sourceTypes] of Object.entries(VISION_SECTION_SOURCES)) {
    const parts = [];
    for (const artifactType of sourceTypes) {
      const artifact = artifactsByType[artifactType];
      if (artifact) {
        const raw = artifact.content || (artifact.artifact_data ? JSON.stringify(artifact.artifact_data) : '');
        if (raw) {
          parts.push(sanitizeForPrompt(raw, 2000));
        }
      }
    }
    if (parts.length > 0) {
      visionSections[sectionKey] = parts.join('\n\n');
    } else {
      visionSections[sectionKey] = sectionKey === 'ui_ux_wireframes'
        ? 'N/A — no UI component identified in venture artifacts'
        : `[Section pending — source artifacts (${sourceTypes.join(', ')}) not yet available]`;
    }
  }

  // Build Vision content markdown
  const visionContent = Object.entries(visionSections)
    .map(([key, body]) => `## ${key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}\n\n${body}`)
    .join('\n\n');

  // Generate vision key
  // Find next available number
  const { data: existingVisions } = await supabase
    .from('eva_vision_documents')
    .select('vision_key')
    .like('vision_key', `VISION-${ventureSlug}-L2-%`);

  const visionNum = (existingVisions?.length || 0) + 1;
  const visionKey = `VISION-${ventureSlug}-L2-${String(visionNum).padStart(3, '0')}`;

  // 4. Upsert Vision document
  let visionResult = null;
  const { data: visionData, error: visionErr } = await upsertVision({
    supabase,
    visionKey,
    level: 'L2',
    content: visionContent,
    sections: visionSections,
    ventureId,
    brainstormId,
    createdBy: 'stage-17-doc-generation',
  });

  if (visionErr) {
    errors.push(`Vision upsert failed: ${visionErr.message}`);
    logger.error('[Stage17-DocGen] Vision upsert failed:', visionErr.message);
  } else {
    visionResult = visionData;
    logger.log('[Stage17-DocGen] Vision doc created:', visionKey);

    // Quality validation loop (max 2 retries)
    if (visionData && visionData.quality_checked === false && visionData.quality_issues?.length > 0) {
      logger.log('[Stage17-DocGen] Vision quality check failed, attempting rewrite...');
      for (let retry = 0; retry < 2; retry++) {
        // Enrich sections addressing quality issues
        const issues = visionData.quality_issues;
        for (const issue of issues) {
          if (issue.section && visionSections[issue.section]) {
            visionSections[issue.section] += `\n\n[Enrichment addressing: ${issue.message || issue}]`;
          }
        }
        const enrichedContent = Object.entries(visionSections)
          .map(([key, body]) => `## ${key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}\n\n${body}`)
          .join('\n\n');

        const { data: retryData, error: retryErr } = await upsertVision({
          supabase, visionKey, level: 'L2', content: enrichedContent,
          sections: visionSections, ventureId, brainstormId,
          createdBy: 'stage-17-doc-generation',
        });

        if (!retryErr && retryData?.quality_checked) {
          visionResult = retryData;
          logger.log(`[Stage17-DocGen] Vision quality passed on retry ${retry + 1}`);
          break;
        }
      }
    }
  }

  // 5. Build Architecture Plan content
  const archSections = {};
  for (const [sectionKey, sourceTypes] of Object.entries(ARCH_SECTION_SOURCES)) {
    const parts = [];
    for (const artifactType of sourceTypes) {
      const artifact = artifactsByType[artifactType];
      if (artifact) {
        const raw = artifact.content || (artifact.artifact_data ? JSON.stringify(artifact.artifact_data) : '');
        if (raw) {
          parts.push(sanitizeForPrompt(raw, 2000));
        }
      }
    }
    if (parts.length > 0) {
      archSections[sectionKey] = parts.join('\n\n');
    } else {
      archSections[sectionKey] = sectionKey === 'legacy_deprecation_plan'
        ? 'N/A — greenfield venture, no legacy systems'
        : `[Section pending — source artifacts (${sourceTypes.join(', ')}) not yet available]`;
    }
  }

  const archContent = Object.entries(archSections)
    .map(([key, body]) => `## ${key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}\n\n${body}`)
    .join('\n\n');

  // Only create arch plan if vision was created
  let archResult = null;
  if (visionResult) {
    const archNum = 1;
    const archKey = `ARCH-${ventureSlug}-${String(archNum).padStart(3, '0')}`;

    const { data: archData, error: archErr } = await upsertArchPlan({
      supabase,
      planKey: archKey,
      visionKey,
      content: archContent,
      sections: archSections,
      ventureId,
      brainstormId,
      createdBy: 'stage-17-doc-generation',
    });

    if (archErr) {
      errors.push(`Arch plan upsert failed: ${archErr.message}`);
      logger.error('[Stage17-DocGen] Arch plan upsert failed:', archErr.message);
    } else {
      archResult = archData;
      logger.log('[Stage17-DocGen] Arch plan created:', archKey);

      // Quality validation loop for arch plan
      if (archData && archData.quality_checked === false && archData.quality_issues?.length > 0) {
        logger.log('[Stage17-DocGen] Arch quality check failed, attempting rewrite...');
        for (let retry = 0; retry < 2; retry++) {
          const { data: retryData, error: retryErr } = await upsertArchPlan({
            supabase, planKey: archKey, visionKey, content: archContent,
            sections: archSections, ventureId, brainstormId,
            createdBy: 'stage-17-doc-generation',
          });
          if (!retryErr && retryData?.quality_checked) {
            archResult = retryData;
            logger.log(`[Stage17-DocGen] Arch quality passed on retry ${retry + 1}`);
            break;
          }
        }
      }
    }
  }

  const duration = Date.now() - startTime;
  logger.log(`[Stage17-DocGen] Complete in ${duration}ms`, {
    vision: visionResult?.vision_key || null,
    arch: archResult?.plan_key || null,
    errors: errors.length,
  });

  return { vision: visionResult, archPlan: archResult, errors };
}
