/**
 * Design System Compliance Checks
 * Validates design system usage and token compliance
 *
 * Extracted from design-sub-agent.js for modularity
 * SD-LEO-REFACTOR-DESIGN-AGENT-001
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';
import { SEVERITY } from './constants.js';
import { getCSSFiles, getComponentFiles } from './file-helpers.js';

/**
 * Check design system compliance
 * @param {string} basePath - Base path to scan
 * @param {Object} options - File scanning options
 * @returns {Promise<Object>} Design system compliance results
 */
export async function checkDesignSystem(basePath, options = {}) {
  const results = {
    tokens: {},
    components: {},
    compliance: 0,
    issues: []
  };

  // Look for design tokens/variables
  const cssFiles = await getCSSFiles(basePath, options);
  let hasVariables = false;
  let hasTokens = false;

  for (const file of cssFiles) {
    const content = await fs.readFile(file, 'utf8');

    // Check for CSS variables
    if (/--\w+:/gi.test(content)) {
      hasVariables = true;
      const variables = content.match(/--[\w-]+:/gi) || [];
      results.tokens.cssVariables = variables.length;
    }

    // Check for design token usage
    if (/var\(--/gi.test(content)) {
      hasTokens = true;
      const usage = content.match(/var\(--[\w-]+\)/gi) || [];
      results.tokens.usage = usage.length;
    }

    // Check for hard-coded values
    const hardcodedColors = content.match(/#[0-9a-f]{3,6}/gi) || [];
    if (hardcodedColors.length > 10) {
      results.issues.push({
        type: 'HARDCODED_COLORS',
        count: hardcodedColors.length,
        file: path.relative(process.cwd(), file),
        severity: SEVERITY.MEDIUM,
        fix: 'Use CSS variables or design tokens for colors'
      });
    }
  }

  // Check component structure
  const componentFiles = await getComponentFiles(basePath, options);
  const componentPatterns = {
    atomic: 0,
    compound: 0,
    composed: 0
  };

  for (const file of componentFiles) {
    const name = path.basename(file);

    if (/^(Atom|Molecule|Organism)/i.test(name)) {
      componentPatterns.atomic++;
    } else if (/^(Base|Core|Ui)/i.test(name)) {
      componentPatterns.compound++;
    }
  }

  results.components = componentPatterns;

  // Calculate compliance score
  let score = 0;
  if (hasVariables) score += 25;
  if (hasTokens) score += 25;
  if (results.issues.length === 0) score += 25;
  if (componentPatterns.atomic > 0 || componentPatterns.compound > 0) score += 25;

  results.compliance = score;

  results.status = score >= 75 ? 'PASS' : score >= 50 ? 'WARNING' : 'FAIL';

  return results;
}
