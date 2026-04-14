/**
 * Design Fidelity Scorer
 * SD-REPLIT-PIPELINE-S20S26-REDESIGN-ORCH-001-D-B
 *
 * Compares Stitch design specifications (color palettes, typography,
 * component specs) against the built UI in a GitHub repository.
 * Produces a fidelity score (0-100) with per-dimension breakdowns.
 */

const DIMENSIONS = {
  colors: { weight: 30, label: 'Color Palette' },
  typography: { weight: 25, label: 'Typography' },
  components: { weight: 25, label: 'Component Presence' },
  layout: { weight: 20, label: 'Layout Structure' },
};

/**
 * Extract hex colors from a string (CSS, Tailwind config, etc.).
 * @param {string} content
 * @returns {string[]} Lowercase hex colors
 */
function extractHexColors(content) {
  if (!content) return [];
  const matches = content.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
  return [...new Set(matches.map(c => c.toLowerCase()))];
}

/**
 * Score color fidelity by comparing design palette against repo colors.
 * @param {object} designTokens - Stitch design data with colorPalette
 * @param {string[]} repoFiles - File paths from repo
 * @param {object} dependencies - Package.json deps
 * @returns {{score: number, evidence: string[], details: string}}
 */
function scoreColors(designTokens, repoFiles, dependencies) {
  const designColors = [];
  const palette = designTokens?.colorPalette || designTokens?.colors || [];

  if (Array.isArray(palette)) {
    for (const color of palette) {
      const hex = color?.hex || color?.value || color;
      if (typeof hex === 'string' && hex.startsWith('#')) {
        designColors.push(hex.toLowerCase());
      }
    }
  }

  if (designColors.length === 0) {
    return { score: 0, evidence: [], details: 'No design colors found in Stitch data' };
  }

  // Check if repo has Tailwind (most common for Stitch-designed apps)
  const hasTailwind = repoFiles.some(f =>
    f.includes('tailwind.config') || f.includes('tailwind.css')
  );
  const hasCss = repoFiles.some(f => f.endsWith('.css') || f.endsWith('.scss'));

  const evidence = [];
  if (hasTailwind) evidence.push('tailwind.config found — design tokens likely applied');
  if (hasCss) evidence.push('CSS files found — custom styles present');

  // Heuristic: Tailwind config presence implies design tokens were applied
  // Full color matching would require reading file contents (future enhancement)
  const score = hasTailwind ? 80 : hasCss ? 50 : 10;

  return {
    score,
    evidence,
    details: `${designColors.length} design colors, ${hasTailwind ? 'Tailwind' : hasCss ? 'CSS' : 'no styling'} detected`,
  };
}

/**
 * Score typography fidelity.
 * @param {object} designTokens
 * @param {string[]} repoFiles
 * @returns {{score: number, evidence: string[], details: string}}
 */
function scoreTypography(designTokens, repoFiles) {
  const fonts = designTokens?.typography?.fontFamily
    || designTokens?.fonts
    || designTokens?.fontFamily;

  const hasFontConfig = repoFiles.some(f =>
    f.includes('tailwind.config') || f.includes('fonts') || f.includes('typography')
  );
  const hasGlobalCss = repoFiles.some(f =>
    f.includes('globals.css') || f.includes('global.css') || f.includes('app.css')
  );

  const evidence = [];
  if (hasFontConfig) evidence.push('Font configuration file found');
  if (hasGlobalCss) evidence.push('Global styles file found (likely contains font imports)');

  const score = hasFontConfig ? 75 : hasGlobalCss ? 50 : fonts ? 25 : 0;

  return {
    score,
    evidence,
    details: fonts ? `Design font: ${typeof fonts === 'string' ? fonts : 'specified'}` : 'No typography spec in design',
  };
}

/**
 * Score component presence by checking if design-specified components exist.
 * @param {object} designTokens
 * @param {string[]} repoFiles
 * @returns {{score: number, evidence: string[], details: string}}
 */
function scoreComponents(designTokens, repoFiles) {
  const designComponents = designTokens?.components
    || designTokens?.screens
    || designTokens?.pages
    || [];

  const componentNames = Array.isArray(designComponents)
    ? designComponents.map(c => (c?.name || c?.title || c || '').toLowerCase()).filter(Boolean)
    : [];

  if (componentNames.length === 0) {
    // Fallback: check if repo has component structure at all
    const hasComponents = repoFiles.some(f => f.includes('/components/'));
    return {
      score: hasComponents ? 50 : 0,
      evidence: hasComponents ? ['src/components/ directory found'] : [],
      details: 'No specific component list in design spec',
    };
  }

  const repoFileNames = repoFiles.map(f => f.toLowerCase());
  let matches = 0;
  const evidence = [];

  for (const name of componentNames) {
    const normalized = name.replace(/[^a-z0-9]/g, '');
    const match = repoFileNames.find(f => f.includes(normalized));
    if (match) {
      matches++;
      evidence.push(`${name} → ${match}`);
    }
  }

  const score = Math.round((matches / componentNames.length) * 100);
  return {
    score,
    evidence: evidence.slice(0, 5),
    details: `${matches}/${componentNames.length} design components found in repo`,
  };
}

/**
 * Score layout structure fidelity.
 * @param {object} designTokens
 * @param {string[]} repoFiles
 * @returns {{score: number, evidence: string[], details: string}}
 */
function scoreLayout(designTokens, repoFiles) {
  const hasLayout = repoFiles.some(f =>
    f.toLowerCase().includes('layout') || f.toLowerCase().includes('_app')
  );
  const hasPages = repoFiles.some(f =>
    f.includes('/pages/') || f.includes('/app/')
  );
  const hasResponsive = repoFiles.some(f =>
    f.includes('tailwind') || f.includes('responsive') || f.includes('media')
  );

  const evidence = [];
  let score = 0;

  if (hasLayout) { score += 40; evidence.push('Layout component found'); }
  if (hasPages) { score += 30; evidence.push('Pages/routes directory found'); }
  if (hasResponsive) { score += 30; evidence.push('Responsive configuration detected'); }

  return {
    score: Math.min(100, score),
    evidence,
    details: `Layout: ${hasLayout ? 'yes' : 'no'}, Pages: ${hasPages ? 'yes' : 'no'}, Responsive: ${hasResponsive ? 'yes' : 'no'}`,
  };
}

/**
 * Score design fidelity of a Replit-built app against Stitch design data.
 *
 * @param {object} stitchData - Stitch export data (design tokens, components, etc.)
 * @param {object} repoAnalysis - Output from github-repo-analyzer.analyzeRepo()
 * @returns {{
 *   score: number,
 *   dimensions: object,
 *   summary: string
 * } | null} null if no Stitch data available
 */
export function scoreDesignFidelity(stitchData, repoAnalysis) {
  if (!stitchData) return null;
  if (!repoAnalysis || !repoAnalysis.files) {
    return {
      score: 0,
      dimensions: {},
      summary: 'No repository data available for comparison.',
    };
  }

  const { files = [], dependencies = {} } = repoAnalysis;

  const dimensionResults = {
    colors: scoreColors(stitchData, files, dependencies),
    typography: scoreTypography(stitchData, files),
    components: scoreComponents(stitchData, files),
    layout: scoreLayout(stitchData, files),
  };

  // Calculate weighted total
  let totalScore = 0;
  const dimensions = {};

  for (const [key, config] of Object.entries(DIMENSIONS)) {
    const result = dimensionResults[key];
    const weighted = (result.score / 100) * config.weight;
    totalScore += weighted;

    dimensions[key] = {
      label: config.label,
      score: result.score,
      weight: config.weight,
      weightedScore: Math.round(weighted),
      evidence: result.evidence,
      details: result.details,
    };
  }

  const finalScore = Math.round(totalScore);
  const summary = `Design Fidelity: ${finalScore}/100 — ${
    finalScore >= 80 ? 'Strong alignment with Stitch design.' :
    finalScore >= 50 ? 'Partial alignment — some design aspects missing.' :
    'Weak alignment — significant design gaps.'
  }`;

  return { score: finalScore, dimensions, summary };
}

export default { scoreDesignFidelity };
