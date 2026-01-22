/**
 * Sub-Agent Execution and Result Storage
 * Handles executing sub-agents and storing results in the database
 */

import { executeSubAgent as realExecuteSubAgent } from '../../../lib/sub-agent-executor.js';
import { safeInsert, generateUUID } from '../safe-insert.js';

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
 * Store sub-agent result in database
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - SD ID
 * @param {Object} result - Execution result
 * @returns {Promise<string>} Record ID
 */
async function storeSubAgentResult(supabase, sdId, result) {
  console.log(`   Recording ${result.sub_agent_code} execution...`);

  const insertData = {
    id: generateUUID(),
    sd_id: sdId,
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
  updatePRDMetadataFromSubAgents
};
