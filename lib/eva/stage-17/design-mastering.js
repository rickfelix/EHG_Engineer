/**
 * Design Mastering Module for S17
 *
 * Extracts a codified design system (s17_design_system artifact) from
 * approved S17 HTML variants. Analyzes CSS custom properties, semantic
 * HTML structure, and layout patterns to produce a structured artifact.
 *
 * SD-S17-DESIGN-MASTERY-PIPELINE-ORCH-001-B (US-001)
 * @module lib/eva/stage-17/design-mastering
 */

import { writeArtifact } from '../artifact-persistence-service.js';

/**
 * Extract a design system from approved HTML and write as s17_design_system artifact.
 *
 * @param {object} supabase - Supabase client
 * @param {string} ventureId
 * @param {string} approvedHtml - HTML content of the approved design
 * @param {object} metadata - Screen metadata (screenId, platform, etc.)
 * @returns {Promise<string|null>} Artifact ID, or null on failure
 */
export async function masterDesign(supabase, ventureId, approvedHtml, metadata = {}) {
  if (!approvedHtml || typeof approvedHtml !== 'string') return null;

  const designSystem = extractDesignSystem(approvedHtml);

  const artifactId = await writeArtifact(supabase, {
    ventureId,
    lifecycleStage: 17,
    artifactType: 's17_design_system',
    title: `Design System — ${metadata.screenName ?? metadata.screenId ?? 'Screen'}`,
    content: JSON.stringify(designSystem),
    artifactData: designSystem,
    qualityScore: 80,
    validationStatus: 'pending',
    source: 'stage-17-design-mastering',
    metadata: {
      screenId: metadata.screenId,
      platform: metadata.platform,
      extractedAt: new Date().toISOString(),
    },
  });

  return artifactId;
}

/**
 * Extract design system components from HTML string.
 * Uses regex parsing — no DOM or jsdom dependency required.
 *
 * @param {string} html
 * @returns {{ component_inventory: object[], color_map: object[], spacing_patterns: object[], typography: object, layout_grid: object }}
 */
export function extractDesignSystem(html) {
  return {
    component_inventory: extractComponents(html),
    color_map: extractColorMap(html),
    spacing_patterns: extractSpacingPatterns(html),
    typography: extractTypography(html),
    layout_grid: extractLayoutGrid(html),
  };
}

function extractComponents(html) {
  const components = [];
  const patterns = [
    { tag: 'button', type: 'button' },
    { tag: 'nav', type: 'navigation' },
    { tag: 'form', type: 'form' },
    { tag: 'input', type: 'input' },
    { tag: 'article', type: 'article' },
    { tag: 'aside', type: 'sidebar' },
    { tag: 'header', type: 'header' },
    { tag: 'footer', type: 'footer' },
    { tag: 'table', type: 'table' },
    { tag: 'img', type: 'image' },
  ];

  for (const { tag, type } of patterns) {
    const regex = new RegExp(`<${tag}[^>]*>`, 'gi');
    const matches = html.match(regex);
    if (matches && matches.length > 0) {
      components.push({ type, count: matches.length, tag });
    }
  }

  // Card patterns (div with card class)
  const cardMatches = html.match(/class="[^"]*card[^"]*"/gi);
  if (cardMatches) {
    components.push({ type: 'card', count: cardMatches.length, tag: 'div.card' });
  }

  return components;
}

function extractColorMap(html) {
  const colorMap = [];
  // Match var(--token-name) usage
  const varPattern = /var\(--([a-zA-Z0-9_-]+)\)/g;
  const usageCount = {};
  let match;

  while ((match = varPattern.exec(html)) !== null) {
    const token = match[1];
    usageCount[token] = (usageCount[token] || 0) + 1;
  }

  // Match :root declarations
  const rootPattern = /--([a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g;
  const definitions = {};
  while ((match = rootPattern.exec(html)) !== null) {
    definitions[match[1]] = match[2].trim();
  }

  for (const [token, count] of Object.entries(usageCount)) {
    colorMap.push({
      token: `--${token}`,
      value: definitions[token] ?? null,
      usage_count: count,
    });
  }

  return colorMap.sort((a, b) => b.usage_count - a.usage_count);
}

function extractSpacingPatterns(html) {
  const spacingValues = {};
  // Match margin and padding values in inline styles
  const spacingPattern = /(?:margin|padding)(?:-(?:top|right|bottom|left))?:\s*(\d+)px/gi;
  let match;

  while ((match = spacingPattern.exec(html)) !== null) {
    const px = parseInt(match[1]);
    spacingValues[px] = (spacingValues[px] || 0) + 1;
  }

  // Match gap values
  const gapPattern = /gap:\s*(\d+)px/gi;
  while ((match = gapPattern.exec(html)) !== null) {
    const px = parseInt(match[1]);
    spacingValues[px] = (spacingValues[px] || 0) + 1;
  }

  return Object.entries(spacingValues)
    .map(([px, count]) => ({
      value_px: parseInt(px),
      count,
      grid_aligned: parseInt(px) % 4 === 0,
    }))
    .sort((a, b) => b.count - a.count);
}

function extractTypography(html) {
  const fonts = new Set();
  const fontPattern = /font-family:\s*([^;}"]+)/gi;
  let match;
  while ((match = fontPattern.exec(html)) !== null) {
    fonts.add(match[1].trim().replace(/['"]/g, '').split(',')[0].trim());
  }

  const fontSizes = {};
  const sizePattern = /font-size:\s*(\d+(?:\.\d+)?)(px|rem|em)/gi;
  while ((match = sizePattern.exec(html)) !== null) {
    const key = `${match[1]}${match[2]}`;
    fontSizes[key] = (fontSizes[key] || 0) + 1;
  }

  return {
    font_families: [...fonts],
    font_sizes: Object.entries(fontSizes)
      .map(([size, count]) => ({ size, count }))
      .sort((a, b) => b.count - a.count),
  };
}

function extractLayoutGrid(html) {
  const hasGrid = /display:\s*grid/i.test(html);
  const hasFlex = /display:\s*flex/i.test(html);
  const columnPattern = /grid-template-columns:\s*([^;}"]+)/i;
  const columnMatch = columnPattern.exec(html);

  return {
    uses_grid: hasGrid,
    uses_flexbox: hasFlex,
    grid_columns: columnMatch ? columnMatch[1].trim() : null,
    has_sidebar: /<aside/i.test(html),
    has_sticky_header: /position:\s*sticky/i.test(html),
  };
}

/**
 * Build a short summary of a variant for cross-variant awareness.
 * Deterministic — uses layout description and distinctive move HTML comment.
 *
 * @param {string} variantHtml - Generated variant HTML
 * @param {string} layoutDescription - Layout description used for this variant
 * @returns {string} Summary under 200 chars
 */
export function buildVariantSummary(variantHtml, layoutDescription) {
  const movePattern = /<!-- distinctive move:\s*(.+?)\s*-->/i;
  const moveMatch = movePattern.exec(variantHtml ?? '');
  const move = moveMatch ? moveMatch[1].slice(0, 80) : '';

  const layout = layoutDescription.slice(0, 80);
  const summary = move
    ? `Layout: ${layout}. Move: ${move}`
    : `Layout: ${layout}`;

  return summary.length > 200 ? summary.slice(0, 197) + '...' : summary;
}
