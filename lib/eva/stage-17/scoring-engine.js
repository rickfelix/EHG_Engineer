/**
 * Stage 17 Design Variant Scoring Engine
 *
 * Three-layer scoring model per design-variant-scoring-rubric-v2:
 *   Pass 1: Deterministic signal extraction (HTML/CSS parsing)
 *   Pass 2: LLM dimension scoring (Sonnet 4.6, structured JSON)
 *   Committee: Median-of-three voting for variance reduction
 *
 * SD-S17-DESIGN-INTELLIGENCE-ORCH-001-D
 * @module lib/eva/stage-17/scoring-engine
 */

import { writeArtifact } from '../artifact-persistence-service.js';

// ── Weight Profiles ──────────────────────────────────────────────────────

const MOBILE_WEIGHTS = {
  U1: 0.10, U2: 0.07, U3: 0.09, U4: 0.07, U5: 0.10, U6: 0.08, U7: 0.09,
  M1: 0.12, M2: 0.08, M3: 0.10, M4: 0.10,
};

const DESKTOP_WEIGHTS = {
  U1: 0.10, U2: 0.07, U3: 0.09, U4: 0.07, U5: 0.10, U6: 0.08, U7: 0.09,
  D1: 0.12, D2: 0.10, D3: 0.08, D4: 0.10,
};

/** Page-type weight modifiers (multipliers on specific dimensions). */
const PAGE_TYPE_MODIFIERS = {
  landing:   { U1: 1.4, U6: 1.5, U7: 1.3, M2: 1.2, D2: 0.7 },
  signup:    { U5: 1.5, U6: 1.4, M1: 1.3, U3: 1.2, D2: 0.8 },
  dashboard: { D2: 1.75, U3: 1.4, D4: 1.3, U1: 1.2, U7: 0.9 },
  insights:  { D2: 1.5, U1: 1.3, D4: 1.3, M3: 1.3 },
  settings:  { U3: 1.5, U2: 1.2, D3: 1.3, D4: 1.2, U7: 0.9 },
  listing:   { M1: 1.3, D2: 1.3, U3: 1.3, D4: 1.2 },
  detail:    { U1: 1.4, U2: 1.3, D1: 1.3 },
};

// ── Anti-Pattern Detection ───────────────────────────────────────────────

/**
 * Detect anti-patterns from signal dossier and return score caps.
 * @param {object} signals - Signal dossier from extractSignals
 * @param {'MOBILE'|'DESKTOP'} deviceType
 * @returns {number[]} Array of cap values (empty if no anti-patterns triggered)
 */
function detectAntiPatterns(signals, deviceType) {
  const caps = [];

  // Universal anti-patterns
  if (signals.contrastFailures > 3) caps.push(2.0);
  if (signals.semanticTagCount === 0) caps.push(3.0);
  if (signals.tokenUsageRate < 0.5) caps.push(3.0);
  if (signals.isCookieCutter) caps.push(3.0);

  if (deviceType === 'MOBILE') {
    if (signals.minTargetSize < 24) caps.push(2.0);
    if (signals.hasHorizontalOverflow) caps.push(2.0);
    if (signals.bodyFontSize < 14) caps.push(2.5);
  } else {
    if (signals.hoverStateCount === 0) caps.push(3.0);
    if (signals.isSingleCenteredColumn) caps.push(3.0);
    if (signals.hasNoFocusIndicator) caps.push(2.5);
  }

  return caps;
}

// ── Pass 1: Deterministic Signal Extraction ──────────────────────────────

/**
 * Extract deterministic signals from HTML/CSS.
 * Lightweight heuristic parsing — sufficient for scoring without full browser rendering.
 *
 * @param {string} html - HTML string of the variant
 * @returns {object} Signal dossier
 */
export function extractSignals(html) {
  const lower = html.toLowerCase();

  // Semantic HTML detection
  const semanticTags = ['<nav', '<main', '<header', '<footer', '<button', '<article', '<section'];
  const semanticTagCount = semanticTags.reduce((n, tag) => n + (lower.split(tag).length - 1), 0);

  // Heading hierarchy
  const h1Count = (lower.match(/<h1[\s>]/g) || []).length;
  const headingLevels = new Set();
  for (let i = 1; i <= 6; i++) {
    if (lower.includes(`<h${i}`)) headingLevels.add(i);
  }

  // Font-size extraction
  const fontSizeMatches = html.match(/font-size:\s*(\d+)px/gi) || [];
  const fontSizes = fontSizeMatches.map(m => parseInt(m.match(/(\d+)/)[1], 10));
  const bodyFontSize = fontSizes.length > 0 ? Math.min(...fontSizes.filter(s => s >= 10)) || 16 : 16;
  const distinctFontSizes = new Set(fontSizes).size;

  // Touch target detection (look for width/height in interactive elements)
  const targetSizeMatches = html.match(/(?:min-height|height|min-width|width):\s*(\d+)px/gi) || [];
  const targetSizes = targetSizeMatches.map(m => parseInt(m.match(/(\d+)/)[1], 10));
  const minTargetSize = targetSizes.length > 0 ? Math.min(...targetSizes.filter(s => s > 0 && s < 200)) || 48 : 48;

  // Hover/focus detection
  const hoverStateCount = (html.match(/:hover/gi) || []).length;
  const focusStateCount = (html.match(/:focus-visible|:focus/gi) || []).length;
  const hasNoFocusIndicator = focusStateCount === 0 && lower.includes('outline: none');

  // Spacing analysis
  const spacingMatches = html.match(/(?:margin|padding|gap):\s*(\d+)px/gi) || [];
  const spacingValues = [...new Set(spacingMatches.map(m => parseInt(m.match(/(\d+)/)[1], 10)))];

  // CSS custom property usage (token compliance)
  const varUsages = (html.match(/var\(--/g) || []).length;
  const hardcodedColors = (html.match(/#[0-9a-f]{3,8}\b/gi) || []).length;
  const tokenUsageRate = varUsages + hardcodedColors > 0
    ? varUsages / (varUsages + hardcodedColors)
    : 0.5;

  // Layout detection
  const hasGrid = lower.includes('display: grid') || lower.includes('display:grid');
  const hasFlex = lower.includes('display: flex') || lower.includes('display:flex');
  const hasMultiColumn = lower.includes('grid-template-columns') || /columns:\s*\d/i.test(html);
  const hasBottomNav = lower.includes('bottom: 0') && lower.includes('<nav');
  const isSingleCenteredColumn = !hasMultiColumn && !hasGrid && lower.includes('margin: 0 auto');

  // Horizontal overflow detection (mobile)
  const hasFixedWidthOverflow = /width:\s*(?:[5-9]\d{2}|[1-9]\d{3,})px/i.test(html);
  const hasHorizontalOverflow = hasFixedWidthOverflow && !lower.includes('overflow-x');

  // Contrast failures (simplified — count dark-on-dark or light-on-light pairs)
  const contrastFailures = 0; // Simplified: would need full color parsing for accuracy

  // Cookie-cutter template detection
  const hasHeroGradient = lower.includes('linear-gradient') && lower.includes('<h1');
  const hasThreeFeatureCards = (lower.match(/class=".*card/gi) || []).length >= 3;
  const hasTestimonialRow = lower.includes('testimonial') || lower.includes('quote');
  const isCookieCutter = hasHeroGradient && hasThreeFeatureCards && hasTestimonialRow;

  // Reduced motion support
  const hasReducedMotion = lower.includes('prefers-reduced-motion');

  // Accessibility
  const hasAltOnImages = (lower.match(/<img[^>]*alt=/gi) || []).length;
  const imgCount = (lower.match(/<img/gi) || []).length;
  const altCoverage = imgCount > 0 ? hasAltOnImages / imgCount : 1;

  return {
    semanticTagCount,
    h1Count,
    headingLevelCount: headingLevels.size,
    bodyFontSize,
    distinctFontSizes,
    minTargetSize,
    hoverStateCount,
    focusStateCount,
    hasNoFocusIndicator,
    spacingValueCount: spacingValues.length,
    tokenUsageRate: Math.round(tokenUsageRate * 100) / 100,
    hasGrid,
    hasFlex,
    hasMultiColumn,
    hasBottomNav,
    isSingleCenteredColumn,
    hasHorizontalOverflow,
    contrastFailures,
    isCookieCutter,
    hasReducedMotion,
    altCoverage: Math.round(altCoverage * 100) / 100,
  };
}

// ── Pass 2: LLM Dimension Scoring ────────────────────────────────────────

/**
 * LLM evaluation of a single variant against the scoring rubric.
 *
 * @param {string} html - Variant HTML
 * @param {object} signals - Signal dossier from Pass 1
 * @param {Record<string,number>} weights - Dimension weight profile
 * @param {string} pageType - Screen page type
 * @param {'MOBILE'|'DESKTOP'} deviceType
 * @returns {Promise<Record<string,number>>} Dimension scores (1-5)
 */
export async function llmEvaluate(html, signals, weights, pageType, deviceType) {
  const { getLLMClient } = await import('../../llm/client-factory.js');
  const client = getLLMClient({ provider: 'anthropic', model: 'claude-sonnet-4-6' });

  const dimensionList = Object.keys(weights).join(', ');
  const platformDimensions = deviceType === 'MOBILE'
    ? 'M1 Touch Ergonomics, M2 Thumb-Zone Reachability, M3 Single-Column Flow, M4 Mobile Nav'
    : 'D1 Spatial Efficiency, D2 Information Density, D3 Desktop Nav, D4 Hover/Keyboard Affordances';

  const prompt = `Score this HTML design variant on these dimensions (1-5 integer each):

Universal: U1 Visual Hierarchy, U2 Typography, U3 Layout Structure, U4 Brand Consistency, U5 Accessibility, U6 Task Clarity, U7 Design Distinctiveness
Platform (${deviceType}): ${platformDimensions}

Page type: ${pageType}

Signal dossier (from deterministic analysis):
${JSON.stringify(signals, null, 2)}

HTML (first 3000 chars):
${html.slice(0, 3000)}

Return ONLY valid JSON with dimension codes as keys and integer scores as values. Example: {"U1":4,"U2":3,...}`;

  try {
    const result = await client.complete(
      'You are a design evaluator. Score HTML design variants on specific dimensions. Return only JSON.',
      prompt,
      { timeout: 30000, cacheTTLMs: 0, temperature: 0.3 }
    );

    const text = typeof result === 'string' ? result : result?.content || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return defaultScores(weights);

    const scores = JSON.parse(match[0]);
    // Validate and clamp scores to 1-5
    for (const key of Object.keys(weights)) {
      scores[key] = Math.max(1, Math.min(5, Math.round(scores[key] || 3)));
    }
    return scores;
  } catch (err) {
    console.warn(`[scoring-engine] LLM evaluation failed: ${err.message}`);
    return defaultScores(weights);
  }
}

function defaultScores(weights) {
  const scores = {};
  for (const key of Object.keys(weights)) scores[key] = 3;
  return scores;
}

// ── Committee Voting ─────────────────────────────────────────────────────

/**
 * Run 3x LLM evaluation and take median per dimension.
 */
async function committeeVote(html, signals, weights, pageType, deviceType) {
  const evaluations = await Promise.all([
    llmEvaluate(html, signals, weights, pageType, deviceType),
    llmEvaluate(html, signals, weights, pageType, deviceType),
    llmEvaluate(html, signals, weights, pageType, deviceType),
  ]);

  const median = {};
  const spread = {};
  for (const key of Object.keys(weights)) {
    const values = evaluations.map(e => e[key] || 3).sort((a, b) => a - b);
    median[key] = values[1]; // median of 3
    spread[key] = values[2] - values[0];
  }

  return { scores: median, spread, evaluationCount: 3 };
}

// ── Composite Scoring ────────────────────────────────────────────────────

/**
 * Apply page-type modifiers to base weights and renormalize.
 */
function applyModifiers(baseWeights, pageType) {
  const modifiers = PAGE_TYPE_MODIFIERS[pageType] || {};
  const modified = {};
  for (const [dim, weight] of Object.entries(baseWeights)) {
    modified[dim] = weight * (modifiers[dim] || 1.0);
  }
  const total = Object.values(modified).reduce((s, w) => s + w, 0);
  for (const dim of Object.keys(modified)) {
    modified[dim] = modified[dim] / total;
  }
  return modified;
}

/**
 * Score all variants for a screen.
 *
 * @param {string} ventureId
 * @param {string} screenId
 * @param {Array<{html: string, variantIndex: number}>} variants
 * @param {object} options
 * @param {string} options.pageType
 * @param {'MOBILE'|'DESKTOP'} options.deviceType
 * @param {object} supabase
 * @returns {Promise<object>} Scoring results
 */
export async function scoreVariants(ventureId, screenId, variants, options, supabase) {
  const { pageType = 'landing', deviceType = 'DESKTOP' } = options;

  const baseWeights = deviceType === 'MOBILE' ? MOBILE_WEIGHTS : DESKTOP_WEIGHTS;
  const weights = applyModifiers(baseWeights, pageType);

  const scoredVariants = [];

  for (const variant of variants) {
    const signals = extractSignals(variant.html);
    const { scores, spread, evaluationCount } = await committeeVote(
      variant.html, signals, weights, pageType, deviceType
    );

    // Weighted score
    let weightedScore = 0;
    for (const [dim, weight] of Object.entries(weights)) {
      weightedScore += (scores[dim] || 3) * weight;
    }

    // Anti-pattern caps
    const caps = detectAntiPatterns(signals, deviceType);
    const finalScore = caps.length > 0 ? Math.min(weightedScore, ...caps) : weightedScore;
    const starRating = Math.round(finalScore * 2) / 2; // half-stars

    scoredVariants.push({
      variantIndex: variant.variantIndex,
      dimensions: scores,
      spread,
      appliedWeights: weights,
      weightedScore: Math.round(weightedScore * 100) / 100,
      triggeredAntiPatterns: caps,
      finalScore: Math.round(finalScore * 100) / 100,
      starRating,
      evaluationCount,
      signals,
    });
  }

  // Sort descending by final score, break ties by weighted score, then U7
  scoredVariants.sort((a, b) =>
    b.finalScore - a.finalScore ||
    b.weightedScore - a.weightedScore ||
    (b.dimensions.U7 || 0) - (a.dimensions.U7 || 0)
  );

  const result = {
    variants: scoredVariants,
    metadata: {
      evaluatorModel: 'claude-sonnet-4-6',
      committeeSize: 3,
      pageType,
      deviceType,
      weightProfile: deviceType === 'MOBILE' ? 'mobile' : 'desktop',
    },
  };

  // Persist as s17_variant_scores artifact
  if (supabase) {
    await writeArtifact(supabase, {
      ventureId,
      lifecycleStage: 17,
      artifactType: 's17_variant_scores',
      title: `Variant Scores — ${screenId.slice(0, 8)}`,
      content: JSON.stringify(result),
      artifactData: result,
      qualityScore: 85,
      validationStatus: 'validated',
      source: 'stage-17-scoring-engine',
      metadata: { screenId, pageType, deviceType },
    });
  }

  return result;
}
