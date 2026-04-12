/**
 * PWA Manifest Generator
 * SD: SD-DUALPLAT-MOBILE-WEB-ORCH-001-C
 *
 * Generates a W3C Web App Manifest from venture brand tokens.
 * Brand tokens come from S11 (visual identity) artifacts.
 *
 * @module templates/pwa/manifest-generator
 */

/**
 * Generate a valid manifest.json from venture brand tokens.
 *
 * @param {Object} brandTokens - S11 brand token data
 * @param {string} brandTokens.venture_name - Venture display name
 * @param {string} [brandTokens.short_name] - Short name for home screen
 * @param {Object} [brandTokens.colors] - Color palette
 * @param {string} [brandTokens.colors.primary] - Primary brand color
 * @param {string} [brandTokens.colors.background] - Background color
 * @param {string} [brandTokens.description] - Venture description
 * @param {Array}  [brandTokens.icons] - Icon definitions [{src, sizes, type}]
 * @returns {Object} Valid W3C Web App Manifest object
 */
export function generateManifest(brandTokens) {
  const name = brandTokens.venture_name || brandTokens.name || 'Venture App';
  const shortName = brandTokens.short_name || name.slice(0, 12);
  const themeColor = brandTokens.colors?.primary || brandTokens.theme_color || '#000000';
  const backgroundColor = brandTokens.colors?.background || brandTokens.background_color || '#ffffff';
  const description = brandTokens.description || `${name} - Progressive Web App`;

  // Default icons if none provided
  const icons = brandTokens.icons || [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
  ];

  return {
    name,
    short_name: shortName,
    description,
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    theme_color: themeColor,
    background_color: backgroundColor,
    icons,
    categories: ['business'],
  };
}

/**
 * Serialize manifest to JSON string.
 * @param {Object} manifest - Manifest object from generateManifest
 * @returns {string} JSON string ready to write to manifest.json
 */
export function serializeManifest(manifest) {
  return JSON.stringify(manifest, null, 2);
}
