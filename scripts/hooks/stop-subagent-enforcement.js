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
 * @module stop-subagent-enforcement
 * @see SD-LEO-REFAC-STOP-HOOK-004
 */

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
  main().catch(err => {
    console.error('Stop hook error:', err.message);
    process.exit(0);
  });
}
