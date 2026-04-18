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
import { scoreVariants } from './scoring-engine.js';

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

  return `You are a senior UI designer creating HTML design archetypes. Generate a complete, self-contained HTML page as Archetype Variant ${variantIndex} of 6 for this screen.
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
  // 1. Load the single stitch_design_export artifact containing all screens
  const { data: exportArt } = await supabase
    .from('venture_artifacts')
    .select('id, metadata')
    .eq('venture_id', ventureId)
    .eq('artifact_type', 'stitch_design_export')
    .eq('is_current', true)
    .limit(1)
    .maybeSingle();

  if (!exportArt?.metadata?.html_files?.length) {
    throw new ArchetypeGenerationError(
      `No stitch_design_export with html_files found for venture ${ventureId}. ` +
      'Stage 15/16 Stitch export must complete before Stage 17 archetype generation.'
    );
  }

  const htmlFiles = exportArt.metadata.html_files;     // [{ screen_id, html (URL), size }]
  const pngFiles = exportArt.metadata.png_files_base64 ?? [];
  const pngMap = new Map();
  for (const png of pngFiles) {
    if (png.screen_id && png.base64) pngMap.set(png.screen_id, png.base64);
  }

  // 1b. Load screen names and deviceType from S15 stitch_curation artifact
  const { data: curationArt } = await supabase
    .from('venture_artifacts')
    .select('artifact_data')
    .eq('venture_id', ventureId)
    .eq('artifact_type', 'stitch_curation')
    .eq('lifecycle_stage', 15)
    .limit(1)
    .maybeSingle();
  const screenPrompts = curationArt?.artifact_data?.screen_prompts ?? [];
  const screenNameMap = new Map();
  const deviceTypeMap = new Map();
  const genResults = curationArt?.artifact_data?.generation_results ?? [];
  for (let i = 0; i < screenPrompts.length; i++) {
    const id = genResults[i]?.screen_id ?? htmlFiles[i]?.screen_id;
    // Screen name: try screen_name, _screenName, screenName (provisioner uses different conventions)
    const name = screenPrompts[i]?.screen_name ?? screenPrompts[i]?._screenName ?? screenPrompts[i]?.screenName;
    const device = screenPrompts[i]?.deviceType ?? 'DESKTOP';
    if (id && name) screenNameMap.set(id, name);
    if (id) deviceTypeMap.set(id, device);
  }

  console.log(`[archetype-generator] ${htmlFiles.length} screens to process, ${screenPrompts.length} prompts loaded`);

  // 1c. Resume: check which screens already have completed artifacts
  const completedScreens = await getCompletedScreens(supabase, ventureId);
  if (completedScreens.size > 0) {
    console.log(`[archetype-generator] Resume: ${completedScreens.size}/${htmlFiles.length} screens already completed, skipping`);
  }

  // 2. Load brand token manifest
  const tokens = await getTokenConstraints(ventureId, supabase);

  // 3. Import LLM client
  const { getLLMClient } = await import('../../llm/client-factory.js');
  const client = getLLMClient({ provider: 'anthropic', model: 'claude-opus-4-7' });

  const artifactIds = [];
  const totalScreens = htmlFiles.length;

  // 4. Generate 6 archetypes per screen, writing ONE artifact per screen
  for (let screenIdx = 0; screenIdx < htmlFiles.length; screenIdx++) {
    if (signal?.aborted) {
      console.info(`[archetype-generator] Cancelled after ${screenIdx}/${totalScreens} screens (${artifactIds.length} artifacts written)`);
      return { screenCount: screenIdx, artifactIds, cancelled: true };
    }
    const screenFile = htmlFiles[screenIdx];
    const screenId = screenFile.screen_id ?? `screen-${screenIdx}`;

    // Resume: skip screens that already have completed artifacts
    if (completedScreens.has(screenId)) {
      console.log(`[archetype-generator] Skipping ${screenId} (already completed)`);
      continue;
    }
    const screenTitle = screenNameMap.get(screenId)
      ?? screenPrompts[screenIdx]?.screen_name
      ?? screenPrompts[screenIdx]?._screenName
      ?? `Screen ${screenIdx + 1}`;
    const screenPromptText = screenPrompts[screenIdx]?.prompt ?? screenPrompts[screenIdx]?.text ?? '';

    // Fetch actual HTML content from the download URL
    let screenHtml = '';
    try {
      const res = await fetch(screenFile.html);
      if (res.ok) screenHtml = await res.text();
      else console.warn(`[archetype-generator] Failed to fetch HTML for ${screenTitle}: ${res.status}`);
    } catch (err) {
      console.warn(`[archetype-generator] HTML fetch error for ${screenTitle}: ${err.message}`);
    }
    if (!screenHtml) {
      console.warn(`[archetype-generator] Skipping ${screenTitle} — no HTML content`);
      continue;
    }

    // Extract device type from curation prompt metadata (SD-S17-DESIGN-INTELLIGENCE-ORCH-001-C)
    const deviceType = deviceTypeMap.get(screenId) ?? screenPrompts[screenIdx]?.deviceType ?? 'DESKTOP';

    // Classify page type for this screen (SD-S17-DESIGN-INTELLIGENCE-ORCH-001-B)
    const classification = classifyPageType(screenTitle, screenPromptText);
    const layouts = classification.confidence >= 0.5
      ? getArchetypesForPageType(classification.pageType)
      : FALLBACK_LAYOUTS;
    console.log(`[archetype-generator] ${screenTitle} → pageType=${classification.pageType}, deviceType=${deviceType} (confidence=${classification.confidence})`);

    const variants = [];

    const pngBase64 = pngMap.get(screenId);

    for (let i = 0; i < 6; i++) {
      const promptText = buildArchetypePrompt(screenHtml, tokens, layouts[i], i + 1, { pageType: classification.pageType, deviceType });

      // Build multimodal prompt: PNG screenshot (visual reference) + text prompt
      const userContent = [];
      if (pngBase64) {
        userContent.push({
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: pngBase64 }
        });
      }
      userContent.push({ type: 'text', text: promptText });

      const archetypeResult = await client.complete(
        'You are a senior UI designer creating static visual mockup HTML. You are given both a screenshot and the HTML source of the original screen. Use both to understand the design intent, then create your variant. Return only the complete HTML.',
        userContent,
        { stream: true, timeout: 120000, cacheTTLMs: 0 }
      );
      const archetypeHtml = archetypeResult?.content ?? String(archetypeResult);

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
        sourceArtifactId: exportArt.id,
        tokensApplied: !!tokens,
      },
    });

    artifactIds.push(artifactId);
    console.log(`[archetype-generator] Screen "${screenTitle}" complete (${screenIdx + 1}/${totalScreens})`);

    // Auto-score variants async (fire-and-forget — scoring failures do not block generation)
    // SD-S17-ARCHETYPE-GENERATION-RESILIENCE-ORCH-001-A: decoupled from generation loop
    scoreVariants(ventureId, screenId, variants, {
      pageType: classification.pageType,
      deviceType,
    }, supabase).then(scoringResult => {
      const bestScore = scoringResult.variants[0]?.finalScore ?? 0;
      console.log(`[archetype-generator] Scored ${screenTitle}: best=${bestScore.toFixed(1)}, anti-patterns=${scoringResult.variants[0]?.triggeredAntiPatterns?.length ?? 0}`);
    }).catch(scoreErr => {
      console.error(`[archetype-generator] Scoring FAILED for ${screenTitle}: ${scoreErr.message}`, {
        ventureId, screenId, error: scoreErr.message,
      });
    });
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
  const { getLLMClient } = await import('../../llm/client-factory.js');
  const client = getLLMClient({ provider: 'anthropic', model: 'claude-opus-4-7' });

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
      { stream: true, timeout: 120000, cacheTTLMs: 0 }
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
