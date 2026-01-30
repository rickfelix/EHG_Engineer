#!/usr/bin/env node
/**
 * Task Sub-Agent Recorder Hook
 * Part of SD-LEO-INFRA-SUB-AGENT-TASK-001
 *
 * PostToolUse hook that records Task tool sub-agent invocations to the database.
 * This enables stop-hook enforcement to find evidence of sub-agent execution
 * without requiring manual database inserts.
 *
 * Hook Type: PostToolUse (matcher: Task)
 *
 * Environment Variables:
 *   SUBAGENT_RECORDER_MODE: 'strict' | 'best-effort' (default: 'best-effort')
 *   SUBAGENT_RECORDER_MAX_OUTPUT_BYTES: number (default: 262144 = 256KB)
 *   SUBAGENT_RECORDER_LOG_LEVEL: 'error' | 'warn' | 'info' (default: 'info')
 *
 * Created: 2026-01-30
 */

const crypto = require('crypto');
const path = require('path');

// Environment configuration (TR-3)
const RECORDER_MODE = process.env.SUBAGENT_RECORDER_MODE || 'best-effort';
const MAX_OUTPUT_BYTES = parseInt(process.env.SUBAGENT_RECORDER_MAX_OUTPUT_BYTES || '262144', 10);
const LOG_LEVEL = process.env.SUBAGENT_RECORDER_LOG_LEVEL || 'info';

// Log level hierarchy
const LOG_LEVELS = { error: 0, warn: 1, info: 2 };
const CURRENT_LOG_LEVEL = LOG_LEVELS[LOG_LEVEL] || 2;

/**
 * Structured logging function (FR-6)
 */
function log(level, event, data = {}) {
  if (LOG_LEVELS[level] > CURRENT_LOG_LEVEL) return;

  const logEntry = {
    timestamp: new Date().toISOString(),
    level: level.toUpperCase(),
    event,
    ...data
  };

  const prefix = `[task-subagent-recorder]`;
  console.log(`${prefix} ${JSON.stringify(logEntry)}`);
}

/**
 * Generate deterministic invocation_id using SHA-256 (FR-4)
 * @param {Object} params - Parameters to hash
 * @returns {string} Hexadecimal hash
 */
function generateInvocationId(params) {
  const { tool_name, subagent_type, tool_call_id, tool_input } = params;

  // Canonicalize input for deterministic hashing
  const canonicalInput = {
    tool_name,
    subagent_type,
    tool_call_id: tool_call_id || null,
    // Sort keys for deterministic JSON serialization
    input_hash: crypto
      .createHash('sha256')
      .update(JSON.stringify(tool_input || {}, Object.keys(tool_input || {}).sort()))
      .digest('hex')
  };

  return crypto
    .createHash('sha256')
    .update(JSON.stringify(canonicalInput, Object.keys(canonicalInput).sort()))
    .digest('hex');
}

/**
 * Parse verdict from Task tool output (FR-2)
 * @param {*} output - Task tool output
 * @returns {string} Normalized verdict: 'pass', 'fail', 'warning', or 'unknown'
 */
function parseVerdict(output) {
  if (!output) return 'unknown';

  // Try structured field first
  if (typeof output === 'object') {
    const verdictField = output.verdict || output.Verdict || output.VERDICT;
    if (verdictField) {
      const normalized = String(verdictField).toLowerCase().trim();
      if (['pass', 'fail', 'warning', 'unknown'].includes(normalized)) {
        return normalized;
      }
    }
  }

  // Try to extract from text with markers
  const textOutput = typeof output === 'string' ? output : JSON.stringify(output);

  // Look for "VERDICT: <value>" pattern
  const verdictMatch = textOutput.match(/(?:^|\n)\s*(?:VERDICT|Verdict):\s*(PASS|FAIL|WARNING|UNKNOWN|pass|fail|warning|unknown)/im);
  if (verdictMatch) {
    return verdictMatch[1].toLowerCase();
  }

  // Look for common sub-agent output patterns
  if (/✅\s*(PASS|passed|approved)/i.test(textOutput)) return 'pass';
  if (/❌\s*(FAIL|failed|rejected)/i.test(textOutput)) return 'fail';
  if (/⚠️?\s*(WARN|warning)/i.test(textOutput)) return 'warning';

  return 'unknown';
}

/**
 * Parse summary from Task tool output (FR-2)
 * @param {*} output - Task tool output
 * @returns {string} Summary string (max 500 chars)
 */
function parseSummary(output) {
  if (!output) return '';

  // Try structured field first
  if (typeof output === 'object') {
    const summaryField = output.summary || output.Summary || output.SUMMARY;
    if (summaryField) {
      return String(summaryField).substring(0, 500).trim();
    }

    // Try description or message fields
    const descField = output.description || output.message || output.result;
    if (descField) {
      return String(descField).substring(0, 500).trim();
    }
  }

  // Extract from text - look for Summary line or use first 500 chars
  const textOutput = typeof output === 'string' ? output : JSON.stringify(output);

  const summaryMatch = textOutput.match(/(?:^|\n)\s*(?:Summary|SUMMARY):\s*(.+?)(?:\n|$)/im);
  if (summaryMatch) {
    return summaryMatch[1].substring(0, 500).trim();
  }

  // Use first 500 chars of output, normalizing whitespace
  return textOutput.replace(/\s+/g, ' ').substring(0, 500).trim();
}

/**
 * Prepare raw_output for storage (FR-3)
 * @param {*} output - Task tool output
 * @returns {Object} JSONB-compatible object
 */
function prepareRawOutput(output) {
  if (!output) return { data: null, truncated: false };

  let serialized;
  try {
    serialized = typeof output === 'string' ? output : JSON.stringify(output);
  } catch (e) {
    serialized = String(output);
  }

  const originalBytes = Buffer.byteLength(serialized, 'utf8');

  if (originalBytes <= MAX_OUTPUT_BYTES) {
    return {
      data: output,
      truncated: false,
      original_bytes: originalBytes
    };
  }

  // Truncate to max bytes
  const truncated = serialized.substring(0, MAX_OUTPUT_BYTES);
  return {
    data: truncated,
    truncated: true,
    original_bytes: originalBytes
  };
}

/**
 * Get active SD from session state
 * @returns {string|null} SD ID if found
 */
function getActiveSD() {
  const fs = require('fs');
  const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || 'C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer';
  const SESSION_STATE_FILE = path.join(PROJECT_DIR, '.claude', 'unified-session-state.json');

  try {
    if (fs.existsSync(SESSION_STATE_FILE)) {
      const content = fs.readFileSync(SESSION_STATE_FILE, 'utf8');
      const cleanContent = content.replace(/^\uFEFF/, '');
      const state = JSON.parse(cleanContent);
      return state.sd?.id || null;
    }
  } catch (_e) {
    // Ignore errors
  }
  return null;
}

/**
 * Insert record into sub_agent_execution_results (FR-3, FR-4, FR-5)
 * @param {Object} record - Record to insert
 * @returns {Promise<{success: boolean, deduped?: boolean, error?: string}>}
 */
async function insertRecord(record) {
  // Load environment variables
  require('dotenv').config({ path: path.join(__dirname, '../..', '.env') });

  const { createClient } = require('@supabase/supabase-js');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  // Check if record already exists (idempotency check)
  const { data: existing } = await supabase
    .from('sub_agent_execution_results')
    .select('id, verdict, summary')
    .eq('invocation_id', record.invocation_id)
    .maybeSingle();

  if (existing) {
    // FR-4: If already exists, only update if verdict/summary were empty
    if (!existing.verdict || existing.verdict === 'unknown') {
      await supabase
        .from('sub_agent_execution_results')
        .update({
          verdict: record.verdict,
          summary: record.summary,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);
      return { success: true, deduped: true, updated: true };
    }
    return { success: true, deduped: true };
  }

  // Insert new record
  const { error } = await supabase
    .from('sub_agent_execution_results')
    .insert(record);

  if (error) {
    // Check for unique constraint violation (another way to detect duplicate)
    if (error.code === '23505') {
      return { success: true, deduped: true };
    }
    throw error;
  }

  return { success: true, deduped: false };
}

/**
 * Process hook input and record Task sub-agent invocation
 * @param {Object} hookInput - PostToolUse hook input
 */
async function processHookInput(hookInput) {
  const toolName = hookInput.tool_name || '';
  const toolInput = hookInput.tool_input || {};
  const toolResult = hookInput.tool_result || hookInput.result || null;
  const toolCallId = hookInput.tool_call_id || hookInput.call_id || null;

  // FR-1: Only process Task tool invocations
  if (toolName !== 'Task') {
    return;
  }

  // FR-1: Only process when subagent_type is present and non-empty
  const subagentType = toolInput.subagent_type || toolInput.subagent || '';
  if (!subagentType || typeof subagentType !== 'string' || !subagentType.trim()) {
    return;
  }

  const normalizedSubagentType = subagentType.trim().toUpperCase();

  // Generate deterministic invocation_id (FR-4)
  const invocationId = generateInvocationId({
    tool_name: toolName,
    subagent_type: normalizedSubagentType,
    tool_call_id: toolCallId,
    tool_input: toolInput
  });

  // Parse verdict and summary (FR-2)
  let verdict = parseVerdict(toolResult);
  let summary = parseSummary(toolResult);

  // Log if parsing used fallback
  if (verdict === 'unknown') {
    log('warn', 'task_subagent_parse_fallback', {
      subagent_type: normalizedSubagentType,
      invocation_id: invocationId,
      reason: 'verdict_not_found'
    });
  }

  // Prepare raw_output (FR-3)
  const rawOutput = prepareRawOutput(toolResult);

  // Get active SD if available
  const sdId = getActiveSD();

  // Build record
  const record = {
    sd_id: sdId,
    sub_agent_code: normalizedSubagentType,
    sub_agent_name: normalizedSubagentType,
    verdict: verdict,
    confidence: verdict === 'pass' ? 100 : verdict === 'fail' ? 0 : 50,
    summary: summary,
    raw_output: rawOutput,
    invocation_id: invocationId,
    source: 'task_hook',
    metadata: {
      tool_call_id: toolCallId,
      recorded_by: 'task-subagent-recorder.cjs',
      recorded_at: new Date().toISOString()
    }
  };

  try {
    const result = await insertRecord(record);

    // FR-6: Log success
    log('info', 'task_subagent_recorded', {
      subagent_type: normalizedSubagentType,
      verdict: verdict,
      invocation_id: invocationId,
      db_write: result.deduped ? 'deduped' : 'inserted',
      sd_id: sdId
    });

  } catch (error) {
    // FR-6: Log error
    log('error', 'task_subagent_db_error', {
      subagent_type: normalizedSubagentType,
      invocation_id: invocationId,
      error: error.message ? error.message.replace(/password[^&\s]*/gi, '****') : 'Unknown error',
      mode: RECORDER_MODE
    });

    // TR-3: In strict mode, fail the hook
    if (RECORDER_MODE === 'strict') {
      process.exit(1);
    }
    // In best-effort mode, continue (non-blocking)
  }
}

/**
 * Main hook execution - reads from stdin
 */
function main() {
  let input = '';

  process.stdin.setEncoding('utf8');

  process.stdin.on('data', chunk => {
    input += chunk;
  });

  process.stdin.on('end', async () => {
    try {
      if (input.trim()) {
        const hookInput = JSON.parse(input);
        await processHookInput(hookInput);
      }
    } catch (e) {
      // Log error but don't break workflow in best-effort mode
      log('error', 'task_subagent_hook_error', {
        error: e.message,
        mode: RECORDER_MODE
      });

      if (RECORDER_MODE === 'strict') {
        process.exit(1);
      }
    }
    process.exit(0);
  });

  // Handle case where stdin is closed immediately
  process.stdin.on('error', () => {
    process.exit(0);
  });

  // Timeout after 5 seconds (longer than protocol-file-tracker to allow DB operations)
  setTimeout(async () => {
    if (input.trim()) {
      try {
        const hookInput = JSON.parse(input);
        await processHookInput(hookInput);
      } catch (_e) {
        // Silently fail in timeout
      }
    }
    process.exit(0);
  }, 5000);
}

main();
