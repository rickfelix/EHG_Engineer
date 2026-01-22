/**
 * Testing Sub-Agent - Framework Detection
 * Detect test framework from project configuration
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';

/**
 * Detect test framework from package.json
 * @param {string} basePath - Project base path
 * @returns {Promise<string|null>} Detected framework or null
 */
export async function detectTestFramework(basePath) {
  try {
    const pkg = JSON.parse(await fs.readFile(path.join(basePath, 'package.json'), 'utf8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    // Check direct dependencies
    if ('jest' in deps) return 'jest';
    if ('mocha' in deps) return 'mocha';
    if ('vitest' in deps) return 'vitest';
    if ('ava' in deps) return 'ava';
    if ('tape' in deps) return 'tape';
    if ('jasmine' in deps) return 'jasmine';
    if ('@playwright/test' in deps) return 'playwright';
    if ('cypress' in deps) return 'cypress';

    // Check scripts for test commands
    if (pkg.scripts?.test) {
      if (pkg.scripts.test.includes('jest')) return 'jest';
      if (pkg.scripts.test.includes('mocha')) return 'mocha';
      if (pkg.scripts.test.includes('vitest')) return 'vitest';
    }

    return null;
  } catch {
    return null;
  }
}
