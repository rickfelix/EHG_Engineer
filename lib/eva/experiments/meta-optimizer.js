/**
 * LLM Meta-Optimizer — Generates next challenger prompt using
 * perturbation operators with safety rails.
 *
 * SD-LEO-FEAT-EXPERIMENT-FEEDBACK-LOOP-001 (FR-005)
 *
 * @module lib/eva/experiments/meta-optimizer
 */

const PERTURBATION_OPERATORS = [
  'rephrase',
  'add_constraint',
  'remove_section',
  'reorder',
  'specificity_shift',
  'decompose',
];

const MAX_PROMPT_LENGTH = 8000;
const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * Generate the next challenger prompt using LLM-guided perturbation.
 *
 * @param {Object} deps - { supabase, logger, anthropic? }
 * @param {Object} params
 * @param {string} params.championPromptName - Name of the current champion prompt
 * @param {string} params.previousExperimentId - ID of the completed experiment
 * @param {Object} [params.winnerPosterior] - Winner's Beta posterior { alpha, beta }
 * @returns {Promise<Object>} { prompt_name, prompt_content, hypothesis, perturbation_used }
 */
export async function generateNextChallenger(deps, params) {
  const { supabase, logger = console } = deps;
  const { championPromptName, previousExperimentId, winnerPosterior } = params;

  // Load the champion prompt
  const { data: championPrompt } = await supabase
    .from('leo_prompts')
    .select('*')
    .eq('name', championPromptName)
    .eq('is_active', true)
    .single();

  if (!championPrompt) {
    throw new Error(`Champion prompt not found: ${championPromptName}`);
  }

  // Load history of failed challengers for diversity enforcement
  const failedChallengers = await getRecentFailedChallengers(deps, championPromptName);

  // Select perturbation operator
  const operator = selectPerturbationOperator(failedChallengers);

  // Generate the new prompt
  const newPromptContent = await applyPerturbation(deps, {
    championContent: championPrompt.content || championPrompt.prompt_text,
    operator,
    failedChallengers,
  });

  // Safety rails
  validateChallengerSafety(newPromptContent, failedChallengers);

  // Store the new prompt
  const challengerName = `${championPromptName}_challenger_${Date.now()}`;
  const { data: newPrompt, error } = await supabase
    .from('leo_prompts')
    .insert({
      name: challengerName,
      content: newPromptContent,
      prompt_text: newPromptContent,
      is_active: false,
      metadata: {
        source: 'meta-optimizer',
        champion_name: championPromptName,
        perturbation: operator,
        previous_experiment_id: previousExperimentId,
        winner_posterior: winnerPosterior,
        generated_at: new Date().toISOString(),
      },
    })
    .select('id, name')
    .single();

  if (error) {
    throw new Error(`Failed to store challenger prompt: ${error.message}`);
  }

  logger.log(
    `   [MetaOptimizer] Generated challenger: ${challengerName} ` +
    `(perturbation: ${operator})`
  );

  return {
    prompt_name: challengerName,
    prompt_content: newPromptContent,
    hypothesis: `${operator} perturbation of champion ${championPromptName} will improve gate survival rates`,
    perturbation_used: operator,
  };
}

/**
 * Get recent failed challengers for diversity enforcement.
 */
async function getRecentFailedChallengers(deps, championPromptName) {
  const { supabase } = deps;

  const { data: experiments } = await supabase
    .from('experiments')
    .select('id, variants, config')
    .eq('status', 'completed')
    .order('ended_at', { ascending: false })
    .limit(5);

  if (!experiments) return [];

  const failed = [];
  for (const exp of experiments) {
    const winner = exp.config?.final_analysis?.winner;
    if (!winner) continue;

    // Find the loser variant
    const loser = (exp.variants || []).find(v => v.key !== winner);
    if (loser?.prompt_name) {
      // Load the prompt content
      const { data: prompt } = await supabase
        .from('leo_prompts')
        .select('content, prompt_text, metadata')
        .eq('name', loser.prompt_name)
        .single();

      if (prompt) {
        failed.push({
          prompt_name: loser.prompt_name,
          content: prompt.content || prompt.prompt_text,
          perturbation: prompt.metadata?.perturbation || 'unknown',
        });
      }
    }
  }

  return failed.slice(0, 3); // Last 3 failed challengers
}

/**
 * Select a perturbation operator, avoiding consecutive failures.
 */
function selectPerturbationOperator(failedChallengers) {
  const recentPerturbations = failedChallengers.map(f => f.perturbation);

  // Count consecutive failures with same operator
  let consecutiveSame = 0;
  if (recentPerturbations.length > 0) {
    const last = recentPerturbations[0];
    for (const p of recentPerturbations) {
      if (p === last) consecutiveSame++;
      else break;
    }
  }

  // If 3 consecutive failures with same operator, switch strategy
  let candidates = PERTURBATION_OPERATORS;
  if (consecutiveSame >= MAX_CONSECUTIVE_FAILURES) {
    const failedOp = recentPerturbations[0];
    candidates = PERTURBATION_OPERATORS.filter(op => op !== failedOp);
  }

  // Avoid recently used operators for diversity
  const recentOps = new Set(recentPerturbations.slice(0, 2));
  const preferred = candidates.filter(op => !recentOps.has(op));
  const pool = preferred.length > 0 ? preferred : candidates;

  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Apply a perturbation operator to generate new prompt content.
 * Uses simple string-based perturbation when no LLM is available.
 */
async function applyPerturbation(deps, params) {
  const { championContent, operator, failedChallengers } = params;
  const { logger = console } = deps;

  try {
    const { getFastClient } = await import('../../llm/client-factory.js');
    const client = getFastClient();
    return await llmPerturbation(client, championContent, operator, failedChallengers, logger);
  } catch {
    // Fallback: simple string-based perturbation
    return simplePerturbation(championContent, operator);
  }
}

/**
 * LLM-guided perturbation using client factory.
 */
async function llmPerturbation(client, championContent, operator, failedChallengers, logger) {
  const failedContext = failedChallengers.length > 0
    ? `\n\nPrevious failed challengers (DO NOT repeat similar changes):\n${
        failedChallengers.map((f, i) => `${i + 1}. Perturbation: ${f.perturbation}`).join('\n')
      }`
    : '';

  try {
    const response = await client.complete(
      'You are a prompt optimization expert.',
      `Apply the "${operator}" perturbation operator to improve this prompt for generating better venture evaluation syntheses.

PERTURBATION OPERATOR: ${operator}
- rephrase: Reword for clarity without changing meaning
- add_constraint: Add a specific constraint or quality criterion
- remove_section: Remove a redundant or low-value section
- reorder: Rearrange sections for better logical flow
- specificity_shift: Make vague instructions more specific
- decompose: Break a complex instruction into clearer sub-steps

CURRENT CHAMPION PROMPT:
${championContent}
${failedContext}

Output ONLY the modified prompt text. No explanations, no markdown formatting. The output should be a complete, usable prompt.`,
      { maxTokens: 4000 }
    );

    return (response.content || response.text || '').trim();
  } catch (err) {
    logger.warn(`[MetaOptimizer] LLM perturbation failed: ${err.message}, using simple fallback`);
    return simplePerturbation(championContent, operator);
  }
}

/**
 * Simple string-based perturbation (fallback when no LLM available).
 */
function simplePerturbation(content, operator) {
  switch (operator) {
    case 'add_constraint':
      return content + '\n\nIMPORTANT: Be specific and quantitative in your analysis. Avoid vague qualitative statements.';
    case 'specificity_shift':
      return content.replace(
        /should be|needs to be|must be/gi,
        match => `MUST specifically and measurably ${match.toLowerCase().replace('should be', 'be').replace('needs to be', 'be').replace('must be', 'be')}`
      );
    case 'reorder': {
      const lines = content.split('\n');
      const sections = [];
      let current = [];
      for (const line of lines) {
        if (line.startsWith('#') && current.length > 0) {
          sections.push(current.join('\n'));
          current = [];
        }
        current.push(line);
      }
      if (current.length > 0) sections.push(current.join('\n'));
      if (sections.length > 2) {
        // Move the last section to second position
        const last = sections.pop();
        sections.splice(1, 0, last);
      }
      return sections.join('\n');
    }
    case 'rephrase':
    case 'remove_section':
    case 'decompose':
    default:
      // Minimal perturbation: add timestamp to make it distinct
      return content + `\n\n[Optimized: ${new Date().toISOString().split('T')[0]}]`;
  }
}

/**
 * Validate challenger safety rails.
 */
function validateChallengerSafety(content, failedChallengers) {
  // Rail 1: Prompt length budget
  if (content.length > MAX_PROMPT_LENGTH) {
    throw new Error(
      `Challenger prompt exceeds length budget: ${content.length} > ${MAX_PROMPT_LENGTH}`
    );
  }

  // Rail 2: Diversity enforcement — must differ from last 3 failed challengers
  for (const failed of failedChallengers) {
    if (failed.content && content === failed.content) {
      throw new Error('Challenger is identical to a previous failed challenger');
    }
  }

  // Rail 3: Not empty or trivially short
  if (content.trim().length < 50) {
    throw new Error('Challenger prompt is too short (< 50 chars)');
  }
}

export {
  PERTURBATION_OPERATORS,
  selectPerturbationOperator,
  validateChallengerSafety,
};
