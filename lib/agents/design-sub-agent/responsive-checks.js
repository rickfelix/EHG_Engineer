/**
 * Responsive Design Validation Checks
 * Validates responsive design implementation
 *
 * Extracted from design-sub-agent.js for modularity
 * SD-LEO-REFACTOR-DESIGN-AGENT-001
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';
import { SEVERITY } from './constants.js';
import { getCSSFiles, getHTMLFiles, getComponentFiles } from './file-helpers.js';

/**
 * Check responsive design implementation
 * @param {string} basePath - Base path to scan
 * @param {Object} options - File scanning options
 * @returns {Promise<Object>} Responsive design check results
 */
export async function checkResponsiveDesign(basePath, options = {}) {
  const results = {
    breakpoints: [],
    issues: [],
    mobileFirst: false,
    viewportMeta: false
  };

  // Check for viewport meta tag in HTML
  const htmlFiles = await getHTMLFiles(basePath, options);
  for (const file of htmlFiles) {
    const content = await fs.readFile(file, 'utf8');

    if (/<meta[^>]*viewport/gi.test(content)) {
      results.viewportMeta = true;

      // Check for proper viewport settings
      if (!content.includes('width=device-width') || !content.includes('initial-scale=1')) {
        results.issues.push({
          type: 'INCORRECT_VIEWPORT',
          file: path.relative(process.cwd(), file),
          severity: SEVERITY.HIGH,
          fix: '<meta name="viewport" content="width=device-width, initial-scale=1">'
        });
      }
    }
  }

  // Analyze CSS for responsive patterns
  const cssFiles = await getCSSFiles(basePath, options);

  for (const file of cssFiles) {
    const content = await fs.readFile(file, 'utf8');
    const relPath = path.relative(process.cwd(), file);

    // Extract media queries
    const mediaQueries = content.match(/@media[^{]+/gi) || [];

    for (const query of mediaQueries) {
      // Check for min-width (mobile-first)
      if (/min-width/gi.test(query)) {
        results.mobileFirst = true;
        const width = query.match(/min-width:\s*(\d+)/);
        if (width) {
          results.breakpoints.push({
            type: 'min-width',
            value: parseInt(width[1]),
            file: relPath
          });
        }
      }

      // Check for max-width (desktop-first)
      if (/max-width/gi.test(query)) {
        const width = query.match(/max-width:\s*(\d+)/);
        if (width) {
          results.breakpoints.push({
            type: 'max-width',
            value: parseInt(width[1]),
            file: relPath
          });
        }
      }
    }

    // Check for fixed widths
    const fixedWidths = content.match(/width:\s*\d+px/gi) || [];
    if (fixedWidths.length > 5) {
      results.issues.push({
        type: 'EXCESSIVE_FIXED_WIDTHS',
        file: relPath,
        count: fixedWidths.length,
        severity: SEVERITY.MEDIUM,
        fix: 'Use relative units (%, rem, vw) instead of fixed pixels'
      });
    }

    // Check for horizontal scroll issues
    if (/overflow-x:\s*scroll/gi.test(content)) {
      results.issues.push({
        type: 'HORIZONTAL_SCROLL',
        file: relPath,
        severity: SEVERITY.MEDIUM,
        fix: 'Avoid horizontal scrolling on mobile devices'
      });
    }

    // Check for flexible images
    if (!content.includes('max-width: 100%') && content.includes('img')) {
      results.issues.push({
        type: 'NON_RESPONSIVE_IMAGES',
        file: relPath,
        severity: SEVERITY.MEDIUM,
        fix: 'Add img { max-width: 100%; height: auto; }'
      });
    }
  }

  // Analyze breakpoint consistency
  const uniqueBreakpoints = [...new Set(results.breakpoints.map(b => b.value))];
  if (uniqueBreakpoints.length > 5) {
    results.issues.push({
      type: 'TOO_MANY_BREAKPOINTS',
      count: uniqueBreakpoints.length,
      severity: SEVERITY.LOW,
      fix: 'Standardize on 3-4 main breakpoints'
    });
  }

  // Check component files for responsive utilities
  const componentFiles = await getComponentFiles(basePath, options);
  let _responsiveUtilities = 0;

  for (const file of componentFiles) {
    const content = await fs.readFile(file, 'utf8');

    // Check for responsive utility classes (Tailwind, Bootstrap)
    if (/sm:|md:|lg:|xl:|col-sm|col-md|col-lg/gi.test(content)) {
      _responsiveUtilities++;
    }

    // Check for CSS Grid or Flexbox
    if (/display:\s*(grid|flex)/gi.test(content)) {
      results.passed = results.passed || [];
      results.passed.push('Uses modern layout (Grid/Flexbox)');
    }
  }

  results.status = !results.viewportMeta || results.issues.filter(i => i.severity === SEVERITY.HIGH).length > 0 ? 'FAIL' :
    results.issues.length > 3 ? 'WARNING' : 'PASS';

  return results;
}
