/**
 * Extractors Domain
 * Selector, navigation, and component extraction utilities
 *
 * @module test-intelligence/extractors
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileFromBranch } from './file-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Extract selectors from test file
 * @param {string|Object} testFile - Test file path or object
 * @param {Object} options - Options including branch context
 * @returns {Promise<Array>} List of selectors
 */
export async function extractSelectorsFromTest(testFile, options = {}) {
  const selectors = [];

  const isObject = typeof testFile === 'object';
  const filePath = isObject ? testFile.path : testFile;
  const branch = isObject ? testFile.branch : options.branch;
  const repoPath = isObject ? (options.repoPath || path.resolve(__dirname, '../../../../../ehg')) : null;

  try {
    let content;

    // If we have branch context, read from branch via git
    if (branch && repoPath) {
      content = readFileFromBranch(repoPath, branch, filePath);
      if (!content) {
        console.warn(`   ⚠️  Could not read ${path.basename(filePath)} from branch ${branch}`);
        return selectors;
      }
    } else {
      content = await fs.readFile(filePath, 'utf-8');
    }

    const lines = content.split('\n');

    // Pattern: waitForSelector, getByRole, getByText, locator with text=
    const selectorPatterns = [
      /waitForSelector\(['"`]text=([^'"`]+)['"`]/g,
      /locator\(['"`]text=([^'"`]+)['"`]/g,
      /getByText\(['"`]([^'"`]+)['"`]/g,
      /getByRole\([^)]*name:\s*\/([^/]+)\//g
    ];

    lines.forEach((line, index) => {
      selectorPatterns.forEach(pattern => {
        const matches = [...line.matchAll(pattern)];
        matches.forEach(match => {
          selectors.push({
            text: match[1],
            line_number: index + 1,
            original_line: line,
            type: pattern.source.includes('waitFor') ? 'waitForSelector' :
                  pattern.source.includes('locator') ? 'locator' :
                  pattern.source.includes('getByText') ? 'getByText' : 'getByRole'
          });
        });
      });
    });
  } catch (error) {
    console.warn(`   ⚠️  Could not extract selectors: ${error.message}`);
  }

  return selectors;
}

/**
 * Find referenced components based on selectors
 * @param {string|Object} testFile - Test file
 * @param {Array} selectors - List of selectors
 * @returns {Promise<Array>} List of components
 */
export async function findReferencedComponents(testFile, selectors) {
  const components = [];
  const componentDir = path.resolve(__dirname, '../../../../../ehg/src/components/stages');

  try {
    // Check for common stage patterns in selectors
    const stagePatterns = selectors.map(s => s.text.match(/Stage (\d+)/)).filter(Boolean);

    for (const match of stagePatterns) {
      const stageNum = match[1];
      const files = await fs.readdir(componentDir);
      const stageFile = files.find(f => f.includes(`Stage${stageNum}`) && f.endsWith('.tsx'));

      if (stageFile) {
        components.push({
          name: stageFile.replace('.tsx', ''),
          path: path.join(componentDir, stageFile)
        });
      }
    }
  } catch (error) {
    console.warn(`   ⚠️  Could not find components: ${error.message}`);
  }

  return components;
}

/**
 * Validate a selector against component code
 * @param {Object} selector - Selector object
 * @param {Array} components - List of components
 * @returns {Promise<Object>} Validation result
 */
export async function validateSelector(selector, components) {
  const validation = {
    is_valid: false,
    actual_text: null,
    component_file: null,
    component_line: null,
    severity: 'HIGH',
    reason: null,
    suggested_fix: null
  };

  try {
    // Search for selector text in component files
    for (const component of components) {
      const content = await fs.readFile(component.path, 'utf-8');
      const lines = content.split('\n');

      // Look for exact match
      const exactMatch = lines.findIndex(line => line.includes(selector.text));

      if (exactMatch !== -1) {
        validation.is_valid = true;
        validation.component_file = path.basename(component.path);
        validation.component_line = exactMatch + 1;
        return validation;
      }

      // Look for partial matches
      const partialMatch = lines.findIndex(line => {
        const normalized = line.toLowerCase().replace(/[^\w\s]/g, '');
        const selectorNormalized = selector.text.toLowerCase().replace(/[^\w\s]/g, '');
        return normalized.includes(selectorNormalized) || selectorNormalized.includes(normalized);
      });

      if (partialMatch !== -1) {
        const actualLine = lines[partialMatch];
        const actualTextMatch = actualLine.match(/[">]([^<"]+)[<"]/);

        if (actualTextMatch) {
          validation.is_valid = false;
          validation.actual_text = actualTextMatch[1].trim();
          validation.component_file = path.basename(component.path);
          validation.component_line = partialMatch + 1;
          validation.reason = `Selector text doesn't match component. Found "${validation.actual_text}" instead`;
          validation.suggested_fix = selector.original_line.replace(selector.text, validation.actual_text);
          validation.severity = 'CRITICAL';
        }
      }
    }

    if (!validation.is_valid && !validation.actual_text) {
      validation.reason = 'Selector text not found in any component';
      validation.severity = 'CRITICAL';
    }

  } catch (error) {
    validation.reason = `Validation error: ${error.message}`;
  }

  return validation;
}

/**
 * Extract navigation sequences from test file
 * @param {string|Object} testFile - Test file
 * @param {Object} options - Options
 * @returns {Promise<Array>} List of navigation sequences
 */
export async function extractNavigationSequences(testFile, options = {}) {
  const sequences = [];

  const isObject = typeof testFile === 'object';
  const filePath = isObject ? testFile.path : testFile;
  const branch = isObject ? testFile.branch : options.branch;
  const repoPath = isObject ? (options.repoPath || path.resolve(__dirname, '../../../../../ehg')) : null;

  try {
    let content;

    if (branch && repoPath) {
      content = readFileFromBranch(repoPath, branch, filePath);
      if (!content) {
        return sequences;
      }
    } else {
      content = await fs.readFile(filePath, 'utf-8');
    }

    const lines = content.split('\n');

    let currentSequence = null;

    lines.forEach((line, index) => {
      // Detect navigation actions
      if (line.includes('.click()') || line.includes('navigate') || line.includes('goto')) {
        if (!currentSequence) {
          currentSequence = { steps: [], start_line: index + 1 };
        }
        currentSequence.steps.push({
          line: index + 1,
          action: line.trim()
        });
      }

      // Detect sequence end
      if (currentSequence && (line.includes('waitForSelector') || line.includes('expect'))) {
        currentSequence.end_line = index + 1;
        sequences.push(currentSequence);
        currentSequence = null;
      }
    });
  } catch (error) {
    console.warn(`   ⚠️  Could not extract navigation: ${error.message}`);
  }

  return sequences;
}

/**
 * Validate a navigation sequence
 * @param {Object} _sequence - Navigation sequence
 * @returns {Object} Validation result
 */
export function validateNavigationSequence(_sequence) {
  // Simplified validation
  return {
    is_valid: true,
    optimal_path: null
  };
}

/**
 * Extract component references from test file
 * @param {string|Object} testFile - Test file
 * @param {Object} options - Options
 * @returns {Promise<Array>} List of component references
 */
export async function extractComponentReferences(testFile, options = {}) {
  const references = [];

  const isObject = typeof testFile === 'object';
  const filePath = isObject ? testFile.path : testFile;
  const branch = isObject ? testFile.branch : options.branch;
  const repoPath = isObject ? (options.repoPath || path.resolve(__dirname, '../../../../../ehg')) : null;

  try {
    let content;

    if (branch && repoPath) {
      content = readFileFromBranch(repoPath, branch, filePath);
      if (!content) {
        return references;
      }
    } else {
      content = await fs.readFile(filePath, 'utf-8');
    }

    const lines = content.split('\n');

    lines.forEach((line, index) => {
      const importMatch = line.match(/from ['"].*\/([A-Z][a-zA-Z0-9]+)['"]/);
      if (importMatch) {
        references.push({
          name: importMatch[1],
          line_number: index + 1,
          type: 'import'
        });
      }
    });
  } catch (error) {
    console.warn(`   ⚠️  Could not extract references: ${error.message}`);
  }

  return references;
}

export default {
  extractSelectorsFromTest,
  findReferencedComponents,
  validateSelector,
  extractNavigationSequences,
  validateNavigationSequence,
  extractComponentReferences
};
