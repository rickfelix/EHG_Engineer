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
 * @module CodebaseSearchService
 * @version 3.7.0
 */

import fs from 'fs';
import path from 'path';

// =============================================================================
// CODEBASE SEARCH SERVICE
// =============================================================================

/**
 * CodebaseSearchService - Native file search without shell spawning
 */
export class CodebaseSearchService {
  constructor(options = {}) {
    this.defaultPaths = options.paths || [
      '/mnt/c/_EHG/ehg/src',
      '/mnt/c/_EHG/EHG_Engineer/src'
    ];
    this.maxResults = options.maxResults || 10;
    this.timeout = options.timeout || 5000;
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
              relativePath: filePath.replace('/mnt/c/_EHG/', ''),
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
                relativePath: filePath.replace('/mnt/c/_EHG/', ''),
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

// =============================================================================
// PROCESS MANAGER (Replaces spawn/exec for server restart)
// =============================================================================

/**
 * ProcessManager - Controlled process lifecycle without shell spawning
 */
export class ProcessManager {
  constructor() {
    this.pm2Available = null;
  }

  /**
   * Get server status without spawning shell
   */
  async getServerStatus() {
    return {
      pid: process.pid,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      nodeVersion: process.version,
      platform: process.platform
    };
  }

  /**
   * Request graceful restart
   *
   * Instead of spawning PM2, we signal the need for restart
   * and let the orchestration layer handle it.
   */
  async requestRestart() {
    return {
      status: 'restart_requested',
      message: 'Restart request queued. Orchestration layer will handle.',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Check if PM2 is available (for informational purposes)
   */
  async isPM2Available() {
    if (this.pm2Available !== null) {
      return this.pm2Available;
    }

    try {
      // Check if running under PM2 by environment variable
      this.pm2Available = !!process.env.PM2_HOME || !!process.env.pm_id;
      return this.pm2Available;
    } catch {
      this.pm2Available = false;
      return false;
    }
  }
}

// Singleton instances
let searchInstance = null;
let processInstance = null;

/**
 * Get singleton CodebaseSearchService instance
 */
export function getCodebaseSearchService() {
  if (!searchInstance) {
    searchInstance = new CodebaseSearchService();
  }
  return searchInstance;
}

/**
 * Get singleton ProcessManager instance
 */
export function getProcessManager() {
  if (!processInstance) {
    processInstance = new ProcessManager();
  }
  return processInstance;
}

export default { CodebaseSearchService, ProcessManager };
