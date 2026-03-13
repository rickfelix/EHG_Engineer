/**
 * Module Resolver — Static Analysis
 * SD-ORCHESTRATOR-COMPLETION-VALIDATION-GATES-ORCH-001-C
 *
 * Resolves ESM import and CJS require paths to absolute file paths.
 */

import fs from 'fs';
import path from 'path';

/** Extensions to try when resolving bare specifiers */
const EXTENSIONS = ['.js', '.mjs', '.cjs'];
/** Index files to try when resolving directory imports */
const INDEX_FILES = ['index.js', 'index.mjs'];

/**
 * Resolve a module specifier to an absolute file path.
 *
 * @param {string} importPath - The import/require specifier (e.g. './foo', '../bar')
 * @param {string} fromFile - Absolute path of the file containing the import
 * @param {string} rootDir - Project root directory
 * @returns {string|null} Absolute resolved path or null if not found
 */
export function resolveModulePath(importPath, fromFile, rootDir) {
  // Skip bare specifiers (npm packages) — they are not project files
  if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
    return null;
  }

  const fromDir = path.dirname(fromFile);
  const basePath = path.resolve(fromDir, importPath);

  // Normalize to forward slashes for consistency
  const normalize = (p) => p.replace(/\\/g, '/');

  // 1. Exact match (already has extension)
  if (fs.existsSync(basePath) && fs.statSync(basePath).isFile()) {
    return normalize(basePath);
  }

  // 2. Try appending extensions
  for (const ext of EXTENSIONS) {
    const withExt = basePath + ext;
    if (fs.existsSync(withExt) && fs.statSync(withExt).isFile()) {
      return normalize(withExt);
    }
  }

  // 3. Try as directory with index file
  for (const indexFile of INDEX_FILES) {
    const indexPath = path.join(basePath, indexFile);
    if (fs.existsSync(indexPath) && fs.statSync(indexPath).isFile()) {
      return normalize(indexPath);
    }
  }

  return null;
}
