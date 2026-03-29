/**
 * Constants for Complete Quick-Fix
 * Part of quick-fix modularization
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { resolveRepoPath, getRepoPaths, ENGINEER_ROOT } from '../../../lib/repo-paths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cross-platform path resolution (registry-driven via lib/repo-paths.js)
export const EHG_ENGINEER_ROOT = ENGINEER_ROOT;
export const EHG_ROOT = resolveRepoPath('ehg') || path.resolve(ENGINEER_ROOT, '..', 'ehg');

// Auto-refinement constants
export const MAX_REFINEMENT_ATTEMPTS = 3;
export const MIN_PASS_SCORE = 90;
export const MIN_WARN_SCORE = 70;

// Test execution constants
export const TEST_TIMEOUT_UNIT = 120000; // 2 minutes for unit tests
export const TEST_TIMEOUT_E2E = 300000;  // 5 minutes for E2E tests

// Repository paths for target application (registry-driven)
export const REPO_PATHS = getRepoPaths();
