#!/usr/bin/env node
/**
 * Board Vetting CLI
 * SD: SD-LEO-SELF-IMPROVE-002C (FR-7)
 * Enhanced: SD-LEO-ORCH-SELF-IMPROVING-LEO-001-B (Multi-Model Debate System)
 *
 * Commands:
 *   check-families --proposer <modelId> --evaluators <id1,id2,id3>
 *   evaluate --proposal-id <id> --proposer-model <modelId> --models <id1,id2,id3>
 *   debate --proposal-id <id>    [NEW] Run multi-model debate
 *   verdict --proposal-id <id>
 *
 * Flags:
 *   --json    Output line-delimited JSON (CI-friendly)
 *
 * Exit Codes:
 *   0 - Success
 *   1 - General error
 *   2 - CONST-002 violation
 *   3 - Verdict not found
 *   4 - Debate failed
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { triggerDebate, getLatestDebate } from '../lib/sub-agents/vetting/debate-orchestrator.js';
import { validateFamilySeparation, getComplianceSummary } from '../lib/sub-agents/vetting/const-002-validator.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Parse CLI arguments
const args = process.argv.slice(2);
const command = args[0];
const isJson = args.includes('--json');

function log(message, data = null) {
  if (isJson) {
    console.log(JSON.stringify({ message, data, timestamp: new Date().toISOString() }));
  } else {
    if (data) {
      console.log(message, data);
    } else {
      console.log(message);
    }
  }
}

function logError(message, error = null) {
  if (isJson) {
    console.error(JSON.stringify({ error: message, details: error?.message, timestamp: new Date().toISOString() }));
  } else {
    console.error('❌', message, error?.message || '');
  }
}

function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1 && args[idx + 1]) {
    return args[idx + 1];
  }
  return null;
}

/**
 * Get model family from database function
 */
async function getModelFamily(modelId) {
  const { data, error } = await supabase.rpc('get_model_family', { p_model_id: modelId });
  if (error) {
    // Fallback to client-side mapping if function doesn't exist
    return getModelFamilyLocal(modelId);
  }
  return data;
}

/**
 * Client-side model family mapping (fallback)
 */
function getModelFamilyLocal(modelId) {
  if (!modelId) return 'unknown';

  const id = modelId.toLowerCase();

  if (/^(claude|anthropic)[-:/_]/.test(id) || /^claude\b/.test(id)) return 'anthropic';
  if (/^(gpt|o\d|openai)[-:/_]/.test(id) || /^text-embedding-/.test(id) || /^gpt\b/.test(id)) return 'openai';
  if (/^(gemini|palm|google)[-:/_]/.test(id) || /^gemini\b/.test(id)) return 'google';
  if (/^(llama|meta)[-:/_]/.test(id) || /^llama\b/.test(id)) return 'meta';
  if (/^(mistral|mixtral)[-:/_]/.test(id) || /^(mixtral|mistral)\b/.test(id)) return 'mistral';

  return 'unknown';
}

/**
 * Check CONST-002 family separation
 */
async function checkFamilies(proposer, evaluators) {
  const proposerFamily = await getModelFamily(proposer);
  const evaluatorFamilies = await Promise.all(evaluators.map(e => getModelFamily(e)));

  const result = {
    proposer: proposer,
    proposer_family: proposerFamily,
    evaluators: evaluators.map((e, i) => ({ model: e, family: evaluatorFamilies[i] })),
    const_002_pass: false,
    violations: []
  };

  // Check proposer is not unknown
  if (proposerFamily === 'unknown') {
    result.violations.push('Proposer model family is unknown');
    return result;
  }

  // Check proposer differs from all evaluators
  const distinctFamilies = new Set();
  for (let i = 0; i < evaluators.length; i++) {
    const evalFamily = evaluatorFamilies[i];

    if (evalFamily === proposerFamily) {
      result.violations.push(`Evaluator ${evaluators[i]} shares family '${evalFamily}' with proposer`);
    }

    if (evalFamily !== 'unknown') {
      distinctFamilies.add(evalFamily);
    }
  }

  // Check at least 2 distinct evaluator families
  if (distinctFamilies.size < 2) {
    result.violations.push(`Need at least 2 distinct evaluator families, found ${distinctFamilies.size}`);
  }

  result.const_002_pass = result.violations.length === 0;
  result.distinct_evaluator_families = Array.from(distinctFamilies);

  return result;
}

/**
 * Get RUBRIC_VERSION from system_settings
 */
async function getRubricVersion() {
  const { data, error } = await supabase
    .from('system_settings')
    .select('value_json')
    .eq('key', 'RUBRIC_VERSION')
    .single();

  if (error || !data) {
    throw new Error('RUBRIC_VERSION not found in system_settings. Run migration first.');
  }

  return data.value_json;
}

/**
 * Create critic assessments for a proposal (legacy mode)
 * @deprecated Use runDebate() for full multi-model debate
 */
async function evaluate(proposalId, proposerModel, evaluatorModels) {
  // Validate RUBRIC_VERSION exists
  let rubricVersion;
  try {
    rubricVersion = await getRubricVersion();
  } catch (e) {
    logError('Failed to get RUBRIC_VERSION', e);
    process.exit(1);
  }

  // Check CONST-002 compliance first using new validator
  const familyValidation = validateFamilySeparation({
    proposerModel,
    evaluators: evaluatorModels.map((model, i) => ({
      persona: ['safety', 'value', 'risk'][i],
      model
    }))
  });

  if (!familyValidation.passed) {
    logError('CONST-002 violation', { violations: familyValidation.violations });
    if (isJson) {
      console.log(JSON.stringify({ const_002_summary: getComplianceSummary(familyValidation) }));
    }
    process.exit(2);
  }

  const personas = ['safety', 'value', 'risk'];
  const assessments = [];

  for (let i = 0; i < personas.length; i++) {
    const persona = personas[i];
    const model = evaluatorModels[i % evaluatorModels.length];
    const family = await getModelFamily(model);

    // In a real implementation, this would call an AI model
    // For now, we create placeholder assessments
    const assessment = {
      improvement_id: proposalId,
      evaluator_model: model,
      critic_persona: persona,
      model_family: family,
      is_board_verdict: false,
      rubric_version: rubricVersion.board || 'board-v1',
      score: 75, // Placeholder - would come from AI evaluation
      recommendation: 'APPROVE', // Placeholder
      reasoning: `${persona} assessment pending AI evaluation`,
      evaluated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('improvement_quality_assessments')
      .insert(assessment)
      .select()
      .single();

    if (error) {
      logError(`Failed to insert ${persona} assessment`, error);
      process.exit(1);
    }

    assessments.push(data);
  }

  log('Evaluations created', {
    proposal_id: proposalId,
    assessments: assessments.map(a => ({
      persona: a.critic_persona,
      model: a.evaluator_model,
      family: a.model_family
    })),
    rubric_version: rubricVersion.board
  });

  return assessments;
}

/**
 * Run multi-model debate for a proposal
 * SD-LEO-ORCH-SELF-IMPROVING-LEO-001-B (FR-1, FR-2)
 */
async function runDebate(proposalId, options = {}) {
  log('Starting multi-model debate', { proposalId });

  try {
    const result = await triggerDebate(proposalId, options);

    if (result.skipped) {
      log('Debate skipped', {
        proposalId,
        reason: result.reason,
        existingDebateId: result.existingDebateId
      });
      return result;
    }

    if (!result.success) {
      logError('Debate failed', {
        debateId: result.debateId,
        error: result.error,
        const002Passed: result.const002Passed
      });
      process.exit(4);
    }

    log('Debate completed', {
      debateId: result.debateId,
      proposalId: result.proposalId,
      finalVerdict: result.finalVerdict,
      finalScore: result.finalScore,
      consensusReached: result.consensusReached,
      roundsCompleted: result.roundsCompleted,
      topIssues: result.topIssues,
      durationMs: result.durationMs
    });

    return result;
  } catch (error) {
    logError('Debate execution failed', error);
    process.exit(4);
  }
}

/**
 * Get debate status for a proposal
 */
async function getDebateStatus(proposalId) {
  try {
    const debate = await getLatestDebate(proposalId);

    if (!debate) {
      log('No debate found', { proposalId });
      return null;
    }

    log('Debate status', {
      debateId: debate.id,
      proposalId: debate.proposal_id,
      status: debate.status,
      finalVerdict: debate.final_verdict,
      finalScore: debate.final_score,
      consensusReached: debate.consensus_reached,
      roundsCompleted: debate.actual_rounds,
      createdAt: debate.created_at,
      completedAt: debate.completed_at
    });

    return debate;
  } catch (error) {
    logError('Failed to get debate status', error);
    process.exit(1);
  }
}

/**
 * Get board verdict for a proposal
 */
async function getVerdict(proposalId) {
  const { data, error } = await supabase
    .from('v_improvement_board_verdicts')
    .select('*')
    .eq('improvement_id', proposalId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      logError('Verdict not found - may need 3 critic assessments');
      process.exit(3);
    }
    logError('Failed to get verdict', error);
    process.exit(1);
  }

  const verdict = {
    proposal_id: proposalId,
    verdict: data.verdict,
    consensus: data.consensus,
    scores: {
      safety: data.safety_score,
      value: data.value_score,
      risk: data.risk_score,
      overall: data.overall_score
    },
    approve_count: data.approve_count,
    reject_count: data.reject_count,
    recommended_risk_tier: data.recommended_risk_tier,
    rubric_version: data.rubric_version
  };

  log('Board verdict', verdict);
  return verdict;
}

/**
 * Main CLI handler
 */
async function main() {
  if (!command) {
    console.log(`
Board Vetting CLI (SD-LEO-SELF-IMPROVE-002C + SD-LEO-ORCH-SELF-IMPROVING-LEO-001-B)

Commands:
  check-families --proposer <modelId> --evaluators <id1,id2,id3>
    Check CONST-002 family separation

  evaluate --proposal-id <id> --proposer-model <modelId> --models <id1,id2,id3>
    Create 3 critic assessments for a proposal (legacy mode)

  debate --proposal-id <id> [--max-rounds <n>]
    Run multi-model debate with 3 AI critics (Anthropic, OpenAI, Google)
    Auto-triggers when proposal status is 'submitted'

  debate-status --proposal-id <id>
    Get latest debate status and results for a proposal

  verdict --proposal-id <id>
    Get board verdict for a proposal

Flags:
  --json         Output line-delimited JSON (CI-friendly)
  --max-rounds   Max debate rounds (default: 3)

Exit Codes:
  0 - Success
  1 - General error
  2 - CONST-002 violation
  3 - Verdict not found
  4 - Debate failed
`);
    process.exit(0);
  }

  switch (command) {
    case 'check-families': {
      const proposer = getArg('proposer');
      const evaluatorsStr = getArg('evaluators');

      if (!proposer || !evaluatorsStr) {
        logError('Missing required arguments: --proposer and --evaluators');
        process.exit(1);
      }

      const evaluators = evaluatorsStr.split(',').map(s => s.trim());
      const result = await checkFamilies(proposer, evaluators);

      log('Family check result', result);

      if (!result.const_002_pass) {
        process.exit(2);
      }
      break;
    }

    case 'evaluate': {
      const proposalId = getArg('proposal-id');
      const proposerModel = getArg('proposer-model');
      const modelsStr = getArg('models');

      if (!proposalId || !proposerModel || !modelsStr) {
        logError('Missing required arguments: --proposal-id, --proposer-model, and --models');
        process.exit(1);
      }

      const models = modelsStr.split(',').map(s => s.trim());
      await evaluate(proposalId, proposerModel, models);
      break;
    }

    case 'debate': {
      const proposalId = getArg('proposal-id');

      if (!proposalId) {
        logError('Missing required argument: --proposal-id');
        process.exit(1);
      }

      const maxRoundsStr = getArg('max-rounds');
      const options = {};
      if (maxRoundsStr) {
        options.maxRounds = parseInt(maxRoundsStr, 10);
      }

      await runDebate(proposalId, options);
      break;
    }

    case 'debate-status': {
      const proposalId = getArg('proposal-id');

      if (!proposalId) {
        logError('Missing required argument: --proposal-id');
        process.exit(1);
      }

      await getDebateStatus(proposalId);
      break;
    }

    case 'verdict': {
      const proposalId = getArg('proposal-id');

      if (!proposalId) {
        logError('Missing required argument: --proposal-id');
        process.exit(1);
      }

      await getVerdict(proposalId);
      break;
    }

    default:
      logError(`Unknown command: ${command}`);
      process.exit(1);
  }
}

main().catch(e => {
  logError('Unexpected error', e);
  process.exit(1);
});
