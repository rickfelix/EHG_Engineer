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
import {
  createTaskContract,
  claimTaskContract,
  completeTaskContract,
  createArtifact,
  readArtifact
} from './artifact-tools.js';
import { validateSubAgentOutput, HallucinationLevel } from './validation/hallucination-check.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// LEO v4.4 PATCH-005: Validation configuration
const VALIDATION_SCORE_THRESHOLD = parseInt(process.env.LEO_VALIDATION_SCORE_THRESHOLD || '60', 10);
const _VALIDATION_MAX_RETRIES = parseInt(process.env.LEO_VALIDATION_MAX_RETRIES || '2', 10);
const ENABLE_FULL_VALIDATION = process.env.LEO_FULL_VALIDATION !== 'false';
import dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// Task Contract Configuration (Agentic Context Engineering v3.0)
// ============================================================================

/**
 * Whether to use contract-based handoffs for sub-agents
 * When enabled, sub-agents receive a task contract ID instead of full context
 * This reduces context overhead by 50-70%
 */
const USE_TASK_CONTRACTS = process.env.LEO_USE_TASK_CONTRACTS !== 'false';

/**
 * Threshold for storing instructions as artifacts (bytes)
 * Instructions larger than this are stored as artifacts with pointers
 */
const INSTRUCTION_ARTIFACT_THRESHOLD = 2048; // 2KB

/**
 * Phase model configuration loader
 * Loads from config/phase-model-config.json with fallback for backwards compatibility
 */
let _phaseModelConfigCache = null;

function loadPhaseModelConfig() {
  if (_phaseModelConfigCache) return _phaseModelConfigCache;
  try {
    const configPath = join(__dirname, '..', 'config', 'phase-model-config.json');
    const configData = JSON.parse(readFileSync(configPath, 'utf-8'));

    // Convert JSON format to simple model strings (backwards compatibility)
    const convertPhase = (phaseConfig) => {
      const result = {};
      for (const [key, value] of Object.entries(phaseConfig)) {
        if (key.startsWith('_')) continue; // Skip metadata keys
        result[key] = value.model;
      }
      return result;
    };

    const convertDefaults = (defaults) => {
      const result = {};
      for (const [key, value] of Object.entries(defaults)) {
        if (key.startsWith('_')) continue;
        result[key] = value.model;
      }
      return result;
    };

    _phaseModelConfigCache = {
      phaseModelOverrides: {
        LEAD: convertPhase(configData.phaseModelOverrides.LEAD),
        PLAN: convertPhase(configData.phaseModelOverrides.PLAN),
        EXEC: convertPhase(configData.phaseModelOverrides.EXEC)
      },
      defaultModelAssignments: convertDefaults(configData.defaultModelAssignments),
      subAgentCategoryMapping: configData.subAgentCategoryMapping
    };
    return _phaseModelConfigCache;
  } catch (error) {
    console.error('[PHASE_MODEL_CONFIG] Failed to load config, using fallback:', error.message);
    // Minimal fallback for core functionality
    return {
      phaseModelOverrides: { LEAD: {}, PLAN: {}, EXEC: {} },
      defaultModelAssignments: { SECURITY: 'opus' },
      subAgentCategoryMapping: {}
    };
  }
}

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
 *
 * NOTE: Configuration loaded from config/phase-model-config.json
 */
const PHASE_MODEL_OVERRIDES = new Proxy({}, {
  get: (_target, prop) => loadPhaseModelConfig().phaseModelOverrides[prop],
  ownKeys: () => Object.keys(loadPhaseModelConfig().phaseModelOverrides),
  getOwnPropertyDescriptor: (_target, prop) => {
    const config = loadPhaseModelConfig().phaseModelOverrides;
    if (prop in config) {
      return { enumerable: true, configurable: true, value: config[prop] };
    }
    return undefined;
  },
  has: (_target, prop) => prop in loadPhaseModelConfig().phaseModelOverrides
});

// Original inline config commented out - now loaded from config/phase-model-config.json
/* const PHASE_MODEL_OVERRIDES = {
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
    API: 'sonnet',        // API contract design
    RISK: 'sonnet',       // Security risk assessment
    DEPENDENCY: 'sonnet', // CVE assessment
    PERFORMANCE: 'sonnet',// Optimization planning
    RETRO: 'sonnet',      // Retrospective needs context understanding
    UAT: 'sonnet',        // UAT design

    // TIER 3: Opus (critical gates)
    SECURITY: 'opus',     // Security design review - NEVER COMPROMISE
    VALIDATION: 'opus',   // PLAN phase: critical duplicate detection - NEVER COMPROMISE
    STORIES: 'opus',      // User story elaboration - upgraded 2025-12-08 (3.4% pass rate with Sonnet)
  },

  EXEC: {
    // TIER 1: Haiku (deterministic/operational tasks)
    GITHUB: 'haiku',      // PR operations, basic coordination
    QUICKFIX: 'haiku',    // Small edits and patches

    // TIER 2: Sonnet (mid-level reasoning)
    DESIGN: 'sonnet',     // Implementation-phase architecture decisions
    DATABASE: 'sonnet',   // Migration execution (careful reasoning)
    STORIES: 'sonnet',    // Story-driven implementation details
    API: 'sonnet',        // API implementation validation
    DEPENDENCY: 'sonnet', // Dependency update validation
    PERFORMANCE: 'sonnet',// Performance optimization execution
    RETRO: 'sonnet',      // Retrospective generation (context needed)
    DOCMON: 'sonnet',     // Documentation compliance - upgraded 2025-12-08 (13% pass rate with Haiku)

    // TIER 3: Opus (critical gates)
    SECURITY: 'opus',     // Security code review - NEVER COMPROMISE
    VALIDATION: 'opus',   // EXEC phase: final QA gate - NEVER COMPROMISE
    TESTING: 'opus',      // E2E test execution - upgraded 2025-12-08 (11% pass rate with Sonnet)
    UAT: 'sonnet',        // UAT execution (structured testing)
  }
}; */

/**
 * Default model assignments (used when phase is unknown or for ad-hoc runs)
 * NOTE: Configuration loaded from config/phase-model-config.json
 */
const DEFAULT_MODEL_ASSIGNMENTS = new Proxy({}, {
  get: (_target, prop) => loadPhaseModelConfig().defaultModelAssignments[prop],
  ownKeys: () => Object.keys(loadPhaseModelConfig().defaultModelAssignments),
  getOwnPropertyDescriptor: (_target, prop) => {
    const config = loadPhaseModelConfig().defaultModelAssignments;
    if (prop in config) {
      return { enumerable: true, configurable: true, value: config[prop] };
    }
    return undefined;
  },
  has: (_target, prop) => prop in loadPhaseModelConfig().defaultModelAssignments
});

/**
 * Sub-agent to pattern category mapping
 * LEO Protocol v4.3.2 Enhancement: Enables proactive pattern injection
 * NOTE: Configuration loaded from config/phase-model-config.json
 */
const SUB_AGENT_CATEGORY_MAPPING = new Proxy({}, {
  get: (_target, prop) => loadPhaseModelConfig().subAgentCategoryMapping[prop],
  ownKeys: () => Object.keys(loadPhaseModelConfig().subAgentCategoryMapping),
  getOwnPropertyDescriptor: (_target, prop) => {
    const config = loadPhaseModelConfig().subAgentCategoryMapping;
    if (prop in config) {
      return { enumerable: true, configurable: true, value: config[prop] };
    }
    return undefined;
  },
  has: (_target, prop) => prop in loadPhaseModelConfig().subAgentCategoryMapping
});

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
 * Resolve SD key (e.g., "SD-VISION-V2-013") to UUID
 * Returns the UUID if sdId is already a UUID, otherwise looks up by sd_key
 * @param {string} sdId - SD key or UUID
 * @returns {Promise<{uuid: string, sd_key: string}|null>} Resolved SD info or null
 */
async function resolveSdKeyToUUID(sdId) {
  if (!sdId) return null;

  // Check if it's already a UUID (simple regex check)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isUUID = uuidRegex.test(sdId);

  try {
    const supabase = await getSupabaseClient();
    let data = null;
    let _error = null;

    if (isUUID) {
      // Query by uuid_id for UUID inputs
      const result = await supabase
        .from('strategic_directives_v2')
        .select('id, sd_key, current_phase, status, uuid_id')
        .eq('uuid_id', sdId)
        .single();
      data = result.data;
      // error assigned for logging/debugging if needed
      _error = result.error;
    } else {
      // SD-RETRO-FIX-001: For non-UUID inputs, try multiple columns in order:
      // 1. First try `id` column (stores legacy IDs like 'SD-E2E-FOUNDATION-001')
      // 2. Then try `sd_key` column
      // 3. Finally try `legacy_id` column
      const queries = [
        { column: 'id', value: sdId },
        { column: 'sd_key', value: sdId },
        { column: 'legacy_id', value: sdId }
      ];

      for (const q of queries) {
        const result = await supabase
          .from('strategic_directives_v2')
          .select('id, sd_key, current_phase, status, uuid_id')
          .eq(q.column, sdId)
          .maybeSingle();

        if (result.data) {
          data = result.data;
          break;
        }
      }
    }

    if (!data) {
      return null;
    }

    // SD-RETRO-FIX-001: The `id` column is the primary key used by foreign keys
    // (it's a text value like 'SD-E2E-FOUNDATION-001', not a UUID)
    // uuid_id is a separate column that's not used for FK constraints
    return {
      uuid: data.id,           // Use `id` column for FK operations
      sd_key: data.sd_key || data.id,
      current_phase: data.current_phase,
      status: data.status
    };
  } catch (err) {
    console.error(`   ⚠️  Error resolving SD key ${sdId}:`, err.message);
    return null;
  }
}

/**
 * Get current phase for an SD from database
 * @param {string} sdId - Strategic Directive ID (key or UUID)
 * @returns {Promise<string|null>} Current phase (LEAD, PLAN, EXEC) or null
 */
async function getSDPhase(sdId) {
  if (!sdId) return null;

  try {
    // Use the resolution function to handle both UUID and sd_key
    const resolved = await resolveSdKeyToUUID(sdId);

    if (!resolved) {
      console.log(`   ℹ️  Could not determine phase for ${sdId}`);
      return null;
    }

    // Normalize phase from current_phase or status
    const phase = resolved.current_phase || resolved.status;

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
 * Enhanced with Task Contract support (Agentic Context Engineering v3.0)
 *
 * @param {string} code - Sub-agent code
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} options - Execution options (sub-agent specific)
 * @param {boolean} options.useContract - Override USE_TASK_CONTRACTS setting
 * @param {string} options.objective - Custom objective (overrides default)
 * @param {Object} options.constraints - Additional constraints for task contract
 * @param {string} options.sessionId - Session ID for artifact isolation
 * @returns {Promise<Object>} Execution results
 */
export async function executeSubAgent(code, sdId, options = {}) {
  const startTime = Date.now();
  const useContract = options.useContract ?? USE_TASK_CONTRACTS;

  console.log(`\n🚀 Executing sub-agent: ${code} for ${sdId}`);
  console.log('⚙️  Options:', { ...options, useContract });

  let taskContract = null;
  let inputArtifacts = [];

  try {
    // Step 0a: Resolve SD key to UUID for foreign key operations
    const resolved = await resolveSdKeyToUUID(sdId);
    const sdUUID = resolved?.uuid || null;
    const sdKey = resolved?.sd_key || sdId;

    if (!resolved) {
      console.log(`   ⚠️  Warning: Could not resolve SD ${sdId} - database operations may fail`);
    } else {
      console.log(`   🔗 Resolved: ${sdKey} → ${sdUUID}`);
    }

    // Step 0b: Determine optimal model based on phase context
    const sdPhase = resolved?.current_phase || resolved?.status || null;
    const normalizedPhase = sdPhase ? ({
      'lead_review': 'LEAD',
      'plan_active': 'PLAN',
      'exec_active': 'EXEC',
      'LEAD': 'LEAD',
      'PLAN': 'PLAN',
      'EXEC': 'EXEC'
    }[sdPhase] || null) : null;
    const recommendedModel = getModelForAgentAndPhase(code, normalizedPhase);

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

    // Step 2: Create Task Contract (if enabled)
    // This is the key enhancement from Agentic Context Engineering v3.0
    if (useContract) {
      console.log(`\n📜 Creating task contract for ${code}...`);

      // Store large instructions as artifact if they exceed threshold
      if (subAgent.formatted && subAgent.formatted.length > INSTRUCTION_ARTIFACT_THRESHOLD) {
        try {
          const instructionArtifact = await createArtifact(subAgent.formatted, {
            source_tool: 'sub-agent-executor',
            sd_id: sdUUID, // Use UUID for foreign key
            session_id: options.sessionId,
            type: 'sub_agent_instructions',
            metadata: {
              sub_agent_code: code,
              sub_agent_name: subAgent.name,
              sd_key: sdKey, // Store original key in metadata
              has_patterns: (subAgent.relevantPatterns?.length || 0) > 0
            }
          });
          inputArtifacts.push(instructionArtifact.artifact_id);
          console.log(`   📦 Stored instructions as artifact: ${instructionArtifact.artifact_id} (${instructionArtifact.token_count} tokens)`);
        } catch (artifactError) {
          console.log(`   ⚠️  Failed to store instructions as artifact: ${artifactError.message}`);
          // Continue without artifact - will pass instructions inline
        }
      }

      // Build objective from sub-agent description or custom override
      const objective = options.objective || `Execute ${subAgent.name} analysis for SD ${sdKey}. ${subAgent.description || ''}`;

      // Build constraints from sub-agent capabilities and options
      const constraints = {
        max_execution_time_ms: 300000, // 5 minutes default
        recommended_model: recommendedModel,
        sd_phase: normalizedPhase,
        capabilities: subAgent.capabilities || [],
        ...(options.constraints || {})
      };

      // Create the task contract
      try {
        taskContract = await createTaskContract(code, objective, {
          parent_agent: 'LEO_EXECUTOR',
          sd_id: sdUUID, // Use UUID for foreign key
          session_id: options.sessionId,
          input_artifact_ids: inputArtifacts,
          input_summary: `Sub-agent ${code} for ${sdKey} | Phase: ${normalizedPhase || 'unknown'} | Model: ${recommendedModel}`,
          constraints,
          priority: subAgent.priority || 50,
          max_tokens: 4000
        });

        console.log(`   ✅ Task contract created: ${taskContract.contract_id}`);
        console.log(`   📝 ${taskContract.summary}`);

        // Attach contract info to subAgent for module access
        subAgent.taskContract = taskContract;
      } catch (contractError) {
        console.log(`   ⚠️  Failed to create task contract: ${contractError.message}`);
        console.log('   📋 Falling back to inline context mode');
        // Continue without contract - will use traditional inline context
      }
    }

    // Step 3: Display instructions for Claude to read
    // If contract was created, show compact summary; otherwise show full instructions
    if (taskContract) {
      console.log('\n────────────────────────────────────────────────────────────────');
      console.log(`📜 TASK CONTRACT: ${taskContract.contract_id}`);
      console.log('────────────────────────────────────────────────────────────────');
      console.log(`Target: ${code} | SD: ${sdKey} | Phase: ${normalizedPhase || 'unknown'}`);
      console.log(`Model: ${recommendedModel} | Priority: ${subAgent.priority || 50}`);
      if (inputArtifacts.length > 0) {
        console.log(`📦 Input Artifacts: ${inputArtifacts.length} (${inputArtifacts.join(', ')})`);
        console.log('   Use readArtifact(id) to load full content when needed');
      }
      console.log('────────────────────────────────────────────────────────────────');
    } else {
      // Traditional mode: display full instructions
      console.log(subAgent.formatted);
    }

    // Step 4: Execute sub-agent specific logic
    let results;

    // Try to import sub-agent specific module
    try {
      const modulePath = `./sub-agents/${code.toLowerCase()}.js`;
      const subAgentModule = await import(modulePath);

      if (subAgentModule.execute) {
        console.log(`\n🔧 Executing ${code} module logic...`);
        // Pass contract info in options if available
        // Also pass sdKey for display purposes
        const execOptions = taskContract
          ? { ...options, taskContract, inputArtifacts, sdKey, sdUUID }
          : { ...options, sdKey, sdUUID };
        // Pass sdUUID for database operations (foreign keys expect UUID)
        results = await subAgentModule.execute(sdUUID || sdId, subAgent, execOptions);
      } else {
        console.log(`\n⚠️  No execute() function in ${code} module`);
        results = {
          verdict: 'PENDING',
          confidence: 50,
          message: `${code} module loaded but no execute() function found`,
          recommendations: ['Implement execute() function in module']
        };
      }
    } catch {
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

    // Step 5: Calculate execution time
    const executionTime = Date.now() - startTime;
    results.execution_time_ms = executionTime;

    // Step 5.5: LEO v4.4 PATCH-005 - Full Hallucination Detection
    // Validates files (L1), symbols (L2), syntax (L3), and tables (DB)
    const validationStartTime = Date.now();
    try {
      // Determine validation levels based on configuration
      const validationLevels = ENABLE_FULL_VALIDATION
        ? [HallucinationLevel.L1, HallucinationLevel.L2, HallucinationLevel.L3, HallucinationLevel.DB]
        : [HallucinationLevel.L1, HallucinationLevel.L2];

      console.log('\n🔍 Running hallucination detection (' + validationLevels.join(', ') + ')...');

      const hallucinationCheck = await validateSubAgentOutput(results, {
        baseDir: process.cwd(),
        levels: validationLevels,
        autoLoadTables: true // LEO v4.4: Auto-load tables from database
      });

      results.hallucination_check = hallucinationCheck;
      const validationDuration = Date.now() - validationStartTime;

      if (hallucinationCheck.passed) {
        console.log(`   ✅ Hallucination check: PASS (Score: ${hallucinationCheck.score}/100)`);
      } else {
        console.log(`   ⚠️  Hallucination check: ISSUES DETECTED (Score: ${hallucinationCheck.score}/100)`);
        if (hallucinationCheck.file_references.invalid.length > 0) {
          console.log(`   📁 Invalid files: ${hallucinationCheck.file_references.invalid.map(f => f.path).join(', ')}`);
        }
        if (hallucinationCheck.table_references.unknown && hallucinationCheck.table_references.unknown.length > 0) {
          console.log(`   🗄️  Unknown tables: ${hallucinationCheck.table_references.unknown.join(', ')}`);
        }
        if (hallucinationCheck.code_snippets && hallucinationCheck.code_snippets.invalid.length > 0) {
          console.log(`   📝 Syntax errors: ${hallucinationCheck.code_snippets.invalid.length} code snippet(s)`);
        }
        if (hallucinationCheck.issues.length > 0) {
          hallucinationCheck.issues.slice(0, 3).forEach(issue => {
            console.log(`      - ${issue.message}`);
          });
        }
      }

      // Store validation results (LEO v4.4 PATCH-005)
      await storeValidationResults({
        sd_id: sdKey,
        sub_agent_code: code,
        validation_passed: hallucinationCheck.score >= VALIDATION_SCORE_THRESHOLD,
        validation_score: hallucinationCheck.score,
        levels_checked: validationLevels,
        file_references: hallucinationCheck.file_references,
        symbol_references: hallucinationCheck.symbol_references,
        table_references: hallucinationCheck.table_references,
        code_snippets: hallucinationCheck.code_snippets || {},
        issues: hallucinationCheck.issues,
        warnings: hallucinationCheck.warnings,
        validation_duration_ms: validationDuration,
        tables_loaded_count: hallucinationCheck.table_references?.tables_loaded || 0
      });

    } catch (hallucinationError) {
      console.log(`   ⚠️  Hallucination check failed: ${hallucinationError.message}`);
      results.hallucination_check = {
        performed: false,
        error: hallucinationError.message
      };
    }

    // Step 6: Complete task contract (if created)
    if (taskContract) {
      try {
        const contractResult = await completeTaskContract(taskContract.contract_id, {
          success: results.verdict === 'PASS' || results.verdict === 'CONDITIONAL_PASS',
          summary: `${results.verdict}: ${results.message || 'Execution complete'}`,
          tokens_used: Math.ceil(executionTime / 10) // Rough estimate
        });
        console.log(`   📜 Contract completed: ${contractResult?.message || 'done'}`);
      } catch (completeError) {
        console.log(`   ⚠️  Failed to complete contract: ${completeError.message}`);
      }
    }

    // Step 7: Store results in database
    // Pass sdUUID for foreign key, sdKey for display/metadata
    const stored = await storeSubAgentResults(code, sdUUID, subAgent, results, { sdKey });

    console.log(`\n✅ ${code} execution complete (${executionTime}ms)`);
    console.log(`   Verdict: ${results.verdict}`);
    console.log(`   Confidence: ${results.confidence || 'N/A'}%`);
    console.log(`   Stored: ${stored.id}`);
    if (taskContract) {
      console.log(`   Contract: ${taskContract.contract_id}`);
    }

    return {
      ...results,
      sub_agent: subAgent,
      stored_result_id: stored.id,
      task_contract_id: taskContract?.contract_id || null
    };

  } catch (error) {
    console.error(`\n❌ ${code} execution failed:`, error.message);

    // Complete task contract with failure (if created)
    if (taskContract) {
      try {
        await completeTaskContract(taskContract.contract_id, {
          success: false,
          error_message: error.message
        });
      } catch (completeError) {
        console.error('   Failed to complete contract with error:', completeError.message);
      }
    }

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
export async function storeSubAgentResults(code, sdId, subAgent, results, options = {}) {
  console.log(`\n💾 Storing ${code} results to database...`);
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
  const RESULT_COMPRESSION_THRESHOLD = 8192; // 8KB
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

        console.log(`   📦 Compressed detailed_analysis to artifact (${artifact.token_count} tokens)`);

        // Replace with artifact reference
        detailedAnalysis = {
          _compressed: true,
          artifact_id: artifact.artifact_id,
          summary: artifact.summary,
          token_count: artifact.token_count
        };
        metadata.detailed_analysis_artifact_id = artifact.artifact_id;
      } catch (compressError) {
        console.warn(`   ⚠️  Failed to compress detailed_analysis: ${compressError.message}`);
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
      console.warn(`   ⚠️  Timeout storing results (non-fatal): ${error.message}`);
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

  console.log(`   ✅ Stored with ID: ${data.id}`);

  // ============================================================================
  // PAT-SUBAGENT-PRD-LINK-001: Auto-link sub-agent results to PRD metadata
  // Ensures PLAN-TO-EXEC handoff can verify sub-agent execution via PRD
  // ============================================================================
  const PRD_LINKABLE_SUBAGENTS = ['DESIGN', 'DATABASE', 'SECURITY', 'STORIES', 'RISK'];

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
          console.log(`   🔗 Linked ${code} results to PRD metadata.${metadataField} (with full analysis)`);
        } else {
          console.warn(`   ⚠️  Failed to link to PRD: ${updateErr.message}`);
        }
      } else if (prdErr?.code !== 'PGRST116') {
        // PGRST116 = not found, which is expected if PRD doesn't exist yet
        console.log(`   ℹ️  No PRD found for ${sdId} - skipping metadata link`);
      }
    } catch (linkError) {
      // Non-fatal - sub-agent results are stored, linking is enhancement
      console.warn(`   ⚠️  PRD metadata link failed: ${linkError.message}`);
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
async function storeValidationResults(validationData) {
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
      console.warn(`   ⚠️  Failed to store validation results: ${error.message}`);
      return null;
    }

    console.log(`   📋 Validation stored (ID: ${data.id.slice(0, 8)}...)`);
    return data;
  } catch (err) {
    // Non-fatal: Log but don't throw
    console.warn(`   ⚠️  Validation storage error: ${err.message}`);
    return null;
  }
}

/**
 * Get validation history for a sub-agent
 * @param {string} code - Sub-agent code
 * @param {string} sdId - Strategic Directive ID (optional)
 * @param {number} limit - Number of results to return (default: 10)
 * @returns {Promise<Array>} Validation history
 */
export async function getValidationHistory(code, sdId = null, limit = 10) {
  const supabase = await getSupabaseClient();

  let query = supabase
    .from('subagent_validation_results')
    .select('*')
    .eq('sub_agent_code', code);

  if (sdId) {
    query = query.eq('sd_id', sdId);
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn(`Failed to get validation history: ${error.message}`);
    return [];
  }

  return data || [];
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
    .select('code, name, priority, metadata')
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

// ============================================================================
// TASK CONTRACT HELPERS (Agentic Context Engineering v3.0)
// Re-export artifact tools for sub-agent module use
// ============================================================================

/**
 * Read artifact content by ID
 * Sub-agent modules should use this to load input artifacts on-demand
 *
 * @example
 * // In a sub-agent module:
 * import { readArtifactContent, claimPendingContract } from '../sub-agent-executor.js';
 *
 * export async function execute(sdId, subAgent, options) {
 *   // If contract mode, read from artifacts
 *   if (options.inputArtifacts?.length > 0) {
 *     const instructions = await readArtifactContent(options.inputArtifacts[0]);
 *     // ... process instructions
 *   }
 * }
 */
export { readArtifact as readArtifactContent };

/**
 * Claim a pending task contract
 * Sub-agents can use this to pick up work from the queue
 */
export { claimTaskContract as claimPendingContract };

/**
 * Create a new artifact from content
 * Sub-agents can store their output as artifacts
 */
export { createArtifact as storeOutputArtifact };

/**
 * Check if task contracts are enabled
 * @returns {boolean} Whether contract mode is active
 */
export function isContractModeEnabled() {
  return USE_TASK_CONTRACTS;
}

/**
 * Execute sub-agent with contract mode explicitly disabled
 * Use this when you want full context inheritance
 *
 * @param {string} code - Sub-agent code
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Execution results
 */
export async function executeSubAgentWithFullContext(code, sdId, options = {}) {
  return executeSubAgent(code, sdId, { ...options, useContract: false });
}

/**
 * Execute sub-agent with contract mode explicitly enabled
 * Use this when you want minimal context (contract-based handoff)
 *
 * @param {string} code - Sub-agent code
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Execution results
 */
export async function executeSubAgentWithContract(code, sdId, options = {}) {
  return executeSubAgent(code, sdId, { ...options, useContract: true });
}
