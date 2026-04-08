/**
 * Stitch Exporter - Artifact Export at Stage 17 Gate Approval
 * SD-LEO-INFRA-GOOGLE-STITCH-DESIGN-001-C
 *
 * Exports Stitch design screens as self-contained HTML and PNG,
 * generates DESIGN.md, and adds SRI integrity hashes to CDN refs.
 *
 * @module eva/bridge/stitch-exporter
 * @version 1.0.0
 */

import { createHash } from 'crypto';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import sanitize from 'sanitize-html';

// ---------------------------------------------------------------------------
// Stitch Client Loader (DI pattern for testability)
// ---------------------------------------------------------------------------

let _stitchClient = null;
let _stitchClientLoader = null;

export function setStitchClientLoader(loader) {
  _stitchClientLoader = loader;
  _stitchClient = null;
}

async function getStitchClient() {
  if (_stitchClient) return _stitchClient;
  if (_stitchClientLoader) {
    _stitchClient = await _stitchClientLoader();
    return _stitchClient;
  }
  try {
    const mod = await import(/* @vite-ignore */ './stitch-client.js');
    _stitchClient = mod;
    return _stitchClient;
  } catch (err) {
    throw new Error(`Cannot load stitch-client: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// SRI Hash Injection
// ---------------------------------------------------------------------------

const CDN_PATTERNS = [
  /(<(?:script|link)[^>]*(?:src|href)=["'])([^"']*(?:googleapis|gstatic|cdnjs|unpkg|jsdelivr|cloudflare)[^"']*)(["'][^>]*)(\/?>)/gi,
];

/**
 * Generate SRI hash for content fetched from a URL.
 * In production, would fetch the resource — here we generate from URL as placeholder.
 */
function generateSRIHash(content) {
  const hash = createHash('sha384').update(content).digest('base64');
  return `sha384-${hash}`;
}

/**
 * Add SRI integrity attributes to CDN references in HTML.
 */
export function injectSRIHashes(html) {
  if (!html || typeof html !== 'string') return html;

  let result = html;
  for (const pattern of CDN_PATTERNS) {
    result = result.replace(pattern, (match, prefix, url, quote, closing) => {
      if (match.includes('integrity=')) return match; // already has SRI
      const hash = generateSRIHash(url);
      return `${prefix}${url}${quote} integrity="${hash}" crossorigin="anonymous"${closing}`;
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// DESIGN.md Generation
// ---------------------------------------------------------------------------

function generateDesignMd(screens, brandTokens) {
  const lines = ['# DESIGN.md', '', '## Design Tokens', ''];

  if (brandTokens?.colors?.length > 0) {
    lines.push('### Colors');
    brandTokens.colors.forEach(c => lines.push(`- \`${c}\``));
    lines.push('');
  }

  if (brandTokens?.fonts?.length > 0) {
    lines.push('### Typography');
    brandTokens.fonts.forEach(f => lines.push(`- ${f}`));
    lines.push('');
  }

  if (brandTokens?.personality) {
    lines.push('### Brand Personality');
    lines.push(typeof brandTokens.personality === 'string'
      ? brandTokens.personality
      : JSON.stringify(brandTokens.personality, null, 2));
    lines.push('');
  }

  lines.push('## Screens', '');
  screens.forEach(s => {
    lines.push(`### ${s.name || s.screen_id}`);
    if (s.dimensions) lines.push(`- Dimensions: ${s.dimensions.w || '?'}x${s.dimensions.h || '?'}`);
    lines.push(`- HTML: \`screens/${s.screen_id}.html\``);
    lines.push(`- Screenshot: \`screenshots/${s.screen_id}.png\``);
    lines.push('');
  });

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Export Stitch design artifacts for a venture.
 *
 * @param {string} ventureId - Venture UUID
 * @param {string} projectId - Stitch project ID
 * @param {string} outputDir - Output directory path
 * @param {Object} [options] - Additional options
 * @param {Object} [options.brandTokens] - Brand tokens for DESIGN.md
 * @param {number} [options.concurrency] - Max parallel exports (default: 3)
 * @returns {Promise<{manifest: Object, html_files: string[], png_files: string[], design_md_path: string}>}
 */
export async function exportStitchArtifacts(ventureId, projectId, outputDir, options = {}) {
  const client = await getStitchClient();
  const concurrency = options.concurrency || 3;

  // List all screens in the project
  const screens = await client.listScreens(projectId);

  if (screens.length === 0) {
    return {
      manifest: { venture_id: ventureId, project_id: projectId, screen_count: 0, files: [] },
      html_files: [],
      png_files: [],
      design_md_path: null,
    };
  }

  // Create output directories
  const screensDir = join(outputDir, 'screens');
  const screenshotsDir = join(outputDir, 'screenshots');
  await mkdir(screensDir, { recursive: true });
  await mkdir(screenshotsDir, { recursive: true });

  const html_files = [];
  const png_files = [];
  const manifestFiles = [];

  // Export screens in batches
  for (let i = 0; i < screens.length; i += concurrency) {
    const batch = screens.slice(i, i + concurrency);
    await Promise.all(batch.map(async (screen) => {
      const screenId = screen.screen_id;

      // Export HTML (SD-LEO-FIX-GOOGLE-STITCH-PIPELINE-001-A: sanitize + structured logging)
      try {
        let html = await client.exportScreenHtml(screenId);
        // Sanitize HTML first to prevent XSS, then inject SRI hashes on clean content
        html = sanitize(html, {
          allowedTags: sanitize.defaults.allowedTags.concat(['img', 'style', 'link', 'meta', 'svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'g', 'defs', 'use']),
          allowedAttributes: { ...sanitize.defaults.allowedAttributes, '*': ['class', 'id', 'style', 'data-*'], link: ['rel', 'href', 'crossorigin'], img: ['src', 'alt', 'width', 'height'] },
          allowedSchemes: ['https', 'data'],
        });
        html = injectSRIHashes(html);
        const htmlPath = join(screensDir, `${screenId}.html`);
        await writeFile(htmlPath, html, 'utf-8');
        html_files.push(htmlPath);
        manifestFiles.push({ type: 'html', screen_id: screenId, path: `screens/${screenId}.html`, size: Buffer.byteLength(html) });
      } catch (err) {
        console.error(`[stitch-joint] HTML export failed: venture=${ventureId} screen=${screenId} error=${err.message}`);
      }

      // Export PNG
      try {
        const pngBuffer = await client.exportScreenImage(screenId);
        const pngPath = join(screenshotsDir, `${screenId}.png`);
        await writeFile(pngPath, pngBuffer);
        png_files.push(pngPath);
        manifestFiles.push({ type: 'png', screen_id: screenId, path: `screenshots/${screenId}.png`, size: pngBuffer.length });
      } catch (err) {
        console.error(`[stitch-joint] PNG export failed: venture=${ventureId} screen=${screenId} error=${err.message}`);
      }
    }));
  }

  // Generate DESIGN.md
  const designMd = generateDesignMd(screens, options.brandTokens || {});
  const designMdPath = join(outputDir, 'DESIGN.md');
  await writeFile(designMdPath, designMd, 'utf-8');
  manifestFiles.push({ type: 'design_md', path: 'DESIGN.md', size: Buffer.byteLength(designMd) });

  const manifest = {
    venture_id: ventureId,
    project_id: projectId,
    screen_count: screens.length,
    exported_at: new Date().toISOString(),
    total_files: manifestFiles.length,
    total_size: manifestFiles.reduce((sum, f) => sum + (f.size || 0), 0),
    files: manifestFiles,
  };

  console.info(`[stitch-exporter] Exported ${screens.length} screens: ${html_files.length} HTML, ${png_files.length} PNG, 1 DESIGN.md`);

  return { manifest, html_files, png_files, design_md_path: designMdPath };
}

// Export for testing
export { generateDesignMd };
