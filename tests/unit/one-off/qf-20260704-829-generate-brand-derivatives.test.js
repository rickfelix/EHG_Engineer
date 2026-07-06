/**
 * Unit test for the QF-20260704-829 brand-derivative generation script's crop-line algorithm.
 * Synthetic single-column-wide row-content patterns -- no real image files needed. Regression
 * guard for the bug found during generation: picking the WIDEST background gap (instead of the
 * FIRST sufficiently-large one) crops into the wordmark text below the globe/swoosh mark.
 */
import { describe, it, expect } from 'vitest';
import { findMarkCropLine, THRESHOLD, BG_LIGHT, BG_DARK } from '../../../scripts/one-off/qf-20260704-829-generate-brand-derivatives.mjs';

const CHANNELS = 4;
const WIDTH = 4;

/** Build a raw RGBA buffer from a per-row content/gap pattern (true = has content). */
function buildRows(pattern) {
  const height = pattern.length;
  const data = new Uint8Array(WIDTH * height * CHANNELS);
  pattern.forEach((hasContent, y) => {
    for (let x = 0; x < WIDTH; x++) {
      data[(y * WIDTH + x) * CHANNELS + 3] = hasContent ? 255 : 0;
    }
  });
  return { data, width: WIDTH, height, channels: CHANNELS };
}

describe('findMarkCropLine — regression: first sufficiently-large gap wins, not the widest', () => {
  it('reproduces the real ehg-logo.png specimen shape: short gap (mark seam) then longer gaps further down', () => {
    // Mirrors the measured row-content run-lengths: content up to 845, gap 846-870 (25px),
    // content 871-930 (wordmark), gap 931-953 (23px), content 954-1022 (rule), gap 1023-1085.
    const pattern = new Array(1086).fill(true);
    for (let y = 0; y < 543; y++) pattern[y] = true; // upper half — irrelevant, scan starts at 50%
    for (let y = 543; y <= 845; y++) pattern[y] = true;
    for (let y = 846; y <= 870; y++) pattern[y] = false; // the seam (25px)
    for (let y = 871; y <= 930; y++) pattern[y] = true;  // wordmark
    for (let y = 931; y <= 953; y++) pattern[y] = false; // 23px gap
    for (let y = 954; y <= 1022; y++) pattern[y] = true; // decorative rule
    for (let y = 1023; y <= 1085; y++) pattern[y] = false; // trailing margin (63px, the widest)

    const { data, width, height, channels } = buildRows(pattern);
    const cropLine = findMarkCropLine(data, width, height, channels);

    // Must land INSIDE the first (846-870) gap, not the wider 1023-1085 one.
    expect(cropLine).toBeGreaterThanOrEqual(846);
    expect(cropLine).toBeLessThanOrEqual(870);
  });

  it('a gap shorter than MIN_GAP does not qualify — falls through to the next real gap', () => {
    const pattern = new Array(200).fill(true);
    for (let y = 100; y <= 101; y++) pattern[y] = false; // 2px noise gap, well under MIN_GAP
    for (let y = 102; y <= 120; y++) pattern[y] = true;
    for (let y = 121; y <= 140; y++) pattern[y] = false; // real 20px gap
    for (let y = 141; y <= 160; y++) pattern[y] = true;

    const { data, width, height, channels } = buildRows(pattern);
    const cropLine = findMarkCropLine(data, width, height, channels);
    expect(cropLine).toBeGreaterThanOrEqual(121);
    expect(cropLine).toBeLessThanOrEqual(140);
  });

  it('no gap found at all falls back to the ~72% estimate', () => {
    const pattern = new Array(100).fill(true); // all content, no background gap anywhere
    const { data, width, height, channels } = buildRows(pattern);
    expect(findMarkCropLine(data, width, height, channels)).toBe(Math.floor(100 * 0.72));
  });
});

describe('chroma-key constants (sanity)', () => {
  it('BG_LIGHT/BG_DARK are the measured corner colors; THRESHOLD is positive', () => {
    expect(BG_LIGHT).toEqual({ r: 254, g: 253, b: 254 });
    expect(BG_DARK).toEqual({ r: 0, g: 0, b: 0 });
    expect(THRESHOLD).toBeGreaterThan(0);
  });
});
