/**
 * Artifact Tools - Tool Output Wrappers for Context Optimization
 *
 * SD: SD-FOUND-AGENTIC-CONTEXT-001 (Agentic Context Engineering v3.0)
 *
 * Purpose: Intercepts large tool outputs, stores them as artifacts in the database,
 * and returns compact summaries with pointers. This reduces context window usage
 * by 30-40% for operations that produce large outputs.
 *
 * Usage:
 *   import { createArtifact, readArtifact, wrapToolOutput } from './artifact-tools.js';
 *
 *   // Store large content as artifact
 *   const pointer = await createArtifact(content, { source_tool: 'Read', summary: '...' });
 *
 *   // Retrieve artifact when needed
 *   const content = await readArtifact(pointer.artifact_id);
 *
 *   // Auto-wrap tool output (creates artifact if >4KB)
 *   const result = await wrapToolOutput('Read', content, { file_path: '/path/to/file' });
 *
 * @module artifact-tools
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// Configuration
// ============================================================================

const ARTIFACT_THRESHOLD_BYTES = 4096; // 4KB - outputs larger than this become artifacts
const DEFAULT_TTL_HOURS = 2; // Artifacts expire after 2 hours by default
const MAX_SUMMARY_LENGTH = 500; // Maximum characters in summary

// Supabase client (lazy initialization)
let supabase = null;

function getSupabase() {
  if (!supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
      throw new Error('Supabase credentials not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    }

    supabase = createClient(url, key);
  }
  return supabase;
}

// ============================================================================
// Summary Generation
// ============================================================================

/**
 * Generate a meaningful summary for content based on its type
 *
 * @param {string} content - The content to summarize
 * @param {string} sourceTool - The tool that generated this content (Read, Bash, Grep, etc.)
 * @param {Object} metadata - Additional context about the content
 * @returns {string} A concise summary
 */
function generateSummary(content, sourceTool, metadata = {}) {
  if (!content || content.length === 0) {
    return 'Empty content';
  }

  const lines = content.split('\n');
  const lineCount = lines.length;
  const charCount = content.length;
  const tokenEstimate = Math.ceil(charCount / 4);

  // Tool-specific summary strategies
  switch (sourceTool.toLowerCase()) {
    case 'read': {
      // For file reads, show first/last lines and structure
      const filePath = metadata.file_path || 'unknown file';
      const fileName = filePath.split('/').pop();
      const extension = fileName.includes('.') ? fileName.split('.').pop() : 'unknown';

      // Extract key patterns from code files
      let keyPatterns = [];
      if (['js', 'ts', 'jsx', 'tsx'].includes(extension)) {
        // Find exports, functions, classes
        const exports = content.match(/export\s+(default\s+)?(function|class|const|let|var)\s+\w+/g) || [];
        const functions = content.match(/(?:async\s+)?function\s+\w+/g) || [];
        keyPatterns = [...new Set([...exports, ...functions])].slice(0, 5);
      } else if (['sql'].includes(extension)) {
        // Find CREATE TABLE, functions
        const creates = content.match(/CREATE\s+(TABLE|FUNCTION|INDEX|TRIGGER)\s+\w+/gi) || [];
        keyPatterns = creates.slice(0, 5);
      }

      const patternsText = keyPatterns.length > 0
        ? `\nKey patterns: ${keyPatterns.join(', ')}`
        : '';

      return `File: ${fileName} (${extension})\n` +
             `Size: ${lineCount} lines, ~${tokenEstimate} tokens\n` +
             `First line: ${lines[0]?.substring(0, 80) || '(empty)'}` +
             `${lineCount > 1 ? `\nLast line: ${lines[lineCount - 1]?.substring(0, 80) || '(empty)'}` : ''}` +
             patternsText;
    }

    case 'bash': {
      // For bash output, show command and key results
      const command = metadata.command || 'unknown command';

      // Detect error patterns
      const hasError = /error|failed|exception|fatal/i.test(content);
      const hasWarning = /warning|warn/i.test(content);

      // Count success indicators
      const successMatches = content.match(/✓|✅|passed|success|ok/gi) || [];
      const failureMatches = content.match(/✗|❌|failed|failure|error/gi) || [];

      let status = 'completed';
      if (hasError || failureMatches.length > 0) status = 'errors detected';
      else if (hasWarning) status = 'warnings detected';

      return `Command: ${command.substring(0, 100)}\n` +
             `Status: ${status}\n` +
             `Output: ${lineCount} lines, ~${tokenEstimate} tokens\n` +
             (successMatches.length > 0 ? `Successes: ${successMatches.length}\n` : '') +
             (failureMatches.length > 0 ? `Failures: ${failureMatches.length}\n` : '') +
             `First output: ${lines[0]?.substring(0, 80) || '(empty)'}`;
    }

    case 'grep':
    case 'glob': {
      // For search results, show match count and sample
      const matchCount = lineCount;
      const sampleMatches = lines.slice(0, 3).map(l => l.substring(0, 60));

      return `Search results: ${matchCount} matches\n` +
             `Pattern: ${metadata.pattern || 'unknown'}\n` +
             `Sample matches:\n${sampleMatches.map(m => `  - ${m}`).join('\n')}`;
    }

    case 'webfetch': {
      // For web content, show title and key sections
      const url = metadata.url || 'unknown URL';
      const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1] : 'No title';

      return `URL: ${url}\n` +
             `Title: ${title}\n` +
             `Content: ${lineCount} lines, ~${tokenEstimate} tokens`;
    }

    default: {
      // Generic summary
      return `Content: ${lineCount} lines, ${charCount} chars, ~${tokenEstimate} tokens\n` +
             `Preview: ${content.substring(0, 200)}${content.length > 200 ? '...' : ''}`;
    }
  }
}

/**
 * Determine confidence level based on content characteristics
 *
 * HIGH: Summary is sufficient for most decisions
 * MEDIUM: May need to read artifact for some operations
 * LOW: Should read full artifact before acting
 *
 * @param {string} content - The content
 * @param {string} sourceTool - The tool that generated it
 * @param {string} summary - The generated summary
 * @returns {'HIGH' | 'MEDIUM' | 'LOW'}
 */
function determineConfidence(content, sourceTool, _summary) {
  const charCount = content.length;
  const lineCount = content.split('\n').length;

  // Very large content = lower confidence in summary
  if (charCount > 50000 || lineCount > 1000) {
    return 'LOW';
  }

  // Complex code files need full read
  if (['read'].includes(sourceTool.toLowerCase())) {
    const extension = content.includes('export') || content.includes('import') ? 'code' : 'text';
    if (extension === 'code' && lineCount > 200) {
      return 'MEDIUM';
    }
  }

  // Error outputs should be read in full
  if (/error|exception|failed/i.test(content)) {
    return 'MEDIUM';
  }

  // Search results with many matches
  if (['grep', 'glob'].includes(sourceTool.toLowerCase()) && lineCount > 20) {
    return 'MEDIUM';
  }

  return 'HIGH';
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Create an artifact from content
 *
 * @param {string} content - The content to store
 * @param {Object} options - Options
 * @param {string} options.source_tool - Tool that generated the content
 * @param {string} options.summary - Optional custom summary
 * @param {string} options.sd_id - Optional SD ID for context
 * @param {string} options.session_id - Optional session ID
 * @param {string} options.type - Artifact type (default: 'tool_output')
 * @param {number} options.ttl_hours - Hours until expiration (default: 2)
 * @param {Object} options.metadata - Additional metadata
 * @returns {Promise<{artifact_id: string, summary: string, confidence: string, token_count: number, pointer: string}>}
 */
export async function createArtifact(content, options = {}) {
  const {
    source_tool = 'other',
    summary: customSummary = null,
    sd_id = null,
    session_id = null,
    type = 'tool_output',
    ttl_hours = DEFAULT_TTL_HOURS,
    metadata = {}
  } = options;

  const db = getSupabase();

  // Generate summary if not provided
  const summary = customSummary || generateSummary(content, source_tool, metadata);
  const confidence = determineConfidence(content, source_tool, summary);
  const tokenCount = Math.ceil(content.length / 4);

  // Call database function
  const { data, error } = await db.rpc('create_artifact_v2', {
    p_session_id: session_id,
    p_sd_id: sd_id,
    p_type: type,
    p_source_tool: source_tool,
    p_summary: summary.substring(0, MAX_SUMMARY_LENGTH),
    p_content_text: content,
    p_confidence: confidence,
    p_expires_in_hours: ttl_hours,
    p_metadata: metadata
  });

  if (error) {
    console.error('Failed to create artifact:', error);
    throw new Error(`Artifact creation failed: ${error.message}`);
  }

  const result = data[0];

  return {
    artifact_id: result.artifact_id,
    summary: summary.substring(0, MAX_SUMMARY_LENGTH),
    confidence,
    token_count: tokenCount,
    pointer: result.pointer_text
  };
}

/**
 * Read an artifact by ID
 *
 * @param {string} artifactId - The artifact UUID
 * @returns {Promise<{content: string, summary: string, confidence: string, token_count: number, is_expired: boolean}>}
 */
export async function readArtifact(artifactId) {
  const db = getSupabase();

  const { data, error } = await db.rpc('read_artifact_v2', {
    p_artifact_id: artifactId
  });

  if (error) {
    console.error('Failed to read artifact:', error);
    throw new Error(`Artifact read failed: ${error.message}`);
  }

  if (!data || data.length === 0) {
    throw new Error(`Artifact not found: ${artifactId}`);
  }

  const result = data[0];

  return {
    content: result.content,
    summary: result.summary,
    confidence: result.confidence,
    token_count: result.token_count,
    source_tool: result.source_tool,
    expires_at: result.expires_at,
    is_expired: result.is_expired
  };
}

/**
 * Wrap tool output - creates artifact if content exceeds threshold
 *
 * @param {string} sourceTool - The tool that generated the output (Read, Bash, Grep, etc.)
 * @param {string} content - The tool output content
 * @param {Object} metadata - Tool-specific metadata (file_path, command, pattern, etc.)
 * @param {Object} options - Additional options
 * @param {number} options.threshold - Size threshold in bytes (default: 4096)
 * @param {string} options.sd_id - Optional SD ID
 * @param {string} options.session_id - Optional session ID
 * @returns {Promise<{is_artifact: boolean, content?: string, artifact?: Object}>}
 */
export async function wrapToolOutput(sourceTool, content, metadata = {}, options = {}) {
  const {
    threshold = ARTIFACT_THRESHOLD_BYTES,
    sd_id = null,
    session_id = null
  } = options;

  // If content is small enough, return it directly
  if (!content || content.length <= threshold) {
    return {
      is_artifact: false,
      content
    };
  }

  // Content exceeds threshold - create artifact
  const artifact = await createArtifact(content, {
    source_tool: sourceTool,
    sd_id,
    session_id,
    metadata
  });

  return {
    is_artifact: true,
    artifact,
    // Return summary instead of full content
    summary: artifact.summary,
    pointer: artifact.pointer,
    confidence: artifact.confidence,
    token_count: artifact.token_count,
    artifact_id: artifact.artifact_id
  };
}

// ============================================================================
// Task Contract Integration
// ============================================================================

/**
 * Create a task contract for a sub-agent
 *
 * @param {string} targetAgent - The agent type that should execute
 * @param {string} objective - What the sub-agent should accomplish
 * @param {Object} options - Options
 * @param {string} options.parent_agent - The calling agent type
 * @param {string[]} options.input_artifact_ids - Artifact IDs to include as input
 * @param {string} options.input_summary - Summary of inputs
 * @param {Object} options.constraints - Any constraints for the sub-agent
 * @param {string} options.sd_id - Optional SD ID
 * @param {string} options.session_id - Optional session ID
 * @param {number} options.priority - Priority 1-100 (default: 50)
 * @param {number} options.max_tokens - Token budget (default: 4000)
 * @returns {Promise<{contract_id: string, summary: string}>}
 */
export async function createTaskContract(targetAgent, objective, options = {}) {
  const {
    parent_agent = 'MAIN',
    input_artifact_ids = [],
    input_summary = null,
    constraints = {},
    sd_id = null,
    session_id = null,
    priority = 50,
    max_tokens = 4000
  } = options;

  const db = getSupabase();

  const { data, error } = await db.rpc('create_task_contract', {
    p_parent_agent: parent_agent,
    p_target_agent: targetAgent,
    p_objective: objective,
    p_session_id: session_id,
    p_sd_id: sd_id,
    p_input_artifacts: input_artifact_ids,
    p_input_summary: input_summary,
    p_constraints: constraints,
    p_expected_output_type: 'artifact',
    p_priority: priority,
    p_max_tokens: max_tokens
  });

  if (error) {
    console.error('Failed to create task contract:', error);
    throw new Error(`Task contract creation failed: ${error.message}`);
  }

  const result = data[0];

  return {
    contract_id: result.contract_id,
    summary: result.contract_summary
  };
}

/**
 * Claim a pending task contract (for sub-agent use)
 *
 * @param {string} agentType - The agent type claiming work
 * @returns {Promise<Object|null>} The claimed contract or null if none available
 */
export async function claimTaskContract(agentType) {
  const db = getSupabase();

  const { data, error } = await db.rpc('claim_task_contract', {
    p_target_agent: agentType
  });

  if (error) {
    console.error('Failed to claim task contract:', error);
    throw new Error(`Task contract claim failed: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return null;
  }

  return data[0];
}

/**
 * Complete a task contract
 *
 * @param {string} contractId - The contract UUID
 * @param {Object} result - The result
 * @param {string} result.output_artifact_id - Optional artifact ID with results
 * @param {string} result.summary - Summary of what was done
 * @param {number} result.tokens_used - Tokens consumed
 * @param {boolean} result.success - Whether the task succeeded
 * @param {string} result.error_message - Error message if failed
 */
export async function completeTaskContract(contractId, result = {}) {
  const {
    output_artifact_id = null,
    summary = null,
    tokens_used = null,
    success = true,
    error_message = null
  } = result;

  const db = getSupabase();

  const { data, error } = await db.rpc('complete_task_contract', {
    p_contract_id: contractId,
    p_output_artifact_id: output_artifact_id,
    p_result_summary: summary,
    p_execution_tokens: tokens_used,
    p_success: success,
    p_error_message: error_message
  });

  if (error) {
    console.error('Failed to complete task contract:', error);
    throw new Error(`Task contract completion failed: ${error.message}`);
  }

  return data[0];
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Cleanup expired artifacts
 *
 * @returns {Promise<{deleted_count: number, freed_tokens: number}>}
 */
export async function cleanupExpiredArtifacts() {
  const db = getSupabase();

  const { data, error } = await db.rpc('cleanup_expired_artifacts_v2');

  if (error) {
    console.error('Failed to cleanup artifacts:', error);
    throw new Error(`Artifact cleanup failed: ${error.message}`);
  }

  return data[0];
}

/**
 * Get statistics about artifacts
 *
 * @param {string} sessionId - Optional session ID to filter
 * @returns {Promise<Object>}
 */
export async function getArtifactStats(sessionId = null) {
  const db = getSupabase();

  let query = db
    .from('agent_artifacts')
    .select('id, token_count, confidence, source_tool, expires_at', { count: 'exact' });

  if (sessionId) {
    query = query.eq('session_id', sessionId);
  }

  const { data, count, error } = await query;

  if (error) {
    console.error('Failed to get artifact stats:', error);
    throw new Error(`Artifact stats failed: ${error.message}`);
  }

  const now = new Date();
  const stats = {
    total_artifacts: count,
    total_tokens: data.reduce((sum, a) => sum + (a.token_count || 0), 0),
    by_confidence: {
      HIGH: data.filter(a => a.confidence === 'HIGH').length,
      MEDIUM: data.filter(a => a.confidence === 'MEDIUM').length,
      LOW: data.filter(a => a.confidence === 'LOW').length
    },
    by_source_tool: {},
    expired_count: data.filter(a => a.expires_at && new Date(a.expires_at) < now).length
  };

  // Count by source tool
  data.forEach(a => {
    const tool = a.source_tool || 'unknown';
    stats.by_source_tool[tool] = (stats.by_source_tool[tool] || 0) + 1;
  });

  return stats;
}

// ============================================================================
// Exports
// ============================================================================

export default {
  createArtifact,
  readArtifact,
  wrapToolOutput,
  createTaskContract,
  claimTaskContract,
  completeTaskContract,
  cleanupExpiredArtifacts,
  getArtifactStats,

  // Configuration exports for testing
  ARTIFACT_THRESHOLD_BYTES,
  DEFAULT_TTL_HOURS,
  MAX_SUMMARY_LENGTH
};
