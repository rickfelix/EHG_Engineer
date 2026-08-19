/**
 * Hallucination Detection - File and Symbol Checks
 * L1 (file existence) and L2 (symbol existence) validation
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

/**
 * L1: Check if file exists
 * LEO v4.4.3: Branch-aware - checks feature branch first if provided
 * SD-FDBK-ENH-RETRO-SUB-AGENT-001: bare-basename fallback via a per-call basename index.
 * Return type stays a plain boolean -- quickHallucinationCheck's `!checkFileExists(...)` call
 * site depends on this contract.
 *
 * @param {string} filePath
 * @param {string} baseDir
 * @param {Object|null} branchContext
 * @param {Map<string,string[]>|null} basenameIndex - caller-supplied index (built once per
 *   validateSubAgentOutput() call by validateFileReferences and threaded through here) so the
 *   filesystem walk runs at most once per call, not once per file reference. When omitted,
 *   findBasenameMatches builds one on demand (preserves standalone callability).
 */
export function checkFileExists(filePath, baseDir, branchContext = null, basenameIndex = null) {
  // If branch context provided, check branch first
  if (branchContext && branchContext.branch && branchContext.repoPath) {
    const branchResult = checkFileExistsOnBranch(filePath, branchContext);
    if (branchResult.exists) {
      return true;
    }
  }

  // Filesystem check (main/HEAD)
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(baseDir, filePath);

  let existsDirectly;
  try {
    existsDirectly = fs.existsSync(absolutePath);
  } catch {
    return false;
  }
  if (existsDirectly) {
    return true;
  }

  // Bare-basename fallback: only when filePath has no directory separator.
  if (filePath === path.basename(filePath)) {
    return findBasenameMatches(filePath, baseDir, basenameIndex).length > 0;
  }

  return false;
}

/**
 * Build a basename -> [relative paths] index via a filesystem walk rooted at `root`, excluding
 * node_modules and .git. Built FRESH per call -- no cross-call TTL cache. A cache was found to
 * reproduce the exact "misses just-created files" staleness bug this design already rejected
 * `git ls-files` for (which only sees tracked files); a fresh walk costs ~137ms on this repo,
 * cheap enough that caching is unnecessary.
 */
export function buildBasenameIndex(root) {
  const index = new Map();
  // SD-FDBK-ENH-RETRO-SUB-AGENT-001 (SECURITY EXEC-TO-PLAN review): .worktrees and
  // .reaper-source excluded alongside node_modules/.git. Measured live from this repo's main
  // root (121 worktrees): .worktrees/ alone accounts for 94.7% of the file mass (1,019,570 of
  // 1,076,759 files), turning an otherwise-205ms walk into 17-30s + 300MB RSS -- and 19.5% of
  // real sub_agent_execution_results rows run with executed_from_cwd at exactly that root.
  const EXCLUDED_DIRS = new Set(['node_modules', '.git', '.worktrees', '.reaper-source']);

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) continue;
        walk(path.join(dir, entry.name));
      } else if (entry.isFile()) {
        const relPath = path.relative(root, path.join(dir, entry.name)).split(path.sep).join('/');
        if (!index.has(entry.name)) index.set(entry.name, []);
        index.get(entry.name).push(relPath);
      }
    }
  }

  walk(root);
  return index;
}

/**
 * Return the real repo paths sharing `basename`, built on the same per-call, node_modules/.git
 * -excluded index as checkFileExists's fallback. checkFileExists uses this internally (checking
 * .length > 0) and stays boolean; validateFileReferences (hallucination-check.js, which owns the
 * result object) calls this directly for ambiguity detail -- never through checkFileExists's
 * return value.
 *
 * @param {string} basename
 * @param {string} root
 * @param {Map<string,string[]>|null} basenameIndex - caller-supplied index; built fresh on
 *   demand when omitted.
 */
export function findBasenameMatches(basename, root, basenameIndex = null) {
  const index = basenameIndex || buildBasenameIndex(root);
  return index.get(basename) || [];
}

/**
 * Check if file exists on a specific git branch
 */
export function checkFileExistsOnBranch(filePath, branchContext) {
  const { branch, repoPath } = branchContext;

  let relativePath = filePath;
  if (path.isAbsolute(filePath)) {
    if (filePath.startsWith(repoPath)) {
      relativePath = filePath.substring(repoPath.length).replace(/^\//, '');
    } else {
      return { exists: false, reason: 'path_outside_repo' };
    }
  }

  try {
    execSync(
      `cd "${repoPath}" && git cat-file -e "${branch}:${relativePath}" 2>/dev/null`,
      { encoding: 'utf-8' }
    );
    return { exists: true, source: 'branch', branch };
  } catch {
    return { exists: false, reason: 'not_on_branch' };
  }
}

/**
 * Read file content from branch (for symbol validation)
 */
export function readFileFromBranch(filePath, branchContext) {
  const { branch, repoPath } = branchContext;

  let relativePath = filePath;
  if (path.isAbsolute(filePath)) {
    if (filePath.startsWith(repoPath)) {
      relativePath = filePath.substring(repoPath.length).replace(/^\//, '');
    } else {
      return null;
    }
  }

  try {
    return execSync(
      `cd "${repoPath}" && git show "${branch}:${relativePath}" 2>/dev/null`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    );
  } catch {
    return null;
  }
}

/**
 * L2: Check if symbol exists in file
 */
export function checkSymbolExistsInFile(filePath, symbolName, baseDir, branchContext = null) {
  let content = null;

  // Try branch first if context provided
  if (branchContext && branchContext.branch && branchContext.repoPath) {
    content = readFileFromBranch(filePath, branchContext);
  }

  // Fall back to filesystem if not found on branch
  if (!content) {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(baseDir, filePath);

    try {
      if (!fs.existsSync(absolutePath)) {
        return { exists: false, reason: 'file_not_found' };
      }
      content = fs.readFileSync(absolutePath, 'utf8');
    } catch (error) {
      return { exists: false, reason: `error: ${error.message}` };
    }
  }

  try {
    const patterns = [
      new RegExp(`function\\s+${symbolName}\\s*\\(`),
      new RegExp(`(?:const|let|var)\\s+${symbolName}\\s*=`),
      new RegExp(`class\\s+${symbolName}(?:\\s|\\{)`),
      new RegExp(`export\\s+(?:default\\s+)?(?:async\\s+)?(?:function|const|let|class)\\s+${symbolName}`),
      new RegExp(`['"]${symbolName}['"]\\s*:`)
    ];

    for (const pattern of patterns) {
      if (pattern.test(content)) {
        return { exists: true };
      }
    }

    if (content.includes(symbolName)) {
      return { exists: true, confidence: 'low', reason: 'string_match_only' };
    }

    return { exists: false, reason: 'symbol_not_found' };
  } catch (error) {
    return { exists: false, reason: `error: ${error.message}` };
  }
}

/**
 * Resolve module path from import statement
 */
export function resolveModulePath(modulePath, baseDir) {
  if (modulePath.startsWith('.')) {
    const resolved = path.join(baseDir, modulePath);
    const extensions = ['', '.js', '.ts', '.jsx', '.tsx', '/index.js', '/index.ts'];
    for (const ext of extensions) {
      const fullPath = resolved + ext;
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }
  }

  return null;
}
