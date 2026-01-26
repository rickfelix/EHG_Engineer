/**
 * DOCMON File Scanner
 * Utility for finding documentation files
 *
 * Part of SD-LEO-INFRA-DOCMON-SUB-AGENT-001-A
 */

import fs from 'fs';
import path from 'path';
import { findRepoRoot } from './config-loader.js';

/**
 * Find all markdown files in a directory
 */
export function findMdFiles(dir, options = {}) {
  const {
    extensions = ['.md', '.mdx'],
    excludeDirs = ['node_modules', '.git', '.next', 'dist', 'vendor'],
    includeArchive = false,
    relativeTo = null
  } = options;

  const results = [];
  const baseDir = relativeTo || dir;

  if (!fs.existsSync(dir)) return results;

  function scan(currentDir) {
    const items = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const item of items) {
      const fullPath = path.join(currentDir, item.name);

      // Skip excluded directories
      if (item.isDirectory()) {
        if (excludeDirs.includes(item.name)) continue;
        if (!includeArchive && item.name === 'archive') continue;
        scan(fullPath);
      } else if (item.isFile()) {
        const ext = path.extname(item.name).toLowerCase();
        if (extensions.includes(ext)) {
          results.push({
            path: fullPath,
            relativePath: path.relative(baseDir, fullPath),
            name: item.name,
            ext
          });
        }
      }
    }
  }

  scan(dir);
  return results;
}

/**
 * Find markdown files in root directory only
 */
export function findRootMdFiles(rootDir, options = {}) {
  const { extensions = ['.md', '.mdx'] } = options;

  if (!fs.existsSync(rootDir)) return [];

  const items = fs.readdirSync(rootDir, { withFileTypes: true });
  const results = [];

  for (const item of items) {
    if (item.isFile()) {
      const ext = path.extname(item.name).toLowerCase();
      if (extensions.includes(ext)) {
        results.push({
          path: path.join(rootDir, item.name),
          relativePath: item.name,
          name: item.name,
          ext
        });
      }
    }
  }

  return results;
}

/**
 * Find markdown files in a specific subdirectory
 */
export function findMdFilesIn(subDir, rootDir = null) {
  const root = rootDir || findRepoRoot();
  const targetDir = path.join(root, subDir);

  if (!fs.existsSync(targetDir)) return [];

  return findMdFiles(targetDir, { relativeTo: root });
}

/**
 * Check if a path is a symlink
 */
export function isSymlink(filePath) {
  try {
    const stat = fs.lstatSync(filePath);
    return stat.isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Check if a path is within the repo root (security check)
 */
export function isWithinRepoRoot(filePath, repoRoot = null) {
  const root = repoRoot || findRepoRoot();
  const resolvedPath = path.resolve(filePath);
  const resolvedRoot = path.resolve(root);

  return resolvedPath.startsWith(resolvedRoot);
}

/**
 * Normalize a path for consistent comparison
 */
export function normalizePath(filePath) {
  return path.normalize(filePath).replace(/\\/g, '/');
}

/**
 * Get file stats safely
 */
export function getFileStats(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return {
      exists: true,
      isFile: stat.isFile(),
      isDirectory: stat.isDirectory(),
      size: stat.size,
      mtime: stat.mtime
    };
  } catch {
    return {
      exists: false,
      isFile: false,
      isDirectory: false,
      size: 0,
      mtime: null
    };
  }
}
