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

// SD-FDBK-INFRA-RCA-FIRST-HARD-001 (FR-1): single shared wall-clock bound for FAST
// external steps (shell-process spawns + git/gh network RPCs). RCA (single structural
// root) found these call sites omit a timeout, so an adverse input (gh/git stalling on
// auth/network, or a per-file `test -f` loop ballooned by a stale origin/main) rides to
// the external 2m/5m SIGTERM as EXIT 124. Apply this to every shelling-out execSync that
// lacks a timeout. Intentionally-LONGER steps (tsc, lint, the unit/e2e suites) keep their
// own explicit timeouts (TEST_TIMEOUT_*, test-runner.js) and are NOT routed through this.
// Override via env LEO_QF_EXTERNAL_STEP_TIMEOUT_MS=<positive integer ms>.
function resolveExternalStepTimeoutMs() {
  const raw = process.env.LEO_QF_EXTERNAL_STEP_TIMEOUT_MS;
  if (raw !== undefined) {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 60000; // 60s default — generous for a fast probe, far under the 2m external kill
}
export const EXTERNAL_STEP_TIMEOUT_MS = resolveExternalStepTimeoutMs();

// Repository paths for target application (registry-driven)
export const REPO_PATHS = getRepoPaths();
