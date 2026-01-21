/**
 * Workflow Data Loader
 * Loads stages data from YAML and provides helper functions
 *
 * Extracted from generate-workflow-docs.js for modularity
 * SD-LEO-REFACTOR-WORKFLOW-DOCS-001
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Root paths
export const scriptsDir = path.join(__dirname, '..');
export const docsDir = path.join(scriptsDir, '..', 'docs');
export const workflowDir = path.join(docsDir, 'workflow');
export const stagesDir = path.join(docsDir, 'stages');

// Load stages data
const stagesPath = path.join(workflowDir, 'stages.yaml');

let _stagesCache = null;

/**
 * Load and cache stages data from YAML
 * @returns {Array} Array of stage objects
 */
export function loadStages() {
  if (_stagesCache) return _stagesCache;

  const stagesData = yaml.load(fs.readFileSync(stagesPath, 'utf8'));
  _stagesCache = stagesData.stages;
  return _stagesCache;
}

/**
 * Get stages data (alias for loadStages)
 * @returns {Array} Array of stage objects
 */
export function getStages() {
  return loadStages();
}

/**
 * Helper to ensure directory exists
 * @param {string} dirPath - Directory path to ensure
 */
export function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Generate URL-friendly slug from title
 * @param {string} title - Title to convert
 * @returns {string} URL-friendly slug
 */
export function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/**
 * Pad stage ID with leading zeros
 * @param {number} id - Stage ID
 * @returns {string} Zero-padded ID (e.g., "01", "10")
 */
export function padStageId(id) {
  return String(id).padStart(2, '0');
}
