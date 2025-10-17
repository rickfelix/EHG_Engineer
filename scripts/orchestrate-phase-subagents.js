#!/usr/bin/env node

/**
 * Phase Sub-Agent Orchestrator
 *
 * Purpose: Automatically execute all required sub-agents for a given SD phase
 * Workflow:
 *   1. Query leo_sub_agents table filtered by trigger_phases
 *   2. Detect required sub-agents based on SD scope
 *   3. Execute sub-agents in parallel where independent
 *   4. Store results in sub_agent_execution_results
 *   5. Return aggregated results (PASS/FAIL/BLOCKED)
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
 *   - Parallel execution where possible (reduce latency)
 *   - BLOCKS handoff if CRITICAL sub-agent fails
 *   - Stores all results in database
 *   - Returns clear PASS/FAIL/BLOCKED verdict
 */

import { createClient } from '@supabase/supabase-js';
import { createDatabaseClient } from '../lib/supabase-connection.js';
import { executeSubAgent as realExecuteSubAgent } from '../lib/sub-agent-executor.js';
import { selectSubAgents } from '../lib/context-aware-sub-agent-selector.js';
import { safeInsert, generateUUID } from './modules/safe-insert.js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Phase to sub-agent mapping (loaded from database, this is fallback)
const PHASE_SUBAGENT_MAP = {
  LEAD_PRE_APPROVAL: ['VALIDATION', 'DATABASE', 'SECURITY', 'DESIGN', 'RISK'],
  PLAN_PRD: ['DATABASE', 'STORIES', 'RISK'],
  EXEC_IMPL: [], // EXEC does the work, no sub-agents
  PLAN_VERIFY: ['TESTING', 'GITHUB', 'DATABASE', 'SECURITY', 'PERFORMANCE', 'DESIGN', 'API', 'DEPENDENCY'],
  LEAD_FINAL: ['RETRO']
};

/**
 * Query SD details from database
 */
async function getSDDetails(sdId) {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', sdId)
    .single();

  if (error) {
    throw new Error(`Failed to get SD details: ${error.message}`);
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
 * Check if sub-agent is required based on SD scope
 * Now uses context-aware selector for intelligent matching
 */
function isSubAgentRequired(subAgent, sd, phase) {
  const code = subAgent.sub_agent_code || subAgent.code;

  // Always required sub-agents per phase (MANDATORY regardless of content)
  const alwaysRequired = {
    LEAD_PRE_APPROVAL: ['RISK', 'VALIDATION', 'SECURITY'], // Risk assessment, duplicate check, security review for ALL SDs
    PLAN_VERIFY: ['TESTING', 'GITHUB', 'DOCMON', 'STORIES'], // Tests, CI/CD, documentation, story verification for ALL implementations
    LEAD_FINAL: ['RETRO'] // Retrospective for continuous improvement
  };

  if (alwaysRequired[phase]?.includes(code)) {
    return { required: true, reason: 'Always required for this phase' };
  }

  // Use context-aware selector for intelligent matching
  try {
    const { recommended, coordinationGroups } = selectSubAgents(sd, {
      confidenceThreshold: 0.4,
      includeCoordination: true
    });

    // Check if this sub-agent is recommended
    const recommendation = recommended.find(r => r.code === code);

    if (recommendation) {
      const confidencePercent = recommendation.confidence;
      const matchedKeywords = recommendation.matchedKeywords || [];
      const keywordSummary = matchedKeywords.slice(0, 3).join(', ');

      return {
        required: true,
        reason: `Context-aware match (${confidencePercent}% confidence): ${keywordSummary}${matchedKeywords.length > 3 ? '...' : ''}`
      };
    }

    // Check if sub-agent is part of a coordination group
    const inCoordination = coordinationGroups.some(group =>
      group.agents.includes(code)
    );

    if (inCoordination) {
      const group = coordinationGroups.find(g => g.agents.includes(code));
      return {
        required: true,
        reason: `Required by coordination group: ${group.name} (${group.keywordMatches} keyword matches)`
      };
    }

    // High priority SDs still get performance review (legacy rule)
    if (code === 'PERFORMANCE' && sd.priority >= 70) {
      return { required: true, reason: 'High priority SD requires performance review' };
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
 */
async function executeSubAgent(subAgent, sdId) {
  const code = subAgent.sub_agent_code || subAgent.code;
  const name = subAgent.name;

  console.log(`\n🤖 Executing ${code} (${name})...`);

  try {
    // Call REAL executor from lib/sub-agent-executor.js
    const result = await realExecuteSubAgent(code, sdId, {
      phase: 'orchestrated',
      priority: subAgent.priority
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
        : 0
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
    created_at: new Date().toISOString()
  };

  // Use safeInsert for type-safe insert with validation
  const insertResult = await safeInsert(supabase, 'sub_agent_execution_results', insertData, {
    validate: true,
    verify: true,
    autoGenerateId: false  // We already generated UUID above
  });

  // Check if insert succeeded
  if (!insertResult.success) {
    console.error(`   ❌ Failed to record sub-agent execution`);
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
 */
async function orchestrate(phase, sdId) {
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

    // Step 2: Get phase sub-agents from database
    console.log('\n🔍 Step 2: Querying sub-agents for phase...');
    const phaseSubAgents = await getPhaseSubAgents(phase);
    console.log(`   Found ${phaseSubAgents.length} sub-agents registered for ${phase}`);

    // Step 3: Filter required sub-agents based on SD scope
    console.log('\n🎯 Step 3: Determining required sub-agents...');
    const requiredSubAgents = [];
    const skippedSubAgents = [];

    for (const subAgent of phaseSubAgents) {
      const { required, reason } = isSubAgentRequired(subAgent, sd, phase);
      const code = subAgent.sub_agent_code || subAgent.code;

      if (required) {
        console.log(`   ✅ ${code}: ${reason}`);
        requiredSubAgents.push({ ...subAgent, reason });
      } else {
        console.log(`   ⏭️  ${code}: ${reason}`);
        skippedSubAgents.push({ ...subAgent, reason });
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
        const result = await executeSubAgent(subAgent, sdId);
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
    console.log(`\nBreakdown:`);
    console.log(`  • Total agents: ${aggregated.total_agents}`);
    console.log(`  • Passed: ${aggregated.passed}`);
    console.log(`  • Failed: ${aggregated.failed}`);
    console.log(`  • Blocked: ${aggregated.blocked}`);
    console.log('═'.repeat(60));

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
export { orchestrate, getPhaseSubAgents, isSubAgentRequired };
