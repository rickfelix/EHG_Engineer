/**
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
      `[GENESIS SAFETY] ${context} requires EHG_MOCK_MODE=true. ` +
      'This is a safety measure to prevent simulation code from running in production.'
    );
  }
}

export default {
  assertMockMode,
  isMockModeEnabled,
  requireMockMode,
};
