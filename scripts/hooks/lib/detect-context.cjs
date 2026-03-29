/**
 * Hook Context Detection — Shared CJS utility for all Claude Code hooks.
 *
 * Provides registry-based project directory and codebase detection.
 * Replaces hardcoded 'C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer' fallbacks.
 *
 * SD-LEO-INFRA-VENTURE-DEVWORKFLOW-AWARENESS-001 (gap remediation)
 */

const { getRepoPaths, ENGINEER_ROOT } = require('../../../lib/repo-paths.cjs');

/**
 * Detect the filesystem path of the current project from CWD or CLAUDE_PROJECT_DIR.
 * Matches against all registered applications (longest-match-first).
 * @returns {string} Absolute filesystem path
 */
function detectProjectDir() {
  const cwd = (process.env.CLAUDE_PROJECT_DIR || process.cwd()).replace(/\\/g, '/').toLowerCase();
  try {
    const paths = getRepoPaths();
    const entries = Object.entries(paths).sort((a, b) => b[1].length - a[1].length);
    for (const [, appPath] of entries) {
      const norm = appPath.replace(/\\/g, '/').toLowerCase();
      if (cwd === norm || cwd.startsWith(norm + '/')) return appPath;
    }
  } catch { /* fallback */ }
  return ENGINEER_ROOT;
}

/**
 * Detect the application/codebase name for the current working directory.
 * @returns {string} Application name (e.g., 'EHG_Engineer', 'commitcraft-ai')
 */
function detectCodebase() {
  const cwd = (process.env.CLAUDE_PROJECT_DIR || process.cwd()).replace(/\\/g, '/').toLowerCase();
  try {
    const paths = getRepoPaths();
    const entries = Object.entries(paths).sort((a, b) => b[1].length - a[1].length);
    for (const [name, appPath] of entries) {
      const norm = appPath.replace(/\\/g, '/').toLowerCase();
      if (cwd === norm || cwd.startsWith(norm + '/')) return name;
    }
  } catch { /* fallback */ }
  return 'EHG_Engineer';
}

module.exports = { detectProjectDir, detectCodebase };
