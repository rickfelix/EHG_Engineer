/**
 * Genesis Virtual Bunker - Simulation Watermark Middleware
 *
 * Injects a visible SIMULATION watermark on all pages.
 * Cannot be hidden by CSS (uses fixed positioning and !important).
 * Part of SD-GENESIS-V31-MASON-P3
 *
 * @module lib/genesis/watermark-middleware
 */

/**
 * CSS for the simulation watermark overlay.
 * Uses !important to prevent CSS overrides.
 */
export const WATERMARK_CSS = `
.genesis-simulation-watermark {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  width: 100% !important;
  height: 100% !important;
  pointer-events: none !important;
  z-index: 2147483647 !important;
  display: flex !important;
  justify-content: center !important;
  align-items: center !important;
  overflow: hidden !important;
}

.genesis-simulation-watermark::before {
  content: 'SIMULATION' !important;
  font-size: 120px !important;
  font-weight: bold !important;
  color: rgba(255, 0, 0, 0.15) !important;
  transform: rotate(-45deg) !important;
  white-space: nowrap !important;
  pointer-events: none !important;
  user-select: none !important;
  -webkit-user-select: none !important;
}

.genesis-simulation-banner {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  background: #ff0000 !important;
  color: white !important;
  text-align: center !important;
  padding: 8px !important;
  font-weight: bold !important;
  font-size: 14px !important;
  z-index: 2147483646 !important;
  box-shadow: 0 2px 4px rgba(0,0,0,0.3) !important;
}
`;

/**
 * HTML for the watermark elements.
 */
export const WATERMARK_HTML = `
<div class="genesis-simulation-watermark" data-genesis-watermark="true"></div>
<div class="genesis-simulation-banner" data-genesis-banner="true">
  🚧 GENESIS SIMULATION MODE - This is NOT a production environment 🚧
</div>
`;

/**
 * Script to inject watermark that resists removal.
 */
export const WATERMARK_SCRIPT = `
(function() {
  'use strict';

  // Create watermark elements
  function createWatermark() {
    const existing = document.querySelector('[data-genesis-watermark]');
    if (existing) return;

    const style = document.createElement('style');
    style.textContent = ${JSON.stringify(WATERMARK_CSS)};
    document.head.appendChild(style);

    const container = document.createElement('div');
    container.innerHTML = ${JSON.stringify(WATERMARK_HTML)};
    document.body.appendChild(container);
  }

  // Restore watermark if removed
  const observer = new MutationObserver(function(mutations) {
    if (!document.querySelector('[data-genesis-watermark]')) {
      createWatermark();
    }
  });

  // Start observing
  if (document.body) {
    createWatermark();
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', function() {
      createWatermark();
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }
})();
`;

/**
 * Express middleware that injects watermark into HTML responses.
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
export function watermarkMiddleware(req, res, next) {
  // Only modify HTML responses
  const originalSend = res.send;

  res.send = function (body) {
    if (typeof body === 'string' && body.includes('</body>')) {
      // Inject watermark before </body>
      const injection = `
        <style>${WATERMARK_CSS}</style>
        ${WATERMARK_HTML}
        <script>${WATERMARK_SCRIPT}</script>
      `;
      body = body.replace('</body>', `${injection}</body>`);
    }
    return originalSend.call(this, body);
  };

  next();
}

/**
 * Generate watermark injection code for a specific framework.
 *
 * @param {'next' | 'react' | 'express' | 'html'} framework - Target framework
 * @returns {string} - Framework-specific injection code
 */
export function generateWatermarkCode(framework) {
  switch (framework) {
    case 'next':
      return `
// Add to _app.js or layout.tsx
import Script from 'next/script';

export default function SimulationWatermark() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: ${JSON.stringify(WATERMARK_CSS)} }} />
      <div className="genesis-simulation-watermark" data-genesis-watermark="true" />
      <div className="genesis-simulation-banner" data-genesis-banner="true">
        🚧 GENESIS SIMULATION MODE - This is NOT a production environment 🚧
      </div>
      <Script id="genesis-watermark" strategy="afterInteractive">
        {\`${WATERMARK_SCRIPT}\`}
      </Script>
    </>
  );
}`;

    case 'react':
      return `
import { useEffect } from 'react';

export function SimulationWatermark() {
  useEffect(() => {
    ${WATERMARK_SCRIPT}
  }, []);

  return null;
}`;

    case 'express':
      return `
import { watermarkMiddleware } from '@/lib/genesis/watermark-middleware';

app.use(watermarkMiddleware);`;

    case 'html':
    default:
      return `
<!-- Add before </body> -->
<style>${WATERMARK_CSS}</style>
${WATERMARK_HTML}
<script>${WATERMARK_SCRIPT}</script>`;
  }
}

/**
 * Check if a page has the watermark properly injected.
 *
 * @param {string} html - HTML content to check
 * @returns {{ hasWatermark: boolean, hasBanner: boolean, hasScript: boolean }}
 */
export function verifyWatermarkPresence(html) {
  return {
    hasWatermark: html.includes('genesis-simulation-watermark'),
    hasBanner: html.includes('genesis-simulation-banner'),
    hasScript: html.includes('data-genesis-watermark'),
  };
}

export default {
  WATERMARK_CSS,
  WATERMARK_HTML,
  WATERMARK_SCRIPT,
  watermarkMiddleware,
  generateWatermarkCode,
  verifyWatermarkPresence,
};
