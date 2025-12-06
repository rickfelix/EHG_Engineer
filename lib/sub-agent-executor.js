/**
 * Generic Sub-Agent Executor Framework
 * LEO Protocol v4.3.2 - Sub-Agent Performance Enhancement
 *
 * Purpose: Standardized execution framework that automatically loads
 * sub-agent instructions from database and ensures they're always read.
 *
 * Created: 2025-10-11 (SD-SUBAGENT-IMPROVE-001)
 * Updated: 2025-11-07 - Fixed RLS access using service role key (SD-CREWAI-ARCHITECTURE-001)
 * Updated: 2025-11-26 - Added on-demand loading support for Opus 4.5 optimization
 * Updated: 2025-11-28 - Added pattern injection from issue_patterns table (LEO Protocol v4.3.2)
 */

import { createSupabaseServiceClient } from '../scripts/lib/supabase-connection.js';
import {
  getSubAgentCatalog,
  loadSubAgentDocumentation,
  searchRelevantSubAgents,
  loadMultipleSubAgentDocs
} from './utils/on-demand-loader.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Phase-aware model selection for rate limit optimization
 * HAIKU-FIRST STRATEGY (2025-12-06)
 *
 * Principle: Use cheapest sufficient model, escalate only when needed
 * - Haiku: Deterministic/operational tasks (CI/CD, documentation, patterns)
 * - Sonnet: Mid-level reasoning (design, testing, analysis)
 * - Opus: Security-critical and quality gates (never compromise)
 *
 * Philosophy: "Trust the simple model until proven wrong. Only upgrade based on evidence."
 * Calibration: Weekly review of actual performance to adjust assignments
 */
const PHASE_MODEL_OVERRIDES = {
  LEAD: {
    // TIER 1: Haiku (deterministic/operational tasks)
    GITHUB: 'haiku',      // CI/CD verification, status checks
    DOCMON: 'haiku',      // Pattern-based file structure validation
    RETRO: 'haiku',       // Pattern extraction from execution history
    QUICKFIX: 'haiku',    // Trivial edits (<50 LOC)

    // TIER 2: Sonnet (mid-level reasoning)
    VALIDATION: 'haiku',  // LEAD phase: ideation only, low-risk planning
    DESIGN: 'sonnet',     // Architecture brainstorming requires reasoning
    TESTING: 'sonnet',    // Test strategy planning needs thoughtfulness
    DATABASE: 'sonnet',   // Schema planning needs careful reasoning
    STORIES: 'sonnet',    // User story generation needs context
    API: 'sonnet',        // API design patterns
    RISK: 'sonnet',       // Risk assessment
    DEPENDENCY: 'sonnet', // Dependency analysis
    PERFORMANCE: 'sonnet',// Performance planning
    UAT: 'sonnet',        // UAT planning

    // TIER 3: Opus (security-critical)
    SECURITY: 'opus',     // Threat modeling - NEVER COMPROMISE
  },

  PLAN: {
    // TIER 1: Haiku (deterministic/operational tasks)
    GITHUB: 'haiku',      // Branch setup, basic coordination
    DOCMON: 'haiku',      // Template-based PRD compliance checks

    // TIER 2: Sonnet (mid-level reasoning)
    DESIGN: 'sonnet',     // Component architecture design
    TESTING: 'sonnet',    // E2E test plan generation (needs edge case thinking)
    DATABASE: 'sonnet',   // Schema design (constraints matter)
    STORIES: 'sonnet',    // User story elaboration
    API: 'sonnet',        // API contract design
    RISK: 'sonnet',       // Security risk assessment
    DEPENDENCY: 'sonnet', // CVE assessment
    PERFORMANCE: 'sonnet',// Optimization planning
    RETRO: 'sonnet',      // Retrospective needs context understanding
    UAT: 'sonnet',        // UAT design

    // TIER 3: Opus (critical gates)
    SECURITY: 'opus',     // Security design review - NEVER COMPROMISE
    VALIDATION: 'opus',   // PLAN phase: critical duplicate detection - NEVER COMPROMISE
  },

  EXEC: {
    // TIER 1: Haiku (deterministic/operational tasks)
    GITHUB: 'haiku',      // PR operations, basic coordination
    DOCMON: 'haiku',      // Documentation compliance checks
    QUICKFIX: 'haiku',    // Small edits and patches

    // TIER 2: Sonnet (mid-level reasoning)
    DESIGN: 'sonnet',     // Implementation-phase architecture decisions
    TESTING: 'sonnet',    // E2E test execution and edge case validation
    DATABASE: 'sonnet',   // Migration execution (careful reasoning)
    STORIES: 'sonnet',    // Story-driven implementation details
    API: 'sonnet',        // API implementation validation
    DEPENDENCY: 'sonnet', // Dependency update validation
    PERFORMANCE: 'sonnet',// Performance optimization execution
    RETRO: 'sonnet',      // Retrospective generation (context needed)

    // TIER 3: Opus (critical gates)
    SECURITY: 'opus',     // Security code review - NEVER COMPROMISE
    VALIDATION: 'opus',   // EXEC phase: final QA gate - NEVER COMPROMISE
    UAT: 'sonnet',        // UAT execution (structured testing)
  }
};

/**
 * Default model assignments (used when phase is unknown or for ad-hoc runs)
 * HAIKU-FIRST STRATEGY (2025-12-06)
 *
 * Fallback when phase is not available - uses most conservative assignment
 * (generally Sonnet, with Haiku for low-risk agents, Opus for security)
 */
const DEFAULT_MODEL_ASSIGNMENTS = {
  // TIER 1: Haiku (deterministic/operational)
  GITHUB: 'haiku',      // CI/CD operations, status checks
  DOCMON: 'haiku',      // Pattern-based compliance checks
  RETRO: 'haiku',       // Pattern extraction
  QUICKFIX: 'haiku',    // Small edits

  // TIER 2: Sonnet (mid-level reasoning - default when phase unknown)
  DATABASE: 'sonnet',   // Schema work needs careful reasoning
  STORIES: 'sonnet',    // Context understanding required
  DESIGN: 'sonnet',     // Design judgment needed
  RISK: 'sonnet',       // Risk assessment
  PERFORMANCE: 'sonnet',// Optimization analysis
  TESTING: 'sonnet',    // Edge case detection
  API: 'sonnet',        // API design
  DEPENDENCY: 'sonnet', // Dependency analysis
  UAT: 'sonnet',        // Structured testing
  VALIDATION: 'sonnet', // Default to Sonnet (can escalate to Opus in critical phases)

  // TIER 3: Opus (security-critical)
  SECURITY: 'opus',     // Always Opus for security - NEVER COMPROMISE
};

/**
 * Sub-agent to pattern category mapping
 * LEO Protocol v4.3.2 Enhancement: Enables proactive pattern injection
 */
const SUB_AGENT_CATEGORY_MAPPING = {
  'VALIDATION': ['code_structure', 'protocol', 'testing'],
  'TESTING': ['testing', 'deployment', 'build'],
  'DATABASE': ['database', 'security'],
  'SECURITY': ['security', 'database'],
  'DESIGN': ['ui', 'code_structure'],
  'PERFORMANCE': ['performance', 'database'],
  'GITHUB': ['deployment', 'build', 'ci_cd'],
  'DOCMON': ['documentation', 'protocol'],
  'RETRO': ['protocol', 'process'],
  'UAT': ['testing', 'ui'],
  'DEPENDENCY': ['deployment', 'build'],
  'API': ['api', 'security'],
  'STORIES': ['protocol', 'requirements'],
  'RISK': ['security', 'protocol'],
  'QUICKFIX': ['code_structure', 'testing', 'build']
};

// Initialize Supabase client with SERVICE ROLE KEY
// This is required because automation scripts need to bypass RLS policies
let supabaseClient = null;

/**
 * Get or create Supabase service client
 * @returns {Promise<import('@supabase/supabase-js').SupabaseClient>}
 */
async function getSupabaseClient() {
  if (!supabaseClient) {
    supabaseClient = await createSupabaseServiceClient('engineer', {
      verbose: false
    });
  }
  return supabaseClient;
}

/**
 * Get current phase for an SD from database
 * @param {string} sdId - Strategic Directive ID
 * @returns {Promise<string|null>} Current phase (LEAD, PLAN, EXEC) or null
 */
async function getSDPhase(sdId) {
  if (!sdId) return null;

  try {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .select('current_phase, status')
      .eq('id', sdId)
      .single();

    if (error || !data) {
      console.log(`   ℹ️  Could not determine phase for ${sdId}`);
      return null;
    }

    // Normalize phase from current_phase or status
    const phase = data.current_phase || data.status;

    // Map status values to canonical phases
    const phaseMap = {
      'lead_review': 'LEAD',
      'plan_active': 'PLAN',
      'exec_active': 'EXEC',
      'LEAD': 'LEAD',
      'PLAN': 'PLAN',
      'EXEC': 'EXEC',
    };

    return phaseMap[phase] || null;
  } catch (err) {
    console.log(`   ⚠️  Phase lookup error: ${err.message}`);
    return null;
  }
}

/**
 * Determine optimal model for a sub-agent based on phase context
 * @param {string} code - Sub-agent code (e.g., 'DATABASE', 'TESTING')
 * @param {string|null} phase - Current SD phase (LEAD, PLAN, EXEC) or null
 * @returns {string} Model to use (haiku, sonnet, opus)
 */
function getModelForAgentAndPhase(code, phase) {
  const upperCode = code.toUpperCase();

  // If we have phase context, check for phase-specific override
  if (phase && PHASE_MODEL_OVERRIDES[phase]) {
    const phaseOverride = PHASE_MODEL_OVERRIDES[phase][upperCode];
    if (phaseOverride) {
      console.log(`   🎯 Model routing: ${upperCode} in ${phase} → ${phaseOverride} (phase-specific)`);
      return phaseOverride;
    }
  }

  // Fall back to default assignment
  const defaultModel = DEFAULT_MODEL_ASSIGNMENTS[upperCode] || 'sonnet';
  console.log(`   🎯 Model routing: ${upperCode} → ${defaultModel} (default)`);
  return defaultModel;
}

// Export for external use
export { getSDPhase, getModelForAgentAndPhase, PHASE_MODEL_OVERRIDES, DEFAULT_MODEL_ASSIGNMENTS };

/**
 * Load relevant issue patterns for a sub-agent based on category mapping
 * LEO Protocol v4.3.2 Enhancement: Proactive pattern injection
 * @param {string} code - Sub-agent code
 * @returns {Promise<Array>} Relevant patterns with proven solutions
 */
export async function loadRelevantPatterns(code) {
  const categories = SUB_AGENT_CATEGORY_MAPPING[code] || [];

  if (categories.length === 0) {
    console.log(`   ℹ️  No category mapping for ${code}, skipping pattern injection`);
    return [];
  }

  console.log(`   🔍 Loading patterns for categories: ${categories.join(', ')}`);

  const supabase = await getSupabaseClient();

  try {
    // Query patterns that match any of the mapped categories
    const { data: patterns, error } = await supabase
      .from('issue_patterns')
      .select('pattern_id, category, severity, issue_summary, occurrence_count, proven_solutions, prevention_checklist, trend')
      .eq('status', 'active')
      .in('category', categories)
      .order('occurrence_count', { ascending: false })
      .limit(5);

    if (error) {
      console.warn(`   ⚠️  Failed to load patterns: ${error.message}`);
      return [];
    }

    if (!patterns || patterns.length === 0) {
      console.log(`   ℹ️  No active patterns found for ${code}`);
      return [];
    }

    console.log(`   ✅ Loaded ${patterns.length} relevant patterns`);
    return patterns;

  } catch (err) {
    console.warn(`   ⚠️  Pattern loading error: ${err.message}`);
    return [];
  }
}

/**
 * Load sub-agent instructions from database
 * @param {string} code - Sub-agent code (e.g., 'VALIDATION', 'TESTING', 'DATABASE')
 * @returns {Promise<Object>} Sub-agent data with formatted instructions
 */
export async function loadSubAgentInstructions(code) {
  console.log(`\n📖 Loading sub-agent instructions: ${code}...`);

  const supabase = await getSupabaseClient();

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

  // LEO Protocol v4.3.2 Enhancement: Load relevant patterns
  const relevantPatterns = await loadRelevantPatterns(code);

  // Format instructions for Claude to read (now includes patterns)
  const formatted = formatInstructionsForClaude(subAgent, relevantPatterns);

  console.log(`✅ Loaded: ${subAgent.name} (v${subAgent.metadata?.version || '1.0.0'})`);

  return {
    ...subAgent,
    relevantPatterns,
    formatted
  };
}

/**
 * Format sub-agent instructions for Claude to read
 * LEO Protocol v4.3.2: Now includes relevant patterns and prevention checklists
 * @param {Object} subAgent - Sub-agent record from database
 * @param {Array} relevantPatterns - Relevant issue patterns (optional)
 * @returns {string} Formatted instructions
 */
export function formatInstructionsForClaude(subAgent, relevantPatterns = []) {
  const metadata = subAgent.metadata || {};
  const capabilities = subAgent.capabilities || [];
  const sources = metadata.sources || [];

  // Format pattern section
  let patternSection = '';
  if (relevantPatterns && relevantPatterns.length > 0) {
    patternSection = `
────────────────────────────────────────────────────────────────
🔥 KNOWN ISSUES & PROVEN SOLUTIONS (from issue_patterns)
────────────────────────────────────────────────────────────────
`;
    relevantPatterns.forEach((p, i) => {
      const severityIcon = p.severity === 'critical' ? '🔴' : p.severity === 'high' ? '🟠' : '🟡';
      const topSolution = p.proven_solutions && p.proven_solutions.length > 0
        ? p.proven_solutions[0].solution || p.proven_solutions[0].method || 'See pattern details'
        : 'No proven solution yet';

      patternSection += `
${i + 1}. ${severityIcon} [${p.pattern_id}] ${p.issue_summary}
   Category: ${p.category} | Occurrences: ${p.occurrence_count} | Trend: ${p.trend}
   ✅ Proven Solution: ${topSolution.substring(0, 100)}${topSolution.length > 100 ? '...' : ''}
`;
    });

    // Add aggregated prevention checklist
    const preventionItems = new Set();
    relevantPatterns.forEach(p => {
      if (p.prevention_checklist) {
        p.prevention_checklist.slice(0, 2).forEach(item => preventionItems.add(item));
      }
    });

    if (preventionItems.size > 0) {
      patternSection += `
────────────────────────────────────────────────────────────────
⚠️  PREVENTION CHECKLIST (Apply Before Proceeding)
────────────────────────────────────────────────────────────────
`;
      Array.from(preventionItems).slice(0, 5).forEach((item, i) => {
        patternSection += `[ ] ${i + 1}. ${item}\n`;
      });
    }
  }

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
${patternSection}
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
  console.log('⚙️  Options:', options);

  try {
    // Step 0: Determine optimal model based on phase context
    const sdPhase = await getSDPhase(sdId);
    const recommendedModel = getModelForAgentAndPhase(code, sdPhase);

    // Log the model routing decision
    if (sdPhase) {
      console.log(`   📍 SD Phase: ${sdPhase}`);
    }
    console.log(`   🤖 Recommended model: ${recommendedModel}`);

    // Step 1: Load instructions from database
    const subAgent = await loadSubAgentInstructions(code);

    // Attach routing metadata for downstream use
    subAgent.routing = {
      sdPhase,
      recommendedModel,
      timestamp: new Date().toISOString()
    };

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
      console.error('   Failed to store error result:', storeError.message);
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
    // SD-LEO-PROTOCOL-V4-4-0: Add adaptive validation mode fields
    validation_mode: results.validation_mode || 'prospective',  // Default to prospective for backward compatibility
    justification: results.justification || null,  // Required for CONDITIONAL_PASS (validated at DB level)
    conditions: results.conditions || null,  // Required for CONDITIONAL_PASS (validated at DB level)
    metadata: {
      sub_agent_version: subAgent?.metadata?.version || '1.0.0',
      original_verdict: results.verdict,  // Store original before mapping
      options: results.options || {},
      findings: results.findings || [],
      metrics: results.metrics || {},
      error: results.error || null,
      stack: results.stack || null,
      // Model routing metadata (added 2025-12-03)
      routing: subAgent?.routing || null,
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
  const supabase = await getSupabaseClient();

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
  const supabase = await getSupabaseClient();

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
  const supabase = await getSupabaseClient();

  const { data, error } = await supabase
    .from('leo_sub_agents')
    .select('code, name, priority, activation, metadata')
    .order('priority', { ascending: false });

  if (error) {
    throw new Error(`Failed to list sub-agents: ${error.message}`);
  }

  return data || [];
}

// ============================================================================
// ON-DEMAND LOADING (Opus 4.5 Optimization)
// Re-export on-demand loader functions for easy access
// ============================================================================

/**
 * Get lightweight catalog of available sub-agents
 * Use this instead of listAllSubAgents() for better token efficiency
 */
export { getSubAgentCatalog };

/**
 * Load full documentation for a specific sub-agent ON-DEMAND
 * Call this only when you need the full instructions
 */
export { loadSubAgentDocumentation };

/**
 * Search for relevant sub-agents based on keywords
 * Returns list without loading full documentation
 */
export { searchRelevantSubAgents };

/**
 * Load documentation for multiple sub-agents in batch
 * More efficient than loading one at a time
 */
export { loadMultipleSubAgentDocs };
