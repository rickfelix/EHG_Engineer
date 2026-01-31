/**
 * Sub-Agent Execution and Result Storage
 * Handles executing sub-agents and storing results in the database
 */

import { executeSubAgent as realExecuteSubAgent } from '../../../lib/sub-agent-executor.js';
import { safeInsert, generateUUID } from '../safe-insert.js';
import { createHash } from 'crypto';
// SD-LEO-FIX-NORMALIZE-UUID-SUB-001: Import normalizeSDId to fix FK constraint violation (PAT-FK-SDKEY-001)
import { normalizeSDId } from '../sd-id-normalizer.js';

/**
 * Generate deterministic idempotency key for sub-agent execution
 * SD-LEO-INFRA-HARDENING-001: Prevents duplicate execution records
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {string} subAgentCode - Sub-agent code
 * @param {string} sessionId - Optional session ID
 * @param {string} phase - Optional phase name
 * @returns {string} Deterministic idempotency key
 */
function generateIdempotencyKey(sdId, subAgentCode, sessionId = null, phase = null) {
  // Create deterministic key from execution context
  // Time window: Round to nearest hour to allow re-runs after 1 hour
  const timeWindow = Math.floor(Date.now() / (60 * 60 * 1000));

  const components = [
    sdId,
    subAgentCode,
    sessionId || 'no-session',
    phase || 'orchestrated',
    timeWindow.toString()
  ];

  const hash = createHash('sha256')
    .update(components.join('::'))
    .digest('hex')
    .substring(0, 32);

  return `idmp_${subAgentCode}_${hash}`;
}

/**
 * Check if an idempotent execution already exists
 * @param {Object} supabase - Supabase client
 * @param {string} idempotencyKey - The idempotency key to check
 * @returns {Promise<Object|null>} Existing record or null
 */
async function checkIdempotentExecution(supabase, idempotencyKey) {
  try {
    const { data, error } = await supabase
      .from('sub_agent_execution_results')
      .select('id, sub_agent_code, verdict, confidence, created_at')
      .contains('metadata', { idempotency_key: idempotencyKey })
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.warn(`   Idempotency check warning: ${error.message}`);
      return null;
    }

    return data || null;
  } catch (err) {
    console.warn(`   Idempotency check exception: ${err.message}`);
    return null;
  }
}

/**
 * Ensure detailed_analysis is always a string (TEXT column requirement)
 * @param {any} value - The value to normalize
 * @returns {string} Always returns a string
 */
function normalizeDetailedAnalysis(value) {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

/**
 * Execute sub-agent
 * @param {Object} subAgent - Sub-agent definition
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Execution result
 */
async function executeSubAgent(subAgent, sdId, options = {}) {
  const code = subAgent.sub_agent_code || subAgent.code;
  const name = subAgent.name;

  console.log(`\nExecuting ${code} (${name})...`);

  try {
    const result = await realExecuteSubAgent(code, sdId, {
      phase: 'orchestrated',
      priority: subAgent.priority,
      ...options
    });

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
      validation_mode: result.validation_mode || null,
      justification: result.justification || null,
      conditions: result.conditions || null
    };

  } catch (error) {
    console.error(`   Execution failed: ${error.message}`);

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
 * Verify that a sub-agent execution was recorded in the database
 * @param {Object} supabase - Supabase client
 * @param {string} recordId - The ID of the record to verify
 * @returns {Promise<boolean>} True if record exists
 */
async function verifyExecutionRecorded(supabase, recordId) {
  try {
    const { data, error } = await supabase
      .from('sub_agent_execution_results')
      .select('id')
      .eq('id', recordId)
      .single();

    if (error) {
      console.error(`   Verification query failed: ${error.message}`);
      return false;
    }

    return data !== null && data.id === recordId;
  } catch (err) {
    console.error(`   Verification exception: ${err.message}`);
    return false;
  }
}

/**
 * Store sub-agent result in database with idempotency protection
 * SD-LEO-INFRA-HARDENING-001: Idempotency keys prevent duplicate records
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - SD ID
 * @param {Object} result - Execution result
 * @param {Object} options - Additional options
 * @param {string} options.sessionId - Session ID for idempotency
 * @param {boolean} options.skipIdempotency - Force new record (default: false)
 * @returns {Promise<string>} Record ID
 */
async function storeSubAgentResult(supabase, sdId, result, options = {}) {
  const sessionId = options.sessionId || process.env.CLAUDE_SESSION_ID || null;
  const phase = result.phase || 'orchestrated';

  // SD-LEO-FIX-NORMALIZE-UUID-SUB-001: Normalize sd_id to UUID before insert
  // PAT-FK-SDKEY-001: sub_agent_execution_results.sd_id FK expects UUID, not sd_key
  let normalizedSdId = sdId;
  if (sdId) {
    const resolvedId = await normalizeSDId(supabase, sdId);
    if (resolvedId) {
      if (resolvedId !== sdId) {
        console.log(`   [SD-ID] Normalized: "${sdId}" -> "${resolvedId}"`);
      }
      normalizedSdId = resolvedId;
    } else {
      // If normalization fails, set to null to avoid FK violation
      console.warn(`   [SD-ID] Warning: Could not normalize "${sdId}" - setting to null`);
      normalizedSdId = null;
    }
  }

  // Generate idempotency key
  const idempotencyKey = generateIdempotencyKey(sdId, result.sub_agent_code, sessionId, phase);
  console.log(`   Recording ${result.sub_agent_code} execution (ikey: ${idempotencyKey.substring(0, 20)}...)...`);

  // Check for existing idempotent execution (unless skipped)
  if (!options.skipIdempotency) {
    const existing = await checkIdempotentExecution(supabase, idempotencyKey);
    if (existing) {
      console.log(`   Idempotent hit: Returning existing record ${existing.id} (created ${existing.created_at})`);
      return existing.id;
    }
  }

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
    metadata: {
      phase,
      orchestrated: true,
      idempotency_key: idempotencyKey,
      session_id: sessionId
    },
    created_at: new Date().toISOString(),
    validation_mode: result.validation_mode || null,
    justification: result.justification || null,
    conditions: result.conditions || null
  };

  const insertResult = await safeInsert(supabase, 'sub_agent_execution_results', insertData, {
    validate: true,
    verify: true,
    autoGenerateId: false
  });

  if (!insertResult.success) {
    console.error('   Failed to record sub-agent execution');
    console.error(`   Error: ${insertResult.error}`);
    throw new Error(`MANDATORY RECORDING FAILED: ${insertResult.error}`);
  }

  const recordId = insertResult.data.id;
  const verified = await verifyExecutionRecorded(supabase, recordId);

  if (!verified) {
    throw new Error(`VERIFICATION FAILED: Record ${recordId} not found after insert.`);
  }

  console.log(`   Stored & verified: ${recordId}`);

  if (insertResult.warnings && insertResult.warnings.length > 0) {
    insertResult.warnings.forEach(warning => {
      console.warn(`   ${warning}`);
    });
  }

  return recordId;
}

/**
 * Update PRD metadata with sub-agent execution results
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - SD ID (UUID)
 * @param {string} phase - Phase name
 * @param {Array} results - Sub-agent execution results
 * @returns {Promise<Object|null>} Updated metadata or null
 */
async function updatePRDMetadataFromSubAgents(supabase, sdId, phase, results) {
  try {
    const { data: prd, error: prdError } = await supabase
      .from('product_requirements_v2')
      .select('id, metadata')
      .eq('directive_id', sdId)
      .single();

    if (prdError || !prd) {
      console.log(`   No PRD found for SD ${sdId} (normal for early phases)`);
      return null;
    }

    const subAgentSummary = results.map(r => ({
      code: r.sub_agent_code,
      verdict: r.verdict,
      confidence: r.confidence,
      executed_at: new Date().toISOString()
    }));

    const allPassed = results.every(r =>
      ['PASS', 'CONDITIONAL_PASS'].includes(r.verdict)
    );

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
      console.warn(`   Failed to update PRD metadata: ${updateError.message}`);
      return null;
    }

    console.log(`   PRD metadata updated with ${results.length} sub-agent results`);
    return updatedMetadata;
  } catch (err) {
    console.warn(`   PRD metadata update exception: ${err.message}`);
    return null;
  }
}

export {
  normalizeDetailedAnalysis,
  executeSubAgent,
  verifyExecutionRecorded,
  storeSubAgentResult,
  updatePRDMetadataFromSubAgents,
  // SD-LEO-INFRA-HARDENING-001: Idempotency utilities
  generateIdempotencyKey,
  checkIdempotentExecution
};
