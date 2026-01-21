/**
 * Codebase Analysis Functions
 * Analyzes the codebase to find relevant patterns and references
 *
 * @module codebase-analysis
 */

import { fileURLToPath } from 'url';
import path, { dirname } from 'path';
import { existsSync } from 'fs';
import pkg from 'glob';
const { glob } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Analyze codebase patterns for context generation
 * @param {string} _sdId - Strategic Directive ID
 * @param {Object} prd - PRD object for context
 * @returns {Promise<Object>} Codebase patterns
 */
export async function analyzeCodebasePatterns(_sdId, prd) {
  const patterns = {
    components: [],
    services: [],
    utilities: [],
    hooks: [],
    types: []
  };

  // Detect target application from PRD or SD
  const targetApp = detectTargetApplication(prd);
  const basePath = targetApp === 'EHG'
    ? path.resolve(__dirname, '../../../../../../ehg')
    : path.resolve(__dirname, '../../../../..');

  console.log(`   Target app: ${targetApp} (${basePath})`);

  try {
    // Find existing components
    if (existsSync(`${basePath}/src/components`)) {
      const componentFiles = await glob(`${basePath}/src/components/**/*.{tsx,jsx}`, { absolute: true });
      const filesArray = Array.isArray(componentFiles) ? componentFiles : [];
      patterns.components = filesArray.slice(0, 10).map(f => ({
        path: f.replace(basePath, ''),
        name: f.split('/').pop().replace(/\.(tsx|jsx)$/, '')
      }));
    }

    // Find existing services
    if (existsSync(`${basePath}/src/services`)) {
      const serviceFiles = await glob(`${basePath}/src/services/**/*.{ts,js}`, { absolute: true });
      const filesArray = Array.isArray(serviceFiles) ? serviceFiles : [];
      patterns.services = filesArray.slice(0, 10).map(f => ({
        path: f.replace(basePath, ''),
        name: f.split('/').pop().replace(/\.(ts|js)$/, '')
      }));
    }

    // Find existing hooks
    if (existsSync(`${basePath}/src/hooks`)) {
      const hookFiles = await glob(`${basePath}/src/hooks/**/*.{ts,tsx,js,jsx}`, { absolute: true });
      const filesArray = Array.isArray(hookFiles) ? hookFiles : [];
      patterns.hooks = filesArray.slice(0, 10).map(f => ({
        path: f.replace(basePath, ''),
        name: f.split('/').pop().replace(/\.(ts|tsx|js|jsx)$/, '')
      }));
    }

  } catch (error) {
    console.log(`   Warning: Pattern analysis warning: ${error.message}`);
  }

  return patterns;
}

/**
 * Detect target application from PRD content
 * @param {Object} prd - PRD object
 * @returns {string} Target application name
 */
export function detectTargetApplication(prd) {
  if (!prd) return 'EHG';

  const content = `${prd.title} ${prd.executive_summary || ''} ${prd.technical_context || ''}`.toLowerCase();

  // EHG_Engineer indicators
  if (content.includes('leo protocol') ||
      content.includes('strategic directive') ||
      content.includes('dashboard') && content.includes('management') ||
      content.includes('engineer')) {
    return 'EHG_Engineer';
  }

  return 'EHG';
}
