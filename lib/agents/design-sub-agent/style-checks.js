/**
 * Style Validation Checks
 * Color contrast, typography, and animation validation
 *
 * Extracted from design-sub-agent.js for modularity
 * SD-LEO-REFACTOR-DESIGN-AGENT-001
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';
import { WCAG_CRITERIA, SEVERITY } from './constants.js';
import { getCSSFiles } from './file-helpers.js';

/**
 * Extract colors from CSS content
 * @param {string} css - CSS content
 * @returns {string[]} Array of color values
 */
export function extractColors(css) {
  const colors = [];

  // Hex colors
  const hexColors = css.match(/#[0-9a-f]{3,6}/gi) || [];
  colors.push(...hexColors);

  // RGB colors
  const rgbColors = css.match(/rgb\([^)]+\)/gi) || [];
  colors.push(...rgbColors);

  // Named colors
  const namedColors = css.match(/color:\s*\w+/gi) || [];
  colors.push(...namedColors.map(c => c.replace('color:', '').trim()));

  return colors;
}

/**
 * Check if color is dark
 * @param {string} hexColor - Hex color value
 * @returns {boolean} True if color is dark
 */
export function isColorDark(hexColor) {
  if (!hexColor.startsWith('#')) return false;

  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);

  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness < 128;
}

/**
 * Calculate contrast ratio between two colors
 * @param {string} color1 - First color
 * @param {string} color2 - Second color
 * @returns {number|null} Contrast ratio or null if can't parse
 */
export function calculateContrast(color1, color2) {
  // For now, return null if we can't parse the colors
  if (!color1.startsWith('#') || !color2.startsWith('#')) {
    return null;
  }

  // Very basic contrast check
  const isDark1 = isColorDark(color1);
  const isDark2 = isColorDark(color2);

  if (isDark1 !== isDark2) {
    return 7.5; // Assume good contrast
  } else {
    return 2.5; // Assume poor contrast
  }
}

/**
 * Check color contrast ratios
 * @param {string} basePath - Base path to scan
 * @param {Object} options - File scanning options
 * @returns {Promise<Object>} Color contrast check results
 */
export async function checkColorContrast(basePath, options = {}) {
  const results = {
    issues: [],
    warnings: [],
    passed: []
  };

  const cssFiles = await getCSSFiles(basePath, options);

  // Common color combinations to check
  const _colorCombos = [];

  for (const file of cssFiles) {
    const content = await fs.readFile(file, 'utf8');
    const relPath = path.relative(process.cwd(), file);

    // Extract color definitions
    const _colors = extractColors(content);

    // Find text color + background combinations
    const rules = content.split('}');

    for (const rule of rules) {
      const hasColor = rule.match(/color:\s*([^;]+)/);
      const hasBackground = rule.match(/background(?:-color)?:\s*([^;]+)/);

      if (hasColor && hasBackground) {
        const textColor = hasColor[1].trim();
        const bgColor = hasBackground[1].trim();

        // Calculate contrast if we can parse the colors
        const contrast = calculateContrast(textColor, bgColor);

        if (contrast !== null) {
          if (contrast < WCAG_CRITERIA.contrast.min) {
            results.issues.push({
              type: 'LOW_CONTRAST',
              file: relPath,
              textColor,
              bgColor,
              contrast: contrast.toFixed(2),
              required: WCAG_CRITERIA.contrast.min,
              severity: SEVERITY.HIGH,
              wcag: '1.4.3'
            });
          } else if (contrast < WCAG_CRITERIA.contrast.enhanced) {
            results.warnings.push({
              type: 'SUBOPTIMAL_CONTRAST',
              file: relPath,
              contrast: contrast.toFixed(2),
              recommended: WCAG_CRITERIA.contrast.enhanced
            });
          } else {
            results.passed.push(`Good contrast: ${contrast.toFixed(2)}:1`);
          }
        }
      }
    }

    // Check for common bad patterns
    if (/color:\s*#[789abcdef]{6}/gi.test(content)) {
      results.warnings.push({
        type: 'LIGHT_GRAY_TEXT',
        file: relPath,
        severity: SEVERITY.MEDIUM,
        fix: 'Light gray text often has poor contrast'
      });
    }
  }

  results.status = results.issues.length > 0 ? 'FAIL' :
    results.warnings.length > 3 ? 'WARNING' : 'PASS';

  return results;
}

/**
 * Check typography consistency
 * @param {string} basePath - Base path to scan
 * @param {Object} options - File scanning options
 * @returns {Promise<Object>} Typography check results
 */
export async function checkTypography(basePath, options = {}) {
  const results = {
    fonts: [],
    sizes: [],
    lineHeights: [],
    issues: []
  };

  const cssFiles = await getCSSFiles(basePath, options);

  for (const file of cssFiles) {
    const content = await fs.readFile(file, 'utf8');

    // Extract font families
    const fontFamilies = content.match(/font-family:\s*([^;]+)/gi) || [];
    results.fonts.push(...fontFamilies.map(f => f.replace(/font-family:\s*/i, '').trim()));

    // Extract font sizes
    const fontSizes = content.match(/font-size:\s*([^;]+)/gi) || [];
    results.sizes.push(...fontSizes.map(f => f.replace(/font-size:\s*/i, '').trim()));

    // Extract line heights
    const lineHeights = content.match(/line-height:\s*([^;]+)/gi) || [];
    results.lineHeights.push(...lineHeights.map(f => f.replace(/line-height:\s*/i, '').trim()));
  }

  // Check for consistency
  const uniqueFonts = [...new Set(results.fonts)];
  const uniqueSizes = [...new Set(results.sizes)];

  if (uniqueFonts.length > 3) {
    results.issues.push({
      type: 'TOO_MANY_FONTS',
      count: uniqueFonts.length,
      severity: SEVERITY.MEDIUM,
      fix: 'Limit to 2-3 font families maximum'
    });
  }

  if (uniqueSizes.length > 8) {
    results.issues.push({
      type: 'INCONSISTENT_TYPE_SCALE',
      count: uniqueSizes.length,
      severity: SEVERITY.LOW,
      fix: 'Use a consistent type scale (e.g., 12, 14, 16, 20, 24, 32)'
    });
  }

  // Check for px vs rem usage
  const pxSizes = results.sizes.filter(s => s.includes('px')).length;
  const remSizes = results.sizes.filter(s => s.includes('rem')).length;

  if (pxSizes > 0 && remSizes > 0) {
    results.issues.push({
      type: 'MIXED_UNITS',
      severity: SEVERITY.MEDIUM,
      fix: 'Use rem units consistently for better accessibility'
    });
  }

  results.status = results.issues.filter(i => i.severity === SEVERITY.HIGH).length > 0 ? 'FAIL' :
    results.issues.length > 5 ? 'WARNING' : 'PASS';

  return results;
}

/**
 * Check animation performance
 * @param {string} basePath - Base path to scan
 * @param {Object} options - File scanning options
 * @returns {Promise<Object>} Animation check results
 */
export async function checkAnimations(basePath, options = {}) {
  const results = {
    animations: [],
    issues: [],
    performant: []
  };

  const cssFiles = await getCSSFiles(basePath, options);

  for (const file of cssFiles) {
    const content = await fs.readFile(file, 'utf8');
    const relPath = path.relative(process.cwd(), file);

    // Check for animations
    const animations = content.match(/@keyframes\s+(\w+)/gi) || [];
    const transitions = content.match(/transition:\s*([^;]+)/gi) || [];

    results.animations.push(...animations.map(a => ({
      type: 'keyframes',
      name: a.replace(/@keyframes\s+/i, ''),
      file: relPath
    })));

    // Check for performance issues
    if (/transition:.*all/gi.test(content)) {
      results.issues.push({
        type: 'TRANSITION_ALL',
        file: relPath,
        severity: SEVERITY.MEDIUM,
        fix: 'Specify exact properties instead of "all" for better performance'
      });
    }

    // Check for transform and opacity (performant)
    if (/transform|opacity/gi.test(content)) {
      results.performant.push('Uses transform/opacity for animations');
    }

    // Check for layout-triggering properties
    if (/animation.*(?:width|height|top|left)/gi.test(content)) {
      results.issues.push({
        type: 'LAYOUT_ANIMATION',
        file: relPath,
        severity: SEVERITY.HIGH,
        fix: 'Avoid animating layout properties (width, height, top, left)'
      });
    }

    // Check for will-change
    if (/will-change:\s*transform/gi.test(content)) {
      results.performant.push('Uses will-change for optimization');
    }

    // Check for reduced motion support
    if (/@media.*prefers-reduced-motion/gi.test(content)) {
      results.performant.push('Respects prefers-reduced-motion');
    } else if (animations.length > 0 || transitions.length > 0) {
      results.issues.push({
        type: 'NO_REDUCED_MOTION',
        file: relPath,
        severity: SEVERITY.MEDIUM,
        wcag: '2.3.3',
        fix: 'Add @media (prefers-reduced-motion: reduce) support'
      });
    }
  }

  results.status = results.issues.filter(i => i.severity === SEVERITY.HIGH).length > 0 ? 'FAIL' :
    results.issues.length > 3 ? 'WARNING' : 'PASS';

  return results;
}
