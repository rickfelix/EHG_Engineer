/**
 * GitHub Repo Analyzer
 * SD-REPLIT-PIPELINE-S20S26-REDESIGN-ORCH-001-B-A
 *
 * Reads a GitHub repository via the gh CLI to extract file listings,
 * package.json dependencies, secret scanning results, and overall
 * repository structure. Foundation for S20-S22 verification stages.
 *
 * Gracefully degrades if gh CLI fails (logs warning, returns empty analysis).
 */
import { execSync } from 'child_process';

const GH_TIMEOUT_MS = 15000;

/**
 * Extract owner/repo from a GitHub URL.
 * @param {string} repoUrl - Full GitHub URL
 * @returns {string|null} "owner/repo" or null
 */
function parseOwnerRepo(repoUrl) {
  if (!repoUrl) return null;
  const match = repoUrl.match(/github\.com\/([^/]+\/[^/.]+)/);
  return match ? match[1] : null;
}

/**
 * Validate repo URL is from github.com (basic injection prevention).
 * @param {string} repoUrl
 * @returns {boolean}
 */
function isAllowedUrl(repoUrl) {
  if (!repoUrl || typeof repoUrl !== 'string') return false;
  try {
    const url = new URL(repoUrl);
    return url.hostname === 'github.com' || url.hostname === 'www.github.com';
  } catch {
    return false;
  }
}

/**
 * Run a gh CLI command and return stdout. Returns null on failure.
 * @param {string} cmd - gh CLI command
 * @returns {string|null}
 */
function ghExec(cmd) {
  try {
    return execSync(cmd, {
      encoding: 'utf-8',
      timeout: GH_TIMEOUT_MS,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Analyze a GitHub repository.
 *
 * @param {string} repoUrl - Full GitHub URL (e.g. https://github.com/owner/repo)
 * @param {object} [options]
 * @param {string} [options.branch] - Branch to analyze (default: default branch)
 * @returns {Promise<{files: string[], dependencies: object, secrets: object[], structure: object, error?: string}>}
 */
export async function analyzeRepo(repoUrl, options = {}) {
  const empty = { files: [], dependencies: {}, secrets: [], structure: {}, error: null };

  if (!isAllowedUrl(repoUrl)) {
    return { ...empty, error: `URL not allowed: ${repoUrl}` };
  }

  const ownerRepo = parseOwnerRepo(repoUrl);
  if (!ownerRepo) {
    return { ...empty, error: `Cannot parse owner/repo from: ${repoUrl}` };
  }

  const branchFlag = options.branch ? `&sha=${options.branch}` : '';

  // 1. File listing (top-level tree)
  const treeOutput = ghExec(
    `gh api "repos/${ownerRepo}/git/trees/HEAD?recursive=1" --jq ".tree[] | select(.type==\"blob\") | .path" 2>/dev/null`
  );
  const files = treeOutput ? treeOutput.split('\n').filter(Boolean) : [];

  // 2. Package.json dependencies
  let dependencies = {};
  const pkgOutput = ghExec(
    `gh api "repos/${ownerRepo}/contents/package.json${branchFlag}" --jq ".content" 2>/dev/null`
  );
  if (pkgOutput) {
    try {
      const decoded = Buffer.from(pkgOutput, 'base64').toString('utf-8');
      const pkg = JSON.parse(decoded);
      dependencies = {
        name: pkg.name,
        version: pkg.version,
        dependencies: pkg.dependencies || {},
        devDependencies: pkg.devDependencies || {},
      };
    } catch { /* malformed package.json */ }
  }

  // 3. Secret scanning (basic detection from file names)
  const secrets = [];
  const sensitivePatterns = ['.env', '.env.local', '.env.production', 'credentials', 'secrets', '.pem', '.key'];
  for (const file of files) {
    const basename = file.split('/').pop().toLowerCase();
    if (sensitivePatterns.some(p => basename.includes(p))) {
      secrets.push({ file, type: 'sensitive_file', severity: 'warning' });
    }
  }

  // 4. Repository structure summary
  const dirs = new Set();
  for (const file of files) {
    const parts = file.split('/');
    if (parts.length > 1) dirs.add(parts[0]);
  }

  const structure = {
    totalFiles: files.length,
    topLevelDirs: [...dirs].sort(),
    hasPackageJson: files.includes('package.json'),
    hasReadme: files.some(f => f.toLowerCase().startsWith('readme')),
    hasSrc: dirs.has('src'),
    hasTests: dirs.has('tests') || dirs.has('test') || dirs.has('__tests__'),
    hasPublic: dirs.has('public') || dirs.has('static'),
    fileTypes: countFileTypes(files),
  };

  return { files, dependencies, secrets, structure, error: null };
}

/**
 * Count file extensions for structure summary.
 * @param {string[]} files
 * @returns {object} e.g. { '.js': 42, '.ts': 18, '.css': 5 }
 */
function countFileTypes(files) {
  const counts = {};
  for (const file of files) {
    const ext = file.includes('.') ? '.' + file.split('.').pop().toLowerCase() : '(no ext)';
    counts[ext] = (counts[ext] || 0) + 1;
  }
  return counts;
}

export { parseOwnerRepo, isAllowedUrl };
export default { analyzeRepo, parseOwnerRepo, isAllowedUrl };
