/**
 * Results Storage
 * Database storage for sub-agent execution and validation results
 *
 * Extracted from sub-agent-executor.js for modularity
 * SD-LEO-REFACTOR-SUBAGENT-EXEC-001
 */

import { getSupabaseClient } from './supabase-client.js';
import { USE_TASK_CONTRACTS, RESULT_COMPRESSION_THRESHOLD, PRD_LINKABLE_SUBAGENTS } from './constants.js';
import { createArtifact } from '../artifact-tools.js';

/**
 * Store sub-agent execution results in database
 * @param {string} code - Sub-agent code
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} subAgent - Sub-agent record (or null if error before load)
 * @param {Object} results - Execution results
 * @param {Object} options - Storage options
 * @returns {Promise<Object>} Stored result record
 */
export async function storeSubAgentResults(code, sdId, subAgent, results, options = {}) {
  console.log(`\nStoring ${code} results to database...`);
  const sdKey = options.sdKey || sdId; // For display purposes

  const supabase = await getSupabaseClient();

  // Convert milliseconds to seconds for execution_time column
  const executionTimeSec = results.execution_time_ms
    ? Math.round(results.execution_time_ms / 1000)
    : 0;

  // Map verdict to database-allowed values
  // Schema allows: PASS, FAIL, BLOCKED, CONDITIONAL_PASS, WARNING
  const verdictMap = {
    'PASS': 'PASS',
    'FAIL': 'FAIL',
    'BLOCKED': 'BLOCKED',
    'CONDITIONAL_PASS': 'CONDITIONAL_PASS',
    'WARNING': 'WARNING',
    'ERROR': 'FAIL',  // Errors map to FAIL
    'PENDING': 'WARNING',  // Pending maps to WARNING
    'MANUAL_REQUIRED': 'WARNING',  // Manual required maps to WARNING
    'UNKNOWN': 'WARNING'  // Unknown maps to WARNING
  };
  const mappedVerdict = verdictMap[results.verdict] || 'WARNING';

  // Agentic Context Engineering v3.0: Compress large results
  let detailedAnalysis = results.detailed_analysis || null;

  // FIX: Filter out nested findings from results.metadata before spreading
  // This prevents recursive snowballing where previous sub-agent results are nested
  const safeMetadata = (() => {
    if (!results.metadata) return {};
    const { findings, sub_agent_results: _sub_agent_results, ...rest } = results.metadata;
    // If findings exists in metadata, only keep a summary
    if (findings) {
      rest._findings_stripped = true;
      rest._findings_had_keys = Object.keys(findings);
    }
    return rest;
  })();

  let metadata = {
    sub_agent_version: subAgent?.metadata?.version || '1.0.0',
    original_verdict: results.verdict,  // Store original before mapping
    options: results.options || {},
    findings: results.findings || [],
    metrics: results.metrics || {},
    error: results.error || null,
    stack: results.stack || null,
    // Model routing metadata (added 2025-12-03)
    routing: subAgent?.routing || null,
    ...safeMetadata  // FIX: Use filtered metadata instead of raw spread
  };

  // Compress large detailed_analysis to artifact (>8KB threshold)
  if (detailedAnalysis && USE_TASK_CONTRACTS) {
    const analysisStr = typeof detailedAnalysis === 'string'
      ? detailedAnalysis
      : JSON.stringify(detailedAnalysis);

    if (analysisStr.length > RESULT_COMPRESSION_THRESHOLD) {
      try {
        const artifact = await createArtifact(analysisStr, {
          source_tool: 'sub-agent-executor',
          type: 'analysis',
          sd_id: sdId,
          metadata: { sub_agent_code: code, field: 'detailed_analysis' }
        });

        console.log(`   Compressed detailed_analysis to artifact (${artifact.token_count} tokens)`);

        // Replace with artifact reference
        detailedAnalysis = {
          _compressed: true,
          artifact_id: artifact.artifact_id,
          summary: artifact.summary,
          token_count: artifact.token_count
        };
        metadata.detailed_analysis_artifact_id = artifact.artifact_id;
      } catch (compressError) {
        console.warn(`   Warning: Failed to compress detailed_analysis: ${compressError.message}`);
        // Keep original on failure
      }
    }
  }

  const record = {
    sd_id: sdId,
    sub_agent_code: code,
    sub_agent_name: subAgent?.name || code,
    verdict: mappedVerdict,
    confidence: results.confidence !== undefined ? results.confidence : 50,
    critical_issues: results.critical_issues || [],
    warnings: results.warnings || [],
    recommendations: results.recommendations || [],
    detailed_analysis: detailedAnalysis,
    execution_time: executionTimeSec,
    // SD-LEO-PROTOCOL-V4-4-0: Add adaptive validation mode fields
    validation_mode: results.validation_mode || 'prospective',  // Default to prospective for backward compatibility
    justification: results.justification || null,  // Required for CONDITIONAL_PASS (validated at DB level)
    conditions: results.conditions || null,  // Required for CONDITIONAL_PASS (validated at DB level)
    metadata,
    created_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('sub_agent_execution_results')
    .insert(record)
    .select()
    .single();

  if (error) {
    // SD-VENTURE-STAGE0-UI-001: Treat timeout errors as warnings, not fatal
    // The sub-agent work completed successfully, only the recording failed
    if (error.message.includes('statement timeout') || error.message.includes('timeout')) {
      console.warn(`   Warning: Timeout storing results (non-fatal): ${error.message}`);
      // Return a mock result so the orchestration can continue
      return {
        id: `timeout-${Date.now()}`,
        sd_id: record.sd_id,
        sub_agent_code: record.sub_agent_code,
        verdict: record.verdict,
        confidence_score: record.confidence_score,
        storage_timeout: true
      };
    }
    throw new Error(`Failed to store sub-agent results: ${error.message}`);
  }

  console.log(`   Stored with ID: ${data.id}`);

  // ============================================================================
  // PAT-SUBAGENT-PRD-LINK-001: Auto-link sub-agent results to PRD metadata
  // Ensures PLAN-TO-EXEC handoff can verify sub-agent execution via PRD
  // ============================================================================

  if (PRD_LINKABLE_SUBAGENTS.includes(code)) {
    try {
      // Use sdKey (from options) for PRD ID, fall back to sdId
      const prdId = `PRD-${sdKey}`;
      const metadataField = `${code.toLowerCase()}_analysis`;

      // Fetch current PRD metadata
      const { data: prd, error: prdErr } = await supabase
        .from('product_requirements_v2')
        .select('metadata')
        .eq('id', prdId)
        .single();

      if (!prdErr && prd) {
        const existingMetadata = prd.metadata || {};

        // FIX 3 (2026-01-01): Include full analysis content for GATE1 validation
        // GATE1 expects: raw_analysis, generated_at, sd_context, recommendations
        const analysisContent = {
          // Core execution metadata
          verdict: record.verdict,
          confidence: record.confidence,
          execution_id: data.id,
          executed_at: record.created_at,
          sub_agent_version: metadata.version || '1.0.0',

          // FIX 3: Include full analysis content (GATE1 requirement)
          raw_analysis: record.detailed_analysis,
          generated_at: record.created_at,
          sd_context: record.sd_id,

          // Include actionable outputs
          critical_issues: record.critical_issues || [],
          warnings: record.warnings || [],
          recommendations: record.recommendations || [],

          // Validation context
          validation_mode: record.validation_mode || 'prospective',
          justification: record.justification,
          conditions: record.conditions,

          // Design-informed flag (for DESIGN sub-agent)
          design_informed: code === 'DESIGN' ? true : undefined
        };

        const updatedMetadata = {
          ...existingMetadata,
          [metadataField]: analysisContent
        };

        const { error: updateErr } = await supabase
          .from('product_requirements_v2')
          .update({
            metadata: updatedMetadata,
            updated_at: new Date().toISOString()
          })
          .eq('id', prdId);

        if (!updateErr) {
          console.log(`   Linked ${code} results to PRD metadata.${metadataField} (with full analysis)`);
        } else {
          console.warn(`   Warning: Failed to link to PRD: ${updateErr.message}`);
        }
      } else if (prdErr?.code !== 'PGRST116') {
        // PGRST116 = not found, which is expected if PRD doesn't exist yet
        console.log(`   Info: No PRD found for ${sdId} - skipping metadata link`);
      }
    } catch (linkError) {
      // Non-fatal - sub-agent results are stored, linking is enhancement
      console.warn(`   Warning: PRD metadata link failed: ${linkError.message}`);
    }
  }

  return data;
}

/**
 * Store validation results in database (LEO v4.4 PATCH-005)
 *
 * @param {Object} validationData - Validation result data
 * @returns {Promise<Object|null>} Stored record or null if storage fails
 */
export async function storeValidationResults(validationData) {
  try {
    const supabase = await getSupabaseClient();

    const record = {
      sd_id: validationData.sd_id,
      sub_agent_code: validationData.sub_agent_code,
      validation_passed: validationData.validation_passed,
      validation_score: validationData.validation_score,
      levels_checked: validationData.levels_checked,
      file_references: validationData.file_references || {},
      symbol_references: validationData.symbol_references || {},
      table_references: validationData.table_references || {},
      code_snippets: validationData.code_snippets || {},
      issues: validationData.issues || [],
      warnings: validationData.warnings || [],
      retry_count: validationData.retry_count || 0,
      retry_reason: validationData.retry_reason || null,
      previous_validation_id: validationData.previous_validation_id || null,
      validation_duration_ms: validationData.validation_duration_ms || null,
      tables_loaded_count: validationData.tables_loaded_count || null,
      execution_id: validationData.execution_id || null
    };

    const { data, error } = await supabase
      .from('subagent_validation_results')
      .insert(record)
      .select()
      .single();

    if (error) {
      // Non-fatal: Log but don't throw - validation storage is enhancement
      console.warn(`   Warning: Failed to store validation results: ${error.message}`);
      return null;
    }

    console.log(`   Validation stored (ID: ${data.id.slice(0, 8)}...)`);
    return data;
  } catch (err) {
    // Non-fatal: Log but don't throw
    console.warn(`   Warning: Validation storage error: ${err.message}`);
    return null;
  }
}
