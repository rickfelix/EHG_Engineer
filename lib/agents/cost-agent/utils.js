/**
 * Cost Optimization Sub-Agent - Utilities
 * Helper functions for file operations and code generation
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';

/**
 * Get source files from directory
 * @param {string} basePath - Base path to search
 * @returns {Promise<Array>} Array of file paths
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

/**
 * Generate cache implementation code
 * @param {Object} _pattern - Pattern that triggered caching suggestion
 * @returns {string} Cache implementation code
 */
export function generateCacheImplementation(_pattern) {
  return `
// Simple in-memory cache
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getCached(key, fetcher) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const data = await fetcher();
  cache.set(key, { data, timestamp: Date.now() });
  return data;
}`;
}
