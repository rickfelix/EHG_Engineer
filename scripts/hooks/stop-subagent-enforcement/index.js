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

/**
 * Main orchestration function
 */
export async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // 1. Check for bypass
  const bypassResult = await checkBypass(supabase);
  if (bypassResult.allowed) {
    process.exit(0);
  }
  if (bypassResult.blocked) {
    console.log(JSON.stringify(bypassResult.response));
    process.exit(2);
  }

  // 2. Get current branch to extract SD ID
  let branch;
  try {
    branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    process.exit(0); // Not in git repo
  }

  // 3. Extract SD ID from branch
  // Pattern matches: SD-XXX-...-NNN format (e.g., SD-LEO-INFRA-STOP-HOOK-SUB-001)
  const sdMatch = branch.match(/SD-[A-Z]+-(?:[A-Z]+-)*[0-9]+/i);
  if (sdMatch === null) {
    process.exit(0); // No SD in branch
  }
  const sdKey = sdMatch[0];

  // 4. Get SD details
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, legacy_id, title, sd_type, category, current_phase, status')
    .or(`sd_key.eq.${sdKey},legacy_id.eq.${sdKey},id.eq.${sdKey}`)
    .single();

  if (sdError || sd === null) {
    process.exit(0); // SD not found
  }

  // 5. Check post-completion if completed
  if (sd.status === 'completed' || sd.current_phase === 'COMPLETED') {
    await validatePostCompletion(supabase, sd, sdKey);
    process.exit(0);
  }

  // 5a. Type-aware completion validation
  // Check if SD has commits and is near completion (EXEC phase or later)
  const nearCompletionPhases = ['EXEC', 'PLAN_VERIFY', 'LEAD_FINAL', 'PLAN', 'PLAN-TO-LEAD'];
  if (nearCompletionPhases.includes(sd.current_phase)) {
    // Only validate if there are actual commits
    try {
      const diffOutput = execSync('git diff main...HEAD --name-only', { encoding: 'utf-8' }).trim();
      if (diffOutput) {
        // Has commits - validate type-specific completion requirements
        await validateCompletionForType(supabase, sd, sdKey);
      }
    } catch {
      // If diff fails, skip type-aware validation
    }
  }

  // 5b. Skip if no work has been committed on the branch (nothing to validate)
  try {
    const diffOutput = execSync('git diff main...HEAD --name-only', { encoding: 'utf-8' }).trim();
    if (!diffOutput) {
      console.error(`⏭️ Skipping validation for ${sdKey}: No commits on branch (nothing to validate)`);
      process.exit(0);
    }
  } catch {
    // If diff fails (e.g., main doesn't exist), continue with normal validation
  }

  // 5c. Type-aware bias detection
  // Detect common AI workflow biases based on SD type and state
  const validationRequirements = getValidationRequirements(sd);
  await detectBiasesForType(supabase, sd, sdKey, validationRequirements);

  // 6. Validate sub-agents
  const sdType = sd.sd_type || 'feature';
  const category = sd.category || '';

  const validation = await validateSubAgents(supabase, sd, sdKey);

  // 7. Handle validation results (blocks if required missing, warns if recommended missing)
  handleValidationResults(sdKey, sdType, category, sd.current_phase, validation);

  // 8. All required validations passed
  process.exit(0);
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
