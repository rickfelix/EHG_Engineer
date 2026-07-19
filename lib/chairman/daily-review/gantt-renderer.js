/**
 * gantt-renderer — SD-LEO-INFRA-CHAIRMAN-DAILY-REVIEW-DOC-001-D.
 *
 * Hand-rolled SVG Gantt-bar chart + sharp rasterization for the daily-review MMS. NOT built
 * on scripts/lib/visualization-provider.js (that module is a generative-AI text-prompt image
 * tool with zero chart capability, and the repo has no deterministic charting library) — this
 * is a from-scratch, deterministic renderer taking Child A's buildRoadmapStatusDoc()
 * plan_of_record.waves shape directly, with no external network/AI-generation call.
 */
import sharp from 'sharp';

const CHART_WIDTH = 640;
const ROW_HEIGHT = 40;
const BAR_X = 220;
const BAR_MAX_WIDTH = 380;
const TOP_MARGIN = 30;
const BOTTOM_MARGIN = 20;

function escapeXml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}

/**
 * Pure function: builds a well-formed SVG string for a Gantt-style bar chart, one row per
 * wave, bar width scaled by progress_pct. No I/O, no external assets/fonts, no network call.
 * @param {Array<{wave_id?:string, title:string, status?:string, progress_pct?:number|null}>} waves
 * @returns {string} SVG markup
 */
export function buildGanttSvg(waves) {
  const rows = Array.isArray(waves) ? waves : [];
  const height = TOP_MARGIN + BOTTOM_MARGIN + Math.max(rows.length, 1) * ROW_HEIGHT;

  const bars = rows.map((wave, i) => {
    const y = TOP_MARGIN + i * ROW_HEIGHT;
    const pct = Math.max(0, Math.min(100, Number(wave.progress_pct) || 0));
    const barWidth = (pct / 100) * BAR_MAX_WIDTH;
    const label = escapeXml(wave.title || `Wave ${i + 1}`);
    return [
      `<text x="10" y="${y + 20}" font-family="sans-serif" font-size="14" fill="#222">${label}</text>`,
      `<rect x="${BAR_X}" y="${y + 8}" width="${BAR_MAX_WIDTH}" height="18" fill="#e0e0e0" />`,
      `<rect x="${BAR_X}" y="${y + 8}" width="${barWidth}" height="18" fill="#3b82f6" />`,
      `<text x="${BAR_X + BAR_MAX_WIDTH + 8}" y="${y + 20}" font-family="sans-serif" font-size="12" fill="#555">${pct}%</text>`,
    ].join('');
  }).join('');

  const placeholder = rows.length === 0
    ? `<text x="10" y="${TOP_MARGIN + 20}" font-family="sans-serif" font-size="14" fill="#888">No roadmap waves available</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CHART_WIDTH}" height="${height}" viewBox="0 0 ${CHART_WIDTH} ${height}">` +
    `<rect x="0" y="0" width="${CHART_WIDTH}" height="${height}" fill="#ffffff" />` +
    bars + placeholder +
    '</svg>';
}

/**
 * Rasterizes buildGanttSvg(waves) into a PNG Buffer via sharp — no network/AI-generation call.
 * @param {Array<object>} waves
 * @returns {Promise<Buffer>}
 */
export async function renderGanttPng(waves) {
  const svg = buildGanttSvg(waves);
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export default { buildGanttSvg, renderGanttPng };
