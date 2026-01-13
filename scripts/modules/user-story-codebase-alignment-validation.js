/**
 * USER STORY CODEBASE ALIGNMENT VALIDATION (US-002)
 *
 * LEO Protocol v4.3.4 Enhancement - Addresses Genesis PRD Review feedback:
 * "Key file paths in PRDs/User Stories are aspirational, not verified"
 *
 * Validates that file paths referenced in user stories actually exist in the codebase.
 * Prevents implementation blocking due to aspirational/incorrect paths.
 *
 * @module user-story-codebase-alignment-validation
 * @version 1.0.0
 * @see SD-LEO-PROTOCOL-V434-001
 */

import fs from 'fs';
import path from 'path';
import glob from 'glob';
import { fileURLToPath } from 'url';

// Cross-platform path resolution (SD-WIN-MIG-005 fix)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EHG_ENGINEER_ROOT = path.resolve(__dirname, '../..');
const EHG_ROOT = path.resolve(__dirname, '../../../ehg');

// Default application paths by target_application
const APP_PATHS = {
  EHG: EHG_ROOT,
  EHG_Engineer: EHG_ENGINEER_ROOT,
  default: EHG_ROOT
};

/**
 * Detect path format from file path string
 * @param {string} filePath - Path to analyze
 * @returns {string} Format: 'absolute', 'relative', 'repository-relative', 'glob-pattern', 'filename-only'
 */
export function detectPathFormat(filePath) {
  if (!filePath || typeof filePath !== 'string') return 'invalid';

  if (filePath.startsWith('/')) return 'absolute';
  if (filePath.includes('EHG/') || filePath.includes('EHG_Engineer/')) return 'repository-relative';
  if (filePath.includes('*')) return 'glob-pattern';
  if (!filePath.includes('/')) return 'filename-only';
  return 'relative';
}

/**
 * Extract file paths from user story implementation_context
 * Parses various formats: bullet lists, inline mentions, etc.
 *
 * @param {Object} story - User story object
 * @returns {string[]} Array of detected file paths
 */
export function extractPathsFromStory(story) {
  const paths = [];
  const pathPatterns = [
    // Match common file extensions
    /(?:^|\s|['"`])([a-zA-Z0-9_\-./]+\.(ts|tsx|js|jsx|json|sql|md|yml|yaml|css|scss))/gm,
    // Match paths with common prefixes
    /(?:^|\s|['"`])((?:src|lib|scripts|database|tests|components|pages|hooks|utils|modules)\/[a-zA-Z0-9_\-./]+)/gm,
    // Match explicit file references
    /(?:file|path|location|target|modify|update|create|in)\s*[:=]?\s*['"`]?([a-zA-Z0-9_\-./]+\.[a-z]+)/gmi,
  ];

  // Check implementation_context field
  const contextFields = [
    story.implementation_context,
    story.key_files,
    story.acceptance_criteria
  ];

  for (const field of contextFields) {
    if (!field) continue;

    const text = typeof field === 'string'
      ? field
      : (Array.isArray(field) ? field.join(' ') : JSON.stringify(field));

    for (const pattern of pathPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const extractedPath = match[1];
        if (extractedPath && !paths.includes(extractedPath)) {
          paths.push(extractedPath);
        }
      }
    }
  }

  return paths;
}

/**
 * Resolve and validate a single file path
 *
 * @param {string} filePath - Path to validate
 * @param {string} appPath - Application root path
 * @param {Object} options - Validation options
 * @returns {Object} { exists: boolean, resolvedPath: string, format: string, warnings: string[] }
 */
export async function validateFileExists(filePath, appPath, options = {}) {
  const result = {
    originalPath: filePath,
    exists: false,
    resolvedPath: null,
    format: detectPathFormat(filePath),
    warnings: [],
    strategy: null
  };

  if (!filePath || result.format === 'invalid') {
    result.warnings.push(`Invalid path format: ${filePath}`);
    return result;
  }

  try {
    // Strategy 1: Absolute path
    if (result.format === 'absolute') {
      if (fs.existsSync(filePath)) {
        result.exists = true;
        result.resolvedPath = filePath;
        result.strategy = 'absolute';
        return result;
      }
    }

    // Strategy 2: Relative to app root
    if (result.format === 'relative') {
      const resolved = path.join(appPath, filePath);
      if (fs.existsSync(resolved)) {
        result.exists = true;
        result.resolvedPath = resolved;
        result.strategy = 'relative-to-app';
        return result;
      }
    }

    // Strategy 3: Repository-relative (strip EHG/ or EHG_Engineer/ prefix)
    if (result.format === 'repository-relative') {
      let stripped = filePath
        .replace(/^EHG_Engineer\//, '')
        .replace(/^EHG\//, '');
      const resolved = path.join(appPath, stripped);
      if (fs.existsSync(resolved)) {
        result.exists = true;
        result.resolvedPath = resolved;
        result.strategy = 'repository-relative';
        return result;
      }
    }

    // Strategy 4: Glob pattern
    if (result.format === 'glob-pattern') {
      const matches = await glob(filePath, { cwd: appPath, nodir: true });
      if (matches.length > 0) {
        result.exists = true;
        result.resolvedPath = matches[0];
        result.strategy = 'glob-pattern';
        result.warnings.push(`Glob pattern matched ${matches.length} file(s)`);
        return result;
      }
    }

    // Strategy 5: Search common directories for filename
    if (result.format === 'filename-only') {
      const searchDirs = ['src', 'lib', 'scripts', 'components', 'pages', 'hooks', 'utils'];
      for (const dir of searchDirs) {
        const searchPath = path.join(appPath, dir);
        if (fs.existsSync(searchPath)) {
          const pattern = `${dir}/**/${filePath}`;
          const matches = await glob(pattern, { cwd: appPath, nodir: true });
          if (matches.length > 0) {
            result.exists = true;
            result.resolvedPath = path.join(appPath, matches[0]);
            result.strategy = 'filename-search';
            if (matches.length > 1) {
              result.warnings.push(`Multiple matches found for '${filePath}': ${matches.length} files`);
            }
            return result;
          }
        }
      }
    }

    // Last resort: Try direct path
    const directPath = path.join(appPath, filePath);
    if (fs.existsSync(directPath)) {
      result.exists = true;
      result.resolvedPath = directPath;
      result.strategy = 'direct';
      return result;
    }

    result.warnings.push(`File not found: ${filePath}`);
    return result;

  } catch (error) {
    result.warnings.push(`Error validating path: ${error.message}`);
    return result;
  }
}

/**
 * Validate all file paths in a user story
 *
 * @param {Object} story - User story object
 * @param {Object} options - Validation options
 * @param {string} options.targetApplication - Target app (EHG, EHG_Engineer)
 * @param {string} options.appPath - Override app path
 * @returns {Promise<Object>} Validation result
 */
export async function validateStoryCodebaseAlignment(story, options = {}) {
  const {
    targetApplication = 'EHG_Engineer',
    appPath = null
  } = options;

  const resolvedAppPath = appPath || APP_PATHS[targetApplication] || APP_PATHS.default;

  const result = {
    story_id: story.id || story.story_key,
    story_title: story.title,
    valid: true,
    passed: true,
    score: 100,
    issues: [],
    warnings: [],
    details: {
      paths_found: [],
      paths_missing: [],
      paths_validated: 0,
      coverage_percentage: 100,
      app_path: resolvedAppPath
    }
  };

  // Extract paths from story
  const extractedPaths = extractPathsFromStory(story);

  if (extractedPaths.length === 0) {
    result.warnings.push(`No file paths found in story: ${story.title}`);
    result.details.coverage_percentage = 0;
    return result;
  }

  result.details.paths_validated = extractedPaths.length;

  // Validate each path
  for (const filePath of extractedPaths) {
    const pathResult = await validateFileExists(filePath, resolvedAppPath, options);

    if (pathResult.exists) {
      result.details.paths_found.push({
        original: filePath,
        resolved: pathResult.resolvedPath,
        strategy: pathResult.strategy
      });
    } else {
      result.details.paths_missing.push({
        original: filePath,
        warnings: pathResult.warnings
      });
    }

    if (pathResult.warnings.length > 0) {
      result.warnings.push(...pathResult.warnings);
    }
  }

  // Calculate coverage and score
  const foundCount = result.details.paths_found.length;
  const totalCount = extractedPaths.length;
  result.details.coverage_percentage = totalCount > 0
    ? Math.round((foundCount / totalCount) * 100)
    : 0;

  // Score based on coverage
  result.score = result.details.coverage_percentage;

  // Generate issues for missing paths
  if (result.details.paths_missing.length > 0) {
    const missingPaths = result.details.paths_missing.map(p => p.original);
    result.issues.push(`[${story.story_key || story.id}] Missing files: ${missingPaths.join(', ')}`);
  }

  // Determine pass/fail threshold (80% coverage required)
  const COVERAGE_THRESHOLD = 80;
  if (result.details.coverage_percentage < COVERAGE_THRESHOLD) {
    result.valid = false;
    result.passed = false;
    result.issues.push(`[${story.story_key || story.id}] Codebase alignment: ${result.details.coverage_percentage}% (minimum ${COVERAGE_THRESHOLD}%)`);
  }

  return result;
}

/**
 * Validate codebase alignment for all stories in an SD
 *
 * @param {Array} stories - Array of user story objects
 * @param {Object} options - Validation options
 * @returns {Promise<Object>} Aggregate validation result
 */
export async function validateAllStoriesCodebaseAlignment(stories, options = {}) {
  const result = {
    valid: true,
    passed: true,
    score: 0,
    max_score: 100,
    issues: [],
    warnings: [],
    details: {
      stories_validated: stories.length,
      stories_passing: 0,
      total_paths_found: 0,
      total_paths_missing: 0,
      coverage_percentage: 0,
      story_results: []
    }
  };

  if (!stories || stories.length === 0) {
    result.warnings.push('No user stories to validate');
    result.score = 100; // No stories = no alignment issues
    return result;
  }

  let totalPathsFound = 0;
  let totalPathsChecked = 0;

  for (const story of stories) {
    const storyResult = await validateStoryCodebaseAlignment(story, options);
    result.details.story_results.push(storyResult);

    if (storyResult.passed) {
      result.details.stories_passing++;
    }

    totalPathsFound += storyResult.details.paths_found.length;
    totalPathsChecked += storyResult.details.paths_validated;

    result.issues.push(...storyResult.issues);
    result.warnings.push(...storyResult.warnings);
  }

  result.details.total_paths_found = totalPathsFound;
  result.details.total_paths_missing = totalPathsChecked - totalPathsFound;
  result.details.coverage_percentage = totalPathsChecked > 0
    ? Math.round((totalPathsFound / totalPathsChecked) * 100)
    : 100;

  // Calculate aggregate score
  const storiesPassRate = (result.details.stories_passing / stories.length) * 100;
  result.score = Math.round((storiesPassRate * 0.6) + (result.details.coverage_percentage * 0.4));

  // Determine overall pass/fail
  if (result.details.coverage_percentage < 50 || result.issues.length > stories.length) {
    result.valid = false;
    result.passed = false;
  }

  return result;
}

/**
 * Get improvement guidance for codebase alignment issues
 *
 * @param {Object} validationResult - Result from validateStoryCodebaseAlignment
 * @returns {Object} Improvement guidance
 */
export function getCodebaseAlignmentGuidance(validationResult) {
  const guidance = {
    required: [],
    recommended: [],
    timeEstimate: '15-30 minutes',
    instructions: ''
  };

  if (validationResult.details.paths_missing?.length > 0) {
    guidance.required.push('Verify file paths in user stories match actual codebase structure');
    guidance.required.push('Update implementation_context with correct file paths');

    for (const missing of validationResult.details.paths_missing) {
      guidance.required.push(`Fix path: ${missing.original}`);
    }
  }

  if (validationResult.warnings?.some(w => w.includes('Multiple matches'))) {
    guidance.recommended.push('Use more specific file paths to avoid ambiguity');
  }

  if (validationResult.details.coverage_percentage < 80) {
    guidance.required.push(`Improve path coverage from ${validationResult.details.coverage_percentage}% to at least 80%`);
  }

  guidance.instructions =
    `Codebase alignment score: ${validationResult.score}%. ` +
    `Found ${validationResult.details.paths_found?.length || 0} valid paths, ` +
    `${validationResult.details.paths_missing?.length || 0} missing. ` +
    'Update story implementation_context to reference correct file paths.';

  return guidance;
}

export default {
  detectPathFormat,
  extractPathsFromStory,
  validateFileExists,
  validateStoryCodebaseAlignment,
  validateAllStoriesCodebaseAlignment,
  getCodebaseAlignmentGuidance
};
