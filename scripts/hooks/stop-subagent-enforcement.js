#!/usr/bin/env node
/**
 * Stop Hook: Sub-Agent Enforcement with Auto-Remediation
 *
 * LEO Protocol v4.3.3+
 * SD-LEO-INFRA-STOP-HOOK-SUB-001
 *
 * This file is a re-export wrapper for backward compatibility.
 * The implementation has been refactored into domain modules:
 *
 * - stop-subagent-enforcement/config.js - Configuration and requirements
 * - stop-subagent-enforcement/time-utils.js - Timezone normalization
 * - stop-subagent-enforcement/bypass-handler.js - Bypass file handling
 * - stop-subagent-enforcement/post-completion-validator.js - Post-completion validation
 * - stop-subagent-enforcement/type-aware-validator.js - Type-specific validation
 * - stop-subagent-enforcement/bias-detector.js - AI bias detection
 * - stop-subagent-enforcement/sub-agent-validator.js - Sub-agent validation
 * - stop-subagent-enforcement/index.js - Main orchestration
 *
 * GRACEFUL SHUTDOWN: Implements fail-safe error handling to prevent
 * libuv race conditions on Windows (UV_HANDLE_CLOSING assertion).
 *
 * @module stop-subagent-enforcement
 * @see SD-LEO-REFAC-STOP-HOOK-004
 */

// ============================================================================
// GRACEFUL SHUTDOWN - Top-level handlers for wrapper
// Must be registered before any imports that might throw
// ============================================================================

let isShuttingDown = false;

function gracefulExit(code = 0) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  setImmediate(() => process.exit(code));
}

// Catch any errors during module loading or execution
process.on('uncaughtException', (err) => {
  // Suppress libuv race condition errors silently
  if (err.message?.includes('UV_HANDLE_CLOSING') || isShuttingDown) {
    gracefulExit(0);
  } else {
    // Log other errors but still exit cleanly (stop hooks should not block)
    console.error('Stop hook error:', err.message);
    gracefulExit(0);
  }
});

process.on('unhandledRejection', () => {
  gracefulExit(0);
});

process.on('SIGINT', () => gracefulExit(0));
process.on('SIGTERM', () => gracefulExit(0));

// ============================================================================
// Module exports and execution
// ============================================================================

// Re-export everything from the modular implementation
export {
  main,
  checkBypass,
  validatePostCompletion,
  validateCompletionForType,
  getValidationRequirements,
  getUATRequirement,
  detectBiasesForType,
  validateSubAgents,
  handleValidationResults,
  CACHE_DURATION_MS,
  REQUIREMENTS,
  TIMING_RULES,
  REMEDIATION_ORDER,
  getRequiredSubAgents,
  normalizeToUTC
} from './stop-subagent-enforcement/index.js';

// Import for direct execution
import { main } from './stop-subagent-enforcement/index.js';
import { fileURLToPath } from 'url';
import { resolve } from 'path';

// Only run if this is the main module (not imported)
const __filename = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] && resolve(process.argv[1]) === __filename;

if (isMainModule) {
  // Set a hard timeout to ensure we exit even if something hangs
  const HARD_TIMEOUT_MS = 110000; // 110 seconds (under the 120s hook timeout)
  setTimeout(() => {
    console.error('Stop hook: Hard timeout reached, exiting cleanly');
    gracefulExit(0);
  }, HARD_TIMEOUT_MS).unref(); // unref() so it doesn't keep the process alive

  main().catch(err => {
    // Suppress shutdown-related errors
    if (err.message === 'SHUTDOWN_IN_PROGRESS' || isShuttingDown) {
      gracefulExit(0);
    } else {
      console.error('Stop hook error:', err.message);
      gracefulExit(0);
    }
  });
}
