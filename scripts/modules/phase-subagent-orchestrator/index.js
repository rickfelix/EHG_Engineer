/**
 * Phase Sub-Agent Orchestrator Module
 * Main entry point for modular phase sub-agent orchestration
 */

import { getValidationRequirements } from '../../../lib/utils/sd-type-validation.js';
import { getImpactBasedSubAgents } from '../../../lib/intelligent-impact-analyzer.js';
import { getPatternBasedSubAgents } from '../../../lib/learning/pattern-to-subagent-mapper.js';

import {
  MANDATORY_SUBAGENTS_BY_PHASE,
  REFACTOR_INTENSITY_MANDATORY,
  VALID_PHASES
} from './phase-config.js';

import { getSDDetails, getPhaseSubAgents, getPhaseSubAgentsForSd } from './sd-queries.js';
import { isSubAgentRequired } from './subagent-selection.js';
import { executeSubAgent, storeSubAgentResult, updatePRDMetadataFromSubAgents } from './execution.js';
import { aggregateResults } from './result-aggregation.js';

/**
 * Main orchestration function
 * @param {Object} supabase - Supabase client
 * @param {string} phase - Phase name
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Orchestration result
 */
async function orchestrate(supabase, phase, sdId, options = {}) {
  console.log('\nPHASE SUB-AGENT ORCHESTRATOR');
  console.log('='.repeat(60));
  console.log(`Phase: ${phase}`);
  console.log(`SD: ${sdId}\n`);

  try {
    // Step 1: Get SD details
    console.log('Step 1: Getting SD details...');
    const sd = await getSDDetails(supabase, sdId);
    console.log(`   Title: ${sd.title}`);
    console.log(`   Scope: ${(sd.scope || '').substring(0, 80)}...`);
    console.log(`   Priority: ${sd.priority}`);
    console.log(`   SD Type: ${sd.sd_type || 'feature (default)'}`);

    const validationReqs = getValidationRequirements(sd);
    if (validationReqs.skipCodeValidation) {
      console.log('\n   DOCUMENTATION-ONLY SD DETECTED');
      console.log(`      Reason: ${validationReqs.reason}`);
      console.log('      TESTING/GITHUB validation will be SKIPPED');
    }

    // Step 2: Get phase sub-agents from database
    console.log('\nStep 2: Querying sub-agents for phase (sd_type-aware)...');
    const phaseSubAgents = await getPhaseSubAgentsForSd(supabase, phase, sd);
    console.log(`   Found ${phaseSubAgents.length} sub-agents registered for ${phase}`);

    // Step 3: Filter required sub-agents based on SD scope
    console.log('\nStep 3: Determining required sub-agents (using hybrid semantic + keyword matching)...');
    const requiredSubAgents = [];
    const skippedSubAgents = [];

    for (const subAgent of phaseSubAgents) {
      const { required, reason } = await isSubAgentRequired(subAgent, sd, phase);
      const code = subAgent.sub_agent_code || subAgent.code;

      if (required) {
        console.log(`   [REQUIRED] ${code}: ${reason}`);
        requiredSubAgents.push({ ...subAgent, reason });
      } else {
        console.log(`   [SKIP] ${code}: ${reason}`);
        skippedSubAgents.push({ ...subAgent, reason });
      }
    }

    // Step 3B: LLM Impact Analysis Enhancement
    console.log('\nStep 3B: Running LLM intelligent impact analysis...');
    let llmRequiredAgents = [];
    try {
      llmRequiredAgents = await getImpactBasedSubAgents(sd);
      if (llmRequiredAgents.length > 0) {
        console.log(`   LLM identified ${llmRequiredAgents.length} additional concerns:`);
        for (const agent of llmRequiredAgents) {
          console.log(`   [LLM] ${agent.code}: ${agent.reason}`);
          const alreadyRequired = requiredSubAgents.some(sa =>
            (sa.sub_agent_code || sa.code) === agent.code
          );
          if (!alreadyRequired) {
            const subAgent = phaseSubAgents.find(sa =>
              (sa.sub_agent_code || sa.code) === agent.code
            );
            if (subAgent) {
              requiredSubAgents.push({ ...subAgent, reason: agent.reason, source: 'llm_impact' });
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
      console.warn(`   LLM impact analysis failed (non-blocking): ${llmError.message}`);
    }

    // Step 3C: Pattern-Based Learning Enhancement
    console.log('\nStep 3C: Checking learned patterns from retrospectives...');
    let patternRequiredAgents = [];
    try {
      patternRequiredAgents = await getPatternBasedSubAgents(sd);
      if (patternRequiredAgents.length > 0) {
        console.log(`   Patterns require ${patternRequiredAgents.length} sub-agents:`);
        for (const agent of patternRequiredAgents) {
          console.log(`   [PATTERN] ${agent.code}: ${agent.reason}`);
          const alreadyRequired = requiredSubAgents.some(sa =>
            (sa.sub_agent_code || sa.code) === agent.code
          );
          if (!alreadyRequired) {
            const subAgent = phaseSubAgents.find(sa =>
              (sa.sub_agent_code || sa.code) === agent.code
            );
            if (subAgent) {
              requiredSubAgents.push({ ...subAgent, reason: agent.reason, source: 'pattern_learning' });
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
      console.warn(`   Pattern analysis failed (non-blocking): ${patternError.message}`);
    }

    // Step 3D: Apply mandatory sub-agents by SD type
    console.log('\nStep 3D: Applying mandatory sub-agents for SD type...');
    const sdType = sd.sd_type || 'feature';
    const mandatoryForPhase = MANDATORY_SUBAGENTS_BY_PHASE[phase];

    let mandatoryAgents;
    if (sdType === 'refactor' && sd.intensity_level && REFACTOR_INTENSITY_MANDATORY[sd.intensity_level]) {
      mandatoryAgents = REFACTOR_INTENSITY_MANDATORY[sd.intensity_level];
      console.log(`   Refactor intensity: ${sd.intensity_level}`);
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
          console.log(`   [MANDATORY] ${mandatoryCode}: Mandatory for ${sdType} SDs in ${phase}`);
          requiredSubAgents.push({ ...subAgent, reason: `Mandatory for ${sdType} SDs`, source: 'mandatory_matrix' });
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
      console.log('\nNo sub-agents required for this phase');
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

    // Step 4: Execute required sub-agents
    console.log(`\nStep 4: Executing ${requiredSubAgents.length} required sub-agent(s)...`);
    console.log('   (Parallel execution where independent)');

    const executionResults = [];

    for (const subAgent of requiredSubAgents) {
      try {
        const result = await executeSubAgent(subAgent, sdId, options);
        result.phase = phase;
        result.priority = subAgent.priority >= 90 ? 'CRITICAL' : subAgent.priority >= 70 ? 'HIGH' : 'MEDIUM';
        executionResults.push(result);

        await storeSubAgentResult(supabase, sdId, result);
      } catch (error) {
        console.error(`   Failed to execute ${subAgent.code}: ${error.message}`);
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
    console.log('\nStep 5: Aggregating results...');
    const aggregated = aggregateResults(executionResults);

    console.log('\n' + '='.repeat(60));
    console.log('ORCHESTRATION RESULT');
    console.log('='.repeat(60));
    console.log(`Verdict: ${aggregated.verdict}`);
    console.log(`Can Proceed: ${aggregated.can_proceed ? 'YES' : 'NO'}`);
    console.log(`Confidence: ${aggregated.confidence}%`);
    console.log(`Message: ${aggregated.message}`);
    console.log('\nBreakdown:');
    console.log(`  Total agents: ${aggregated.total_agents}`);
    console.log(`  Passed: ${aggregated.passed}`);
    console.log(`  Failed: ${aggregated.failed}`);
    console.log(`  Blocked: ${aggregated.blocked}`);
    console.log('='.repeat(60));

    // Step 6: Update PRD metadata
    console.log('\nStep 6: Updating PRD metadata...');
    if (executionResults.length > 0) {
      await updatePRDMetadataFromSubAgents(supabase, sd.id, phase, executionResults);
    } else {
      console.log('   No sub-agent results to propagate to PRD');
    }

    return aggregated;

  } catch (error) {
    console.error('\nOrchestration failed:', error.message);
    throw error;
  }
}

export {
  orchestrate,
  getPhaseSubAgents,
  getPhaseSubAgentsForSd,
  isSubAgentRequired,
  aggregateResults,
  VALID_PHASES
};

// Re-export from sub-modules
export * from './phase-config.js';
export * from './sd-queries.js';
export * from './subagent-selection.js';
export * from './execution.js';
export * from './result-aggregation.js';
