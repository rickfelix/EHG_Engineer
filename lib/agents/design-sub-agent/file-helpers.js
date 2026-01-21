/**
 * File Helper Functions
 * File scanning utilities for design validation
 *
 * Extracted from design-sub-agent.js for modularity
 * SD-LEO-REFACTOR-DESIGN-AGENT-001
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';
import { execSync } from 'child_process';
import { FILE_PATTERNS, COMMON_HTML_PATHS } from './constants.js';

/**
 * Load files modified in git diff
 * @param {string} _basePath - Base path (unused, kept for signature)
 * @returns {Promise<string[]>} Array of modified file paths
 */
export async function loadGitDiffFiles(_basePath) {
  try {
    // Find git root directory
    const gitRoot = execSync('git rev-parse --show-toplevel', {
      encoding: 'utf8',
      cwd: process.cwd()
    }).trim();

    // Get files modified in current branch vs main (or master)
    let gitCommand = 'git diff --name-only HEAD~5..HEAD';  // Last 5 commits

    try {
      // Try to get files changed compared to main/master
      execSync('git rev-parse --verify main', { stdio: 'ignore', cwd: gitRoot });
      gitCommand = 'git diff --name-only main...HEAD';
    } catch {
      try {
        execSync('git rev-parse --verify master', { stdio: 'ignore', cwd: gitRoot });
        gitCommand = 'git diff --name-only master...HEAD';
      } catch {
        // Fall back to last 5 commits
        gitCommand = 'git diff --name-only HEAD~5..HEAD';
      }
    }

    const output = execSync(gitCommand, { encoding: 'utf8', cwd: gitRoot });
    const modifiedFiles = output
      .split('\n')
      .filter(f => f.trim())
      .map(f => path.resolve(gitRoot, f));

    return modifiedFiles;
  } catch (error) {
    console.warn('Failed to load git diff files:', error.message);
    return [];
  }
}

/**
 * Get component files (JSX, TSX, JS, TS)
 * @param {string} basePath - Base path to scan
 * @param {Object} options - Options including gitDiffOnly and gitDiffFiles
 * @returns {Promise<string[]>} Array of component file paths
 */
export async function getComponentFiles(basePath, options = {}) {
  const files = [];

  async function walk(dir) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await walk(fullPath);
        } else if (entry.isFile() && entry.name.match(FILE_PATTERNS.component)) {
          files.push(fullPath);
        }
      }
    } catch {
      // Directory doesn't exist
    }
  }

  await walk(basePath);

  // Filter by git diff if enabled
  if (options.gitDiffOnly && options.gitDiffFiles && options.gitDiffFiles.length > 0) {
    return files.filter(f => options.gitDiffFiles.includes(f));
  }

  return files;
}

/**
 * Get CSS files (CSS, SCSS, SASS, LESS)
 * @param {string} basePath - Base path to scan
 * @param {Object} options - Options including gitDiffOnly and gitDiffFiles
 * @returns {Promise<string[]>} Array of CSS file paths
 */
export async function getCSSFiles(basePath, options = {}) {
  const files = [];

  async function walk(dir) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await walk(fullPath);
        } else if (entry.isFile() && entry.name.match(FILE_PATTERNS.css)) {
          files.push(fullPath);
        }
      }
    } catch {
      // Directory doesn't exist
    }
  }

  await walk(basePath);

  // Filter by git diff if enabled
  if (options.gitDiffOnly && options.gitDiffFiles && options.gitDiffFiles.length > 0) {
    return files.filter(f => options.gitDiffFiles.includes(f));
  }

  return files;
}

/**
 * Get HTML files
 * @param {string} basePath - Base path to scan
 * @param {Object} options - Options including gitDiffOnly and gitDiffFiles
 * @returns {Promise<string[]>} Array of HTML file paths
 */
export async function getHTMLFiles(basePath, options = {}) {
  const files = [];

  async function walk(dir) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await walk(fullPath);
        } else if (entry.isFile() && entry.name.match(FILE_PATTERNS.html)) {
          files.push(fullPath);
        }
      }
    } catch {
      // Directory doesn't exist
    }
  }

  // Also check common locations
  for (const p of COMMON_HTML_PATHS) {
    try {
      await fs.access(p);
      files.push(p);
    } catch {
      // File doesn't exist
    }
  }

  await walk(basePath);

  const uniqueFiles = [...new Set(files)];

  // Filter by git diff if enabled
  if (options.gitDiffOnly && options.gitDiffFiles && options.gitDiffFiles.length > 0) {
    return uniqueFiles.filter(f => options.gitDiffFiles.includes(f));
  }

  return uniqueFiles;
}
