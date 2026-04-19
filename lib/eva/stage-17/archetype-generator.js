/**
 * Stage 17 Archetype Generation Engine
 *
 * Generates 4 distinct HTML design archetypes per screen using wireframe_screens
 * artifact and locked brand token constraints. Results are persisted as
 * s17_archetypes venture_artifacts — one artifact per screen (containing all
 * 4 variants), discriminated by metadata.screenId.
 *
 * SD-MAN-REFAC-S17-SIMPLIFY-PIPELINE-001: Reduced to 4 variants, removed LLM scoring.
 *
 * Exports:
 *   generateArchetypes(ventureId, supabase) — generate 4 archetypes per screen
 *
 * SD-MAN-ORCH-STAGE-DESIGN-REFINEMENT-001-A
 * SD-S17-DESIGN-INTELLIGENCE-ORCH-001-A (per-screen storage migration)
 * @module lib/eva/stage-17/archetype-generator
 */

import { getTokenConstraints } from './token-manifest.js';
import { writeArtifact } from '../artifact-persistence-service.js';
import { classifyPageType, getArchetypesForPageType } from './page-type-classifier.js';
// SD-MAN-REFAC-S17-SIMPLIFY-PIPELINE-001: LLM scoring removed, deterministic only

/**
 * Query venture_artifacts for screens that already have completed s17_archetypes.
 * Used for stateless resume: generation skips screens whose artifacts already exist.
 *
 * @param {object} supabase
 * @param {string} ventureId
 * @returns {Promise<Set<string>>} Set of completed screenId values
 */
async function getCompletedScreens(supabase, ventureId) {
  const { data } = await supabase
    .from('venture_artifacts')
    .select('metadata')
    .eq('venture_id', ventureId)
    .eq('artifact_type', 's17_archetypes')
    .eq('lifecycle_stage', 17)
    .eq('is_current', true);

  const completed = new Set();
  for (const row of data ?? []) {
    const screenId = row.metadata?.screenId;
    if (screenId) completed.add(screenId);
  }
  return completed;
}

/** Fallback layouts used when page-type classification fails.
 * SD-MAN-REFAC-S17-SIMPLIFY-PIPELINE-001: Reduced from 6 to 4 variants. */
const FALLBACK_LAYOUTS = [
  'hero-centric with full-width header and content below',
  'card-grid layout with equal-weight content tiles',
  'sidebar navigation with content-right panel',
  'single-column minimal with generous whitespace',
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
 * Fetch wireframe_screens artifact for a venture (primary source).
 * Falls back to stitch_design_export for backward compatibility with
 * ventures that completed S15 before the Stitch replacement.
 *
 * @param {object} supabase
 * @param {string} ventureId
 * @returns {Promise<{ source: 'wireframe_screens'|'stitch_design_export', artifact: object|null }>}
 */
async function fetchScreenSourceArtifact(supabase, ventureId) {
  const { data: wireframeArt } = await supabase
    .from('venture_artifacts')
    .select('id, artifact_type, artifact_data, content, metadata, title')
    .eq('venture_id', ventureId)
    .eq('artifact_type', 'wireframe_screens')
    .eq('is_current', true)
    .limit(1)
    .maybeSingle();

  return { source: 'wireframe_screens', artifact: wireframeArt ?? null };
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

  // Rubric awareness and distinctive move requirement (SD-S17-DESIGN-INTELLIGENCE-ORCH-001-F)
  const platformWeights = deviceType === 'MOBILE'
    ? `Platform-specific (MOBILE, 40% total):
- Touch Ergonomics (M1, 12%): All targets ≥48px, spacing ≥8px between targets
- Thumb-Zone Reachability (M2, 8%): Primary CTAs in bottom half, bottom nav
- Single-Column Flow (M3, 10%): No horizontal overflow at 375px, vertical stacking
- Mobile Nav (M4, 10%): Bottom nav for ≤5 items, hamburger only for >5`
    : `Platform-specific (DESKTOP, 40% total):
- Spatial Efficiency (D1, 12%): Multi-column at ≥1024px, no wasted whitespace
- Information Density (D2, 10%): Appropriate density for page type
- Desktop Nav (D3, 8%): Visible sidebar/top nav, breadcrumbs for deep hierarchies
- Hover/Keyboard (D4, 10%): :hover on all interactives, :focus-visible, shortcuts`;

  const rubricGuidance = `
SCORING RUBRIC AWARENESS (your output will be scored on these dimensions):
Universal (60% total):
- Visual Hierarchy (U1, 10%): Single H1, clear heading ramp, one dominant focal point
- Typography (U2, 7%): Body ≥16px, line-height 1.4-1.65, ≤2 font families, measure 45-75ch
- Layout Structure (U3, 9%): Spacing snaps to 4/8px grid, ≤8 distinct spacing values, grid/flex
- Brand Consistency (U4, 7%): Use CSS custom properties (var(--token)) for ≥80% of color values
- Accessibility (U5, 10%): WCAG AAA contrast (7:1 text), semantic HTML, :focus-visible, prefers-reduced-motion
- Task Clarity (U6, 8%): One unmistakable primary CTA, above the fold
- Design Distinctiveness (U7, 9%): NON-TEMPLATE design. Avoid cookie-cutter patterns. Take a deliberate risk.
${platformWeights}

QUALITY DEFAULTS (from scoring rubric Appendix B):
1. Use declared brand tokens (CSS custom properties) for ≥80% of color/spacing values
2. Include :hover, :focus-visible, and @media (prefers-reduced-motion) rules
3. Target WCAG AAA contrast (7:1 normal text) — fall to AA only when design-critical
4. Use semantic HTML: <nav>, <main>, <header>, <footer>, <button>, <article>

DISTINCTIVE MOVE REQUIREMENT:
Take ONE intentional design risk per variant — a typographic choice, layout asymmetry, color pairing,
editorial touch, or non-template component treatment. Annotate it with an HTML comment:
<!-- distinctive move: [describe your deliberate design choice] -->
This is MANDATORY. Variants without a distinctive move score poorly on U7.`;

  return `You are a senior UI designer creating HTML design archetypes. Generate a complete, self-contained HTML page as Archetype Variant ${variantIndex} of 4 for this screen.
${pageTypeContext}${deviceInstructions}
${rubricGuidance}

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
2. Apply the locked brand colors using CSS custom properties (var(--token-name))
3. Use the locked fonts via font-family declarations
4. Implement the specified layout approach distinctly for the ${deviceType === 'MOBILE' ? 'mobile' : 'desktop'} format
5. Preserve all content elements from the source screen
6. Include one <!-- distinctive move: ... --> HTML comment (MANDATORY)
7. Output ONLY the HTML — no explanation, no markdown fences`;
}

/**
 * Generate 6 HTML design archetypes for each stitch screen artifact.
 * Writes one s17_archetypes artifact per screen (containing all 6 variants),
 * using metadata.screenId to discriminate per-screen rows in the unique index.
 *
 * @param {string} ventureId
 * @param {object} supabase - Supabase service client
 * @param {object} [options]
 * @param {AbortSignal} [options.signal] - AbortSignal to cancel generation between screens
 * @returns {Promise<{ screenCount: number, artifactIds: string[], cancelled?: boolean }>}
 * @throws {ArchetypeGenerationError} if no stitch_design_export artifacts found
 */
export async function generateArchetypes(ventureId, supabase, options = {}) {
  const { signal } = options;

  // 1. Load screen source — wireframe_screens (primary) or stitch_design_export (legacy fallback)
  // SD-LEO-ORCH-REPLACE-GOOGLE-STITCH-001-A
  const { source: screenSource, artifact: sourceArt } = await fetchScreenSourceArtifact(supabase, ventureId);
  console.log(`[archetype-generator] Screen source: ${screenSource}`);

  // Build unified screen list from whichever source we found
  let screenList = [];     // [{ screen_id, screen_name, description, deviceType, html?, png? }]
  let sourceArtifactId = null;

  if (!sourceArt) {
    throw new ArchetypeGenerationError(
      `No wireframe_screens artifact found for venture ${ventureId}. ` +
      'Stage 15 must complete before Stage 17 archetype generation.'
    );
  }

  sourceArtifactId = sourceArt.id;
  const screens = sourceArt.artifact_data?.screens ?? [];
  if (!screens.length) {
    throw new ArchetypeGenerationError(
      `wireframe_screens artifact found but contains no screens for venture ${ventureId}.`
    );
  }
  screenList = screens.map((s, idx) => ({
    screen_id: s.screen_id ?? `screen-${idx}`,
    screen_name: s.screen_name ?? s.name ?? `Screen ${idx + 1}`,
    description: s.description ?? '',
    deviceType: s.deviceType ?? 'DESKTOP',
    html: null,
    png: null,
  }));

  console.log(`[archetype-generator] ${screenList.length} screens to process (source: ${screenSource})`);

  // 1b. Resume: check which screens already have completed artifacts
  const completedScreens = await getCompletedScreens(supabase, ventureId);
  if (completedScreens.size > 0) {
    console.log(`[archetype-generator] Resume: ${completedScreens.size}/${screenList.length} screens already completed, skipping`);
  }

  // 2. Load brand token manifest
  const tokens = await getTokenConstraints(ventureId, supabase);

  // 3. Import LLM client — use Anthropic Claude for design generation
  const { getLLMClient } = await import('../../llm/client-factory.js');
  const { getClaudeModel } = await import('../../config/model-config.js');
  const generationModel = getClaudeModel('generation'); // claude-opus-4-6 or newer
  const client = getLLMClient({ purpose: 'generation', provider: 'anthropic', model: generationModel });

  const artifactIds = [];
  const totalScreens = screenList.length;

  // Progress log — written to s17_session_state artifact for frontend consumption
  const progressLog = [];
  const updateProgress = async (entry) => {
    progressLog.push(entry);
    try {
      await writeArtifact(supabase, {
        ventureId,
        lifecycleStage: 17,
        artifactType: 's17_session_state',
        title: 'Generation Progress',
        content: JSON.stringify({ log: progressLog, updatedAt: new Date().toISOString() }),
        artifactData: { totalScreens, completedScreens: artifactIds.length, log: progressLog },
        qualityScore: null,
        validationStatus: null,
        source: 'stage-17-archetype-generator',
        metadata: { progressUpdate: true },
      });
    } catch (e) { console.warn('[archetype-generator] Progress write failed:', e.message); }
  };

  // 4. Generate 4 archetypes per screen
  for (let screenIdx = 0; screenIdx < screenList.length; screenIdx++) {
    if (signal?.aborted) {
      console.info(`[archetype-generator] Cancelled after ${screenIdx}/${totalScreens} screens (${artifactIds.length} artifacts written)`);
      return { screenCount: screenIdx, artifactIds, cancelled: true };
    }
    const screen = screenList[screenIdx];
    const screenId = screen.screen_id;

    if (completedScreens.has(screenId)) {
      console.log(`[archetype-generator] Skipping ${screenId} (already completed)`);
      continue;
    }

    const screenTitle = screen.screen_name;
    const deviceType = screen.deviceType;

    // Build source content from wireframe screen description
    const screenHtml = screen.description
      ? `<!-- Wireframe: ${screenTitle} -->\n<div class="wireframe-description">\n<h1>${screenTitle}</h1>\n<p>${screen.description}</p>\n</div>`
      : `<div><h1>${screenTitle}</h1><p>Screen design for ${deviceType} viewport</p></div>`;


    // Classify page type
    const classification = classifyPageType(screenTitle, screen.description);
    const layouts = classification.confidence >= 0.5
      ? getArchetypesForPageType(classification.pageType)
      : FALLBACK_LAYOUTS;
    const variantCount = layouts.length;
    console.log(`[archetype-generator] ┌── Screen ${screenIdx + 1}/${totalScreens}: ${screenTitle} (${deviceType})`);
    console.log(`[archetype-generator] │   pageType=${classification.pageType} (confidence=${classification.confidence}), generating ${variantCount} variants`);

    const variants = [];
    const screenStartTime = Date.now();

    for (let i = 0; i < variantCount; i++) {
      const variantStart = Date.now();
      const promptText = buildArchetypePrompt(screenHtml, tokens, layouts[i], i + 1, { pageType: classification.pageType, deviceType });

      const userContent = [];
      if (screen.png) {
        userContent.push({
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: screen.png }
        });
      }
      userContent.push({ type: 'text', text: promptText });

      const archetypeResult = await client.complete(
        'You are a senior UI designer creating static visual mockup HTML. Generate a complete, self-contained HTML page based on the screen description and brand constraints. Return only the complete HTML.',
        userContent,
        { stream: true, timeout: 300000, cacheTTLMs: 0, maxTokens: 32768, purpose: 'content-generation' }
      );
      const archetypeHtml = archetypeResult?.content ?? String(archetypeResult);
      const variantSec = ((Date.now() - variantStart) / 1000).toFixed(0);

      variants.push({
        variantIndex: i + 1,
        layoutDescription: layouts[i],
        html: archetypeHtml,
      });

      console.log(`[archetype-generator] │   variant ${i + 1}/${variantCount}: ${layouts[i].slice(0, 40)} — ${archetypeHtml.length} chars (${variantSec}s)`);
      await updateProgress({ type: 'variant', screen: screenTitle, screenIdx: screenIdx + 1, variant: i + 1, totalVariants: variantCount, chars: archetypeHtml.length, seconds: parseInt(variantSec), layout: layouts[i].slice(0, 50) });
    }

    const screenSec = ((Date.now() - screenStartTime) / 1000).toFixed(0);

    const artifactId = await writeArtifact(supabase, {
      ventureId,
      lifecycleStage: 17,
      artifactType: 's17_archetypes',
      title: `${screenTitle} — 4 Archetypes`,
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
        sourceArtifactId,
        screenSource,
        tokensApplied: !!tokens,
      },
    });

    artifactIds.push(artifactId);
    const remaining = totalScreens - (screenIdx + 1);
    const avgPerScreen = remaining > 0 ? ` (~${Math.round(remaining * parseInt(screenSec) / 60)}m remaining)` : '';
    console.log(`[archetype-generator] └── Screen "${screenTitle}" saved — ${screenIdx + 1}/${totalScreens} complete (${screenSec}s)${avgPerScreen}`);
    await updateProgress({ type: 'screen_complete', screen: screenTitle, screenIdx: screenIdx + 1, totalScreens, seconds: parseInt(screenSec), remaining });

    // SD-MAN-REFAC-S17-SIMPLIFY-PIPELINE-001: LLM scoring removed.
    // Deterministic scoring (CSS/HTML signals) applied at frontend display time.
  }

  console.log(`[archetype-generator] ═══ GENERATION COMPLETE: ${artifactIds.length}/${totalScreens} screens, ${artifactIds.length * 4} variants total ═══`);
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
  const { getLLMClient } = await import('../../llm/client-factory.js');
  const client = getLLMClient({ purpose: 'generation' });

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

    const refinedResult = await client.complete(
      'You are a senior UI designer refining chosen design archetypes. Return only the complete HTML.',
      prompt,
      { stream: true, timeout: 120000, cacheTTLMs: 0, maxTokens: 32768, purpose: 'content-generation' }
    );
    const refinedHtml = refinedResult?.content ?? String(refinedResult);

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
