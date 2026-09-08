/**
 * Pins that lib/apa/fixtures/alt-text-sample.png (the image altifyaiGenerateAltText posts to
 * stp-e3e6 and its sibling generation steps) is a genuine, non-degenerate image -- not a 1x1
 * transparent pixel or a uniform solid color. QF-20260906-282.
 *
 * stp-e3e6 has NEVER succeeded across 5 historical uat_test_results rows with several
 * distinct failure modes, and the walker's OLD fixed 1x1 transparent-pixel fixture could not
 * distinguish a degenerate-input artifact from a genuine model/binding defect. This test
 * guards against a future regression silently swapping the fixture back to something
 * degenerate.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const FIXTURE_PATH = fileURLToPath(new URL('../../../lib/apa/fixtures/alt-text-sample.png', import.meta.url));

describe('lib/apa/fixtures/alt-text-sample.png (QF-20260906-282)', () => {
  it('exists and is a valid PNG file', () => {
    const buf = readFileSync(FIXTURE_PATH);
    expect(buf.length).toBeGreaterThan(0);
    // PNG magic bytes
    expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  });

  it('has non-degenerate dimensions (width and height > 1)', async () => {
    const metadata = await sharp(FIXTURE_PATH).metadata();
    expect(metadata.width).toBeGreaterThan(1);
    expect(metadata.height).toBeGreaterThan(1);
  });

  it('has non-uniform pixels (not a solid color, not fully transparent)', async () => {
    const { data, info } = await sharp(FIXTURE_PATH)
      .raw()
      .toBuffer({ resolveWithObject: true });

    const channels = info.channels;
    const pixelCount = info.width * info.height;
    expect(pixelCount).toBeGreaterThan(1);

    const first = Array.from(data.subarray(0, channels));
    let allSame = true;
    for (let i = 1; i < pixelCount; i++) {
      const px = data.subarray(i * channels, i * channels + channels);
      for (let c = 0; c < channels; c++) {
        if (px[c] !== first[c]) { allSame = false; break; }
      }
      if (!allSame) break;
    }
    expect(allSame, 'fixture must not be a single uniform color across every pixel').toBe(false);
  });

  it('is small (bounded file size, keeps the walker fast)', () => {
    const buf = readFileSync(FIXTURE_PATH);
    expect(buf.length).toBeLessThan(10 * 1024); // well under MAX_IMAGE_BYTES concerns; walker fixture, not a stress test
  });
});
