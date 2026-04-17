/**
 * Stage 17 Archetype Generation Engine
 *
 * Generates 6 distinct HTML design archetypes per screen by calling Claude
 * with each stitch_design_export artifact and locked brand token constraints.
 * Results are persisted as s17_archetypes venture_artifacts — one artifact
 * per screen (containing all 6 variants), discriminated by metadata.screenId.
 *
 * Exports:
 *   generateArchetypes(ventureId, supabase) — generate 6 archetypes per screen
 *
 * SD-MAN-ORCH-STAGE-DESIGN-REFINEMENT-001-A
 * SD-S17-DESIGN-INTELLIGENCE-ORCH-001-A (per-screen storage migration)
 * @module lib/eva/stage-17/archetype-generator
 */

import { getTokenConstraints } from './token-manifest.js';
import { writeArtifact } from '../artifact-persistence-service.js';
import { classifyPageType, getArchetypesForPageType } from './page-type-classifier.js';

/** Fallback layouts used when page-type classification fails. */
const FALLBACK_LAYOUTS = [
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
 * @param {object} [options]
 * @param {string} [options.pageType] - Classified page type (e.g., 'landing', 'dashboard')
 * @returns {string} prompt text
 */
function buildArchetypePrompt(screenHtml, tokens, layoutDescription, variantIndex, options = {}) {
  const colorList = (tokens?.colors ?? []).slice(0, 5).join(', ') || 'brand primary, brand secondary, neutral';
  const headingFont = tokens?.typeScale?.heading ?? 'serif';
  const bodyFont = tokens?.typeScale?.body ?? 'sans-serif';

  const pageTypeContext = options.pageType
    ? `\nPAGE TYPE: ${options.pageType} — this is a ${options.pageType} screen. Your layout must serve its primary purpose.\n`
    : '';

  // Device-specific instructions (SD-S17-DESIGN-INTELLIGENCE-ORCH-001-C)
  const deviceType = options.deviceType ?? 'DESKTOP';
  const deviceInstructions = deviceType === 'MOBILE'
    ? `
DEVICE FORMAT: MOBILE — design for touch interaction on a 375px viewport.
- Use bottom navigation (position: fixed/sticky; bottom: 0) for primary destinations
- All interactive elements ≥48px tap target (buttons, links, form controls)
- Single-column layout — no sidebars, no multi-column grids on narrow viewport
- Body font-size ≥16px (prevents iOS input zoom)
- Images max-width: 100%, full-width cards
- Primary CTA in bottom half of viewport (thumb zone)
- 32-64px vertical spacing between sections`
    : `
DEVICE FORMAT: DESKTOP — design for pointer/keyboard interaction on a 1440px viewport.
- Use sidebar navigation or visible top nav (not hamburger for <7 items)
- Multi-column layout at ≥1024px (sidebar + main, or 2-3 column grid)
- Reading content constrained to 65-80ch max-width
- Include :hover states on all interactive elements (color shift, elevation, or transform)
- Include :focus-visible with ≥3px visible ring
- Hover-reveal details where appropriate (tooltips, expanded previews)
- Rich spacing: 48-80px section gaps, generous padding`;

  return `You are a senior UI designer creating HTML design archetypes. Generate a complete, self-contained HTML page as Archetype Variant ${variantIndex} of 6 for this screen.
${pageTypeContext}${deviceInstructions}

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
4. Implement the specified layout approach distinctly for the ${deviceType === 'MOBILE' ? 'mobile' : 'desktop'} format
5. Preserve all content elements from the source screen
6. Output ONLY the HTML — no explanation, no markdown fences`;
}

/**
 * Generate 6 HTML design archetypes for each stitch screen artifact.
 * Writes one s17_archetypes artifact per screen (containing all 6 variants),
 * using metadata.screenId to discriminate per-screen rows in the unique index.
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
  const totalScreens = stitchArtifacts.length;

  // 4. Generate 6 archetypes per screen, writing ONE artifact per screen
  for (let screenIdx = 0; screenIdx < stitchArtifacts.length; screenIdx++) {
    const screenArtifact = stitchArtifacts[screenIdx];
    const screenId = screenArtifact.metadata?.screen_id ?? screenArtifact.id;
    const screenHtml = screenArtifact.content
      || JSON.stringify(screenArtifact.artifact_data ?? {});
    const screenTitle = screenArtifact.title
      ?? screenArtifact.metadata?.screenName
      ?? `screen-${screenId.slice(0, 8)}`;
    const screenPrompt = screenArtifact.metadata?.prompt ?? '';

    // Extract device type from screen metadata (SD-S17-DESIGN-INTELLIGENCE-ORCH-001-C)
    const deviceType = screenArtifact.metadata?.deviceType ?? 'DESKTOP';

    // Classify page type for this screen (SD-S17-DESIGN-INTELLIGENCE-ORCH-001-B)
    const classification = classifyPageType(screenTitle, screenPrompt);
    const layouts = classification.confidence >= 0.5
      ? getArchetypesForPageType(classification.pageType)
      : FALLBACK_LAYOUTS;
    console.log(`[archetype-generator] ${screenTitle} → pageType=${classification.pageType}, deviceType=${deviceType} (confidence=${classification.confidence})`);

    const variants = [];

    for (let i = 0; i < 6; i++) {
      const prompt = buildArchetypePrompt(screenHtml, tokens, layouts[i], i + 1, { pageType: classification.pageType, deviceType });

      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      });

      const archetypeHtml = response.content[0]?.text ?? '';

      variants.push({
        variantIndex: i + 1,
        layoutDescription: layouts[i],
        html: archetypeHtml,
      });

      console.log(`[archetype-generator] ${screenTitle} variant ${i + 1}/6 complete (${archetypeHtml.length} chars)`);
    }

    // Write all 6 variants as ONE per-screen artifact.
    // The unique index discriminates by metadata.screenId, so each screen
    // gets its own is_current=true row.
    const artifactId = await writeArtifact(supabase, {
      ventureId,
      lifecycleStage: 17,
      artifactType: 's17_archetypes',
      title: `${screenTitle} — 6 Archetypes`,
      content: JSON.stringify({ screenName: screenTitle, pageType: classification.pageType, deviceType, variants }),
      artifactData: {
        screenId,
        screenName: screenTitle,
        pageType: classification.pageType,
        pageTypeConfidence: classification.confidence,
        deviceType,
        variantCount: variants.length,
        completedScreens: screenIdx + 1,
        totalScreens,
      },
      qualityScore: 80,
      validationStatus: 'pending',
      source: 'stage-17-archetype-generator',
      metadata: {
        screenId,
        pageType: classification.pageType,
        deviceType,
        sourceArtifactId: screenArtifact.id,
        tokensApplied: !!tokens,
      },
    });

    artifactIds.push(artifactId);
    console.log(`[archetype-generator] Screen "${screenTitle}" complete (${screenIdx + 1}/${totalScreens})`);
  }

  return { screenCount: totalScreens, artifactIds };
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
    const prompt = `You are a senior UI designer refining chosen design archetypes. Generate Refined Variant ${i + 1} of 4 by synthesizing the best elements of the two chosen archetypes below.

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
