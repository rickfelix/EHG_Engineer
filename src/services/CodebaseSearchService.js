/**
 * CodebaseSearchService - Native File Search (No Shell Spawning)
 *
 * OPERATION 'SOVEREIGN PIPE' v3.7.0 - Process Extraction
 *
 * Replaces shell commands with native Node.js operations:
 * - find ${path} -name "*.tsx" | xargs grep -l "${keyword}" → searchComponents()
 * - grep -r "path.*${keyword}" ${path} → searchRoutes()
 *
 * Purpose: API-ready codebase search with no execSync/spawn.
 *
 * Refactored as part of SD-REFACTOR-2025-001-P1-006
 * ProcessManager extracted to process-manager.js for Single Responsibility
 *
 * @module CodebaseSearchService
 * @version 3.8.0
 */

import fs from 'fs';
import path from 'path';

// Import ProcessManager for re-export (backward compatibility)
import { ProcessManager, getProcessManager } from './process-manager.js';

// Re-export for backward compatibility
export { ProcessManager, getProcessManager };

// =============================================================================
// CODEBASE SEARCH SERVICE
// =============================================================================

/**
 * CodebaseSearchService - Native file search without shell spawning
 */
export class CodebaseSearchService {
  constructor(options = {}) {
    // Cross-platform path defaults (SD-WIN-MIG-005 fix)
    const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/i, '$1'));
    const projectRoot = path.resolve(__dirname, '../..');
    const ehgRoot = path.resolve(projectRoot, '../ehg');
    const parentDir = path.resolve(projectRoot, '..');

    this.defaultPaths = options.paths || [
      path.join(ehgRoot, 'src'),
      path.join(projectRoot, 'src')
    ];
    this.maxResults = options.maxResults || 10;
    this.timeout = options.timeout || 5000;
    // Store parent directory for making relative paths
    this._parentDir = parentDir;
  }

  /**
   * Convert absolute path to relative path from parent directory
   * Handles both WSL and Windows paths
   */
  _makeRelativePath(filePath) {
    // Normalize to forward slashes for comparison
    const normalizedPath = filePath.replace(/\\/g, '/');
    const normalizedParent = this._parentDir.replace(/\\/g, '/');

    // If path starts with parent dir, make it relative
    if (normalizedPath.startsWith(normalizedParent)) {
      return normalizedPath.slice(normalizedParent.length + 1);
    }
    // Handle WSL paths for backwards compatibility
    if (normalizedPath.includes('/mnt/c/_EHG/')) {
      return normalizedPath.replace(/.*\/mnt\/c\/_EHG\//, '');
    }
    return filePath;
  }

  // ===========================================================================
  // COMPONENT SEARCH (Replaces: find | xargs grep)
  // ===========================================================================

  /**
   * Search for components containing a keyword
   *
   * Replaces: find ${path} -name "*.tsx" -o -name "*.jsx" | xargs grep -l "${keyword}"
   *
   * @param {string} keyword - Search keyword
   * @param {string[]} extensions - File extensions to search (default: ['.tsx', '.jsx'])
   * @param {string[]} searchPaths - Paths to search (default: ehg/src, EHG_Engineer/src)
   * @returns {Promise<Array>} Array of matching file paths
   */
  async searchComponents(keyword, extensions = ['.tsx', '.jsx'], searchPaths = null) {
    const paths = searchPaths || this.defaultPaths;
    const results = [];
    const keywordLower = keyword.toLowerCase();

    for (const searchPath of paths) {
      try {
        const matches = await this._searchFilesRecursive(
          searchPath,
          extensions,
          keywordLower,
          this.maxResults - results.length
        );
        results.push(...matches);

        if (results.length >= this.maxResults) break;
      } catch {
        // Path may not exist, continue
        console.warn(`[CodebaseSearch] Path not accessible: ${searchPath}`);
      }
    }

    return results.slice(0, this.maxResults);
  }

  /**
   * Search for routes matching a keyword
   *
   * Replaces: grep -r "path.*${keyword}" ${path}
   *
   * @param {string} keyword - Route keyword to search
   * @param {string[]} searchPaths - Paths to search
   * @returns {Promise<Array>} Array of matching routes
   */
  async searchRoutes(keyword, searchPaths = null) {
    const paths = searchPaths || this.defaultPaths;
    const results = [];
    const routePattern = new RegExp(`path[\\s]*[=:][\\s]*["'\`].*${this._escapeRegex(keyword)}`, 'i');

    for (const searchPath of paths) {
      try {
        const matches = await this._searchFilesForPattern(
          searchPath,
          ['.tsx', '.jsx', '.ts', '.js'],
          routePattern,
          this.maxResults - results.length
        );
        results.push(...matches);

        if (results.length >= this.maxResults) break;
      } catch {
        console.warn(`[CodebaseSearch] Path not accessible: ${searchPath}`);
      }
    }

    return results.slice(0, this.maxResults);
  }

  /**
   * Search for any pattern in files
   *
   * @param {string|RegExp} pattern - Pattern to search
   * @param {string[]} extensions - File extensions
   * @param {string[]} searchPaths - Paths to search
   * @returns {Promise<Array>} Array of matches with context
   */
  async searchPattern(pattern, extensions = ['.ts', '.tsx', '.js', '.jsx'], searchPaths = null) {
    const paths = searchPaths || this.defaultPaths;
    const results = [];
    const regex = typeof pattern === 'string' ? new RegExp(this._escapeRegex(pattern), 'i') : pattern;

    for (const searchPath of paths) {
      try {
        const matches = await this._searchFilesForPattern(
          searchPath,
          extensions,
          regex,
          this.maxResults - results.length
        );
        results.push(...matches);

        if (results.length >= this.maxResults) break;
      } catch {
        console.warn(`[CodebaseSearch] Path not accessible: ${searchPath}`);
      }
    }

    return results.slice(0, this.maxResults);
  }

  /**
   * List files matching extensions (no content search)
   *
   * @param {string[]} extensions - File extensions
   * @param {string} searchPath - Path to search
   * @returns {Promise<string[]>} Array of file paths
   */
  async listFiles(extensions, searchPath) {
    const results = [];
    await this._walkDirectory(searchPath, (filePath) => {
      const ext = path.extname(filePath);
      if (extensions.includes(ext)) {
        results.push(filePath);
      }
    });
    return results;
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  /**
   * Recursively search files for keyword in content
   */
  async _searchFilesRecursive(dir, extensions, keyword, limit) {
    const results = [];

    try {
      await this._walkDirectory(dir, async (filePath) => {
        if (results.length >= limit) return;

        const ext = path.extname(filePath);
        if (!extensions.includes(ext)) return;

        try {
          const content = await fs.promises.readFile(filePath, 'utf8');
          if (content.toLowerCase().includes(keyword)) {
            results.push({
              path: filePath,
              relativePath: this._makeRelativePath(filePath),
              matched: keyword
            });
          }
        } catch {
          // Skip unreadable files
        }
      });
    } catch {
      // Directory walk failed
    }

    return results;
  }

  /**
   * Search files for regex pattern with line context
   */
  async _searchFilesForPattern(dir, extensions, pattern, limit) {
    const results = [];

    try {
      await this._walkDirectory(dir, async (filePath) => {
        if (results.length >= limit) return;

        const ext = path.extname(filePath);
        if (!extensions.includes(ext)) return;

        try {
          const content = await fs.promises.readFile(filePath, 'utf8');
          const lines = content.split('\n');

          for (let i = 0; i < lines.length; i++) {
            if (pattern.test(lines[i])) {
              results.push({
                path: filePath,
                relativePath: this._makeRelativePath(filePath),
                line: i + 1,
                content: lines[i].trim().substring(0, 200)
              });

              if (results.length >= limit) return;
            }
          }
        } catch {
          // Skip unreadable files
        }
      });
    } catch {
      // Directory walk failed
    }

    return results;
  }

  /**
   * Walk directory recursively
   */
  async _walkDirectory(dir, callback) {
    const ignoreDirs = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage'];

    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (!ignoreDirs.includes(entry.name)) {
            await this._walkDirectory(fullPath, callback);
          }
        } else if (entry.isFile()) {
          await callback(fullPath);
        }
      }
    } catch {
      // Directory not accessible
    }
  }

  /**
   * Escape special regex characters
   */
  _escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

// Singleton instance
let searchInstance = null;

/**
 * Get singleton CodebaseSearchService instance
 */
export function getCodebaseSearchService() {
  if (!searchInstance) {
    searchInstance = new CodebaseSearchService();
  }
  return searchInstance;
}

// Default export for backward compatibility
export default { CodebaseSearchService, ProcessManager };
