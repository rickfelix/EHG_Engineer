/**
 * PWA Injector
 * SD: SD-DUALPLAT-MOBILE-WEB-ORCH-001-C
 *
 * Injects PWA artifacts (manifest link, service worker registration,
 * viewport meta tag, install prompt) into HTML output for ventures
 * with target_platform including mobile.
 *
 * @module templates/pwa/pwa-injector
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { generateManifest, serializeManifest } from './manifest-generator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Generate all PWA artifacts for a venture.
 *
 * @param {Object} options
 * @param {Object} options.brandTokens - S11 brand token data
 * @param {string} [options.deployHash] - Deployment hash for cache versioning
 * @param {number} [options.cacheTtlMs] - Cache TTL in ms (default: 24hr)
 * @returns {{ manifest: string, serviceWorker: string, headTags: string, bodyScript: string }}
 */
export function generatePWAArtifacts(options) {
  const { brandTokens, deployHash = Date.now().toString(36), cacheTtlMs = 86400000 } = options;

  // 1. Generate manifest.json
  const manifestObj = generateManifest(brandTokens);
  const manifest = serializeManifest(manifestObj);

  // 2. Generate service worker with version stamp
  let serviceWorker;
  try {
    serviceWorker = readFileSync(resolve(__dirname, 'service-worker.js'), 'utf-8');
  } catch {
    // Fallback minimal service worker
    serviceWorker = 'self.addEventListener(\'fetch\', () => {});';
  }
  serviceWorker = serviceWorker
    .replace(/__CACHE_VERSION__/g, deployHash)
    .replace(/__CACHE_TTL_MS__/g, String(cacheTtlMs));

  // 3. Head tags to inject
  const themeColor = manifestObj.theme_color;
  const headTags = [
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    `<meta name="theme-color" content="${themeColor}">`,
    '<meta name="apple-mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-status-bar-style" content="default">',
    '<link rel="manifest" href="/manifest.json">',
  ].join('\n    ');

  // 4. Service worker registration script (inject before </body>)
  const bodyScript = `<script>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('[PWA] Service worker registered:', reg.scope))
        .catch(err => console.warn('[PWA] Service worker registration failed:', err));
    });
  }
  </script>`;

  return { manifest, serviceWorker, headTags, bodyScript };
}

/**
 * Inject PWA artifacts into an HTML string.
 *
 * @param {string} html - Raw HTML content
 * @param {Object} pwaArtifacts - Output from generatePWAArtifacts
 * @returns {string} HTML with PWA artifacts injected
 */
export function injectPWAIntoHTML(html, pwaArtifacts) {
  let result = html;

  // Inject head tags before </head>
  if (result.includes('</head>')) {
    result = result.replace('</head>', `    ${pwaArtifacts.headTags}\n  </head>`);
  }

  // Inject SW registration before </body>
  if (result.includes('</body>')) {
    result = result.replace('</body>', `  ${pwaArtifacts.bodyScript}\n  </body>`);
  }

  return result;
}

/**
 * Check if a venture should get PWA artifacts.
 *
 * @param {string} targetPlatform - Venture's target_platform value
 * @returns {boolean} True if PWA artifacts should be generated
 */
export function shouldInjectPWA(targetPlatform) {
  return targetPlatform === 'both' || targetPlatform === 'mobile';
}
