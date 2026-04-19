/**
 * Stage 17 Screenshot Generator
 *
 * Renders approved S17 HTML designs in headless Edge via Playwright,
 * captures viewport screenshots, and stores PNGs as companion artifacts.
 *
 * SD-LEO-ORCH-REPLACE-GOOGLE-STITCH-001-C
 * @module lib/eva/stage-17/screenshot-generator
 */

import { writeArtifact } from '../artifact-persistence-service.js';

const VIEWPORTS = {
  DESKTOP: { width: 1440, height: 900 },
  MOBILE: { width: 375, height: 812 },
  TABLET: { width: 768, height: 1024 },
  AGNOSTIC: { width: 1440, height: 900 },
};

/**
 * Generate PNG screenshots from all s17_approved artifacts for a venture.
 *
 * @param {string} ventureId
 * @param {object} supabase
 * @param {object} [options]
 * @param {number} [options.timeout=10000] - Per-page timeout in ms
 * @returns {Promise<{ screenshotCount: number, artifactIds: string[] }>}
 */
export async function generateScreenshots(ventureId, supabase, options = {}) {
  const { timeout = 10_000 } = options;

  // 1. Load all s17_approved artifacts
  const { data: approvedArts, error } = await supabase
    .from('venture_artifacts')
    .select('id, content, metadata, artifact_data, title')
    .eq('venture_id', ventureId)
    .eq('artifact_type', 's17_approved')
    .eq('is_current', true)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`[screenshot-gen] DB fetch error: ${error.message}`);
  if (!approvedArts?.length) {
    console.warn(`[screenshot-gen] No s17_approved artifacts found for venture ${ventureId}`);
    return { screenshotCount: 0, artifactIds: [] };
  }

  // 2. Launch Playwright browser
  let chromium;
  try {
    const pw = await import('playwright');
    chromium = pw.chromium;
  } catch {
    console.error('[screenshot-gen] Playwright not installed. Run: npx playwright install chromium');
    return { screenshotCount: 0, artifactIds: [] };
  }

  const browser = await chromium.launch({
    headless: true,
    channel: 'msedge',
  });

  const artifactIds = [];

  try {
    for (const art of approvedArts) {
      const screenId = art.metadata?.screenId ?? art.artifact_data?.screenId ?? 'unknown';
      const screenName = art.artifact_data?.screenName ?? art.title ?? screenId;
      const deviceType = art.metadata?.deviceType ?? art.artifact_data?.deviceType ?? 'DESKTOP';
      const viewport = VIEWPORTS[deviceType] ?? VIEWPORTS.DESKTOP;

      // Extract HTML content
      const html = typeof art.content === 'string' ? art.content : JSON.stringify(art.content);
      if (!html || html.length < 50) {
        console.warn(`[screenshot-gen] Skipping ${screenName} — content too short (${html?.length ?? 0} chars)`);
        continue;
      }

      try {
        const context = await browser.newContext({ viewport });
        const page = await context.newPage();

        await page.setContent(html, { waitUntil: 'networkidle', timeout });
        const pngBuffer = await page.screenshot({ type: 'png', fullPage: false });
        const pngBase64 = pngBuffer.toString('base64');

        await context.close();

        // Store as companion artifact
        const artifactId = await writeArtifact(supabase, {
          ventureId,
          lifecycleStage: 17,
          artifactType: 's17_approved_png',
          title: `${screenName} — PNG Screenshot (${deviceType})`,
          content: pngBase64,
          artifactData: {
            screenId,
            screenName,
            deviceType,
            viewport,
            pngSizeBytes: pngBuffer.length,
            sourceArtifactId: art.id,
          },
          qualityScore: 80,
          validationStatus: 'validated',
          source: 'stage-17-screenshot-generator',
          metadata: {
            screenId,
            deviceType,
            viewport,
            sourceArtifactId: art.id,
          },
        });

        artifactIds.push(artifactId);
        console.log(`[screenshot-gen] ${screenName} (${deviceType}) — PNG ${pngBuffer.length} bytes`);
      } catch (screenErr) {
        console.error(`[screenshot-gen] Failed to screenshot ${screenName}: ${screenErr.message}`);
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`[screenshot-gen] Complete: ${artifactIds.length}/${approvedArts.length} screenshots generated`);
  return { screenshotCount: artifactIds.length, artifactIds };
}
