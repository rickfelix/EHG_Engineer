/**
 * Sub-Agent Executor Constants
 * Configuration values and thresholds
 *
 * Extracted from sub-agent-executor.js for modularity
 * SD-LEO-REFACTOR-SUBAGENT-EXEC-001
 */

import dotenv from 'dotenv';

dotenv.config();

// LEO v4.4 PATCH-005: Validation configuration
export const VALIDATION_SCORE_THRESHOLD = parseInt(process.env.LEO_VALIDATION_SCORE_THRESHOLD || '60', 10);
export const VALIDATION_MAX_RETRIES = parseInt(process.env.LEO_VALIDATION_MAX_RETRIES || '2', 10);
export const ENABLE_FULL_VALIDATION = process.env.LEO_FULL_VALIDATION !== 'false';

// ============================================================================
// Task Contract Configuration (Agentic Context Engineering v3.0)
// ============================================================================

/**
 * Whether to use contract-based handoffs for sub-agents
 * When enabled, sub-agents receive a task contract ID instead of full context
 * This reduces context overhead by 50-70%
 */
export const USE_TASK_CONTRACTS = process.env.LEO_USE_TASK_CONTRACTS !== 'false';

/**
 * Threshold for storing instructions as artifacts (bytes)
 * Instructions larger than this are stored as artifacts with pointers
 */
export const INSTRUCTION_ARTIFACT_THRESHOLD = 2048; // 2KB

/**
 * Threshold for compressing large detailed_analysis results (bytes)
 */
export const RESULT_COMPRESSION_THRESHOLD = 8192; // 8KB

/**
 * Sub-agents that should be linked to PRD metadata
 */
export const PRD_LINKABLE_SUBAGENTS = ['DESIGN', 'DATABASE', 'SECURITY', 'STORIES', 'RISK'];
