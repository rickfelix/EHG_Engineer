/**
 * Genesis Virtual Bunker - Mock Mode Injector
 *
 * Injects assertMockMode() into all generated files to ensure
 * simulation code cannot run in production mode.
 * Part of SD-GENESIS-V31-MASON-P2
 *
 * @module lib/genesis/mock-mode-injector
 */

import fs from 'fs/promises';
import path from 'path';

/**
 * The mock mode assertion code to inject.
 * This ensures EHG_MOCK_MODE environment variable is set.
 */
export const MOCK_MODE_ASSERTION = `/**
 * Genesis Virtual Bunker - Mock Mode Enforcement
 * This code MUST be present in all generated files.
 * Ensures simulation code cannot run in production.
 */
function assertMockMode() {
  if (process.env.EHG_MOCK_MODE !== 'true') {
    throw new Error(
      '[GENESIS SAFETY] This code requires EHG_MOCK_MODE=true. ' +
      'Generated simulation code cannot run in production mode. ' +
      'Set EHG_MOCK_MODE=true in your environment to proceed.'
    );
  }
}
assertMockMode();
`;

/**
 * Compact version of mock mode assertion (single line check).
 */
export const MOCK_MODE_ASSERTION_COMPACT = 'if(process.env.EHG_MOCK_MODE!==\'true\')throw new Error(\'[GENESIS SAFETY] EHG_MOCK_MODE required\');';

/**
 * Import statement version for modular code.
 */
export const MOCK_MODE_IMPORT = 'import { assertMockMode } from \'@/lib/genesis/mock-mode\';\nassertMockMode();\n';

/**
 * Check if a file already has mock mode assertion.
 *
 * @param {string} content - File content
 * @returns {boolean} - True if assertion exists
 */
export function hasMockModeAssertion(content) {
  const checks = [
    'assertMockMode()',
    'EHG_MOCK_MODE',
    '[GENESIS SAFETY]',
  ];

  return checks.some((check) => content.includes(check));
}

/**
 * Inject mock mode assertion into code content.
 *
 * @param {string} content - Original code content
 * @param {Object} options - Injection options
 * @param {boolean} options.compact - Use compact assertion
 * @param {boolean} options.useImport - Use import version (requires mock-mode module)
 * @param {boolean} options.skipIfExists - Don't inject if already present
 * @returns {string} - Code with mock mode assertion
 */
export function injectMockMode(content, options = {}) {
  const {
    compact = false,
    useImport = false,
    skipIfExists = true,
  } = options;

  // Skip if already has assertion
  if (skipIfExists && hasMockModeAssertion(content)) {
    return content;
  }

  const assertion = useImport ? MOCK_MODE_IMPORT :
                    compact ? MOCK_MODE_ASSERTION_COMPACT + '\n' :
                    MOCK_MODE_ASSERTION;

  // Detect file type and inject appropriately
  const lines = content.split('\n');
  let insertIndex = 0;

  // Skip shebang if present
  if (lines[0]?.startsWith('#!')) {
    insertIndex = 1;
  }

  // Skip 'use strict' if present
  if (lines[insertIndex]?.includes("'use strict'") || lines[insertIndex]?.includes('"use strict"')) {
    insertIndex++;
  }

  // Skip existing imports/requires to place assertion after them
  while (insertIndex < lines.length) {
    const line = lines[insertIndex].trim();
    if (line.startsWith('import ') || line.startsWith('const ') && line.includes('require(')) {
      insertIndex++;
    } else if (line === '' && insertIndex > 0) {
      // Skip empty lines between imports
      const prevLine = lines[insertIndex - 1]?.trim() || '';
      if (prevLine.startsWith('import ') || prevLine.includes('require(')) {
        insertIndex++;
      } else {
        break;
      }
    } else {
      break;
    }
  }

  // Insert the assertion
  lines.splice(insertIndex, 0, '\n' + assertion);

  return lines.join('\n');
}

/**
 * Inject mock mode into a file.
 *
 * @param {string} filePath - Path to the file
 * @param {Object} options - Injection options
 * @returns {Promise<{ injected: boolean, error: Error|null }>}
 */
export async function injectMockModeInFile(filePath, options = {}) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');

    if (options.skipIfExists && hasMockModeAssertion(content)) {
      return { injected: false, reason: 'Already has mock mode assertion' };
    }

    const newContent = injectMockMode(content, options);
    await fs.writeFile(filePath, newContent, 'utf-8');

    return { injected: true, error: null };
  } catch (error) {
    return { injected: false, error };
  }
}

/**
 * Inject mock mode into all JavaScript/TypeScript files in a directory.
 *
 * @param {string} dirPath - Directory path
 * @param {Object} options - Injection options
 * @param {string[]} options.extensions - File extensions to process
 * @param {string[]} options.exclude - Patterns to exclude
 * @returns {Promise<{ processed: number, injected: number, errors: Error[] }>}
 */
export async function injectMockModeInDirectory(dirPath, options = {}) {
  const {
    extensions = ['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs'],
    exclude = ['node_modules', '.git', 'dist', 'build', '__tests__', '.test.', '.spec.'],
    ...injectOptions
  } = options;

  const results = {
    processed: 0,
    injected: 0,
    errors: [],
    files: [],
  };

  async function processDir(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Check exclusions
      if (exclude.some((pattern) => fullPath.includes(pattern))) {
        continue;
      }

      if (entry.isDirectory()) {
        await processDir(fullPath);
      } else if (entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext))) {
        results.processed++;
        const { injected, error } = await injectMockModeInFile(fullPath, injectOptions);

        if (error) {
          results.errors.push(error);
        } else if (injected) {
          results.injected++;
          results.files.push(fullPath);
        }
      }
    }
  }

  await processDir(dirPath);
  return results;
}

/**
 * Create the mock mode module that can be imported.
 * This creates @/lib/genesis/mock-mode.js
 *
 * @returns {string} - Module content
 */
export function createMockModeModule() {
  return `/**
 * Genesis Virtual Bunker - Mock Mode Module
 * Import and call assertMockMode() at the start of generated files.
 *
 * @module lib/genesis/mock-mode
 */

/**
 * Assert that EHG_MOCK_MODE is enabled.
 * Throws an error if the environment variable is not set to 'true'.
 *
 * @throws {Error} If EHG_MOCK_MODE !== 'true'
 */
export function assertMockMode() {
  if (process.env.EHG_MOCK_MODE !== 'true') {
    throw new Error(
      '[GENESIS SAFETY] This code requires EHG_MOCK_MODE=true. ' +
      'Generated simulation code cannot run in production mode. ' +
      'Set EHG_MOCK_MODE=true in your environment to proceed.'
    );
  }
}

/**
 * Check if mock mode is enabled without throwing.
 *
 * @returns {boolean} - True if mock mode is enabled
 */
export function isMockModeEnabled() {
  return process.env.EHG_MOCK_MODE === 'true';
}

/**
 * Require mock mode with custom error message.
 *
 * @param {string} context - Context description for error message
 * @throws {Error} If EHG_MOCK_MODE !== 'true'
 */
export function requireMockMode(context) {
  if (process.env.EHG_MOCK_MODE !== 'true') {
    throw new Error(
      \`[GENESIS SAFETY] \${context} requires EHG_MOCK_MODE=true. \` +
      'This is a safety measure to prevent simulation code from running in production.'
    );
  }
}

export default {
  assertMockMode,
  isMockModeEnabled,
  requireMockMode,
};
`;
}

/**
 * Verify mock mode is properly injected in a file.
 *
 * @param {string} filePath - Path to file
 * @returns {Promise<{ valid: boolean, hasAssertion: boolean, error: Error|null }>}
 */
export async function verifyMockModeInjection(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const hasAssertion = hasMockModeAssertion(content);

    return {
      valid: hasAssertion,
      hasAssertion,
      error: null,
    };
  } catch (error) {
    return {
      valid: false,
      hasAssertion: false,
      error,
    };
  }
}

/**
 * Verify all files in a directory have mock mode injection.
 *
 * @param {string} dirPath - Directory path
 * @param {Object} options - Verification options
 * @returns {Promise<{ valid: boolean, total: number, withAssertion: number, missing: string[] }>}
 */
export async function verifyDirectoryInjection(dirPath, options = {}) {
  const {
    extensions = ['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs'],
    exclude = ['node_modules', '.git', 'dist', 'build', '__tests__', '.test.', '.spec.'],
  } = options;

  const results = {
    valid: true,
    total: 0,
    withAssertion: 0,
    missing: [],
  };

  async function checkDir(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (exclude.some((pattern) => fullPath.includes(pattern))) {
        continue;
      }

      if (entry.isDirectory()) {
        await checkDir(fullPath);
      } else if (entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext))) {
        results.total++;
        const { hasAssertion } = await verifyMockModeInjection(fullPath);

        if (hasAssertion) {
          results.withAssertion++;
        } else {
          results.missing.push(fullPath);
          results.valid = false;
        }
      }
    }
  }

  await checkDir(dirPath);
  return results;
}

export default {
  MOCK_MODE_ASSERTION,
  MOCK_MODE_ASSERTION_COMPACT,
  MOCK_MODE_IMPORT,
  hasMockModeAssertion,
  injectMockMode,
  injectMockModeInFile,
  injectMockModeInDirectory,
  createMockModeModule,
  verifyMockModeInjection,
  verifyDirectoryInjection,
};
