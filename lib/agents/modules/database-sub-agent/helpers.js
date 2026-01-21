/**
 * Database Sub-Agent - Helper Functions Module
 *
 * Common utility functions used across database analysis modules.
 *
 * @module lib/agents/modules/database-sub-agent/helpers
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';

/**
 * Get source files recursively from a directory
 *
 * @param {string} basePath - Base path to start searching
 * @returns {Promise<Array<string>>} List of source file paths
 */
export async function getSourceFiles(basePath) {
  const files = [];

  async function walk(dir) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await walk(fullPath);
        } else if (entry.isFile() && entry.name.match(/\.(js|jsx|ts|tsx)$/)) {
          files.push(fullPath);
        }
      }
    } catch {
      // Directory doesn't exist
    }
  }

  await walk(basePath);
  return files;
}
