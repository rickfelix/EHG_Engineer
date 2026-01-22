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
 */
export function checkFileExists(filePath, baseDir, branchContext = null) {
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

  try {
    return fs.existsSync(absolutePath);
  } catch {
    return false;
  }
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
