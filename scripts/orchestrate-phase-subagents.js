#!/usr/bin/env node

/**
 * Phase Sub-Agent Orchestrator
 *
 * Purpose: Automatically execute all required sub-agents for a given SD phase
 *
 * This is a thin wrapper that delegates to modular components in:
 * scripts/modules/phase-subagent-orchestrator/
 *
 * Usage:
 *   node scripts/orchestrate-phase-subagents.js <PHASE> <SD-ID>
 *
 * Phases:
 *   LEAD_PRE_APPROVAL - LEAD initial approval
 *   PLAN_PRD - PLAN PRD creation
 *   EXEC_IMPL - EXEC implementation (none - EXEC does the work)
 *   PLAN_VERIFY - PLAN verification (MANDATORY: TESTING, GITHUB)
 *   LEAD_FINAL - LEAD final approval (MANDATORY: RETRO)
 *
 * Examples:
 *   node scripts/orchestrate-phase-subagents.js PLAN_VERIFY SD-TEST-001
 *   node scripts/orchestrate-phase-subagents.js LEAD_FINAL SD-TEST-001
 */

import dotenv from 'dotenv';
import { createSupabaseServiceClient } from './lib/supabase-connection.js';
import {
  orchestrate,
  getPhaseSubAgents,
  getPhaseSubAgentsForSd,
  isSubAgentRequired,
  VALID_PHASES
} from './modules/phase-subagent-orchestrator/index.js';

dotenv.config();

// Initialize Supabase client with service role key
const supabase = await createSupabaseServiceClient('engineer', { verbose: false });

/**
 * Wrapper for orchestrate that uses the module's supabase client
 * @param {string} phase - Phase name
 * @param {string} sdId - SD ID
 * @param {Object} options - Options
 * @returns {Promise<Object>} Result
 */
async function orchestrateWithClient(phase, sdId, options = {}) {
  return orchestrate(supabase, phase, sdId, options);
}

/**
 * CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: node scripts/orchestrate-phase-subagents.js <PHASE> <SD-ID>');
    console.error('\nPhases:');
    console.error('  LEAD_PRE_APPROVAL - LEAD initial approval');
    console.error('  PLAN_PRD - PLAN PRD creation');
    console.error('  EXEC_IMPL - EXEC implementation');
    console.error('  PLAN_VERIFY - PLAN verification');
    console.error('  LEAD_FINAL - LEAD final approval');
    console.error('\nExample:');
    console.error('  node scripts/orchestrate-phase-subagents.js PLAN_VERIFY SD-TEST-001');
    process.exit(1);
  }

  const [phase, sdId] = args;

  if (!VALID_PHASES.includes(phase)) {
    console.error(`Invalid phase: ${phase}`);
    console.error(`   Valid phases: ${VALID_PHASES.join(', ')}`);
    process.exit(1);
  }

  try {
    const result = await orchestrateWithClient(phase, sdId);
    process.exit(result.can_proceed ? 0 : 1);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

// Export for use in other scripts
export {
  orchestrateWithClient as orchestrate,
  getPhaseSubAgents,
  getPhaseSubAgentsForSd,
  isSubAgentRequired
};
