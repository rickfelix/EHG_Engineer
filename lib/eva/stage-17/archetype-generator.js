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
import { classifyPageType, getArchetypesForPageType, getStrategyLayouts } from './page-type-classifier.js';
import { buildDesignBrief, formatDesignBrief } from './design-system-brief.js';
import { getStrategyReorderHints } from './strategy-stats.js';
import { buildContentBrief, formatContentBrief } from './content-brief-builder.js';
import { buildVariantSummary } from './design-mastering.js';
import { recommendStrategies } from './strategy-recommender.js';
// SD-MAN-REFAC-S17-SIMPLIFY-PIPELINE-001: LLM scoring removed, deterministic only

// SD-LEO-INFRA-S17-PROMPT-ENGINEERING-001: Professional designer prompt engineering
/**
 * Load upstream venture artifacts that inform design decisions.
 * Returns a ventureContext object with all available design-relevant data.
 * Non-blocking — missing artifacts return null fields.
 */
async function loadVentureContext(ventureId, supabase) {
  const ctx = {
    ideaBrief: null,       // Stage 1: problem, target market, value prop
    competitiveAnalysis: null, // Stage 4: competitors, differentiation
    pricingModel: null,    // Stage 7: pricing tiers, strategy
    businessModel: null,   // Stage 8: BMC value prop, customer segments
    customerPersonas: null, // Stage 10: personas, brand archetype
    brandGuidelines: null, // Stage 10: voice, visual tone, industry
    brandName: null,       // Stage 11: selected name, rationale
    productRoadmap: null,  // Stage 13: top features
    userStories: null,     // Stage 15: user stories in user language
  };

  const artifactTypes = [
    'truth_idea_brief',
    'truth_competitive_analysis',
    'engine_pricing_model',
    'engine_business_model_canvas',
    'identity_persona_brand',
    'identity_brand_guidelines',
    'identity_brand_name',
    'blueprint_product_roadmap',
    'blueprint_user_story_pack',
  ];

  try {
    const { data: artifacts } = await supabase
      .from('venture_artifacts')
      .select('artifact_type, artifact_data')
      .eq('venture_id', ventureId)
      .in('artifact_type', artifactTypes)
      .eq('is_current', true);

    for (const a of (artifacts || [])) {
      const d = a.artifact_data;
      if (!d) continue;
      switch (a.artifact_type) {
        case 'truth_idea_brief':
          ctx.ideaBrief = { problem: d.problem_statement, targetMarket: d.target_market, valueProp: d.value_proposition };
          break;
        case 'truth_competitive_analysis':
          ctx.competitiveAnalysis = { competitors: (d.competitors || []).slice(0, 3).map(c => c.name || c), differentiation: d.differentiation || d.positioning };
          break;
        case 'engine_pricing_model':
          ctx.pricingModel = { strategy: d.pricing_strategy, tiers: (d.pricing_tiers || []).slice(0, 3).map(t => t.name || t) };
          break;
        case 'engine_business_model_canvas':
          ctx.businessModel = { valueProposition: d.bmc_components?.value_prop || d.value_prop, customers: d.bmc_components?.customers || d.customers, channels: d.bmc_components?.channels };
          break;
        case 'identity_persona_brand':
          ctx.customerPersonas = {
            primary: (d.customerPersonas || d.personas || [])[0] || null,
            archetype: d.brandGenome?.archetype || d.brand?.archetype,
            values: d.brandGenome?.values || d.brand?.values,
            tone: d.brandGenome?.tone || d.brand?.tone,
            personality: d.brandPersonality || d.brand_personality,
          };
          break;
        case 'identity_brand_guidelines':
          ctx.brandGuidelines = {
            voice: d.brand_guidelines?.voice_guidelines || d.voice_guidelines,
            visualTone: d.brand_guidelines?.visual_tone || d.visual_tone,
            messagingPillars: d.brand_guidelines?.messaging_pillars || d.messaging_pillars,
            industry: d.brand_guidelines?.industry_context || d.industry_context,
          };
          break;
        case 'identity_brand_name':
          ctx.brandName = { name: d.selected_name || d.name, rationale: d.rationale };
          break;
        case 'blueprint_product_roadmap':
          ctx.productRoadmap = { topFeatures: (d.features || d.phases?.[0]?.features || []).slice(0, 5).map(f => f.name || f.title || f) };
          break;
        case 'blueprint_user_story_pack':
          ctx.userStories = (d.user_stories || d.stories || []).slice(0, 3).map(s => ({
            role: s.role || s.user_role || 'user',
            want: s.want || s.title || s.description,
            benefit: s.benefit || s.so_that || '',
          }));
          break;
      }
    }

    const loaded = Object.entries(ctx).filter(([, v]) => v !== null).map(([k]) => k);
    if (loaded.length > 0) {
      console.log(`[archetype-generator] Venture context loaded: ${loaded.join(', ')}`);
    }
  } catch (e) {
    console.warn('[archetype-generator] Venture context load failed (non-blocking):', e.message);
  }

  return ctx;
}

/**
 * Format venture context into a prompt section string.
 * Only includes sections that have data — no placeholder text.
 */
function formatVentureContext(ctx) {
  if (!ctx) return '';
  const lines = [];

  // WHO IS THIS FOR?
  const hasWho = ctx.ideaBrief || ctx.customerPersonas || ctx.brandGuidelines || ctx.businessModel;
  if (hasWho) {
    lines.push('\n═══ WHO IS THIS FOR? ═══');
    if (ctx.ideaBrief?.valueProp) lines.push(`Value Proposition: ${ctx.ideaBrief.valueProp}`);
    if (ctx.ideaBrief?.targetMarket) lines.push(`Target Market: ${ctx.ideaBrief.targetMarket}`);
    if (ctx.customerPersonas?.primary) {
      const p = ctx.customerPersonas.primary;
      lines.push(`Primary Customer: ${p.name || p.role || 'Unknown'} — ${p.description || p.demographics || p.pain_points || ''}`);
    }
    if (ctx.customerPersonas?.archetype) lines.push(`Brand Archetype: ${ctx.customerPersonas.archetype}`);
    if (ctx.customerPersonas?.values) lines.push(`Brand Values: ${Array.isArray(ctx.customerPersonas.values) ? ctx.customerPersonas.values.join(', ') : ctx.customerPersonas.values}`);
    if (ctx.brandGuidelines?.voice) lines.push(`Voice: ${ctx.brandGuidelines.voice}`);
    if (ctx.brandGuidelines?.visualTone) lines.push(`Visual Tone: ${ctx.brandGuidelines.visualTone}`);
    if (ctx.brandGuidelines?.industry) lines.push(`Industry: ${ctx.brandGuidelines.industry}`);
    if (ctx.businessModel?.valueProposition) lines.push(`Business Model: ${ctx.businessModel.valueProposition}`);
    if (ctx.pricingModel?.strategy) lines.push(`Pricing: ${ctx.pricingModel.strategy}${ctx.pricingModel.tiers?.length ? ' (' + ctx.pricingModel.tiers.join(', ') + ')' : ''}`);
  }

  // COMPETITIVE CONTEXT
  if (ctx.competitiveAnalysis) {
    lines.push('\n═══ COMPETITIVE CONTEXT ═══');
    if (ctx.competitiveAnalysis.competitors?.length) lines.push(`Competitors: ${ctx.competitiveAnalysis.competitors.join(', ')}`);
    if (ctx.competitiveAnalysis.differentiation) lines.push(`Our Angle: ${ctx.competitiveAnalysis.differentiation}`);
    lines.push('Design implication: make sure this page does NOT look like a clone of these competitors.');
  }

  // KEY FEATURES & USER NEEDS
  const hasFeatures = ctx.productRoadmap?.topFeatures?.length || ctx.userStories?.length;
  if (hasFeatures) {
    lines.push('\n═══ KEY FEATURES & USER NEEDS ═══');
    if (ctx.productRoadmap?.topFeatures?.length) {
      lines.push('Top features to highlight:');
      ctx.productRoadmap.topFeatures.forEach(f => lines.push(`  - ${f}`));
    }
    if (ctx.userStories?.length) {
      lines.push('User stories (write copy that speaks to these):');
      ctx.userStories.forEach(s => lines.push(`  - As a ${s.role}, I want ${s.want}${s.benefit ? ' so I can ' + s.benefit : ''}`));
    }
  }

  return lines.length > 0 ? lines.join('\n') : '';
}

/**
 * Query venture_artifacts for screens that already have completed s17_archetypes.
 * Used for stateless resume: generation skips screens whose artifacts already exist.
 *
 * @param {object} supabase
 * @param {string} ventureId
 * @returns {Promise<Set<string>>} Set of completed screenId values
 */
// Generation version stamped in metadata for provenance tracking (not used for auto-regeneration).
// Auto-regeneration was removed — Opus 4.7 is expensive. User clicks Regenerate explicitly.
const GENERATION_VERSION = 2; // v2: strategy-driven variants + design briefs

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
    // Any existing archetype counts as completed — never auto-regenerate
    if (screenId) completed.add(screenId);
  }
  return completed;
}

/**
 * Get WIP variant artifacts for a specific screen (PAT-PERSIST-CHECKPOINT-001).
 * Returns a Map of variantIndex → variant data for variants that have already
 * been persisted to DB. Used for sub-screen-level resume after interruption.
 *
 * @param {object} supabase
 * @param {string} ventureId
 * @param {string} screenId
 * @returns {Promise<Map<number, {html: string, layoutDescription: string}>>}
 */
async function getWipVariants(supabase, ventureId, screenId) {
  const { data } = await supabase
    .from('venture_artifacts')
    .select('artifact_data, metadata')
    .eq('venture_id', ventureId)
    .eq('artifact_type', 's17_variant_wip')
    .eq('lifecycle_stage', 17)
    .eq('is_current', true)
    .eq('metadata->>screenId', screenId);

  const wip = new Map();
  for (const row of data ?? []) {
    const idx = row.metadata?.variantIndex;
    if (idx != null && row.artifact_data?.html) {
      wip.set(idx, {
        html: row.artifact_data.html,
        layoutDescription: row.artifact_data.layoutDescription,
        strategy_name: row.metadata?.strategy_name ?? null,
      });
    }
  }
  return wip;
}

/**
 * Clean up WIP variant artifacts for a screen after the final s17_archetypes
 * artifact has been assembled. Marks them as not current (soft delete).
 *
 * @param {object} supabase
 * @param {string} ventureId
 * @param {string} screenId
 */
async function cleanupWipVariants(supabase, ventureId, screenId) {
  const { error } = await supabase
    .from('venture_artifacts')
    .update({ is_current: false, updated_at: new Date().toISOString() })
    .eq('venture_id', ventureId)
    .eq('artifact_type', 's17_variant_wip')
    .eq('lifecycle_stage', 17)
    .eq('is_current', true)
    .eq('metadata->>screenId', screenId);

  if (error) console.warn(`[archetype-generator] WIP cleanup failed for ${screenId}: ${error.message}`);
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
 * @param {string} [options.deviceType] - 'MOBILE' or 'DESKTOP'
 * @param {object} [options.designBrief] - Pre-built design brief from design-system-brief.js
 * @param {object} [options.contentBrief] - Pre-built content brief from content-brief-builder.js
 * @param {string} [options.strategyName] - Design strategy name (conversion/trust/education/engagement)
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

  // SD-LEO-INFRA-S17-PROMPT-ENGINEERING-001: Design seed for variation (1-100)
  const designSeed = options.designSeed ?? (Math.floor(Math.random() * 100) + 1);
  const seedEnergy = designSeed <= 25 ? 'bold and dramatic (large type, high contrast, dark sections)'
    : designSeed <= 50 ? 'refined and minimal (generous white space, thin type, subtle palette)'
    : designSeed <= 75 ? 'warm and editorial (magazine feel, mixed media, layered depth)'
    : 'technical and precise (data-forward, grid-heavy, structured density)';
  const seedLayout = designSeed % 2 === 1 ? 'asymmetric with left-heavy or off-center content' : 'centered hero with editorial vertical scroll';

  const rubricGuidance = `
SCORING RUBRIC (your output will be scored on these dimensions):
Universal (60%):
- Visual Hierarchy (U1, 10%): Single H1, clear heading ramp, one dominant focal point
- Typography (U2, 7%): Body ≥16px, line-height 1.4-1.65, ≤2 font families, measure 45-75ch
- Layout Structure (U3, 9%): Spacing snaps to 4/8px grid, ≤8 distinct spacing values, grid/flex
- Brand Consistency (U4, 7%): Use CSS custom properties (var(--token)) for ≥80% of color values
- Accessibility (U5, 10%): WCAG AAA contrast (7:1 text), semantic HTML, :focus-visible, prefers-reduced-motion
- Task Clarity (U6, 8%): One unmistakable primary CTA, above the fold
- Design Distinctiveness (U7, 9%): NON-TEMPLATE design. Take a deliberate creative risk.
${platformWeights}

═══ DESIGN DIRECTION (seed ${designSeed}) ═══
Energy: ${seedEnergy}
Layout bias: ${seedLayout}
Pick ONE distinctive technique from this toolkit (choose based on your seed and the brand personality):
- Oversized display heading (120px+) that bleeds near viewport edges
- Asymmetric two-column with one column offset 40-80px vertically
- Full-bleed section with text overlay using backdrop-filter: blur()
- One "hero" card breaking out of an otherwise uniform grid at 2x size
- Horizontal scroll section for testimonials or features (overflow-x: auto)
- Monochrome section punctuated by a single accent color pop
- Editorial pull quote with oversized quotation marks
- Gradient mesh or radial gradient as section background
- Split-screen layout with contrasting left/right treatments

═══ CSS ARCHITECTURE (mandatory) ═══
1. :root block with ALL tokens FIRST (colors, fonts, spacing, radius, shadows)
2. Use clamp() for responsive type: e.g. clamp(1rem, 2.5vw, 1.125rem) for body
3. Use grid-template-areas for major layout sections
4. ONE transition timing: cubic-bezier(0.25, 0.1, 0.25, 1) throughout
5. Use gap (not margin) for spacing between siblings
6. Include ONE cohesive page-load animation (@keyframes + animation-delay)
7. Include @media (prefers-reduced-motion: reduce) to disable animations
8. WCAG AAA contrast (7:1) for body text, AA (4.5:1) minimum for large text
9. Semantic HTML: <nav>, <main>, <header>, <footer>, <button>, <article>

═══ NEVER DO THESE (instant quality fail) ═══
- No centered-everything layouts (centered H1 + centered P + centered button stacked vertically)
- No icon-in-circle + heading + paragraph × 3 in a row ("features grid of death")
- No generic gradient buttons with rounded corners and drop shadows
- No uniform card grids where every card is identical size and spacing
- No more than one box-shadow per page — prefer border, backdrop-filter, or layering
- No generic hero (big stock image, dark overlay, white text, CTA) unless the seed demands drama
- No placeholder-looking content — adapt the source wireframe content with editorial intent

═══ OUTPUT FORMAT ═══
Start your HTML with this comment block (fill in ALL fields):
<!--
  DESIGN INTENT:
  Seed: ${designSeed}
  Mood: [one word — e.g., confident, playful, austere, warm]
  Customer: [who this design is meant to attract, from the context above]
  Layout thesis: [one sentence — what makes this layout non-obvious]
  Distinctive move: [which toolkit technique you chose and why it fits this brand]
  Color strategy: [how the palette creates hierarchy — not just "uses brand colors"]
-->
Then output the complete <!DOCTYPE html> through </html>.`;

  // Venture context section (SD-LEO-INFRA-S17-PROMPT-ENGINEERING-001)
  const ventureContextSection = options.ventureContext ? formatVentureContext(options.ventureContext) : '';

  // SD-S17-DESIGN-MASTERY-PIPELINE-ORCH-001-A: compose from brief modules
  const designBriefSection = options.designBrief ? formatDesignBrief(options.designBrief) : '';
  const contentBriefSection = options.contentBrief ? formatContentBrief(options.contentBrief) : '';
  const strategyDirective = options.strategyName
    ? `\nDESIGN STRATEGY: ${options.strategyName.toUpperCase()} — every design decision should serve the ${options.strategyName} goal for this page type.\n`
    : '';

  // SD-LEO-INFRA-S17-PROMPT-ENGINEERING-001: brand name for typography treatment
  const brandNameSection = options.ventureContext?.brandName?.name
    ? `\nBRAND NAME: "${options.ventureContext.brandName.name}" — consider how this name's length and character affect typography treatment (short punchy names → oversized display; longer names → refined weight/spacing).\n`
    : '';

  return `Generate a complete, self-contained HTML page as Archetype Variant ${variantIndex} of 4 for this screen.
${pageTypeContext}${strategyDirective}${brandNameSection}${ventureContextSection}${designBriefSection}${contentBriefSection}${deviceInstructions}
${rubricGuidance}

═══ BRAND TOKENS (LOCKED — do not deviate) ═══
Colors: ${colorList}
Heading font: ${headingFont}
Body font: ${bodyFont}
Spacing: 4px grid (4, 8, 12, 16, 24, 32, 48, 64, 80px)

LAYOUT APPROACH: ${layoutDescription}
${options.priorVariants?.length > 0 ? `
PRIOR VARIANTS (differentiate — do NOT repeat their approach):
${options.priorVariants.map(pv => `- Variant ${pv.index}: ${pv.summary}`).join('\n')}
` : ''}
SOURCE SCREEN (adapt content and structure — don't copy the wireframe literally):
${screenHtml.slice(0, 4000)}

REQUIREMENTS:
1. Complete HTML document with inline CSS only (no external links)
2. Locked brand colors via CSS custom properties (var(--token-name))
3. Locked fonts via font-family declarations
4. The layout approach specified above, optimized for ${deviceType === 'MOBILE' ? 'mobile (375px)' : 'desktop (1440px)'}
5. Preserve all content elements from the source screen but improve the copy
6. Start with the DESIGN INTENT comment block (MANDATORY — see output format above)
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
 * @param {boolean} [options.preview] - Preview mode: generate only Landing + Dashboard for top 2 strategies
 * @param {string} [options.strategy] - Filter to a single strategy (e.g., 'clarity-first')
 * @returns {Promise<{ screenCount: number, artifactIds: string[], cancelled?: boolean }>}
 * @throws {ArchetypeGenerationError} if no stitch_design_export artifacts found
 */
export async function generateArchetypes(ventureId, supabase, options = {}) {
  const { signal, preview, strategy } = options;

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

  // 1a. Preview mode: filter to Landing + Dashboard, use top 2 recommended strategies
  // SD-S17-STRATEGYFIRST-DESIGN-DIRECTION-ORCH-001-A
  let previewRecommendation = null;
  if (preview) {
    const recommendation = await recommendStrategies(ventureId, supabase);
    previewRecommendation = recommendation;
    const previewScreenTypes = ['landing', 'dashboard'];
    screenList = screenList.filter(s => {
      const name = (s.screen_name ?? '').toLowerCase();
      return previewScreenTypes.some(pt => name.includes(pt));
    });
    if (screenList.length === 0) {
      // Fallback: use first 2 screens if no landing/dashboard found
      screenList = screens.slice(0, 2).map((s, idx) => ({
        screen_id: s.screen_id ?? `screen-${idx}`,
        screen_name: s.screen_name ?? s.name ?? `Screen ${idx + 1}`,
        description: s.description ?? '',
        deviceType: s.deviceType ?? 'DESKTOP',
        html: null,
        png: null,
      }));
    }
    console.log(`[archetype-generator] PREVIEW MODE: ${screenList.length} screens, top 2 strategies: ${recommendation.recommended_top_2.join(', ')}`);
  }

  // 1b. Resume: check which screens already have completed artifacts
  const completedScreens = await getCompletedScreens(supabase, ventureId);
  if (completedScreens.size > 0) {
    console.log(`[archetype-generator] Resume: ${completedScreens.size}/${screenList.length} screens already completed, skipping`);
  }

  // 2. Load brand token manifest
  const tokens = await getTokenConstraints(ventureId, supabase);

  // 2b. Load upstream artifacts for design brief (SD-S17-DESIGN-MASTERY-PIPELINE-ORCH-001-A)
  let designBrief = null;
  try {
    const [identityRes, tokenManifestRes] = await Promise.all([
      supabase.from('venture_artifacts')
        .select('artifact_data')
        .eq('venture_id', ventureId)
        .in('artifact_type', ['identity_naming_visual', 'identity_persona_brand', 'identity_brand_guidelines', 'stage11_identity', 's11_identity'])
        .eq('is_current', true)
        .limit(1)
        .maybeSingle(),
      supabase.from('venture_artifacts')
        .select('artifact_data')
        .eq('venture_id', ventureId)
        .in('artifact_type', ['design_token_manifest', 'blueprint_token_manifest'])
        .eq('is_current', true)
        .limit(1)
        .maybeSingle(),
    ]);
    designBrief = buildDesignBrief({
      identityArtifact: identityRes?.data?.artifact_data ?? null,
      tokenManifest: tokenManifestRes?.data?.artifact_data ?? null,
    });
    if (designBrief.positioning !== 'Modern, professional digital product') {
      console.log(`[archetype-generator] Design brief loaded: positioning="${designBrief.positioning.slice(0, 60)}..."`);
    }
  } catch (e) {
    console.warn('[archetype-generator] Design brief skipped:', e.message);
  }

  // 2b2. Load upstream venture context for professional design prompts (SD-LEO-INFRA-S17-PROMPT-ENGINEERING-001)
  let ventureContext = null;
  try {
    ventureContext = await loadVentureContext(ventureId, supabase);
  } catch (e) {
    console.warn('[archetype-generator] Venture context skipped:', e.message);
  }

  // 2c. Load strategy reorder hints from prior stats (feedback loop)
  let strategyReorderHints = null;
  try {
    strategyReorderHints = await getStrategyReorderHints(ventureId, supabase);
    if (strategyReorderHints) {
      console.log(`[archetype-generator] Strategy reorder hints loaded for ${Object.keys(strategyReorderHints).length} page type(s)`);
    }
  } catch (_e) {
    // Non-blocking: no hints available is fine
  }

  // 3. Import LLM client — use Anthropic Claude for design generation
  const { getLLMClient } = await import('../../llm/client-factory.js');
  // COST CONTROL (2026-04-19): S17 variant generation is the ONLY place we use Opus 4.7.
  // Everything else routes through model-config.js which defaults to Sonnet 4.6.
  // Opus 4.7 is hardcoded here (not via getClaudeModel('generation')) because:
  //   1. Variant HTML generation requires Opus-level quality for design fidelity
  //   2. The centralized 'generation' tier was downgraded to Sonnet to cut API costs
  //   3. Override via CLAUDE_MODEL_S17_GENERATION env var if needed
  const generationModel = process.env.CLAUDE_MODEL_S17_GENERATION || 'claude-opus-4-7';
  const client = getLLMClient({ purpose: 'generation', provider: 'anthropic', model: generationModel });

  const artifactIds = [];
  const totalScreens = screenList.length;

  // Progress log — written to s17_session_state artifact for frontend consumption
  // PAT-PERSIST-CHECKPOINT-001: Reset stale progress log from prior interrupted runs.
  // Without this, the frontend shows variant entries from a run that never completed
  // its artifact write, misleading the user into thinking screens are complete when
  // no s17_archetypes artifact exists for them.
  const progressLog = [];
  // Write an empty log immediately to clear any stale data from prior runs
  try {
    await writeArtifact(supabase, {
      ventureId, lifecycleStage: 17, artifactType: 's17_session_state',
      title: 'Generation Progress',
      content: JSON.stringify({ log: [], updatedAt: new Date().toISOString(), generation: 'starting', completedScreens: completedScreens.size }),
      artifactData: { totalScreens, completedScreens: completedScreens.size, log: [] },
      qualityScore: null, validationStatus: null,
      source: 'stage-17-archetype-generator',
      metadata: { progressUpdate: true },
    });
  } catch (_e) { /* non-blocking */ }

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
      await updateProgress({ type: 'generation_stopped', completedScreens: artifactIds.length, totalScreens, reason: 'User cancelled', timestamp: new Date().toISOString() });
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

    // SD-S17-DESIGN-MASTERY-PIPELINE-ORCH-001-A: Use strategy-driven layouts when confidence is sufficient
    let strategyLayouts = classification.confidence >= 0.5
      ? getStrategyLayouts(classification.pageType)
      : null;

    // SD-S17-STRATEGYFIRST-DESIGN-DIRECTION-ORCH-001-A: filter to chosen strategy or preview top 2
    if (strategy && strategyLayouts) {
      const chosen = strategyLayouts.find(sl => sl.strategy === strategy);
      if (chosen) {
        // Generate 4 layout variations within the chosen strategy
        // Use the page-type archetypes as variation descriptions, tagged with the chosen strategy
        const pageArchetypes = getArchetypesForPageType(classification.pageType);
        strategyLayouts = pageArchetypes.map(desc => ({ strategy, description: desc }));
      }
    } else if (preview && previewRecommendation && strategyLayouts) {
      const top2 = previewRecommendation.recommended_top_2;
      strategyLayouts = strategyLayouts.filter(sl => top2.includes(sl.strategy));
    }

    // Apply strategy reorder hints from prior stats (feedback loop)
    if (!strategy && !preview && strategyLayouts && strategyReorderHints?.[classification.pageType]) {
      const reorder = strategyReorderHints[classification.pageType];
      strategyLayouts = reorder
        .map(stratName => strategyLayouts.find(sl => sl.strategy === stratName))
        .filter(Boolean);
    }

    const layouts = strategyLayouts
      ? strategyLayouts.map(sl => sl.description)
      : (classification.confidence >= 0.5 ? getArchetypesForPageType(classification.pageType) : FALLBACK_LAYOUTS);
    const variantCount = layouts.length;
    console.log(`[archetype-generator] ┌── Screen ${screenIdx + 1}/${totalScreens}: ${screenTitle} (${deviceType})`);
    console.log(`[archetype-generator] │   pageType=${classification.pageType} (confidence=${classification.confidence}), generating ${variantCount} variants${strategyLayouts ? ' [strategy-driven]' : ''}`);

    const variants = [];
    const priorVariantSummaries = []; // SD-S17-DESIGN-MASTERY-PIPELINE-ORCH-001-B: cross-variant awareness
    const screenStartTime = Date.now();

    // PAT-PERSIST-CHECKPOINT-001: Check for WIP variants from a prior interrupted run
    const existingWip = await getWipVariants(supabase, ventureId, screenId);
    if (existingWip.size > 0) {
      console.log(`[archetype-generator] │   Resuming: ${existingWip.size}/${variantCount} variants already persisted for ${screenId}`);
    }

    // Emit screen_start entry for frontend traceability
    await updateProgress({
      type: 'screen_start', screen: screenTitle, screenIdx: screenIdx + 1,
      totalScreens, variantCount, deviceType,
      resumedVariants: existingWip.size,
      timestamp: new Date().toISOString(),
    });

    for (let i = 0; i < variantCount; i++) {
      // Check abort signal between variants (not just between screens)
      if (signal?.aborted) {
        console.info(`[archetype-generator] Cancelled mid-screen "${screenTitle}" after variant ${i}/${variantCount}`);
        await updateProgress({ type: 'generation_stopped', completedScreens: artifactIds.length, totalScreens, reason: 'User cancelled', timestamp: new Date().toISOString() });
        return { screenCount: screenIdx, artifactIds, cancelled: true };
      }

      // Skip variants that were already persisted in a prior run
      if (existingWip.has(i + 1)) {
        const wip = existingWip.get(i + 1);
        variants.push({ variantIndex: i + 1, layoutDescription: wip.layoutDescription, html: wip.html, strategy_name: wip.strategy_name });
        console.log(`[archetype-generator] │   variant ${i + 1}/${variantCount}: resumed from WIP — ${wip.html.length} chars`);
        await updateProgress({ type: 'variant', screen: screenTitle, screenIdx: screenIdx + 1, variant: i + 1, totalVariants: variantCount, chars: wip.html.length, seconds: 0, layout: wip.layoutDescription.slice(0, 50), resumed: true, timestamp: new Date().toISOString() });
        continue;
      }

      const variantStart = Date.now();
      // SD-S17-DESIGN-MASTERY-PIPELINE-ORCH-001-A: build content brief per screen, pass strategy + design brief
      // SD-S17-DESIGN-MASTERY-PIPELINE-ORCH-001-B: cross-variant awareness
      const contentBrief = buildContentBrief(screenHtml, classification.pageType);
      const strategyName = strategyLayouts ? strategyLayouts[i]?.strategy : null;
      // SD-LEO-INFRA-S17-PROMPT-ENGINEERING-001: unique seed per variant for design variation
      const designSeed = Math.floor(Math.random() * 100) + 1;
      const promptText = buildArchetypePrompt(screenHtml, tokens, layouts[i], i + 1, {
        pageType: classification.pageType,
        deviceType,
        designBrief,
        contentBrief,
        strategyName,
        ventureContext,
        designSeed,
        priorVariants: priorVariantSummaries.length > 0 ? [...priorVariantSummaries] : undefined,
      });

      const userContent = [];
      if (screen.png) {
        userContent.push({
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: screen.png }
        });
      }
      userContent.push({ type: 'text', text: promptText });

      let archetypeHtml;
      // SD-LEO-INFRA-S17-PROMPT-ENGINEERING-001: Professional designer persona
      // 2026-04-20: Replaced generic "senior UI designer" with opinionated design director persona
      const systemPrompt = 'You are an independent design director who has shipped award-winning websites for startups and established brands. You favor restraint over decoration. You believe whitespace is a design element, not empty space. Your work is recognized for typographic precision, unexpected layout decisions, and the feeling that every pixel was placed with intention. You never produce work that looks like a template or AI-generated. You think about who the customer is before choosing a layout. Return only complete HTML.';
      const llmOpts = { stream: true, timeout: 300000, cacheTTLMs: 0, maxTokens: 32768, purpose: 'content-generation' };

      const result = await client.complete(systemPrompt, userContent, llmOpts);
      archetypeHtml = result?.content ?? String(result);

      // Validate DESIGN INTENT comment block — retry once if missing
      // SD-LEO-INFRA-S17-PROMPT-ENGINEERING-001: check for new intent block (backward compat with distinctive move)
      const hasIntent = /<!-- *\n? *DESIGN INTENT:/i.test(archetypeHtml) || /<!-- distinctive move:/i.test(archetypeHtml);
      if (!hasIntent) {
        console.warn(`[archetype-generator] │   v${i + 1}: DESIGN INTENT block MISSING — retrying with reminder`);
        const retryContent = [...userContent, { type: 'text', text: '\n\nIMPORTANT: Your output is missing the required DESIGN INTENT comment block at the top of the HTML. You MUST include it with Mood, Customer, Layout thesis, Distinctive move, and Color strategy fields. Add it now before <!DOCTYPE html>.' }];
        const retryResult = await client.complete(systemPrompt, retryContent, llmOpts);
        const retryHtml = retryResult?.content ?? String(retryResult);
        if (/DESIGN INTENT:/i.test(retryHtml) || /<!-- distinctive move:/i.test(retryHtml)) {
          archetypeHtml = retryHtml;
        } else {
          console.warn(`[archetype-generator] │   v${i + 1}: DESIGN INTENT still missing after retry — flagging`);
        }
      }

      const variantSec = ((Date.now() - variantStart) / 1000).toFixed(0);

      // PAT-PERSIST-CHECKPOINT-001: Persist each variant immediately to DB as WIP
      // This eliminates the 5-6 min vulnerability window where variants only exist in memory
      await writeArtifact(supabase, {
        ventureId,
        lifecycleStage: 17,
        artifactType: 's17_variant_wip',
        title: `${screenTitle} — WIP Variant ${i + 1}`,
        content: archetypeHtml,
        artifactData: { html: archetypeHtml, layoutDescription: layouts[i], variantIndex: i + 1, screenName: screenTitle },
        qualityScore: null,
        validationStatus: null,
        source: 'stage-17-archetype-generator',
        metadata: { screenId, variantIndex: i + 1, deviceType, strategy_name: strategyName, pageType: classification.pageType },
      });

      variants.push({
        variantIndex: i + 1,
        layoutDescription: layouts[i],
        html: archetypeHtml,
        strategy_name: strategyName,
      });

      // SD-S17-DESIGN-MASTERY-PIPELINE-ORCH-001-B: build summary for cross-variant awareness
      priorVariantSummaries.push({
        index: i + 1,
        summary: buildVariantSummary(archetypeHtml, layouts[i]),
      });

      console.log(`[archetype-generator] │   variant ${i + 1}/${variantCount}: ${layouts[i].slice(0, 40)} — ${archetypeHtml.length} chars (${variantSec}s) [persisted]`);
      await updateProgress({ type: 'variant', screen: screenTitle, screenIdx: screenIdx + 1, variant: i + 1, totalVariants: variantCount, chars: archetypeHtml.length, seconds: parseInt(variantSec), layout: layouts[i].slice(0, 50), persisted: true, timestamp: new Date().toISOString() });
    }

    const screenSec = ((Date.now() - screenStartTime) / 1000).toFixed(0);

    // Assemble final artifact — use s17_preview type in preview mode
    const artifactType = preview ? 's17_preview' : 's17_archetypes';
    const artifactId = await writeArtifact(supabase, {
      ventureId,
      lifecycleStage: 17,
      artifactType,
      title: `${screenTitle} — ${preview ? 'Preview' : `${variants.length} Archetypes`}`,
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
        strategies_used: strategyLayouts ? strategyLayouts.map(sl => sl.strategy) : null,
        generation_version: GENERATION_VERSION,
      },
    });

    // Clean up WIP variants now that the final artifact is assembled
    await cleanupWipVariants(supabase, ventureId, screenId);

    artifactIds.push(artifactId);
    const remaining = totalScreens - (screenIdx + 1);
    const avgPerScreen = remaining > 0 ? ` (~${Math.round(remaining * parseInt(screenSec) / 60)}m remaining)` : '';
    console.log(`[archetype-generator] └── Screen "${screenTitle}" saved — ${screenIdx + 1}/${totalScreens} complete (${screenSec}s)${avgPerScreen}`);
    await updateProgress({ type: 'screen_complete', screen: screenTitle, screenIdx: screenIdx + 1, totalScreens, seconds: parseInt(screenSec), remaining, artifactWritten: true, timestamp: new Date().toISOString() });

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
  // COST CONTROL (2026-04-19): Refined variant HTML generation uses Opus 4.7 explicitly.
  // Same rationale as generateArchetypeVariants above — variant HTML requires Opus-level
  // design fidelity. All other LLM calls default to Google Gemini for cost savings.
  // Override via CLAUDE_MODEL_S17_GENERATION env var if needed.
  const generationModel = process.env.CLAUDE_MODEL_S17_GENERATION || 'claude-opus-4-7';
  const client = getLLMClient({ purpose: 'generation', provider: 'anthropic', model: generationModel });

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

HIGH-END AESTHETIC DIRECTIVES (Awwwards-level quality expected):
- Spatial Composition: Use unexpected layouts — grid-breaking elements, overlapping layers, generous
  negative space. Do NOT default to safe, symmetrical, template-like grids.
- Typography: Pair a distinctive display/heading font treatment (weight, size, letter-spacing, case)
  against a refined body font. Create typographic tension and hierarchy, not bland uniform sizing.
- Motion: Include ONE well-orchestrated, staggered page-load animation using CSS-only (@keyframes +
  animation-delay). One cohesive entrance moment, not scattered micro-interactions.
  Use @media (prefers-reduced-motion: reduce) to disable.

SELECTED ARCHETYPE 1:
${selectedHtmls[0].slice(0, 2000)}

SELECTED ARCHETYPE 2:
${selectedHtmls[1].slice(0, 2000)}${mobileContext}

REQUIREMENTS:
1. Produce one complete, self-contained HTML document with inline CSS only
2. Apply brand tokens via CSS custom properties (var(--token-name))
3. Include one <!-- distinctive move: ... --> HTML comment (MANDATORY)

SELF-VERIFICATION (mandatory before finalizing):
After generating the HTML, review against these checks:
1. Does the layout break away from generic template patterns?
2. Is there clear typographic tension between heading and body treatments?
3. Is there exactly one cohesive CSS entrance animation?
4. Does the distinctive move create real visual impact?
5. Are brand tokens applied via CSS custom properties?
If any check fails, revise before outputting. Annotate:
<!-- verified: spatial=[pass/revised], typography=[pass/revised], motion=[pass/revised] -->

Output ONLY the HTML — no explanation, no markdown fences.`;

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
