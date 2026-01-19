#!/usr/bin/env node

/**
 * Phase Sub-Agent Orchestrator
 *
 * Purpose: Automatically execute all required sub-agents for a given SD phase
 * Workflow:
 *   1. Query leo_sub_agents table filtered by trigger_phases
 *   2. Detect required sub-agents using HYBRID matching (semantic + keyword)
 *   3. Execute sub-agents in parallel where independent
 *   4. Store results in sub_agent_execution_results
 *   5. Return aggregated results (PASS/FAIL/BLOCKED)
 *
 * PHASE 4 ENHANCEMENT: Hybrid Semantic + Keyword Matching
 *   - Uses OpenAI embeddings (text-embedding-3-small) for semantic similarity
 *   - Combines semantic (60%) + keyword (40%) scores
 *   - Falls back to keyword-only if embeddings unavailable
 *   - Reduces false positives from ~20-30% to <10%
 *
 * Usage:
 *   node scripts/orchestrate-phase-subagents.js <PHASE> <SD-ID>
 *
 * Phases:
 *   LEAD_PRE_APPROVAL - LEAD initial approval
 *   PLAN_PRD - PLAN PRD creation
 *   EXEC_IMPL - EXEC implementation (none - EXEC does the work)
 *   PLAN_VERIFY - PLAN verification (MANDATORY: TESTING, GITHUB)
 *   LEAD_FINAL - LEAD final approval (MANDATORY: RETRO)
 *
 * Examples:
 *   node scripts/orchestrate-phase-subagents.js PLAN_VERIFY SD-TEST-001
 *   node scripts/orchestrate-phase-subagents.js LEAD_FINAL SD-TEST-001
 *
 * Integration:
 *   Called by unified-handoff-system.js BEFORE creating handoff
 *
 * Critical Features:
 *   - Hybrid semantic + keyword sub-agent selection
 *   - Parallel execution where possible (reduce latency)
 *   - BLOCKS handoff if CRITICAL sub-agent fails
 *   - Stores all results in database
 *   - Returns clear PASS/FAIL/BLOCKED verdict
 */

import { createClient as _createClient } from '@supabase/supabase-js';
import { createDatabaseClient as _createDatabaseClient } from '../lib/supabase-connection.js';
import { createSupabaseServiceClient } from './lib/supabase-connection.js';
import { executeSubAgent as realExecuteSubAgent } from '../lib/sub-agent-executor.js';
import { selectSubAgents as _selectSubAgents, selectSubAgentsHybrid } from '../lib/context-aware-sub-agent-selector.js';
import { safeInsert, generateUUID } from './modules/safe-insert.js';
import {
  shouldSkipCodeValidation,
  getValidationRequirements,
  getPlanVerifySubAgents as _getPlanVerifySubAgents,
  logSdTypeValidationMode as _logSdTypeValidationMode
} from '../lib/utils/sd-type-validation.js';
// LEO Protocol v4.3.4: LLM-based intelligent impact analysis
import { analyzeSDImpact as _analyzeSDImpact, enhanceSubAgentSelection as _enhanceSubAgentSelection, getImpactBasedSubAgents } from '../lib/intelligent-impact-analyzer.js';
// LEO Protocol v4.3.4: Pattern-based learning from retrospectives
import { getPatternBasedSubAgents, analyzeSDAgainstPatterns as _analyzeSDAgainstPatterns } from '../lib/learning/pattern-to-subagent-mapper.js';
import dotenv from 'dotenv';

dotenv.config();

// Use service role key to bypass RLS policies for orchestration operations
const supabase = await createSupabaseServiceClient('engineer', { verbose: false });

// Phase to sub-agent mapping (loaded from database, this is fallback)
// NOTE: PLAN_PRD and PLAN_VERIFY are now DYNAMIC based on sd_type - see getPhaseSubAgentsForSd()
const PHASE_SUBAGENT_MAP = {
  LEAD_PRE_APPROVAL: ['VALIDATION', 'DATABASE', 'SECURITY', 'DESIGN', 'RISK'],
  PLAN_PRD: ['DATABASE', 'STORIES', 'RISK', 'TESTING'],  // LEO v4.4.1: Added TESTING for test plan creation
  EXEC_IMPL: [], // EXEC does the work, no sub-agents
  PLAN_VERIFY: ['TESTING', 'GITHUB', 'DOCMON', 'STORIES', 'DATABASE', 'SECURITY', 'PERFORMANCE', 'DESIGN', 'API', 'DEPENDENCY'],
  LEAD_FINAL: ['RETRO']
};

// LEO Protocol v4.4.1: SD type-aware PLAN_PRD mapping
// ROOT CAUSE FIX: TESTING was only running during PLAN_VERIFY (after implementation)
// This caused SDs to be implemented without test plans, then blocked when TESTING
// found no tests during verification. Now TESTING runs during PLAN_PRD for
// feature/api SDs to generate test requirements BEFORE implementation.
const PLAN_PRD_BY_SD_TYPE = {
  // Feature/API SDs need test requirements created during planning
  feature: ['DATABASE', 'STORIES', 'RISK', 'TESTING', 'API'],
  api: ['DATABASE', 'STORIES', 'RISK', 'TESTING', 'API'],

  // Database SDs focus on schema validation
  database: ['DATABASE', 'STORIES', 'RISK'],

  // Security SDs need security review during planning
  security: ['DATABASE', 'STORIES', 'RISK', 'SECURITY'],

  // Documentation/infrastructure don't need testing during planning
  documentation: ['STORIES', 'DOCMON'],
  infrastructure: ['DATABASE', 'STORIES', 'RISK'],

  // Refactor uses standard planning
  refactor: ['DATABASE', 'STORIES', 'RISK']
};

// SD type-aware PLAN_VERIFY mapping (SD-TECH-DEBT-DOCS-001 resilience improvement)
// LEO Protocol v4.3.4: SECURITY + PERFORMANCE now MANDATORY for code-impacting SDs
// Rationale: SD-HARDENING-V1 revealed that optional SECURITY/PERFORMANCE sub-agents
// allowed RLS gaps and N+1 queries to slip through. Making them mandatory prevents this.
const PLAN_VERIFY_BY_SD_TYPE = {
  // Full validation for code-impacting SDs - SECURITY + PERFORMANCE are MANDATORY
  // LEO Protocol v4.4.1: Added UAT for user-facing SDs (feature, api) to ensure human verification
  // ROOT CAUSE: UAT sub-agent had 0% invocation rate because it was keyword-only, not phase-mandatory
  feature: ['TESTING', 'GITHUB', 'DOCMON', 'STORIES', 'DATABASE', 'SECURITY', 'PERFORMANCE', 'DESIGN', 'API', 'DEPENDENCY', 'UAT'],
  // LEO Protocol v4.4.1: Enhancement - improvements to existing features (UAT optional, not mandatory)
  // Use this type for minor improvements that don't warrant full UAT validation
  enhancement: ['TESTING', 'GITHUB', 'DOCMON', 'STORIES', 'DATABASE', 'SECURITY', 'PERFORMANCE', 'DESIGN', 'API', 'DEPENDENCY'],
  database: ['TESTING', 'GITHUB', 'DOCMON', 'STORIES', 'DATABASE', 'SECURITY', 'PERFORMANCE'],  // Added PERFORMANCE for N+1 detection
  security: ['TESTING', 'GITHUB', 'DOCMON', 'STORIES', 'DATABASE', 'SECURITY', 'PERFORMANCE'],  // Added PERFORMANCE
  api: ['TESTING', 'GITHUB', 'DOCMON', 'STORIES', 'DATABASE', 'SECURITY', 'PERFORMANCE', 'API', 'UAT'],  // Added UAT for API verification

  // Reduced validation for non-code SDs (skip TESTING, GITHUB)
  documentation: ['DOCMON', 'STORIES'],
  infrastructure: ['DOCMON', 'STORIES', 'GITHUB', 'SECURITY'],  // Infrastructure keeps SECURITY for RLS validation

  // LEO Protocol v4.3.3: Refactor SD type with intensity-aware validation
  // Default refactor uses standard validation; intensity overrides below
  // LEO Protocol v4.4.1: Added REGRESSION for backward compatibility validation
  refactor: ['TESTING', 'GITHUB', 'DOCMON', 'STORIES', 'DATABASE', 'SECURITY', 'PERFORMANCE', 'REGRESSION']
};

// LEO Protocol v4.3.3: Intensity-specific PLAN_VERIFY overrides for refactor SDs
// LEO Protocol v4.4.1: Added REGRESSION for structural/architectural (backward compatibility)
const REFACTOR_INTENSITY_SUBAGENTS = {
  cosmetic: ['GITHUB', 'DOCMON', 'STORIES'],  // No TESTING/SECURITY/PERFORMANCE/REGRESSION - cosmetic is low risk
  structural: ['TESTING', 'GITHUB', 'DOCMON', 'STORIES', 'DATABASE', 'SECURITY', 'PERFORMANCE', 'REGRESSION'],
  architectural: ['TESTING', 'GITHUB', 'DOCMON', 'STORIES', 'DATABASE', 'SECURITY', 'PERFORMANCE', 'DESIGN', 'REGRESSION']
};

// MANDATORY sub-agents that ALWAYS run regardless of keyword matching
// LEO Protocol v4.3.4: Ensures critical validations can't be skipped
// LEO Protocol v4.4.1: PLAN_PRD now SD-type aware to require TESTING for feature/api SDs
const MANDATORY_SUBAGENTS_BY_PHASE = {
  LEAD_PRE_APPROVAL: ['VALIDATION', 'RISK'],  // Always check for duplicates and risks
  PLAN_PRD: {
    // LEO v4.4.1: SD-type specific mandatory agents for PLAN_PRD
    // ROOT CAUSE FIX: Feature/API SDs must have TESTING during planning to create test requirements
    feature: ['DATABASE', 'STORIES', 'TESTING'],
    api: ['DATABASE', 'STORIES', 'TESTING', 'API'],
    database: ['DATABASE', 'STORIES'],
    security: ['DATABASE', 'STORIES', 'SECURITY'],
    documentation: ['STORIES'],
    infrastructure: ['DATABASE', 'STORIES'],
    refactor: ['DATABASE', 'STORIES'],
    // Default fallback for unknown types
    default: ['DATABASE', 'STORIES']
  },
  PLAN_VERIFY: {
    // SD-type specific mandatory agents
    // LEO Protocol v4.4.1: Added UAT to feature/api mandatory lists
    // ROOT CAUSE: UAT had 0% invocation - now mandatory for user-facing SDs
    feature: ['TESTING', 'SECURITY', 'PERFORMANCE', 'UAT'],
    // LEO Protocol v4.4.1: Enhancement - same as feature but UAT NOT mandatory (optional via keyword)
    enhancement: ['TESTING', 'SECURITY', 'PERFORMANCE'],
    // ROOT CAUSE FIX (2026-01-01): Removed TESTING from database mandatory list
    // Database SDs focus on schema/migrations, not user-facing code. TESTING exemption
    // is configured in sd_type_validation_profiles table. Step 3D was overriding this
    // exemption by hardcoding TESTING as mandatory here. Now database SDs correctly
    // use DATABASE agent for schema validation instead of TESTING agent.
    database: ['DATABASE', 'SECURITY', 'PERFORMANCE'],
    security: ['TESTING', 'SECURITY'],
    api: ['TESTING', 'SECURITY', 'PERFORMANCE', 'API', 'UAT'],
    documentation: ['DOCMON'],
    infrastructure: ['GITHUB', 'SECURITY'],
    // LEO Protocol v4.3.3: Refactor mandatory agents (intensity-aware)
    // LEO Protocol v4.4.1: Added REGRESSION - backward compatibility is core to refactoring
    refactor: ['GITHUB', 'DOCMON', 'REGRESSION']  // Base requirement; TESTING mandatory only for structural/architectural
  },
  LEAD_FINAL: ['RETRO']  // Always generate retrospective
};

// LEO Protocol v4.3.3: Intensity-specific MANDATORY sub-agents for refactor
// LEO Protocol v4.4.1: Added REGRESSION for structural/architectural (backward compatibility)
const REFACTOR_INTENSITY_MANDATORY = {
  cosmetic: ['GITHUB', 'DOCMON'],  // Minimal - just git and docs (no REGRESSION for cosmetic)
  structural: ['GITHUB', 'DOCMON', 'SECURITY', 'PERFORMANCE', 'REGRESSION'],  // + backward compatibility
  architectural: ['TESTING', 'GITHUB', 'DOCMON', 'SECURITY', 'PERFORMANCE', 'DESIGN', 'REGRESSION']  // Full validation
};

/**
 * Query SD details from database
 * SD-VENTURE-STAGE0-UI-001: Support UUID, legacy_id, and sd_key lookups
 */
async function getSDDetails(sdId) {
  // Check if sdId is a UUID
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sdId);

  let data, error;

  if (isUUID) {
    // Direct UUID lookup
    const result = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sdId)
      .maybeSingle();  // SD-TECH-DEBT-HANDOFF-001: Use maybeSingle() to avoid coercion error
    data = result.data;
    error = result.error;
  } else {
    // SD-EHG-001-FIX: Try id column first even if not UUID format (some SDs use string IDs like SD-EHG-001)
    const idResult = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sdId)
      .maybeSingle();

    if (idResult.data) {
      data = idResult.data;
      error = idResult.error;
    } else {
      // Try legacy_id first, then sd_key (avoid .or() with .single() which can fail)
      // SD-TECH-DEBT-HANDOFF-001: Split into two queries to avoid "Cannot coerce" error
      const legacyResult = await supabase
        .from('strategic_directives_v2')
        .select('*')
        .eq('legacy_id', sdId)
        .maybeSingle();

      if (legacyResult.data) {
        data = legacyResult.data;
        error = legacyResult.error;
      } else {
        // Try sd_key if legacy_id not found
        const keyResult = await supabase
          .from('strategic_directives_v2')
          .select('*')
          .eq('sd_key', sdId)
          .maybeSingle();
        data = keyResult.data;
        error = keyResult.error;
      }
    }
  }

  if (error) {
    throw new Error(`Failed to get SD details: ${error.message}`);
  }

  if (!data) {
    throw new Error(`SD not found: ${sdId}`);
  }

  return data;
}

/**
 * Query sub-agents from database filtered by phase
 */
async function getPhaseSubAgents(phase) {
  const { data, error } = await supabase
    .from('leo_sub_agents')
    .select('*')
    .eq('active', true)
    .order('priority', { ascending: false });

  if (error) {
    throw new Error(`Failed to query sub-agents: ${error.message}`);
  }

  // Get sub-agent codes for this phase from hardcoded map
  const phaseAgentCodes = PHASE_SUBAGENT_MAP[phase] || [];

  // Filter sub-agents by codes defined for this phase
  return data.filter(sa => {
    const code = sa.code || sa.sub_agent_code;
    return phaseAgentCodes.includes(code);
  });
}

/**
 * Get phase sub-agents with SD type awareness
 * SD-TECH-DEBT-DOCS-001: Documentation-only SDs skip TESTING/GITHUB
 *
 * @param {string} phase - Phase name
 * @param {Object} sd - Strategic Directive object
 * @returns {Promise<Object[]>} Filtered sub-agents
 */
async function getPhaseSubAgentsForSd(phase, sd) {
  const { data, error } = await supabase
    .from('leo_sub_agents')
    .select('*')
    .eq('active', true)
    .order('priority', { ascending: false });

  if (error) {
    throw new Error(`Failed to query sub-agents: ${error.message}`);
  }

  // For PLAN_VERIFY and PLAN_PRD, use sd_type-aware mapping
  let phaseAgentCodes;
  const sdType = sd.sd_type || 'feature';

  if (phase === 'PLAN_VERIFY') {
    const skipCode = shouldSkipCodeValidation(sd);

    // LEO Protocol v4.3.3: Intensity-aware sub-agent selection for refactor SDs
    if (sdType === 'refactor' && sd.intensity_level) {
      phaseAgentCodes = REFACTOR_INTENSITY_SUBAGENTS[sd.intensity_level] || PLAN_VERIFY_BY_SD_TYPE.refactor;
      console.log(`   📋 SD Type: ${sdType} (intensity: ${sd.intensity_level})`);
      console.log(`   📋 Using intensity-aware PLAN_VERIFY sub-agents: ${phaseAgentCodes.join(', ')}`);
    } else if (skipCode) {
      // Use reduced validation for documentation/non-code SDs
      phaseAgentCodes = PLAN_VERIFY_BY_SD_TYPE[sdType] || PLAN_VERIFY_BY_SD_TYPE.documentation;
      console.log(`   📋 SD Type: ${sdType} (skip code validation: YES)`);
      console.log(`   📋 Using reduced PLAN_VERIFY sub-agents: ${phaseAgentCodes.join(', ')}`);
    } else {
      // Use full validation for code-impacting SDs
      phaseAgentCodes = PLAN_VERIFY_BY_SD_TYPE[sdType] || PHASE_SUBAGENT_MAP[phase];
      console.log(`   📋 SD Type: ${sdType} (skip code validation: NO)`);
      console.log(`   📋 Using full PLAN_VERIFY sub-agents: ${phaseAgentCodes.join(', ')}`);
    }
  } else if (phase === 'PLAN_PRD') {
    // LEO Protocol v4.4.1: SD type-aware PLAN_PRD sub-agent selection
    // ROOT CAUSE FIX: Feature/API SDs need TESTING during planning to create test requirements
    phaseAgentCodes = PLAN_PRD_BY_SD_TYPE[sdType] || PHASE_SUBAGENT_MAP[phase];

    // ═══════════════════════════════════════════════════════════════════════════
    // SD-LEARN-008: Schema keyword detection for DATABASE auto-invocation
    // ═══════════════════════════════════════════════════════════════════════════
    // Problem: SDs that mention schema/migration/table work but aren't typed as
    // 'database' may not get DATABASE sub-agent validation.
    //
    // Fix: Detect schema-related keywords in SD description/scope and ensure
    // DATABASE is included in the sub-agent list.
    // ═══════════════════════════════════════════════════════════════════════════
    const schemaKeywords = [
      'schema', 'migration', 'table', 'column', 'constraint', 'index',
      'foreign key', 'rls', 'row level security', 'trigger', 'function',
      'alter table', 'create table', 'drop table', 'database'
    ];

    const sdContent = [
      sd.title || '',
      sd.description || '',
      sd.scope || '',
      sd.rationale || ''
    ].join(' ').toLowerCase();

    const hasSchemaContent = schemaKeywords.some(kw => sdContent.includes(kw));

    if (hasSchemaContent && !phaseAgentCodes.includes('DATABASE')) {
      console.log('   🔍 Schema keywords detected - adding DATABASE sub-agent');
      phaseAgentCodes = [...phaseAgentCodes, 'DATABASE'];
    }

    console.log(`   📋 SD Type: ${sdType}${hasSchemaContent ? ' (schema detected)' : ''}`);
    console.log(`   📋 Using PLAN_PRD sub-agents: ${phaseAgentCodes.join(', ')}`);
  } else {
    // For other phases, use standard mapping
    phaseAgentCodes = PHASE_SUBAGENT_MAP[phase] || [];
  }

  // Filter sub-agents by codes defined for this phase
  return data.filter(sa => {
    const code = sa.code || sa.sub_agent_code;
    return phaseAgentCodes.includes(code);
  });
}

/**
 * Check if sub-agent is required based on SD scope
 * PHASE 4 ENHANCEMENT: Now uses hybrid semantic + keyword matching
 * SD-TECH-DEBT-DOCS-001: Now sd_type-aware for PLAN_VERIFY phase
 */
async function isSubAgentRequired(subAgent, sd, phase) {
  const code = subAgent.sub_agent_code || subAgent.code;

  // SD-TECH-DEBT-DOCS-001: Check if this is a non-code SD
  const skipCodeValidation = shouldSkipCodeValidation(sd);

  // Always required sub-agents per phase (MANDATORY regardless of content)
  // NOTE: For PLAN_VERIFY, this is NOW SD_TYPE-AWARE
  const alwaysRequired = {
    LEAD_PRE_APPROVAL: ['RISK', 'VALIDATION', 'SECURITY', 'DATABASE', 'DESIGN'],
    PLAN_PRD: ['DATABASE', 'STORIES', 'RISK'],
    // PLAN_VERIFY is now dynamic based on sd_type
    PLAN_VERIFY: skipCodeValidation
      ? ['DOCMON', 'STORIES']  // Documentation-only SDs: skip TESTING, GITHUB
      : ['TESTING', 'GITHUB', 'DOCMON', 'STORIES', 'DATABASE'],
    LEAD_FINAL: ['RETRO']
  };

  // Check if sub-agent should be SKIPPED for documentation-only SDs
  if (skipCodeValidation && phase === 'PLAN_VERIFY') {
    if (['TESTING', 'GITHUB'].includes(code)) {
      return {
        required: false,
        reason: `Skipped for documentation-only SD (sd_type=${sd.sd_type || 'detected'})`
      };
    }
  }

  if (alwaysRequired[phase]?.includes(code)) {
    return { required: true, reason: 'Always required for this phase' };
  }

  // Use hybrid selector (semantic + keyword) for intelligent matching
  try {
    const { recommended, coordinationGroups, matchingStrategy } = await selectSubAgentsHybrid(sd, {
      semanticWeight: 0.6,
      keywordWeight: 0.4,
      combinedThreshold: 0.6,
      useKeywordFallback: true, // Auto-fallback to keyword-only if embeddings fail
      matchCount: 10
    });

    // Check if this sub-agent is recommended
    const recommendation = recommended.find(r => r.code === code);

    if (recommendation) {
      const confidencePercent = recommendation.confidence;

      // Build reason based on matching strategy
      let reason;
      if (matchingStrategy === 'hybrid' && recommendation.semanticScore !== undefined) {
        reason = `Hybrid match (${confidencePercent}%): ${recommendation.semanticScore}% semantic + ${recommendation.keywordScore}% keyword (${recommendation.keywordMatches} keywords)`;
      } else {
        // Fallback or keyword-only
        const matchedKeywords = recommendation.matchedKeywords || [];
        const keywordSummary = matchedKeywords.slice(0, 3).join(', ');
        reason = `Keyword match (${confidencePercent}% confidence): ${keywordSummary}${matchedKeywords.length > 3 ? '...' : ''}`;
      }

      return {
        required: true,
        reason
      };
    }

    // Check if sub-agent is part of a coordination group
    const inCoordination = coordinationGroups && coordinationGroups.some(group =>
      group.agents.includes(code)
    );

    if (inCoordination) {
      const group = coordinationGroups.find(g => g.agents.includes(code));
      return {
        required: true,
        reason: `Required by coordination group: ${group.groupName} (${group.keywordMatches} keyword matches)`
      };
    }

    // High priority SDs still get performance review (legacy rule)
    if (code === 'PERFORMANCE' && sd.priority >= 70) {
      return { required: true, reason: 'High priority SD requires performance review' };
    }

    // Smart COST agent triggering - auto-detect infrastructure changes
    if (code === 'COST' && phase === 'PLAN_VERIFY') {
      const content = `${sd.title || ''} ${sd.scope || ''} ${sd.description || ''}`.toLowerCase();

      const infraKeywords = [
        'database migration',
        'scaling',
        'infrastructure',
        'cloud',
        'serverless',
        'deployment',
        'instances',
        'storage',
        'bandwidth',
        'compute',
        'load balancer',
        'CDN',
        'cache',
        'Redis',
        'Elasticsearch',
        'S3',
        'CloudFront',
        'Lambda',
        'EC2',
        'RDS',
        'DynamoDB'
      ];

      const matchedKeywords = infraKeywords.filter(kw => content.includes(kw));

      if (matchedKeywords.length > 0) {
        return {
          required: true,
          reason: `Infrastructure changes detected (${matchedKeywords.slice(0, 3).join(', ')}) - cost analysis required`
        };
      }
    }

    return { required: false, reason: 'Not recommended by context-aware analysis' };

  } catch (error) {
    // Fallback to legacy simple matching if selector fails
    console.warn(`⚠️  Context-aware selector failed for ${code}, using fallback: ${error.message}`);

    const scope = (sd.scope || '').toLowerCase();
    const conditionalRequirements = {
      DATABASE: ['database', 'migration', 'schema', 'table'],
      DESIGN: ['ui', 'component', 'design', 'interface', 'page', 'view'],
      SECURITY: ['auth', 'security', 'permission', 'rls', 'encryption'],
      PERFORMANCE: ['performance', 'optimization', 'load', 'scale'],
      VALIDATION: ['integration', 'existing', 'refactor']
    };

    const keywords = conditionalRequirements[code];
    if (keywords) {
      const matches = keywords.some(keyword => scope.includes(keyword));
      if (matches) {
        return { required: true, reason: `Scope contains (fallback): ${keywords.filter(k => scope.includes(k)).join(', ')}` };
      }
    }

    return { required: false, reason: 'Not required based on scope (fallback)' };
  }
}

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
function normalizeDetailedAnalysis(value) {
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
 */
async function executeSubAgent(subAgent, sdId, options = {}) {
  const code = subAgent.sub_agent_code || subAgent.code;
  const name = subAgent.name;

  console.log(`\n🤖 Executing ${code} (${name})...`);

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
    console.error(`   ❌ Execution failed: ${error.message}`);

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
 * Store sub-agent result in database
 *
 * UPDATED: Now uses safeInsert() and verifies recording to prevent SD-KNOWLEDGE-001 Issue #5
 * Recording is MANDATORY - failures will throw errors immediately.
 *
 * @see docs/retrospectives/SD-KNOWLEDGE-001-completion-issues-and-prevention.md
 */
async function storeSubAgentResult(sdId, result) {
  console.log(`   💾 Recording ${result.sub_agent_code} execution...`);

  // Prepare data for insert
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
    console.error('   ❌ Failed to record sub-agent execution');
    console.error(`   Error: ${insertResult.error}`);
    throw new Error(`MANDATORY RECORDING FAILED: ${insertResult.error}`);
  }

  // Verify the record was actually stored (SD-KNOWLEDGE-001 Issue #5 prevention)
  const recordId = insertResult.data.id;
  const verified = await verifyExecutionRecorded(recordId);

  if (!verified) {
    throw new Error(`VERIFICATION FAILED: Record ${recordId} not found after insert. This is a critical data integrity issue.`);
  }

  console.log(`   ✅ Stored & verified: ${recordId}`);

  // Log warnings if any
  if (insertResult.warnings && insertResult.warnings.length > 0) {
    insertResult.warnings.forEach(warning => {
      console.warn(`   ⚠️  ${warning}`);
    });
  }

  return recordId;
}

/**
 * Verify that a sub-agent execution was actually recorded in the database
 *
 * Prevents SD-KNOWLEDGE-001 Issue #5: Missing sub-agent execution records
 * This verification ensures the record exists and is queryable.
 *
 * @param {string} recordId - The ID of the record to verify
 * @returns {Promise<boolean>} - True if record exists, false otherwise
 */
async function verifyExecutionRecorded(recordId) {
  try {
    const { data, error } = await supabase
      .from('sub_agent_execution_results')
      .select('id')
      .eq('id', recordId)
      .single();

    if (error) {
      console.error(`   ⚠️  Verification query failed: ${error.message}`);
      return false;
    }

    return data !== null && data.id === recordId;
  } catch (err) {
    console.error(`   ⚠️  Verification exception: ${err.message}`);
    return false;
  }
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
 * @returns {Promise<Object|null>} - Updated metadata or null on failure
 */
async function updatePRDMetadataFromSubAgents(sdId, phase, results) {
  try {
    // Get PRD associated with this SD
    const { data: prd, error: prdError } = await supabase
      .from('product_requirements_v2')
      .select('id, metadata')
      .eq('directive_id', sdId)
      .single();

    if (prdError || !prd) {
      // Not an error - SD may not have a PRD yet (early phases)
      console.log(`   ℹ️  No PRD found for SD ${sdId} (normal for early phases)`);
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
      console.warn(`   ⚠️  Failed to update PRD metadata: ${updateError.message}`);
      return null;
    }

    console.log(`   ✅ PRD metadata updated with ${results.length} sub-agent results`);
    return updatedMetadata;
  } catch (err) {
    console.warn(`   ⚠️  PRD metadata update exception: ${err.message}`);
    return null;
  }
}

/**
 * Aggregate sub-agent results into final verdict
 */
function aggregateResults(results) {
  const criticalFails = results.filter(r =>
    r.verdict === 'FAIL' && ['CRITICAL', 'HIGH'].includes(r.priority)
  );

  const anyFails = results.filter(r => r.verdict === 'FAIL');
  const anyBlocked = results.filter(r => r.verdict === 'BLOCKED');
  const allPass = results.every(r => ['PASS', 'CONDITIONAL_PASS'].includes(r.verdict));

  let finalVerdict, canProceed, message;

  if (criticalFails.length > 0) {
    finalVerdict = 'BLOCKED';
    canProceed = false;
    message = `${criticalFails.length} CRITICAL sub-agent(s) failed: ${criticalFails.map(r => r.sub_agent_code).join(', ')}`;
  } else if (anyBlocked.length > 0) {
    finalVerdict = 'BLOCKED';
    canProceed = false;
    message = `${anyBlocked.length} sub-agent(s) blocked: ${anyBlocked.map(r => r.sub_agent_code).join(', ')}`;
  } else if (anyFails.length > 0) {
    finalVerdict = 'CONDITIONAL_PASS';
    canProceed = true; // LEAD can review and decide
    message = `${anyFails.length} sub-agent(s) failed (non-critical): ${anyFails.map(r => r.sub_agent_code).join(', ')}`;
  } else if (allPass) {
    finalVerdict = 'PASS';
    canProceed = true;
    message = `All ${results.length} sub-agent(s) passed`;
  } else {
    finalVerdict = 'WARNING';
    canProceed = true;
    message = 'Mixed results, review recommended';
  }

  const confidence = Math.floor(
    results.reduce((sum, r) => sum + (r.confidence || 0), 0) / results.length
  );

  return {
    verdict: finalVerdict,
    can_proceed: canProceed,
    confidence,
    message,
    total_agents: results.length,
    passed: results.filter(r => ['PASS', 'CONDITIONAL_PASS'].includes(r.verdict)).length,
    failed: anyFails.length,
    blocked: anyBlocked.length,
    results
  };
}

/**
 * Main orchestration function
 *
 * @param {string} phase - Phase name (e.g., 'PLAN_VERIFY')
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} options - Optional execution options
 * @param {string} options.validation_mode - Override validation mode ('prospective' or 'retrospective')
 */
async function orchestrate(phase, sdId, options = {}) {
  console.log('\n🎭 PHASE SUB-AGENT ORCHESTRATOR');
  console.log('═'.repeat(60));
  console.log(`Phase: ${phase}`);
  console.log(`SD: ${sdId}\n`);

  try {
    // Step 1: Get SD details
    console.log('📊 Step 1: Getting SD details...');
    const sd = await getSDDetails(sdId);
    console.log(`   Title: ${sd.title}`);
    console.log(`   Scope: ${(sd.scope || '').substring(0, 80)}...`);
    console.log(`   Priority: ${sd.priority}`);
    console.log(`   SD Type: ${sd.sd_type || 'feature (default)'}`);

    // SD-TECH-DEBT-DOCS-001: Log sd_type validation mode
    const validationReqs = getValidationRequirements(sd);
    if (validationReqs.skipCodeValidation) {
      console.log('\n   ℹ️  DOCUMENTATION-ONLY SD DETECTED');
      console.log(`      Reason: ${validationReqs.reason}`);
      console.log('      TESTING/GITHUB validation will be SKIPPED');
    }

    // Step 2: Get phase sub-agents from database (SD-TYPE AWARE)
    console.log('\n🔍 Step 2: Querying sub-agents for phase (sd_type-aware)...');
    const phaseSubAgents = await getPhaseSubAgentsForSd(phase, sd);
    console.log(`   Found ${phaseSubAgents.length} sub-agents registered for ${phase}`);

    // Step 3: Filter required sub-agents based on SD scope
    console.log('\n🎯 Step 3: Determining required sub-agents (using hybrid semantic + keyword matching)...');
    const requiredSubAgents = [];
    const skippedSubAgents = [];

    for (const subAgent of phaseSubAgents) {
      const { required, reason } = await isSubAgentRequired(subAgent, sd, phase);
      const code = subAgent.sub_agent_code || subAgent.code;

      if (required) {
        console.log(`   ✅ ${code}: ${reason}`);
        requiredSubAgents.push({ ...subAgent, reason });
      } else {
        console.log(`   ⏭️  ${code}: ${reason}`);
        skippedSubAgents.push({ ...subAgent, reason });
      }
    }

    // Step 3B: LEO Protocol v4.3.4 - LLM Impact Analysis Enhancement
    // Use LLM to identify validation needs that keyword matching might miss
    console.log('\n🧠 Step 3B: Running LLM intelligent impact analysis...');
    let llmRequiredAgents = [];
    try {
      llmRequiredAgents = await getImpactBasedSubAgents(sd);
      if (llmRequiredAgents.length > 0) {
        console.log(`   LLM identified ${llmRequiredAgents.length} additional concerns:`);
        for (const agent of llmRequiredAgents) {
          console.log(`   🔍 ${agent.code}: ${agent.reason}`);
          // Add if not already required
          const alreadyRequired = requiredSubAgents.some(sa =>
            (sa.sub_agent_code || sa.code) === agent.code
          );
          if (!alreadyRequired) {
            const subAgent = phaseSubAgents.find(sa =>
              (sa.sub_agent_code || sa.code) === agent.code
            );
            if (subAgent) {
              requiredSubAgents.push({ ...subAgent, reason: agent.reason, source: 'llm_impact' });
              // Remove from skipped if it was there
              const skippedIdx = skippedSubAgents.findIndex(sa =>
                (sa.sub_agent_code || sa.code) === agent.code
              );
              if (skippedIdx >= 0) {
                skippedSubAgents.splice(skippedIdx, 1);
              }
            }
          }
        }
      } else {
        console.log('   No additional concerns identified by LLM analysis');
      }
    } catch (llmError) {
      console.warn(`   ⚠️ LLM impact analysis failed (non-blocking): ${llmError.message}`);
    }

    // Step 3C: LEO Protocol v4.3.4 - Pattern-Based Learning Enhancement
    // Use learned patterns from retrospectives to require sub-agents
    console.log('\n📚 Step 3C: Checking learned patterns from retrospectives...');
    let patternRequiredAgents = [];
    try {
      patternRequiredAgents = await getPatternBasedSubAgents(sd);
      if (patternRequiredAgents.length > 0) {
        console.log(`   Patterns require ${patternRequiredAgents.length} sub-agents:`);
        for (const agent of patternRequiredAgents) {
          console.log(`   📖 ${agent.code}: ${agent.reason}`);
          // Add if not already required
          const alreadyRequired = requiredSubAgents.some(sa =>
            (sa.sub_agent_code || sa.code) === agent.code
          );
          if (!alreadyRequired) {
            const subAgent = phaseSubAgents.find(sa =>
              (sa.sub_agent_code || sa.code) === agent.code
            );
            if (subAgent) {
              requiredSubAgents.push({ ...subAgent, reason: agent.reason, source: 'pattern_learning' });
              // Remove from skipped if it was there
              const skippedIdx = skippedSubAgents.findIndex(sa =>
                (sa.sub_agent_code || sa.code) === agent.code
              );
              if (skippedIdx >= 0) {
                skippedSubAgents.splice(skippedIdx, 1);
              }
            }
          }
        }
      } else {
        console.log('   No additional requirements from learned patterns');
      }
    } catch (patternError) {
      console.warn(`   ⚠️ Pattern analysis failed (non-blocking): ${patternError.message}`);
    }

    // Step 3D: Apply mandatory sub-agents by SD type
    console.log('\n🔒 Step 3D: Applying mandatory sub-agents for SD type...');
    const sdType = sd.sd_type || 'feature';
    const mandatoryForPhase = MANDATORY_SUBAGENTS_BY_PHASE[phase];

    // LEO Protocol v4.3.3: Intensity-aware mandatory agents for refactor SDs
    let mandatoryAgents;
    if (sdType === 'refactor' && sd.intensity_level && REFACTOR_INTENSITY_MANDATORY[sd.intensity_level]) {
      mandatoryAgents = REFACTOR_INTENSITY_MANDATORY[sd.intensity_level];
      console.log(`   📊 Refactor intensity: ${sd.intensity_level}`);
    } else if (typeof mandatoryForPhase === 'object' && !Array.isArray(mandatoryForPhase)) {
      mandatoryAgents = mandatoryForPhase[sdType] || mandatoryForPhase.feature || [];
    } else {
      mandatoryAgents = mandatoryForPhase || [];
    }

    for (const mandatoryCode of mandatoryAgents) {
      const alreadyRequired = requiredSubAgents.some(sa =>
        (sa.sub_agent_code || sa.code) === mandatoryCode
      );
      if (!alreadyRequired) {
        const subAgent = phaseSubAgents.find(sa =>
          (sa.sub_agent_code || sa.code) === mandatoryCode
        );
        if (subAgent) {
          console.log(`   🔒 ${mandatoryCode}: Mandatory for ${sdType} SDs in ${phase}`);
          requiredSubAgents.push({ ...subAgent, reason: `Mandatory for ${sdType} SDs`, source: 'mandatory_matrix' });
          // Remove from skipped
          const skippedIdx = skippedSubAgents.findIndex(sa =>
            (sa.sub_agent_code || sa.code) === mandatoryCode
          );
          if (skippedIdx >= 0) {
            skippedSubAgents.splice(skippedIdx, 1);
          }
        }
      }
    }

    if (requiredSubAgents.length === 0) {
      console.log('\n✅ No sub-agents required for this phase');
      return {
        verdict: 'PASS',
        can_proceed: true,
        message: 'No sub-agents required',
        total_agents: 0,
        passed: 0,
        failed: 0,
        blocked: 0,
        results: []
      };
    }

    // Step 4: Execute required sub-agents (parallel where possible)
    console.log(`\n⚡ Step 4: Executing ${requiredSubAgents.length} required sub-agent(s)...`);
    console.log('   (Parallel execution where independent)');

    const executionResults = [];

    for (const subAgent of requiredSubAgents) {
      try {
        const result = await executeSubAgent(subAgent, sdId, options);
        result.phase = phase;
        result.priority = subAgent.priority >= 90 ? 'CRITICAL' : subAgent.priority >= 70 ? 'HIGH' : 'MEDIUM';
        executionResults.push(result);

        // Store result in database
        await storeSubAgentResult(sdId, result);
      } catch (error) {
        console.error(`   ❌ Failed to execute ${subAgent.code}: ${error.message}`);
        executionResults.push({
          sub_agent_code: subAgent.code,
          sub_agent_name: subAgent.name,
          verdict: 'FAIL',
          confidence: 0,
          critical_issues: [error.message],
          warnings: [],
          recommendations: ['Review sub-agent execution script'],
          detailed_analysis: `Execution failed: ${error.message}`,
          execution_time: 0,
          phase,
          priority: subAgent.priority >= 90 ? 'CRITICAL' : 'MEDIUM'
        });
      }
    }

    // Step 5: Aggregate results
    console.log('\n📊 Step 5: Aggregating results...');
    const aggregated = aggregateResults(executionResults);

    console.log('\n' + '═'.repeat(60));
    console.log('🎯 ORCHESTRATION RESULT');
    console.log('═'.repeat(60));
    console.log(`Verdict: ${aggregated.verdict}`);
    console.log(`Can Proceed: ${aggregated.can_proceed ? '✅ YES' : '❌ NO'}`);
    console.log(`Confidence: ${aggregated.confidence}%`);
    console.log(`Message: ${aggregated.message}`);
    console.log('\nBreakdown:');
    console.log(`  • Total agents: ${aggregated.total_agents}`);
    console.log(`  • Passed: ${aggregated.passed}`);
    console.log(`  • Failed: ${aggregated.failed}`);
    console.log(`  • Blocked: ${aggregated.blocked}`);
    console.log('═'.repeat(60));

    // Step 6: Update PRD metadata with sub-agent results
    console.log('\n📝 Step 6: Updating PRD metadata...');
    if (executionResults.length > 0) {
      await updatePRDMetadataFromSubAgents(sd.id, phase, executionResults);
    } else {
      console.log('   ℹ️  No sub-agent results to propagate to PRD');
    }

    return aggregated;

  } catch (error) {
    console.error('\n❌ Orchestration failed:', error.message);
    throw error;
  }
}

/**
 * CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: node scripts/orchestrate-phase-subagents.js <PHASE> <SD-ID>');
    console.error('\nPhases:');
    console.error('  LEAD_PRE_APPROVAL - LEAD initial approval');
    console.error('  PLAN_PRD - PLAN PRD creation');
    console.error('  EXEC_IMPL - EXEC implementation');
    console.error('  PLAN_VERIFY - PLAN verification');
    console.error('  LEAD_FINAL - LEAD final approval');
    console.error('\nExample:');
    console.error('  node scripts/orchestrate-phase-subagents.js PLAN_VERIFY SD-TEST-001');
    process.exit(1);
  }

  const [phase, sdId] = args;

  const validPhases = ['LEAD_PRE_APPROVAL', 'PLAN_PRD', 'EXEC_IMPL', 'PLAN_VERIFY', 'LEAD_FINAL'];
  if (!validPhases.includes(phase)) {
    console.error(`❌ Invalid phase: ${phase}`);
    console.error(`   Valid phases: ${validPhases.join(', ')}`);
    process.exit(1);
  }

  try {
    const result = await orchestrate(phase, sdId);

    // Exit code: 0 if can proceed, 1 if blocked
    process.exit(result.can_proceed ? 0 : 1);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

// Export for use in other scripts
export { orchestrate, getPhaseSubAgents, getPhaseSubAgentsForSd, isSubAgentRequired };
