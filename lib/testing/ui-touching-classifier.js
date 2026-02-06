/**
 * UI-Touching SD Classifier
 * SD: SD-LEO-ENH-VISION-QA-AUTO-PROCEED-001 (US-002)
 *
 * Deterministic classifier that checks changed file paths against
 * configurable UI patterns to decide whether Vision QA should run.
 *
 * Order-insensitive: same set of paths always produces the same result.
 */

// Default patterns that indicate UI-touching changes
const DEFAULT_UI_PATTERNS = [
  // Next.js / React app paths
  'app/',
  'pages/',
  'src/components/',
  'src/pages/',
  'src/app/',
  // Static assets and styles
  'public/',
  'styles/',
  'src/styles/',
  'src/css/',
  // Common UI file extensions (anywhere in path)
  '.tsx',
  '.jsx',
  '.css',
  '.scss',
  '.svg',
  // Layout and theme files
  'layout.',
  'theme.',
  'tailwind.',
];

// Patterns that are explicitly NOT UI-touching (backend-only)
const DEFAULT_BACKEND_PATTERNS = [
  'lib/',
  'server/',
  'scripts/',
  'database/',
  'migrations/',
  'config/',
  'test/',
  'tests/',
  '.env',
  'package.json',
  'package-lock.json',
];

/**
 * Classify whether an SD is UI-touching based on changed file paths.
 *
 * @param {string[]} changedPaths - List of changed file paths (order does not matter)
 * @param {Object} options - Configuration options
 * @param {string[]} options.uiPatterns - Override default UI patterns
 * @param {string[]} options.backendPatterns - Override default backend patterns
 * @returns {{ ui_touching: boolean, matched_paths: string[], reason: string }}
 */
export function classifySDAsUITouching(changedPaths, options = {}) {
  const uiPatterns = options.uiPatterns || DEFAULT_UI_PATTERNS;

  if (!changedPaths || changedPaths.length === 0) {
    return {
      ui_touching: false,
      matched_paths: [],
      reason: 'no_changed_paths'
    };
  }

  // Normalize paths: lowercase, forward slashes
  const normalized = changedPaths.map(p => p.toLowerCase().replace(/\\/g, '/'));

  // Find paths matching UI patterns
  const matchedPaths = normalized.filter(filePath =>
    uiPatterns.some(pattern => filePath.includes(pattern.toLowerCase()))
  );

  const uiTouching = matchedPaths.length > 0;

  return {
    ui_touching: uiTouching,
    matched_paths: matchedPaths,
    reason: uiTouching
      ? `${matchedPaths.length} file(s) match UI patterns`
      : 'no files match UI patterns'
  };
}

/**
 * Get changed file paths for an SD from git diff.
 *
 * @param {string} branchName - Feature branch name
 * @param {string} baseBranch - Base branch to diff against (default: 'main')
 * @returns {Promise<string[]>} List of changed file paths
 */
export async function getChangedPathsForBranch(branchName, baseBranch = 'main') {
  const { execSync } = await import('child_process');

  try {
    const output = execSync(
      `git diff --name-only ${baseBranch}...${branchName}`,
      { encoding: 'utf-8', timeout: 10000 }
    ).trim();

    return output ? output.split('\n').filter(Boolean) : [];
  } catch {
    // If branch comparison fails, try uncommitted changes
    try {
      const output = execSync('git diff --name-only HEAD', {
        encoding: 'utf-8',
        timeout: 10000
      }).trim();
      return output ? output.split('\n').filter(Boolean) : [];
    } catch {
      return [];
    }
  }
}

/**
 * Classify an SD by looking up its branch and checking changed files.
 *
 * @param {Object} sd - Strategic Directive object
 * @param {Object} options - Options
 * @returns {Promise<{ ui_touching: boolean, matched_paths: string[], reason: string }>}
 */
export async function classifySD(sd, options = {}) {
  // Try to get branch name from SD metadata or conventions
  const branchName = sd.metadata?.branch_name ||
    `feat/${sd.sd_key}`;

  const changedPaths = await getChangedPathsForBranch(
    branchName,
    options.baseBranch || 'main'
  );

  // Also check scope-based hints if no git changes found
  if (changedPaths.length === 0) {
    return classifyFromScope(sd);
  }

  const result = classifySDAsUITouching(changedPaths, options);
  result.branch = branchName;
  result.total_files = changedPaths.length;
  return result;
}

/**
 * Fallback: classify from SD scope/description when no git data available.
 */
function classifyFromScope(sd) {
  const scope = (sd.scope || '').toLowerCase();
  const title = (sd.title || '').toLowerCase();
  const description = (sd.description || '').toLowerCase();
  const combined = `${scope} ${title} ${description}`;

  const uiKeywords = ['ui', 'component', 'page', 'dashboard', 'form', 'modal',
    'button', 'layout', 'style', 'css', 'frontend', 'visual', 'theme'];

  const matched = uiKeywords.filter(kw => combined.includes(kw));

  return {
    ui_touching: matched.length > 0,
    matched_paths: [],
    matched_keywords: matched,
    reason: matched.length > 0
      ? `scope/description contains UI keywords: ${matched.join(', ')}`
      : 'no UI keywords in scope/description',
    source: 'scope_fallback'
  };
}

export { DEFAULT_UI_PATTERNS, DEFAULT_BACKEND_PATTERNS };

export default {
  classifySDAsUITouching,
  classifySD,
  getChangedPathsForBranch,
  DEFAULT_UI_PATTERNS,
  DEFAULT_BACKEND_PATTERNS
};
