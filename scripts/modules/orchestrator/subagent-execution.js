/**
 * Sub-Agent Execution
 *
 * Functions for executing sub-agents and storing results in the database.
 * Includes verification to prevent data integrity issues.
 *
 * Extracted from orchestrate-phase-subagents.js for maintainability.
 * Part of SD-LEO-REFACTOR-ORCH-001
 */

import { executeSubAgent as realExecuteSubAgent } from '../../../lib/sub-agent-executor.js';
import { safeInsert, generateUUID } from '../safe-insert.js';
// SD-LEO-FIX-NORMALIZE-UUID-SUB-001: Import normalizeSDId to fix FK constraint violation (PAT-FK-SDKEY-001)
import { normalizeSDId } from '../sd-id-normalizer.js';

/**
 * Ensure detailed_analysis is always a string (TEXT column requirement)
 *
 * CRITICAL FIX (SD-RETRO-ENHANCE-001):
 * - Empty objects {} are truthy in JavaScript, so `{} || ''` returns {}
 * - Schema validator expects TEXT type, rejects object type
 * - Solution: Explicitly check type and stringify if needed
 *
 * @param {any} value - The value to normalize
 * @returns {string} - Always returns a string
 */
export function normalizeDetailedAnalysis(value) {
  // If undefined or null, return empty string
  if (value === undefined || value === null) {
    return '';
  }

  // If already a string, return as-is
  if (typeof value === 'string') {
    return value;
  }

  // If object (including empty object {}), stringify it
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  // For any other type (number, boolean), convert to string
  return String(value);
}

/**
 * Execute sub-agent (integrated with real executor)
 *
 * @param {Object} subAgent - Sub-agent definition
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} options - Execution options to pass through
 * @returns {Promise<Object>} - Execution result
 */
export async function executeSubAgent(subAgent, sdId, options = {}) {
  const code = subAgent.sub_agent_code || subAgent.code;
  const name = subAgent.name;

  console.log(`\n   Executing ${code} (${name})...`);

  try {
    // Call REAL executor from lib/sub-agent-executor.js
    // Spread options to forward validation_mode, full_e2e, etc.
    const result = await realExecuteSubAgent(code, sdId, {
      phase: 'orchestrated',
      priority: subAgent.priority,
      ...options  // Forward any additional options (validation_mode, full_e2e, etc.)
    });

    // Transform result to match orchestrator's expected format
    return {
      sub_agent_code: code,
      sub_agent_name: name,
      verdict: result.verdict || 'WARNING',
      confidence: result.confidence !== undefined ? result.confidence : 50,
      critical_issues: result.critical_issues || [],
      warnings: result.warnings || [],
      recommendations: result.recommendations || [],
      detailed_analysis: normalizeDetailedAnalysis(result.detailed_analysis),
      execution_time: result.execution_time_ms
        ? Math.floor(result.execution_time_ms / 1000)
        : 0,
      // SD-LEO-PROTOCOL-V4-4-0: Required for CONDITIONAL_PASS verdicts
      validation_mode: result.validation_mode || null,
      justification: result.justification || null,
      conditions: result.conditions || null
    };

  } catch (error) {
    console.error(`      Execution failed: ${error.message}`);

    // Return error result instead of placeholder
    return {
      sub_agent_code: code,
      sub_agent_name: name,
      verdict: 'FAIL',
      confidence: 0,
      critical_issues: [{
        severity: 'CRITICAL',
        issue: `${code} execution failed`,
        error: error.message
      }],
      warnings: [],
      recommendations: [`Review ${code} sub-agent logs`, 'Retry after fixing issues'],
      detailed_analysis: `Execution error: ${error.message}\n\nStack: ${error.stack}`,
      execution_time: 0
    };
  }
}

/**
 * Verify that a sub-agent execution was actually recorded in the database
 *
 * Prevents SD-KNOWLEDGE-001 Issue #5: Missing sub-agent execution records
 * This verification ensures the record exists and is queryable.
 *
 * @param {string} recordId - The ID of the record to verify
 * @param {Object} supabase - Supabase client
 * @returns {Promise<boolean>} - True if record exists, false otherwise
 */
export async function verifyExecutionRecorded(recordId, supabase) {
  try {
    const { data, error } = await supabase
      .from('sub_agent_execution_results')
      .select('id')
      .eq('id', recordId)
      .single();

    if (error) {
      console.error(`      Verification query failed: ${error.message}`);
      return false;
    }

    return data !== null && data.id === recordId;
  } catch (err) {
    console.error(`      Verification exception: ${err.message}`);
    return false;
  }
}

/**
 * Store sub-agent result in database
 *
 * UPDATED: Now uses safeInsert() and verifies recording to prevent SD-KNOWLEDGE-001 Issue #5
 * Recording is MANDATORY - failures will throw errors immediately.
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} result - Sub-agent execution result
 * @param {Object} supabase - Supabase client
 * @returns {Promise<string>} - Record ID
 * @see docs/retrospectives/SD-KNOWLEDGE-001-completion-issues-and-prevention.md
 */
export async function storeSubAgentResult(sdId, result, supabase) {
  console.log(`      Recording ${result.sub_agent_code} execution...`);

  // SD-LEO-FIX-NORMALIZE-UUID-SUB-001: Normalize sd_id to UUID before insert
  // PAT-FK-SDKEY-001: sub_agent_execution_results.sd_id FK expects UUID, not sd_key
  let normalizedSdId = sdId;
  if (sdId) {
    const resolvedId = await normalizeSDId(supabase, sdId);
    if (resolvedId) {
      if (resolvedId !== sdId) {
        console.log(`      [SD-ID] Normalized: "${sdId}" -> "${resolvedId}"`);
      }
      normalizedSdId = resolvedId;
    } else {
      // If normalization fails, set to null to avoid FK violation
      console.warn(`      [SD-ID] Warning: Could not normalize "${sdId}" - setting to null`);
      normalizedSdId = null;
    }
  }

  // Prepare data for insert
  const insertData = {
    id: generateUUID(),
    sd_id: normalizedSdId,  // SD-LEO-FIX-NORMALIZE-UUID-SUB-001: Use normalized UUID
    sub_agent_code: result.sub_agent_code,
    sub_agent_name: result.sub_agent_name,
    verdict: result.verdict,
    confidence: result.confidence,
    critical_issues: result.critical_issues || [],
    warnings: result.warnings || [],
    recommendations: result.recommendations || [],
    detailed_analysis: normalizeDetailedAnalysis(result.detailed_analysis),
    execution_time: result.execution_time || 0,
    metadata: { phase: result.phase, orchestrated: true },
    created_at: new Date().toISOString(),
    // SD-LEO-PROTOCOL-V4-4-0: Required for CONDITIONAL_PASS verdicts
    validation_mode: result.validation_mode || null,
    justification: result.justification || null,
    conditions: result.conditions || null
  };

  // Use safeInsert for type-safe insert with validation
  const insertResult = await safeInsert(supabase, 'sub_agent_execution_results', insertData, {
    validate: true,
    verify: true,
    autoGenerateId: false  // We already generated UUID above
  });

  // Check if insert succeeded
  if (!insertResult.success) {
    console.error('      Failed to record sub-agent execution');
    console.error(`      Error: ${insertResult.error}`);
    throw new Error(`MANDATORY RECORDING FAILED: ${insertResult.error}`);
  }

  // Verify the record was actually stored (SD-KNOWLEDGE-001 Issue #5 prevention)
  const recordId = insertResult.data.id;
  const verified = await verifyExecutionRecorded(recordId, supabase);

  if (!verified) {
    throw new Error(`VERIFICATION FAILED: Record ${recordId} not found after insert. This is a critical data integrity issue.`);
  }

  console.log(`      Stored & verified: ${recordId}`);

  // Log warnings if any
  if (insertResult.warnings && insertResult.warnings.length > 0) {
    insertResult.warnings.forEach(warning => {
      console.warn(`      ${warning}`);
    });
  }

  return recordId;
}

/**
 * Update PRD metadata with sub-agent execution results
 *
 * This ensures sub-agent results are propagated to PRD.metadata for:
 * - Gate validation traceability
 * - Dashboard visibility
 * - Retrospective analysis
 *
 * @param {string} sdId - The SD ID (UUID)
 * @param {string} phase - The phase (e.g., 'PLAN_VERIFY')
 * @param {Array} results - Array of sub-agent execution results
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Object|null>} - Updated metadata or null on failure
 */
export async function updatePRDMetadataFromSubAgents(sdId, phase, results, supabase) {
  try {
    // Get PRD associated with this SD
    const { data: prd, error: prdError } = await supabase
      .from('product_requirements_v2')
      .select('id, metadata')
      .eq('directive_id', sdId)
      .single();

    if (prdError || !prd) {
      // Not an error - SD may not have a PRD yet (early phases)
      console.log(`      No PRD found for SD ${sdId} (normal for early phases)`);
      return null;
    }

    // Build sub-agent summary
    const subAgentSummary = results.map(r => ({
      code: r.sub_agent_code,
      verdict: r.verdict,
      confidence: r.confidence,
      executed_at: new Date().toISOString()
    }));

    const allPassed = results.every(r =>
      ['PASS', 'CONDITIONAL_PASS'].includes(r.verdict)
    );

    // Update PRD metadata with sub-agent results
    const updatedMetadata = {
      ...(prd.metadata || {}),
      [`${phase.toLowerCase()}_sub_agents`]: {
        executed_at: new Date().toISOString(),
        all_passed: allPassed,
        agents: subAgentSummary
      }
    };

    const { error: updateError } = await supabase
      .from('product_requirements_v2')
      .update({ metadata: updatedMetadata })
      .eq('id', prd.id);

    if (updateError) {
      console.warn(`      Failed to update PRD metadata: ${updateError.message}`);
      return null;
    }

    console.log(`      PRD metadata updated with ${results.length} sub-agent results`);
    return updatedMetadata;
  } catch (err) {
    console.warn(`      PRD metadata update exception: ${err.message}`);
    return null;
  }
}
