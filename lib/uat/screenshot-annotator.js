/**
 * Screenshot Annotator for UAT Visual Defects
 *
 * Adds bounding box overlays to screenshots to highlight
 * captured elements for visual defect reports.
 */

import { promises as fs } from 'fs';
import path from 'path';

/**
 * Add a bounding box overlay to a screenshot
 * @param {string} screenshotPath - Path to the original screenshot
 * @param {Object} bbox - Bounding box { x, y, width, height }
 * @param {string} outputPath - Path for the annotated screenshot
 * @param {Object} options - Annotation options
 * @returns {Promise<string>} Path to the annotated screenshot
 */
export async function addBoundingBoxOverlay(screenshotPath, bbox, outputPath, options = {}) {
  const {
    borderColor = '#FF0000',
    borderWidth = 2,
    labelText = null,
    labelBackground = '#FF0000',
    labelColor = '#FFFFFF'
  } = options;

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  await fs.mkdir(outputDir, { recursive: true });

  try {
    // Try to use sharp if available (best quality)
    const sharp = await import('sharp').catch(() => null);

    if (sharp) {
      return await annotateWithSharp(
        sharp.default,
        screenshotPath,
        bbox,
        outputPath,
        { borderColor, borderWidth, labelText, labelBackground, labelColor }
      );
    }

    // Fallback: Create SVG overlay metadata file
    return await createSvgOverlayMetadata(
      screenshotPath,
      bbox,
      outputPath,
      { borderColor, borderWidth, labelText }
    );
  } catch (error) {
    console.error('Screenshot annotation failed:', error.message);
    // Return original screenshot path on failure
    return screenshotPath;
  }
}

/**
 * Annotate screenshot using sharp library
 */
async function annotateWithSharp(sharp, screenshotPath, bbox, outputPath, options) {
  const { borderColor, borderWidth, labelText, labelBackground, labelColor } = options;

  // Read the original image
  const image = sharp(screenshotPath);
  const metadata = await image.metadata();

  // Create SVG overlay with bounding box
  const svgOverlay = createSvgOverlay(
    metadata.width,
    metadata.height,
    bbox,
    { borderColor, borderWidth, labelText, labelBackground, labelColor }
  );

  // Composite the overlay onto the image
  await image
    .composite([{
      input: Buffer.from(svgOverlay),
      top: 0,
      left: 0
    }])
    .toFile(outputPath);

  return outputPath;
}

/**
 * Create SVG overlay string for bounding box annotation
 */
function createSvgOverlay(width, height, bbox, options) {
  const { borderColor, borderWidth, labelText, labelBackground, labelColor } = options;

  let labelSvg = '';
  if (labelText) {
    const labelX = bbox.x;
    const labelY = bbox.y - 20;
    const labelPadding = 4;
    const fontSize = 12;
    const labelWidth = labelText.length * 7 + labelPadding * 2;

    labelSvg = `
      <rect x="${labelX}" y="${Math.max(0, labelY)}" width="${labelWidth}" height="${fontSize + labelPadding * 2}" fill="${labelBackground}" rx="2"/>
      <text x="${labelX + labelPadding}" y="${Math.max(fontSize, labelY + fontSize + labelPadding - 2)}" font-family="Arial, sans-serif" font-size="${fontSize}" fill="${labelColor}">${escapeXml(labelText)}</text>
    `;
  }

  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect
        x="${bbox.x}"
        y="${bbox.y}"
        width="${bbox.width}"
        height="${bbox.height}"
        fill="none"
        stroke="${borderColor}"
        stroke-width="${borderWidth}"
        stroke-dasharray="none"
      />
      ${labelSvg}
    </svg>
  `.trim();
}

/**
 * Fallback: Create metadata file with SVG overlay instructions
 * Used when sharp is not available
 */
async function createSvgOverlayMetadata(screenshotPath, bbox, outputPath, options) {
  const { borderColor, borderWidth, labelText } = options;

  const metadata = {
    original_screenshot: screenshotPath,
    annotation: {
      type: 'bounding_box',
      bbox: {
        x: bbox.x,
        y: bbox.y,
        width: bbox.width,
        height: bbox.height
      },
      style: {
        borderColor,
        borderWidth,
        labelText
      }
    },
    note: 'Install sharp (npm i sharp) for automatic image annotation',
    created_at: new Date().toISOString()
  };

  // Write metadata file
  const metadataPath = outputPath.replace(/\.(png|jpg|jpeg)$/i, '-annotation.json');
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

  // Copy original to output path
  await fs.copyFile(screenshotPath, outputPath);

  console.log(`Screenshot annotation metadata saved to: ${metadataPath}`);
  return outputPath;
}

/**
 * Escape XML special characters
 */
function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Create a comparison view of two screenshots side by side
 * @param {string} leftPath - Path to left screenshot
 * @param {string} rightPath - Path to right screenshot
 * @param {string} outputPath - Path for combined output
 * @returns {Promise<string>} Path to comparison image
 */
export async function createComparisonView(leftPath, rightPath, outputPath, options = {}) {
  const { labels = ['Expected', 'Actual'] } = options;

  try {
    const sharp = await import('sharp').catch(() => null);

    if (!sharp) {
      console.log('Sharp not available, creating comparison metadata only');
      const metadata = {
        type: 'comparison',
        left: { path: leftPath, label: labels[0] },
        right: { path: rightPath, label: labels[1] },
        created_at: new Date().toISOString()
      };
      const metadataPath = outputPath.replace(/\.(png|jpg|jpeg)$/i, '-comparison.json');
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
      return metadataPath;
    }

    // Load both images
    const leftImage = sharp.default(leftPath);
    const rightImage = sharp.default(rightPath);

    const [leftMeta, rightMeta] = await Promise.all([
      leftImage.metadata(),
      rightImage.metadata()
    ]);

    // Resize to same height
    const targetHeight = Math.max(leftMeta.height, rightMeta.height);
    const gap = 10;
    const totalWidth = leftMeta.width + rightMeta.width + gap;

    // Create composite
    const leftBuffer = await leftImage.resize({ height: targetHeight }).toBuffer();
    const rightBuffer = await rightImage.resize({ height: targetHeight }).toBuffer();

    await sharp.default({
      create: {
        width: totalWidth,
        height: targetHeight,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    })
      .composite([
        { input: leftBuffer, left: 0, top: 0 },
        { input: rightBuffer, left: leftMeta.width + gap, top: 0 }
      ])
      .toFile(outputPath);

    return outputPath;
  } catch (error) {
    console.error('Comparison view creation failed:', error.message);
    return leftPath;
  }
}

export default {
  addBoundingBoxOverlay,
  createComparisonView
};
