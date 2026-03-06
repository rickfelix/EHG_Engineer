/**
 * Exercise Runner
 *
 * Runs a mental model's exercise template through LLM to generate
 * structured analysis output. Each model has an exercise_template
 * with a prompt and variable interpolation.
 *
 * Part of SD-LEO-FEAT-MENTAL-MODELS-REPOSITORY-001
 */

const EXERCISE_TIMEOUT_MS = 15000;

/**
 * Run a mental model exercise for a given venture context.
 *
 * @param {Object} params
 * @param {Object} params.model - Mental model object (from selectModels)
 * @param {Object} params.ventureContext - Venture data for variable interpolation
 * @param {Object} deps - Dependencies
 * @param {Object} deps.llmClient - LLM client with .complete() method
 * @param {Object} [deps.logger] - Logger
 * @returns {Promise<Object|null>} Exercise output or null on failure
 */
export async function runExercise({ model, ventureContext }, deps = {}) {
  const { llmClient, logger = console } = deps;

  if (!llmClient || !model?.exercise_template) {
    return null;
  }

  try {
    const prompt = interpolateTemplate(model.exercise_template.prompt, ventureContext);

    const result = await Promise.race([
      llmClient.complete('', prompt, { max_tokens: 4096, timeout: EXERCISE_TIMEOUT_MS }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Exercise timeout')), EXERCISE_TIMEOUT_MS)
      ),
    ]);

    const content = typeof result === 'string' ? result : result?.content || result?.text || '';

    return {
      model_id: model.id,
      model_name: model.name,
      raw_output: content,
      template_used: model.exercise_template.prompt?.substring(0, 200),
      completed_at: new Date().toISOString(),
    };
  } catch (err) {
    logger.warn(`   Mental models: Exercise failed for ${model.name}: ${err.message}`);
    return null;
  }
}

/**
 * Interpolate template variables with venture context values.
 * Variables use {{variable_name}} syntax.
 *
 * @param {string} template - Template string with {{variables}}
 * @param {Object} context - Key-value pairs for interpolation
 * @returns {string} Interpolated string
 */
function interpolateTemplate(template, context) {
  if (!template || !context) return template || '';

  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = context[key];
    if (value === undefined || value === null) return match;
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  });
}
