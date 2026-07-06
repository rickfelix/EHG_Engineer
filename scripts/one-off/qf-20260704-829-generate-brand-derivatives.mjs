#!/usr/bin/env node
/**
 * QF-20260704-829 — EHG brand asset kit: transparent-background derivatives + square icon.
 *
 * Chairman-provided originals: assets/brand/ehg-logo.png (navy-on-near-white) and
 * assets/brand/ehg-logo-dark.png (silver/white-on-near-black). Both are uniform-background,
 * alpha-free 1448x1086 PNGs, so background removal is a mechanical chroma-key (distance from
 * the sampled corner color -> alpha), not a design judgment call.
 *
 * PROPOSED, NOT CANONICAL: per the ticket's hard gate, these derivatives require chairman
 * approval before any UI consumes them. This script only generates candidates for review.
 */
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

export const BG_LIGHT = { r: 254, g: 253, b: 254 };
export const BG_DARK = { r: 0, g: 0, b: 0 };
export const THRESHOLD = 40; // chroma-key distance tolerance

async function toTransparent(inputPath, outputPath, bg) {
  const { data, info } = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  for (let i = 0; i < width * height; i++) {
    const o = i * channels;
    const dr = data[o] - bg.r, dg = data[o + 1] - bg.g, db = data[o + 2] - bg.b;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    data[o + 3] = dist <= THRESHOLD ? 0 : 255;
  }
  await sharp(data, { raw: { width, height, channels } }).png().toFile(outputPath);
  return { width, height, channels, data };
}

/** Find the first sufficiently-large all-background row-gap in the lower half — the seam
 *  between the globe/swoosh mark and the wordmark below it. Returns a safe crop line landing
 *  inside that gap (not the widest gap -- the wordmark's own internal line-spacing and the
 *  trailing decorative rule produce separate, wider gaps further down that must not qualify). */
export function findMarkCropLine(data, width, height, channels) {
  const rowHasContent = new Array(height).fill(false);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * channels + 3] > 0) { rowHasContent[y] = true; break; }
    }
  }
  const MIN_GAP = Math.round(height * 0.015);
  let gapStart = -1, curStart = -1;
  for (let y = Math.floor(height * 0.5); y < height; y++) {
    if (!rowHasContent[y]) {
      if (curStart === -1) curStart = y;
      else if (gapStart === -1 && y - curStart >= MIN_GAP) {
        // land mid-gap: clear of the mark above and the wordmark below.
        let gapEnd = y;
        while (gapEnd < height && !rowHasContent[gapEnd]) gapEnd++;
        gapStart = Math.round((curStart + gapEnd) / 2);
        break;
      }
    } else {
      curStart = -1;
    }
  }
  return gapStart > 0 ? gapStart : Math.floor(height * 0.72); // fallback estimate
}

async function toSquareIcon(transparentData, outputPath) {
  const { width, height, channels, data } = transparentData;
  const cropHeight = findMarkCropLine(data, width, height, channels);
  const side = Math.max(width, cropHeight);
  const cropped = await sharp(data, { raw: { width, height, channels } })
    .extract({ left: 0, top: 0, width, height: Math.min(cropHeight, height) })
    .png().toBuffer();
  await sharp(cropped)
    .resize(side, side, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toFile(outputPath);
  return cropHeight;
}

async function main() {
  const light = await toTransparent('assets/brand/ehg-logo.png', 'assets/brand/ehg-logo-transparent.png', BG_LIGHT);
  await toTransparent('assets/brand/ehg-logo-dark.png', 'assets/brand/ehg-logo-dark-transparent.png', BG_DARK);
  const cropHeight = await toSquareIcon(light, 'assets/brand/ehg-icon.png');
  console.log(`Generated ehg-logo-transparent.png, ehg-logo-dark-transparent.png, ehg-icon.png (mark crop at y=${cropHeight}/${light.height}).`);
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
