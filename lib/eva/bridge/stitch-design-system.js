/**
 * Stitch Design System Integration
 * SD: SD-WIREFRAME-FIDELITY-QA-WITH-ORCH-001-E
 *
 * Maps S11 brand_tokens (colors, fonts, visual style) to Stitch DesignSystem
 * API format and creates a project-level theme that all generated screens inherit.
 *
 * Uses normalized brand_tokens from PR #2950 — colors are strings (hex),
 * fonts are strings (family names).
 */

/**
 * Map brand_tokens extracted at S11 to Stitch DesignSystem format.
 * Never throws — returns sensible defaults for missing fields.
 *
 * @param {Object} brandTokens - Normalized brand tokens from extractStage11Tokens
 * @param {Array<string>} [brandTokens.colors] - Array of hex color strings
 * @param {Array<string>} [brandTokens.fonts] - Array of font family strings
 * @param {string} [brandTokens.personality] - Visual personality (bold, minimal, etc.)
 * @returns {Object} Stitch DesignSystem configuration
 */
export function mapBrandTokensToDesignSystem(brandTokens) {
  if (!brandTokens || typeof brandTokens !== 'object') {
    return buildDefaultDesignSystem();
  }

  const colors = extractColors(brandTokens);
  const fonts = extractFonts(brandTokens);
  const colorMode = inferColorMode(brandTokens);
  const roundness = inferRoundness(brandTokens);

  return {
    theme: {
      colorMode,
      fonts: {
        heading: fonts.heading,
        body: fonts.body,
      },
      roundness,
    },
    customColors: colors,
  };
}

/**
 * Create a DesignSystem on a Stitch project and optionally apply it.
 * Fire-and-forget pattern — failure is non-fatal.
 *
 * @param {Object} params
 * @param {Object} params.sdk - Stitch SDK module
 * @param {string} params.apiKey - Stitch API key
 * @param {string} params.projectId - Stitch project ID
 * @param {Object} params.brandTokens - Brand tokens from S11
 * @returns {Promise<{designSystemId: string|null, applied: boolean}>}
 */
export async function createAndApplyDesignSystem({ sdk, apiKey, projectId, brandTokens }) {
  const designSystemConfig = mapBrandTokensToDesignSystem(brandTokens);

  try {
    const client = new sdk.Stitch(new sdk.StitchToolClient({ apiKey, timeout: 30_000 }));
    const project = client.project(projectId);

    const designSystem = await project.createDesignSystem(designSystemConfig);
    const designSystemId = designSystem?.id || designSystem?.design_system_id || null;

    console.info(`[stitch-design-system] DesignSystem created: ${designSystemId}`);
    console.info(`[stitch-design-system] Theme: colorMode=${designSystemConfig.theme.colorMode}, fonts=${designSystemConfig.theme.fonts.heading}/${designSystemConfig.theme.fonts.body}, roundness=${designSystemConfig.theme.roundness}`);
    console.info(`[stitch-design-system] Colors: ${designSystemConfig.customColors.map(c => `${c.name}=${c.hex}`).join(', ')}`);

    try { await client.close(); } catch { /* ignore */ }

    return { designSystemId, applied: false, config: designSystemConfig };
  } catch (err) {
    const msg = err.message || '';
    const isTransport = /fetch failed|socket|ECONNRESET|other side closed/i.test(msg);
    if (isTransport) {
      console.info('[stitch-design-system] DesignSystem fired (socket dropped — server processing)');
      return { designSystemId: 'fired', applied: false, config: designSystemConfig };
    }
    console.warn(`[stitch-design-system] createDesignSystem failed (non-fatal): ${msg}`);
    return { designSystemId: null, applied: false, config: designSystemConfig };
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function extractColors(brandTokens) {
  const colors = [];
  const rawColors = brandTokens.colors || [];

  if (Array.isArray(rawColors)) {
    const colorNames = ['primary', 'secondary', 'accent', 'neutral', 'background'];
    rawColors.forEach((color, i) => {
      const hex = typeof color === 'string' ? color : (color?.hex || color?.value || null);
      if (hex && /^#[0-9a-fA-F]{3,8}$/.test(hex)) {
        colors.push({ name: colorNames[i] || `color_${i}`, hex });
      }
    });
  }

  // Fallback: if no valid colors extracted, use a neutral default
  if (colors.length === 0) {
    colors.push({ name: 'primary', hex: '#3b82f6' });
  }

  return colors;
}

function extractFonts(brandTokens) {
  const rawFonts = brandTokens.fonts || [];
  let heading = 'Inter';
  let body = 'Inter';

  if (Array.isArray(rawFonts) && rawFonts.length > 0) {
    heading = typeof rawFonts[0] === 'string' ? rawFonts[0] : (rawFonts[0]?.name || rawFonts[0]?.family || 'Inter');
    if (rawFonts.length > 1) {
      body = typeof rawFonts[1] === 'string' ? rawFonts[1] : (rawFonts[1]?.name || rawFonts[1]?.family || 'Inter');
    } else {
      body = heading; // Single font = use for both
    }
  }

  return { heading, body };
}

function inferColorMode(brandTokens) {
  const raw = brandTokens.personality || ''; // QF-20260412-498: guard against object
  const personality = (typeof raw === 'string' ? raw : String(raw)).toLowerCase();
  if (personality.includes('dark') || personality.includes('moody') || personality.includes('night')) {
    return 'dark';
  }
  return 'light';
}

function inferRoundness(brandTokens) {
  const raw = brandTokens.personality || ''; // QF-20260412-498: guard against object
  const personality = (typeof raw === 'string' ? raw : String(raw)).toLowerCase();
  if (personality.includes('sharp') || personality.includes('corporate') || personality.includes('formal')) {
    return 'none';
  }
  if (personality.includes('playful') || personality.includes('friendly') || personality.includes('soft')) {
    return 'full';
  }
  return 'medium';
}

function buildDefaultDesignSystem() {
  return {
    theme: {
      colorMode: 'light',
      fonts: { heading: 'Inter', body: 'Inter' },
      roundness: 'medium',
    },
    customColors: [{ name: 'primary', hex: '#3b82f6' }],
  };
}
