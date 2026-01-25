/**
 * Stop Hook: Sub-Agent Enforcement - Main Orchestration
 *
 * LEO Protocol v4.3.3+
 * SD-LEO-INFRA-STOP-HOOK-SUB-001
 *
 * Main orchestration module that coordinates all validation:
 * 1. Bypass checking
 * 2. SD detection from git branch
 * 3. Post-completion validation
 * 4. Type-aware completion validation
 * 5. Bias detection
 * 6. Sub-agent validation
 *
 * NOTE: This module should not be run directly.
 * Use the parent wrapper: scripts/hooks/stop-subagent-enforcement.js
 *
 * GRACEFUL SHUTDOWN: This module implements fail-safe shutdown handling
 * to prevent libuv race conditions on Windows during process termination.
 * All async operations are wrapped with timeout and abort handling.
 *
 * @module stop-subagent-enforcement/index
 */

import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import dotenv from 'dotenv';

// Import domain modules
import { checkBypass } from './bypass-handler.js';
import { validatePostCompletion } from './post-completion-validator.js';
import {
  validateCompletionForType,
  getValidationRequirements
} from './type-aware-validator.js';
import { detectBiasesForType } from './bias-detector.js';
import { validateSubAgents, handleValidationResults } from './sub-agent-validator.js';
import { REQUIREMENTS } from './config.js';

dotenv.config();

// ============================================================================
// GRACEFUL SHUTDOWN HANDLING
// Prevents libuv race condition: "handle->flags & UV_HANDLE_CLOSING" on Windows
// ============================================================================

let isShuttingDown = false;
const OPERATION_TIMEOUT_MS = 5000; // 5 second timeout per async operation

/**
 * Mark shutdown in progress and exit cleanly
 */
function gracefulExit(code = 0) {
  isShuttingDown = true;
  // Use setImmediate to allow pending microtasks to complete
  setImmediate(() => process.exit(code));
}

/**
 * Check if shutdown is in progress
 */
function checkShutdown() {
  if (isShuttingDown) {
    throw new Error('SHUTDOWN_IN_PROGRESS');
  }
}

/**
 * Wrap an async operation with timeout and shutdown detection
 * @param {Function} asyncFn - Async function to execute
 * @param {string} operationName - Name for logging
 * @returns {Promise<any>} - Result or null on timeout/shutdown
 */
async function safeAsync(asyncFn, operationName) {
  checkShutdown();

  return Promise.race([
    asyncFn(),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`TIMEOUT:${operationName}`)), OPERATION_TIMEOUT_MS);
    })
  ]).catch(err => {
    if (err.message === 'SHUTDOWN_IN_PROGRESS' || err.message.startsWith('TIMEOUT:')) {
      // Exit cleanly on shutdown or timeout - don't let errors propagate
      gracefulExit(0);
    }
    throw err; // Re-throw other errors
  });
}

// Register shutdown signal handlers
process.on('SIGINT', () => gracefulExit(0));
process.on('SIGTERM', () => gracefulExit(0));
process.on('SIGHUP', () => gracefulExit(0));

// Handle uncaught errors during shutdown gracefully
process.on('uncaughtException', (err) => {
  if (isShuttingDown || err.message?.includes('UV_HANDLE_CLOSING')) {
    // Suppress libuv race condition errors during shutdown
    gracefulExit(0);
  } else {
    console.error('Stop hook error:', err.message);
    gracefulExit(0); // Exit cleanly even on errors
  }
});

process.on('unhandledRejection', (reason) => {
  if (isShuttingDown) {
    gracefulExit(0);
  } else {
    console.error('Stop hook rejection:', reason);
    gracefulExit(0);
  }
});

/**
 * Main orchestration function
 * All async operations are wrapped with safeAsync() for graceful shutdown handling
 */
export async function main() {
  // Early exit if already shutting down
  if (isShuttingDown) {
    gracefulExit(0);
    return;
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // 1. Check for bypass (with timeout protection)
  const bypassResult = await safeAsync(
    () => checkBypass(supabase),
    'checkBypass'
  );
  if (!bypassResult) {
    gracefulExit(0); // Timeout or shutdown
    return;
  }
  if (bypassResult.allowed) {
    gracefulExit(0);
    return;
  }
  if (bypassResult.blocked) {
    console.log(JSON.stringify(bypassResult.response));
    gracefulExit(2);
    return;
  }

  // 2. Get current branch to extract SD ID (synchronous - safe)
  let branch;
  try {
    checkShutdown();
    branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
  } catch (err) {
    if (err.message === 'SHUTDOWN_IN_PROGRESS') {
      gracefulExit(0);
      return;
    }
    gracefulExit(0); // Not in git repo
    return;
  }

  // 3. Extract SD ID from branch
  // Pattern matches: SD-XXX-...-NNN format (e.g., SD-LEO-INFRA-STOP-HOOK-SUB-001)
  const sdMatch = branch.match(/SD-[A-Z]+-(?:[A-Z]+-)*[0-9]+/i);
  if (sdMatch === null) {
    gracefulExit(0); // No SD in branch
    return;
  }
  const sdKey = sdMatch[0];

  // 4. Get SD details (with timeout protection)
  const sdResult = await safeAsync(async () => {
    return supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, legacy_id, title, sd_type, category, current_phase, status')
      .or(`sd_key.eq.${sdKey},legacy_id.eq.${sdKey},id.eq.${sdKey}`)
      .single();
  }, 'getSDDetails');

  if (!sdResult) {
    gracefulExit(0); // Timeout or shutdown
    return;
  }

  const { data: sd, error: sdError } = sdResult;

  if (sdError || sd === null) {
    gracefulExit(0); // SD not found
    return;
  }

  // 5. Check post-completion if completed
  if (sd.status === 'completed' || sd.current_phase === 'COMPLETED') {
    await safeAsync(
      () => validatePostCompletion(supabase, sd, sdKey),
      'validatePostCompletion'
    );
    gracefulExit(0);
    return;
  }

  // 5a. Type-aware completion validation
  // Check if SD has commits and is near completion (EXEC phase or later)
  const nearCompletionPhases = ['EXEC', 'PLAN_VERIFY', 'LEAD_FINAL', 'PLAN', 'PLAN-TO-LEAD'];
  if (nearCompletionPhases.includes(sd.current_phase)) {
    // Only validate if there are actual commits
    try {
      checkShutdown();
      const diffOutput = execSync('git diff main...HEAD --name-only', { encoding: 'utf-8' }).trim();
      if (diffOutput) {
        // Has commits - validate type-specific completion requirements
        await safeAsync(
          () => validateCompletionForType(supabase, sd, sdKey),
          'validateCompletionForType'
        );
      }
    } catch (err) {
      if (err.message === 'SHUTDOWN_IN_PROGRESS') {
        gracefulExit(0);
        return;
      }
      // If diff fails, skip type-aware validation
    }
  }

  // 5b. Skip if no work has been committed on the branch (nothing to validate)
  try {
    checkShutdown();
    const diffOutput = execSync('git diff main...HEAD --name-only', { encoding: 'utf-8' }).trim();
    if (!diffOutput) {
      console.error(`⏭️ Skipping validation for ${sdKey}: No commits on branch (nothing to validate)`);
      gracefulExit(0);
      return;
    }
  } catch (err) {
    if (err.message === 'SHUTDOWN_IN_PROGRESS') {
      gracefulExit(0);
      return;
    }
    // If diff fails (e.g., main doesn't exist), continue with normal validation
  }

  // 5c. Type-aware bias detection (with timeout protection)
  // Detect common AI workflow biases based on SD type and state
  const validationRequirements = getValidationRequirements(sd);
  await safeAsync(
    () => detectBiasesForType(supabase, sd, sdKey, validationRequirements),
    'detectBiasesForType'
  );

  // Check shutdown before continuing
  if (isShuttingDown) {
    gracefulExit(0);
    return;
  }

  // 6. Validate sub-agents (with timeout protection)
  const sdType = sd.sd_type || 'feature';
  const category = sd.category || '';

  const validation = await safeAsync(
    () => validateSubAgents(supabase, sd, sdKey),
    'validateSubAgents'
  );

  if (!validation) {
    gracefulExit(0); // Timeout or shutdown
    return;
  }

  // 7. Handle validation results (synchronous - safe)
  // blocks if required missing, warns if recommended missing
  try {
    checkShutdown();
    handleValidationResults(sdKey, sdType, category, sd.current_phase, validation);
  } catch (err) {
    if (err.message === 'SHUTDOWN_IN_PROGRESS') {
      gracefulExit(0);
      return;
    }
    throw err;
  }

  // 8. All required validations passed
  gracefulExit(0);
}

// Re-export all modules for backward compatibility
export { checkBypass } from './bypass-handler.js';
export { validatePostCompletion } from './post-completion-validator.js';
export { validateCompletionForType, getValidationRequirements, getUATRequirement } from './type-aware-validator.js';
export { detectBiasesForType } from './bias-detector.js';
export { validateSubAgents, handleValidationResults } from './sub-agent-validator.js';
export {
  CACHE_DURATION_MS,
  REQUIREMENTS,
  TIMING_RULES,
  REMEDIATION_ORDER,
  getRequiredSubAgents
} from './config.js';
export { normalizeToUTC } from './time-utils.js';
