/**
 * Stitch Design System Integration
 * SD: SD-WIREFRAME-FIDELITY-QA-WITH-ORCH-001-E
 *
 * Maps S11 brand_tokens (colors, fonts, visual style) to Stitch DesignSystem
 * API format and creates a project-level theme that all generated screens inherit.
 *
 * API schema from @google/stitch-sdk tool-definitions.js:
 *   designSystem.displayName (required, string)
 *   designSystem.theme.colorMode (required, enum: LIGHT | DARK)
 *   designSystem.theme.headlineFont (required, enum: INTER | MANROPE | ...)
 *   designSystem.theme.bodyFont (required, enum: INTER | MANROPE | ...)
 *   designSystem.theme.roundness (required, enum: ROUND_FOUR | ROUND_EIGHT | ROUND_TWELVE | ROUND_FULL)
 *   designSystem.theme.customColor (required, hex string e.g. "#ff0000")
 *   designSystem.theme.designMd (optional, markdown string)
 */

// Valid font enums from the Stitch SDK
const VALID_FONTS = [
  'INTER', 'MANROPE', 'SPACE_GROTESK', 'WORK_SANS', 'PLUS_JAKARTA_SANS',
  'PUBLIC_SANS', 'SPLINE_SANS', 'EPILOGUE', 'LEXEND', 'BE_VIETNAM_PRO',
  'NEWSREADER', 'NOTO_SERIF', 'DOMINE', 'LIBRE_CASLON_TEXT', 'EB_GARAMOND',
  'LITERATA', 'SOURCE_SERIF_FOUR', 'MONTSERRAT', 'SOURCE_SANS_THREE',
  'NUNITO_SANS', 'ARIMO', 'HANKEN_GROTESK', 'RUBIK', 'GEIST', 'DM_SANS',
  'IBM_PLEX_SANS', 'SORA'
];

// Map common font names to SDK enums
const FONT_NAME_MAP = {
  'inter': 'INTER', 'manrope': 'MANROPE', 'space grotesk': 'SPACE_GROTESK',
  'work sans': 'WORK_SANS', 'plus jakarta sans': 'PLUS_JAKARTA_SANS',
  'public sans': 'PUBLIC_SANS', 'spline sans': 'SPLINE_SANS',
  'epilogue': 'EPILOGUE', 'lexend': 'LEXEND', 'montserrat': 'MONTSERRAT',
  'roboto': 'INTER', 'helvetica': 'INTER', 'arial': 'INTER',
  'dm sans': 'DM_SANS', 'ibm plex sans': 'IBM_PLEX_SANS', 'sora': 'SORA',
  'rubik': 'RUBIK', 'geist': 'GEIST', 'nunito sans': 'NUNITO_SANS',
  'noto serif': 'NOTO_SERIF', 'eb garamond': 'EB_GARAMOND',
};

/**
 * Map brand_tokens extracted at S11 to Stitch DesignSystem API format.
 * Never throws -- returns sensible defaults for missing fields.
 */
export function mapBrandTokensToDesignSystem(brandTokens, ventureName) {
  if (!brandTokens || typeof brandTokens !== 'object') {
    return buildDefaultDesignSystem(ventureName);
  }

  const customColor = extractPrimaryColor(brandTokens);
  const headlineFont = mapFontToEnum(brandTokens.fonts, 0);
  const bodyFont = mapFontToEnum(brandTokens.fonts, 1) || headlineFont;
  const colorMode = inferColorMode(brandTokens);
  const roundness = inferRoundness(brandTokens);

  return {
    displayName: ventureName || 'Design System',
    theme: {
      colorMode,
      headlineFont,
      bodyFont,
      roundness,
      customColor,
    },
  };
}

/**
 * Create a DesignSystem on a Stitch project.
 * Fire-and-forget pattern -- failure is non-fatal.
 */
export async function createAndApplyDesignSystem({ sdk, apiKey, projectId, brandTokens, ventureName }) {
  const designSystemConfig = mapBrandTokensToDesignSystem(brandTokens, ventureName);

  try {
    const client = new sdk.Stitch(new sdk.StitchToolClient({ apiKey, timeout: 30_000 }));
    const project = client.project(projectId);

    const designSystem = await project.createDesignSystem(designSystemConfig);
    const designSystemId = designSystem?.id || designSystem?.design_system_id || null;

    console.info(`[stitch-design-system] DesignSystem created: ${designSystemId}`);
    console.info(`[stitch-design-system] Theme: colorMode=${designSystemConfig.theme.colorMode}, headline=${designSystemConfig.theme.headlineFont}, body=${designSystemConfig.theme.bodyFont}, roundness=${designSystemConfig.theme.roundness}, color=${designSystemConfig.theme.customColor}`);

    try { await client.close(); } catch { /* ignore */ }

    return { designSystemId, applied: false, config: designSystemConfig };
  } catch (err) {
    const msg = err.message || '';
    const isTransport = /fetch failed|socket|ECONNRESET|other side closed/i.test(msg);
    if (isTransport) {
      console.info('[stitch-design-system] DesignSystem fired (socket dropped -- server processing)');
      return { designSystemId: 'fired', applied: false, config: designSystemConfig };
    }
    console.warn(`[stitch-design-system] createDesignSystem failed (non-fatal): ${msg}`);
    return { designSystemId: null, applied: false, config: designSystemConfig };
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function extractPrimaryColor(brandTokens) {
  const rawColors = brandTokens.colors || [];
  if (Array.isArray(rawColors) && rawColors.length > 0) {
    const first = rawColors[0];
    const hex = typeof first === 'string' ? first : (first?.hex || first?.value || null);
    if (hex && /^#[0-9a-fA-F]{3,8}$/.test(hex)) return hex;
  }
  return '#3b82f6';
}

function mapFontToEnum(fonts, index) {
  if (!Array.isArray(fonts) || fonts.length <= index) return 'INTER';
  const raw = fonts[index];
  const name = (typeof raw === 'string' ? raw : (raw?.name || raw?.family || '')).toLowerCase().trim();

  // Direct match in map
  if (FONT_NAME_MAP[name]) return FONT_NAME_MAP[name];

  // Try converting to enum format (e.g. "Plus Jakarta Sans" -> "PLUS_JAKARTA_SANS")
  const enumAttempt = name.replace(/\s+/g, '_').toUpperCase();
  if (VALID_FONTS.includes(enumAttempt)) return enumAttempt;

  // Fuzzy: check if any valid font starts with the same prefix
  const prefix = name.split(' ')[0].toUpperCase();
  const fuzzy = VALID_FONTS.find(f => f.startsWith(prefix));
  if (fuzzy) return fuzzy;

  return 'INTER';
}

function inferColorMode(brandTokens) {
  const raw = brandTokens.personality || '';
  const personality = (typeof raw === 'string' ? raw : '').toLowerCase();
  if (personality.includes('dark') || personality.includes('moody') || personality.includes('night')) {
    return 'DARK';
  }
  return 'LIGHT';
}

function inferRoundness(brandTokens) {
  const raw = brandTokens.personality || '';
  const personality = (typeof raw === 'string' ? raw : '').toLowerCase();
  if (personality.includes('sharp') || personality.includes('corporate') || personality.includes('formal')) {
    return 'ROUND_FOUR';
  }
  if (personality.includes('playful') || personality.includes('friendly') || personality.includes('soft')) {
    return 'ROUND_FULL';
  }
  return 'ROUND_EIGHT';
}

function buildDefaultDesignSystem(ventureName) {
  return {
    displayName: ventureName || 'Design System',
    theme: {
      colorMode: 'LIGHT',
      headlineFont: 'INTER',
      bodyFont: 'INTER',
      roundness: 'ROUND_EIGHT',
      customColor: '#3b82f6',
    },
  };
}

// Export for testing
export { mapFontToEnum, inferColorMode, inferRoundness, extractPrimaryColor, VALID_FONTS, FONT_NAME_MAP };
