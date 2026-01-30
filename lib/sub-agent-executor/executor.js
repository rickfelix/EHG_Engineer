/**
 * Sub-Agent Executor
 * Main execution logic for sub-agents with Task Contract support
 *
 * Extracted from sub-agent-executor.js for modularity
 * SD-LEO-REFACTOR-SUBAGENT-EXEC-001
 */

import {
  USE_TASK_CONTRACTS,
  INSTRUCTION_ARTIFACT_THRESHOLD,
  VALIDATION_SCORE_THRESHOLD,
  ENABLE_FULL_VALIDATION
} from './constants.js';
import { getSupabaseClient } from './supabase-client.js';
import { resolveSdKeyToUUID } from './sd-resolver.js';
import { getModelForAgentAndPhase } from './model-routing.js';
import { loadSubAgentInstructions } from './instruction-loader.js';
import { storeSubAgentResults, storeValidationResults } from './results-storage.js';
import {
  createTaskContract,
  completeTaskContract,
  createArtifact
} from '../artifact-tools.js';
import { validateSubAgentOutput, HallucinationLevel } from '../validation/hallucination-check.js';

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

  console.log(`\nExecuting sub-agent: ${code} for ${sdId}`);
  console.log('Options:', { ...options, useContract });

  let taskContract = null;
  let inputArtifacts = [];

  try {
    // Step 0a: Resolve SD key to UUID for foreign key operations
    const resolved = await resolveSdKeyToUUID(sdId);
    const sdUUID = resolved?.uuid || null;
    const sdKey = resolved?.sd_key || sdId;

    if (!resolved) {
      console.log(`   Warning: Could not resolve SD ${sdId} - database operations may fail`);
    } else {
      console.log(`   Resolved: ${sdKey} -> ${sdUUID}`);
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
      console.log(`   SD Phase: ${sdPhase}`);
    }
    console.log(`   Recommended model: ${recommendedModel}`);

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
      console.log(`\nCreating task contract for ${code}...`);

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
          console.log(`   Stored instructions as artifact: ${instructionArtifact.artifact_id} (${instructionArtifact.token_count} tokens)`);
        } catch (artifactError) {
          console.log(`   Warning: Failed to store instructions as artifact: ${artifactError.message}`);
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

        console.log(`   Task contract created: ${taskContract.contract_id}`);
        console.log(`   ${taskContract.summary}`);

        // Attach contract info to subAgent for module access
        subAgent.taskContract = taskContract;
      } catch (contractError) {
        console.log(`   Warning: Failed to create task contract: ${contractError.message}`);
        console.log('   Falling back to inline context mode');
        // Continue without contract - will use traditional inline context
      }
    }

    // Step 3: Display instructions for Claude to read
    // If contract was created, show compact summary; otherwise show full instructions
    if (taskContract) {
      console.log('\n────────────────────────────────────────────────────────────────');
      console.log(`TASK CONTRACT: ${taskContract.contract_id}`);
      console.log('────────────────────────────────────────────────────────────────');
      console.log(`Target: ${code} | SD: ${sdKey} | Phase: ${normalizedPhase || 'unknown'}`);
      console.log(`Model: ${recommendedModel} | Priority: ${subAgent.priority || 50}`);
      if (inputArtifacts.length > 0) {
        console.log(`Input Artifacts: ${inputArtifacts.length} (${inputArtifacts.join(', ')})`);
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
      const modulePath = `../sub-agents/${code.toLowerCase()}.js`;
      const subAgentModule = await import(modulePath);

      if (subAgentModule.execute) {
        console.log(`\nExecuting ${code} module logic...`);
        // Pass contract info in options if available
        // Also pass sdKey for display purposes
        const execOptions = taskContract
          ? { ...options, taskContract, inputArtifacts, sdKey, sdUUID }
          : { ...options, sdKey, sdUUID };

        // SD-LEO-INFRA-HARDENING-001: Timeout wrapper (60s default, configurable)
        const timeoutMs = options.timeout || 60000;
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Sub-agent ${code} timed out after ${timeoutMs}ms`)), timeoutMs)
        );

        // Pass sdUUID for database operations (foreign keys expect UUID)
        results = await Promise.race([
          subAgentModule.execute(sdUUID || sdId, subAgent, execOptions),
          timeoutPromise
        ]);
      } else {
        console.log(`\nWarning: No execute() function in ${code} module`);
        results = {
          verdict: 'PENDING',
          confidence: 50,
          message: `${code} module loaded but no execute() function found`,
          recommendations: ['Implement execute() function in module']
        };
      }
    } catch {
      console.log(`\nWarning: No module found for ${code}, using manual mode`);
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

      console.log('\nRunning hallucination detection (' + validationLevels.join(', ') + ')...');

      // LEO v4.4.3: Get branch context for branch-aware file validation
      // Files may exist on feature branch but not on main/HEAD
      let branchContext = null;
      try {
        const { resolveBranch } = await import('../../scripts/lib/branch-resolver.js');
        const supabaseForBranch = await getSupabaseClient();
        // Use sdUUID (full SD ID like SD-EVAL-MATRIX-001) not sdKey (short key like EVAL-MATRIX-001)
        const branchResult = await resolveBranch(supabaseForBranch, sdUUID || sdId, { verbose: false, autoStore: false });
        if (branchResult.success) {
          branchContext = {
            branch: branchResult.branch,
            repoPath: branchResult.repoPath
          };
          console.log(`   Branch context: ${branchResult.branch}`);
        }
      } catch (branchError) {
        // Branch resolution is optional, continue without it
        console.log(`   Warning: Branch resolution skipped: ${branchError.message}`);
      }

      const hallucinationCheck = await validateSubAgentOutput(results, {
        baseDir: process.cwd(),
        levels: validationLevels,
        autoLoadTables: true, // LEO v4.4: Auto-load tables from database
        branchContext // LEO v4.4.3: Branch-aware file validation
      });

      results.hallucination_check = hallucinationCheck;
      const validationDuration = Date.now() - validationStartTime;

      if (hallucinationCheck.passed) {
        console.log(`   Hallucination check: PASS (Score: ${hallucinationCheck.score}/100)`);
      } else {
        console.log(`   Warning: Hallucination check: ISSUES DETECTED (Score: ${hallucinationCheck.score}/100)`);
        if (hallucinationCheck.file_references.invalid.length > 0) {
          console.log(`   Invalid files: ${hallucinationCheck.file_references.invalid.map(f => f.path).join(', ')}`);
        }
        if (hallucinationCheck.table_references.unknown && hallucinationCheck.table_references.unknown.length > 0) {
          console.log(`   Unknown tables: ${hallucinationCheck.table_references.unknown.join(', ')}`);
        }
        if (hallucinationCheck.code_snippets && hallucinationCheck.code_snippets.invalid.length > 0) {
          console.log(`   Syntax errors: ${hallucinationCheck.code_snippets.invalid.length} code snippet(s)`);
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
      console.log(`   Warning: Hallucination check failed: ${hallucinationError.message}`);
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
        console.log(`   Contract completed: ${contractResult?.message || 'done'}`);
      } catch (completeError) {
        console.log(`   Warning: Failed to complete contract: ${completeError.message}`);
      }
    }

    // Step 7: Store results in database
    // Pass sdUUID for foreign key, sdKey for display/metadata
    const stored = await storeSubAgentResults(code, sdUUID, subAgent, results, { sdKey });

    console.log(`\n${code} execution complete (${executionTime}ms)`);
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
    console.error(`\n${code} execution failed:`, error.message);

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
