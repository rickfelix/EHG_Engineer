/**
 * Stage 17 Archetype Generation Engine
 *
 * Generates 6 distinct HTML design archetypes per screen by calling Claude Sonnet
 * with each stitch_design_export artifact and locked brand token constraints.
 * Results are persisted as stage_17_archetype venture_artifacts.
 *
 * Exports:
 *   generateArchetypes(ventureId, supabase) — generate 6 archetypes per screen
 *
 * SD-MAN-ORCH-STAGE-DESIGN-REFINEMENT-001-A
 * @module lib/eva/stage-17/archetype-generator
 */

import { getTokenConstraints } from './token-manifest.js';
import { writeArtifact } from '../artifact-persistence-service.js';

const ARCHETYPE_LAYOUTS = [
  'hero-centric with full-width header and content below',
  'card-grid layout with equal-weight content tiles',
  'sidebar navigation with content-right panel',
  'single-column minimal with generous whitespace',
  'split-screen with media left and text right',
  'dashboard-style with data visualization prominence',
];

/**
 * Named error for missing Stage 15/16 source artifacts.
 */
export class ArchetypeGenerationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ArchetypeGenerationError';
  }
}

/**
 * Fetch all current stitch_design_export artifacts for a venture.
 *
 * @param {object} supabase
 * @param {string} ventureId
 * @returns {Promise<Array>} artifact rows
 */
async function fetchStitchArtifacts(supabase, ventureId) {
  const { data, error } = await supabase
    .from('venture_artifacts')
    .select('id, artifact_type, artifact_data, content, metadata, title')
    .eq('venture_id', ventureId)
    .eq('artifact_type', 'stitch_design_export')
    .eq('is_current', true)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`[archetype-generator] DB fetch error: ${error.message}`);
  return data ?? [];
}

/**
 * Build the Claude prompt for a single archetype variant.
 *
 * @param {string} screenHtml - Truncated screen HTML (max 4000 chars)
 * @param {object} tokens - Brand token manifest {colors, typeScale, spacing}
 * @param {string} layoutDescription - One of the 6 archetype layout descriptions
 * @param {number} variantIndex - 1–6
 * @returns {string} prompt text
 */
function buildArchetypePrompt(screenHtml, tokens, layoutDescription, variantIndex) {
  const colorList = (tokens?.colors ?? []).slice(0, 5).join(', ') || 'brand primary, brand secondary, neutral';
  const headingFont = tokens?.typeScale?.heading ?? 'serif';
  const bodyFont = tokens?.typeScale?.body ?? 'sans-serif';

  return `You are a senior UI designer creating HTML design archetypes. Generate a complete, self-contained HTML page as Archetype Variant ${variantIndex} of 6 for this screen.

BRAND TOKENS (LOCKED — do not deviate):
- Colors: ${colorList}
- Heading font: ${headingFont}
- Body font: ${bodyFont}
- Spacing base: 4px grid (4, 8, 16, 24, 32, 48px)

LAYOUT APPROACH: ${layoutDescription}

SOURCE SCREEN (reference for content and structure):
${screenHtml.slice(0, 4000)}

REQUIREMENTS:
1. Produce one complete HTML document with inline CSS only (no external links)
2. Apply the locked brand colors using CSS custom properties
3. Use the locked fonts via font-family declarations
4. Implement the specified layout approach distinctly
5. Preserve all content elements from the source screen
6. Output ONLY the HTML — no explanation, no markdown fences`;
}

/**
 * Generate 6 HTML design archetypes for each stitch screen artifact.
 * Writes stage_17_archetype venture_artifacts (6 per screen).
 *
 * @param {string} ventureId
 * @param {object} supabase - Supabase service client
 * @returns {Promise<{ screenCount: number, artifactIds: string[] }>}
 * @throws {ArchetypeGenerationError} if no stitch_design_export artifacts found
 */
export async function generateArchetypes(ventureId, supabase) {
  // 1. Load source stitch artifacts
  const stitchArtifacts = await fetchStitchArtifacts(supabase, ventureId);

  if (stitchArtifacts.length === 0) {
    throw new ArchetypeGenerationError(
      `No stitch_design_export artifacts found for venture ${ventureId}. ` +
      'Stage 15/16 Stitch export must complete before Stage 17 archetype generation.'
    );
  }

  // 2. Load brand token manifest
  const tokens = await getTokenConstraints(ventureId, supabase);

  // 3. Import LLM client
  const { createLLMClient } = await import('../../llm/client-factory.js');
  const client = await createLLMClient('sonnet');

  const artifactIds = [];

  // 4. Generate 6 archetypes per screen (sequential to avoid rate limits)
  for (const screenArtifact of stitchArtifacts) {
    const screenHtml = screenArtifact.content
      || JSON.stringify(screenArtifact.artifact_data ?? {});

    const screenTitle = screenArtifact.title ?? screenArtifact.metadata?.screenName ?? `screen-${screenArtifact.id.slice(0, 8)}`;

    for (let i = 0; i < 6; i++) {
      const prompt = buildArchetypePrompt(screenHtml, tokens, ARCHETYPE_LAYOUTS[i], i + 1);

      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      });

      const archetypeHtml = response.content[0]?.text ?? '';

      const artifactId = await writeArtifact(supabase, {
        ventureId,
        lifecycleStage: 17,
        artifactType: 'stage_17_archetype',
        title: `${screenTitle} — Archetype ${i + 1}: ${ARCHETYPE_LAYOUTS[i].split(' ')[0]}`,
        content: archetypeHtml,
        artifactData: {
          variantIndex: i + 1,
          layoutDescription: ARCHETYPE_LAYOUTS[i],
          sourceArtifactId: screenArtifact.id,
          screenName: screenTitle,
        },
        qualityScore: 80,
        validationStatus: 'pending',
        source: 'stage-17-archetype-generator',
        metadata: {
          screenArtifactId: screenArtifact.id,
          variantIndex: i + 1,
          tokensApplied: !!tokens,
        },
      });

      artifactIds.push(artifactId);
    }
  }

  return { screenCount: stitchArtifacts.length, artifactIds };
}

/**
 * Generate 4 refined variants from 2 selected archetype HTMLs.
 * Used by selection-flow.js Pass 1.
 *
 * @param {string} ventureId
 * @param {string} screenName - Screen identifier for artifact titles
 * @param {string[]} selectedHtmls - Array of 2 selected archetype HTML strings
 * @param {object} tokens - Brand token manifest
 * @param {object} supabase
 * @param {object} [options]
 * @param {string} [options.mobileContextHtml] - Approved mobile HTML for desktop reference
 * @returns {Promise<string[]>} Array of 4 artifact IDs
 */
export async function generateRefinedVariants(ventureId, screenName, selectedHtmls, tokens, supabase, options = {}) {
  const { createLLMClient } = await import('../../llm/client-factory.js');
  const client = await createLLMClient('sonnet');

  const mobileContext = options.mobileContextHtml
    ? `\n\nMOBILE REFERENCE (approved mobile design for this screen — desktop must maintain visual coherence):\n${options.mobileContextHtml.slice(0, 2000)}`
    : '';

  const colorList = (tokens?.colors ?? []).slice(0, 5).join(', ') || 'brand primary';
  const headingFont = tokens?.typeScale?.heading ?? 'serif';
  const bodyFont = tokens?.typeScale?.body ?? 'sans-serif';

  const refinementStyles = [
    'elevated visual polish with refined spacing and micro-interactions',
    'high contrast with strong typographic hierarchy',
    'warm and approachable with softer transitions',
    'minimal and focused with reduced visual noise',
  ];

  const artifactIds = [];

  for (let i = 0; i < 4; i++) {
    const prompt = `You are a senior UI designer refining selected design archetypes. Generate Refined Variant ${i + 1} of 4 by synthesizing the best elements of the two selected archetypes below.

BRAND TOKENS (LOCKED):
- Colors: ${colorList}
- Heading font: ${headingFont}
- Body font: ${bodyFont}
- Spacing: 4px grid

REFINEMENT DIRECTION: ${refinementStyles[i]}

SELECTED ARCHETYPE 1:
${selectedHtmls[0].slice(0, 2000)}

SELECTED ARCHETYPE 2:
${selectedHtmls[1].slice(0, 2000)}${mobileContext}

Produce one complete, self-contained HTML document with inline CSS. Output ONLY the HTML.`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const refinedHtml = response.content[0]?.text ?? '';

    const artifactId = await writeArtifact(supabase, {
      ventureId,
      lifecycleStage: 17,
      artifactType: 'stage_17_refined',
      title: `${screenName} — Refined ${i + 1}: ${refinementStyles[i].split(' ')[0]}`,
      content: refinedHtml,
      artifactData: {
        variantIndex: i + 1,
        refinementDirection: refinementStyles[i],
        screenName,
      },
      qualityScore: 85,
      validationStatus: 'pending',
      source: 'stage-17-archetype-generator',
      metadata: { variantIndex: i + 1 },
    });

    artifactIds.push(artifactId);
  }

  return artifactIds;
}
