/**
 * Generic Sub-Agent Executor Framework
 * LEO Protocol v4.2.0 - Sub-Agent Performance Enhancement
 *
 * Purpose: Standardized execution framework that automatically loads
 * sub-agent instructions from database and ensures they're always read.
 *
 * Created: 2025-10-11 (SD-SUBAGENT-IMPROVE-001)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

/**
 * Load sub-agent instructions from database
 * @param {string} code - Sub-agent code (e.g., 'VALIDATION', 'TESTING', 'DATABASE')
 * @returns {Promise<Object>} Sub-agent data with formatted instructions
 */
export async function loadSubAgentInstructions(code) {
  console.log(`\n📖 Loading sub-agent instructions: ${code}...`);

  const { data: subAgent, error } = await supabase
    .from('leo_sub_agents')
    .select('*')
    .eq('code', code)
    .single();

  if (error) {
    throw new Error(`Failed to load sub-agent ${code} from database: ${error.message}`);
  }

  if (!subAgent) {
    throw new Error(`Sub-agent ${code} not found in database`);
  }

  // Format instructions for Claude to read
  const formatted = formatInstructionsForClaude(subAgent);

  console.log(`✅ Loaded: ${subAgent.name} (v${subAgent.metadata?.version || '1.0.0'})`);

  return {
    ...subAgent,
    formatted
  };
}

/**
 * Format sub-agent instructions for Claude to read
 * @param {Object} subAgent - Sub-agent record from database
 * @returns {string} Formatted instructions
 */
export function formatInstructionsForClaude(subAgent) {
  const metadata = subAgent.metadata || {};
  const capabilities = subAgent.capabilities || [];
  const sources = metadata.sources || [];

  return `
════════════════════════════════════════════════════════════════
${subAgent.name} (${subAgent.code})
Version: ${metadata.version || '1.0.0'}
Priority: ${subAgent.priority || 50}
════════════════════════════════════════════════════════════════

${subAgent.description || 'No description available'}

${capabilities.length > 0 ? `
────────────────────────────────────────────────────────────────
CAPABILITIES
────────────────────────────────────────────────────────────────
${capabilities.map((c, i) => `${i + 1}. ${c}`).join('\n')}
` : ''}

${sources.length > 0 ? `
────────────────────────────────────────────────────────────────
LESSONS SOURCES
────────────────────────────────────────────────────────────────
${sources.map((s, i) => `${i + 1}. ${s}`).join('\n')}
` : ''}

${metadata.success_patterns ? `
────────────────────────────────────────────────────────────────
SUCCESS PATTERNS
────────────────────────────────────────────────────────────────
${metadata.success_patterns.map((p, i) => `${i + 1}. ${p}`).join('\n')}
` : ''}

${metadata.failure_patterns ? `
────────────────────────────────────────────────────────────────
FAILURE PATTERNS TO AVOID
────────────────────────────────────────────────────────────────
${metadata.failure_patterns.map((p, i) => `${i + 1}. ${p}`).join('\n')}
` : ''}

════════════════════════════════════════════════════════════════
END OF INSTRUCTIONS
════════════════════════════════════════════════════════════════
`;
}

/**
 * Execute a sub-agent with standardized lifecycle
 * @param {string} code - Sub-agent code
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} options - Execution options (sub-agent specific)
 * @returns {Promise<Object>} Execution results
 */
export async function executeSubAgent(code, sdId, options = {}) {
  const startTime = Date.now();

  console.log(`\n🚀 Executing sub-agent: ${code} for ${sdId}`);
  console.log(`⚙️  Options:`, options);

  try {
    // Step 1: Load instructions from database
    const subAgent = await loadSubAgentInstructions(code);

    // Step 2: Display instructions for Claude to read
    console.log(subAgent.formatted);

    // Step 3: Execute sub-agent specific logic
    let results;

    // Try to import sub-agent specific module
    try {
      const modulePath = `./sub-agents/${code.toLowerCase()}.js`;
      const subAgentModule = await import(modulePath);

      if (subAgentModule.execute) {
        console.log(`\n🔧 Executing ${code} module logic...`);
        results = await subAgentModule.execute(sdId, subAgent, options);
      } else {
        console.log(`\n⚠️  No execute() function in ${code} module`);
        results = {
          verdict: 'PENDING',
          confidence: 50,
          message: `${code} module loaded but no execute() function found`,
          recommendations: ['Implement execute() function in module']
        };
      }
    } catch (moduleError) {
      console.log(`\n⚠️  No module found for ${code}, using manual mode`);
      console.log(`   Create lib/sub-agents/${code.toLowerCase()}.js to automate this sub-agent`);

      results = {
        verdict: 'MANUAL_REQUIRED',
        confidence: 50,
        message: `${subAgent.name} instructions displayed above. Manual analysis required.`,
        recommendations: [
          'Read the instructions above',
          'Perform analysis according to sub-agent description',
          `Create lib/sub-agents/${code.toLowerCase()}.js for automation`
        ]
      };
    }

    // Step 4: Calculate execution time
    const executionTime = Date.now() - startTime;
    results.execution_time_ms = executionTime;

    // Step 5: Store results in database
    const stored = await storeSubAgentResults(code, sdId, subAgent, results);

    console.log(`\n✅ ${code} execution complete (${executionTime}ms)`);
    console.log(`   Verdict: ${results.verdict}`);
    console.log(`   Confidence: ${results.confidence || 'N/A'}%`);
    console.log(`   Stored: ${stored.id}`);

    return {
      ...results,
      sub_agent: subAgent,
      stored_result_id: stored.id
    };

  } catch (error) {
    console.error(`\n❌ ${code} execution failed:`, error.message);

    // Store error result
    const errorResult = {
      verdict: 'ERROR',
      confidence: 0,
      error: error.message,
      stack: error.stack,
      execution_time_ms: Date.now() - startTime
    };

    try {
      await storeSubAgentResults(code, sdId, null, errorResult);
    } catch (storeError) {
      console.error(`   Failed to store error result:`, storeError.message);
    }

    throw error;
  }
}

/**
 * Store sub-agent execution results in database
 * @param {string} code - Sub-agent code
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} subAgent - Sub-agent record (or null if error before load)
 * @param {Object} results - Execution results
 * @returns {Promise<Object>} Stored result record
 */
export async function storeSubAgentResults(code, sdId, subAgent, results) {
  console.log(`\n💾 Storing ${code} results to database...`);

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

  const record = {
    sd_id: sdId,
    sub_agent_code: code,
    sub_agent_name: subAgent?.name || code,
    verdict: mappedVerdict,
    confidence: results.confidence !== undefined ? results.confidence : 50,
    critical_issues: results.critical_issues || [],
    warnings: results.warnings || [],
    recommendations: results.recommendations || [],
    detailed_analysis: results.detailed_analysis || null,
    execution_time: executionTimeSec,
    metadata: {
      sub_agent_version: subAgent?.metadata?.version || '1.0.0',
      original_verdict: results.verdict,  // Store original before mapping
      options: results.options || {},
      findings: results.findings || [],
      metrics: results.metrics || {},
      error: results.error || null,
      stack: results.stack || null,
      ...results.metadata
    },
    created_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('sub_agent_execution_results')
    .insert(record)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to store sub-agent results: ${error.message}`);
  }

  console.log(`   ✅ Stored with ID: ${data.id}`);

  return data;
}

/**
 * Get sub-agent execution history
 * @param {string} code - Sub-agent code
 * @param {string} sdId - Strategic Directive ID (optional)
 * @param {number} limit - Number of results to return (default: 10)
 * @returns {Promise<Array>} Execution history
 */
export async function getSubAgentHistory(code, sdId = null, limit = 10) {
  let query = supabase
    .from('sub_agent_execution_results')
    .select('*')
    .eq('sub_agent_code', code);

  if (sdId) {
    query = query.eq('sd_id', sdId);
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to get sub-agent history: ${error.message}`);
  }

  return data || [];
}

/**
 * Get all sub-agent results for an SD
 * @param {string} sdId - Strategic Directive ID
 * @returns {Promise<Array>} All sub-agent results for this SD
 */
export async function getAllSubAgentResultsForSD(sdId) {
  const { data, error } = await supabase
    .from('sub_agent_execution_results')
    .select('*')
    .eq('sd_id', sdId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to get sub-agent results for ${sdId}: ${error.message}`);
  }

  // Group by verdict for easy filtering
  const grouped = {
    critical: data.filter(r => r.verdict === 'BLOCKED' || r.verdict === 'FAIL'),
    warnings: data.filter(r => r.verdict === 'CONDITIONAL_PASS' || r.warnings?.length > 0),
    passed: data.filter(r => r.verdict === 'PASS'),
    pending: data.filter(r => r.verdict === 'PENDING' || r.verdict === 'MANUAL_REQUIRED'),
    errors: data.filter(r => r.verdict === 'ERROR')
  };

  return {
    all: data,
    grouped,
    summary: {
      total: data.length,
      critical: grouped.critical.length,
      warnings: grouped.warnings.length,
      passed: grouped.passed.length,
      pending: grouped.pending.length,
      errors: grouped.errors.length
    }
  };
}

/**
 * List all available sub-agents from database
 * @returns {Promise<Array>} All sub-agents
 */
export async function listAllSubAgents() {
  const { data, error } = await supabase
    .from('leo_sub_agents')
    .select('code, name, priority, activation, metadata')
    .order('priority', { ascending: false });

  if (error) {
    throw new Error(`Failed to list sub-agents: ${error.message}`);
  }

  return data || [];
}
