/**
 * Accessibility Validation Checks
 * WCAG compliance validation
 *
 * Extracted from design-sub-agent.js for modularity
 * SD-LEO-REFACTOR-DESIGN-AGENT-001
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';
import { WCAG_CRITERIA, SEVERITY } from './constants.js';
import { getComponentFiles, getCSSFiles } from './file-helpers.js';

/**
 * Check accessibility compliance
 * @param {string} basePath - Base path to scan
 * @param {Object} options - File scanning options
 * @returns {Promise<Object>} Accessibility check results
 */
export async function checkAccessibility(basePath, options = {}) {
  const results = {
    issues: [],
    warnings: [],
    passed: [],
    wcagLevel: 'AA'
  };

  const files = await getComponentFiles(basePath, options);

  for (const file of files) {
    const content = await fs.readFile(file, 'utf8');
    const relPath = path.relative(process.cwd(), file);

    // Check for images without alt text
    if (/<img(?![^>]*alt=)/gi.test(content)) {
      results.issues.push({
        type: 'MISSING_ALT_TEXT',
        file: relPath,
        severity: SEVERITY.HIGH,
        wcag: '1.1.1',
        fix: 'Add alt="" for decorative images or descriptive alt text for informative images'
      });
    }

    // Check for missing ARIA labels on interactive elements
    const interactiveElements = content.match(/<(button|input|select|textarea)[^>]*>/gi) || [];
    for (const element of interactiveElements) {
      if (!element.includes('aria-label') && !element.includes('aria-labelledby') && !element.includes('placeholder')) {
        const elementType = element.match(/<(\w+)/)[1];
        results.warnings.push({
          type: 'MISSING_ARIA_LABEL',
          element: elementType,
          file: relPath,
          severity: SEVERITY.MEDIUM,
          wcag: '4.1.2'
        });
      }
    }

    // Check for proper heading structure
    const headings = content.match(/<h[1-6]/gi) || [];
    const headingLevels = headings.map(h => parseInt(h.charAt(2))).sort();

    for (let i = 1; i < headingLevels.length; i++) {
      if (headingLevels[i] - headingLevels[i - 1] > 1) {
        results.issues.push({
          type: 'HEADING_SKIP',
          file: relPath,
          from: `h${headingLevels[i - 1]}`,
          to: `h${headingLevels[i]}`,
          severity: SEVERITY.MEDIUM,
          wcag: '1.3.1',
          fix: 'Maintain proper heading hierarchy without skipping levels'
        });
      }
    }

    // Check for keyboard navigation
    if (/<div[^>]*onclick/gi.test(content) && !/<div[^>]*tabindex/gi.test(content)) {
      results.issues.push({
        type: 'KEYBOARD_TRAP',
        file: relPath,
        severity: SEVERITY.HIGH,
        wcag: '2.1.1',
        fix: 'Add tabindex="0" and keyboard event handlers to clickable divs'
      });
    }

    // Check for focus indicators
    if (/outline:\s*none|outline:\s*0/gi.test(content) && !/focus:.*outline/gi.test(content)) {
      results.warnings.push({
        type: 'MISSING_FOCUS_INDICATOR',
        file: relPath,
        severity: SEVERITY.HIGH,
        wcag: '2.4.7',
        fix: 'Provide visible focus indicators for keyboard navigation'
      });
    }

    // Check for form labels
    const inputs = content.match(/<input[^>]*>/gi) || [];
    const labels = content.match(/<label/gi) || [];

    if (inputs.length > labels.length) {
      results.issues.push({
        type: 'MISSING_FORM_LABELS',
        file: relPath,
        severity: SEVERITY.HIGH,
        wcag: '3.3.2',
        inputs: inputs.length,
        labels: labels.length,
        fix: 'Associate all form inputs with labels'
      });
    }

    // Check for semantic HTML
    if (/<div[^>]*role=["']button["']/gi.test(content)) {
      results.warnings.push({
        type: 'NON_SEMANTIC_HTML',
        file: relPath,
        severity: SEVERITY.LOW,
        fix: 'Use <button> instead of <div role="button">'
      });
    }
  }

  // Check for positive patterns
  const cssFiles = await getCSSFiles(basePath, options);
  for (const file of cssFiles) {
    const content = await fs.readFile(file, 'utf8');

    if (/:focus-visible/gi.test(content)) {
      results.passed.push('Uses :focus-visible for better keyboard navigation');
    }

    if (/@media.*prefers-reduced-motion/gi.test(content)) {
      results.passed.push('Respects prefers-reduced-motion');
    }

    if (/@media.*prefers-color-scheme/gi.test(content)) {
      results.passed.push('Supports dark mode preference');
    }
  }

  results.status = results.issues.length === 0 ? 'PASS' :
    results.issues.filter(i => i.severity === SEVERITY.HIGH).length > 2 ? 'FAIL' : 'WARNING';

  return results;
}

/**
 * Check touch target sizes
 * @param {string} basePath - Base path to scan
 * @param {Object} options - File scanning options
 * @returns {Promise<Object>} Touch target check results
 */
export async function checkTouchTargets(basePath, options = {}) {
  const results = {
    issues: [],
    warnings: [],
    passed: []
  };

  const cssFiles = await getCSSFiles(basePath, options);

  for (const file of cssFiles) {
    const content = await fs.readFile(file, 'utf8');
    const relPath = path.relative(process.cwd(), file);

    // Check button sizes
    const buttonRules = content.match(/button[^{]*\{[^}]+\}/gi) || [];

    for (const rule of buttonRules) {
      const height = rule.match(/height:\s*(\d+)/);
      const minHeight = rule.match(/min-height:\s*(\d+)/);
      const padding = rule.match(/padding:\s*(\d+)/);

      let effectiveHeight = 0;

      if (height) effectiveHeight = parseInt(height[1]);
      else if (minHeight) effectiveHeight = parseInt(minHeight[1]);
      else if (padding) effectiveHeight = parseInt(padding[1]) * 2 + 20; // Estimate

      if (effectiveHeight > 0 && effectiveHeight < WCAG_CRITERIA.touchTarget.min) {
        results.issues.push({
          type: 'SMALL_TOUCH_TARGET',
          file: relPath,
          size: effectiveHeight,
          minimum: WCAG_CRITERIA.touchTarget.min,
          severity: SEVERITY.HIGH,
          wcag: '2.5.5',
          fix: `Minimum touch target should be ${WCAG_CRITERIA.touchTarget.min}px`
        });
      }
    }

    // Check link spacing
    if (/a\s*\{[^}]*line-height:\s*1(?:\.\d)?\s*;/gi.test(content)) {
      results.warnings.push({
        type: 'CRAMPED_LINKS',
        file: relPath,
        severity: SEVERITY.MEDIUM,
        fix: 'Increase line-height for better touch targets in link lists'
      });
    }
  }

  // Check component files for inline styles
  const componentFiles = await getComponentFiles(basePath, options);

  for (const file of componentFiles) {
    const content = await fs.readFile(file, 'utf8');

    // Check for small fixed sizes
    const smallSizes = content.match(/(?:width|height):\s*["']?\d{1,2}px/gi) || [];

    if (smallSizes.length > 0) {
      results.warnings.push({
        type: 'POTENTIAL_SMALL_TARGETS',
        file: path.relative(process.cwd(), file),
        count: smallSizes.length,
        severity: SEVERITY.LOW
      });
    }
  }

  results.status = results.issues.filter(i => i.severity === SEVERITY.HIGH).length > 0 ? 'FAIL' :
    results.warnings.length > 5 ? 'WARNING' : 'PASS';

  return results;
}
