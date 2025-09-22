/**
 * Database Loader Compatibility Shim
 *
 * This file maintains backward compatibility for existing callers.
 * The actual implementation has been refactored into modular components.
 *
 * REFACTOR PR #1: Split monolithic file into focused modules
 * - connections.js: Supabase client management
 * - strategic-loaders.js: SD/PRD/EES loading
 * - submissions.js: SDIP submission handling
 * - pr-reviews.js: PR review tracking
 * - utilities.js: Shared helpers
 * - index.js: Main orchestrator
 *
 * Original file: 1503 lines
 * New structure: <300 lines per module
 *
 * NO BEHAVIOR CHANGES - All existing functionality preserved
 */

import DatabaseLoader from './database-loader/index.js';

// Export the class as default for compatibility
export default DatabaseLoader;

// Also export an instance for direct use (if any code was using it that way)
export const databaseLoader = new DatabaseLoader();