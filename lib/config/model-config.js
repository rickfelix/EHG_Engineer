/**
 * Centralized LLM Model Configuration
 *
 * Single source of truth for model versions across the codebase.
 * Eliminates hardcoded model names and provides environment variable overrides.
 *
 * Usage:
 *   const { getOpenAIModel, getClaudeModel } = require('../lib/config/model-config');
 *   const model = getOpenAIModel('validation'); // Returns configured model for validation purpose
 *
 * Environment Variables (optional overrides):
 *   OPENAI_MODEL - Default OpenAI model for all purposes
 *   OPENAI_MODEL_VALIDATION - Override for validation tasks
 *   OPENAI_MODEL_CLASSIFICATION - Override for classification tasks
 *   OPENAI_MODEL_GENERATION - Override for content generation
 *   OPENAI_MODEL_FAST - Override for fast/cheap operations
 *   OPENAI_MODEL_VISION - Override for image analysis
 *   CLAUDE_MODEL - Default Claude model for all purposes
 *   CLAUDE_MODEL_VALIDATION - Override for validation tasks
 *   CLAUDE_MODEL_CLASSIFICATION - Override for classification tasks
 *   CLAUDE_MODEL_GENERATION - Override for content generation
 *   CLAUDE_MODEL_FAST - Override for fast/cheap operations
 *
 * @module lib/config/model-config
 * @see docs/reference/MODEL-VERSION-UPGRADE-RUNBOOK.md
 */

/**
 * Default model configurations by purpose
 * Update these when new model versions are released
 */
const MODEL_DEFAULTS = {
  openai: {
    validation: 'gpt-5.2',           // SD/PRD/quality validation
    classification: 'gpt-5.2',       // Type classification, categorization (BL-INF-2337D: gpt-5-mini doesn't support temperature)
    generation: 'gpt-5.2',           // Content generation, PRD writing
    fast: 'gpt-5-mini',              // Quick operations, low latency needed
    vision: 'gpt-4o',                // Image/screenshot analysis
  },
  claude: {
    validation: 'claude-sonnet-4-20250514',
    classification: 'claude-haiku-3-5-20241022',
    generation: 'claude-opus-4-5-20251101',
    fast: 'claude-haiku-3-5-20241022',
  },
  google: {
    validation: 'gemini-2.5-pro',
    classification: 'gemini-2.5-flash',
    generation: 'gemini-2.5-pro',
    fast: 'gemini-2.5-flash',
  }
};

/**
 * Environment variable names for overrides
 */
const ENV_VARS = {
  openai: {
    default: 'OPENAI_MODEL',
    validation: 'OPENAI_MODEL_VALIDATION',
    classification: 'OPENAI_MODEL_CLASSIFICATION',
    generation: 'OPENAI_MODEL_GENERATION',
    fast: 'OPENAI_MODEL_FAST',
    vision: 'OPENAI_MODEL_VISION',
  },
  claude: {
    default: 'CLAUDE_MODEL',
    validation: 'CLAUDE_MODEL_VALIDATION',
    classification: 'CLAUDE_MODEL_CLASSIFICATION',
    generation: 'CLAUDE_MODEL_GENERATION',
    fast: 'CLAUDE_MODEL_FAST',
  },
  google: {
    default: 'GEMINI_MODEL',
    validation: 'GEMINI_MODEL_VALIDATION',
    classification: 'GEMINI_MODEL_CLASSIFICATION',
    generation: 'GEMINI_MODEL_GENERATION',
    fast: 'GEMINI_MODEL_FAST',
  }
};

/**
 * Valid model purposes for validation
 */
const VALID_PURPOSES = ['validation', 'classification', 'generation', 'fast', 'vision'];

/**
 * Models that do NOT support temperature parameter (only support temperature=1)
 * BL-INF-2337D: gpt-5-mini returns 400 error if temperature != 1
 */
const MODELS_WITHOUT_TEMPERATURE_SUPPORT = [
  'gpt-5-mini',
  'gpt-4o-mini', // Older mini model, same limitation
];

/**
 * Get the configured OpenAI model for a specific purpose
 *
 * Priority order:
 * 1. Purpose-specific env var (e.g., OPENAI_MODEL_VALIDATION)
 * 2. Default env var (OPENAI_MODEL)
 * 3. Hardcoded default for purpose
 *
 * @param {string} purpose - The purpose: 'validation', 'classification', 'generation', 'fast', 'vision'
 * @returns {string} The model identifier
 * @throws {Error} If purpose is invalid
 *
 * @example
 * const model = getOpenAIModel('validation'); // 'gpt-5.2' or env override
 * const fastModel = getOpenAIModel('fast');   // 'gpt-5-mini' or env override
 */
function getOpenAIModel(purpose = 'validation') {
  if (!VALID_PURPOSES.includes(purpose)) {
    throw new Error(`Invalid purpose: ${purpose}. Valid purposes: ${VALID_PURPOSES.join(', ')}`);
  }

  // Check purpose-specific env var first
  const purposeEnvVar = ENV_VARS.openai[purpose];
  if (purposeEnvVar && process.env[purposeEnvVar]) {
    return process.env[purposeEnvVar];
  }

  // Fall back to default env var
  if (process.env[ENV_VARS.openai.default]) {
    return process.env[ENV_VARS.openai.default];
  }

  // Fall back to hardcoded default
  return MODEL_DEFAULTS.openai[purpose] || MODEL_DEFAULTS.openai.validation;
}

/**
 * Get the configured Claude model for a specific purpose
 *
 * Priority order:
 * 1. Purpose-specific env var (e.g., CLAUDE_MODEL_VALIDATION)
 * 2. Default env var (CLAUDE_MODEL)
 * 3. Hardcoded default for purpose
 *
 * @param {string} purpose - The purpose: 'validation', 'classification', 'generation', 'fast'
 * @returns {string} The model identifier
 * @throws {Error} If purpose is invalid
 *
 * @example
 * const model = getClaudeModel('generation'); // 'claude-opus-4-5-20251101' or env override
 */
function getClaudeModel(purpose = 'validation') {
  const validClaudePurposes = VALID_PURPOSES.filter(p => p !== 'vision');
  if (!validClaudePurposes.includes(purpose)) {
    throw new Error(`Invalid purpose: ${purpose}. Valid Claude purposes: ${validClaudePurposes.join(', ')}`);
  }

  // Check purpose-specific env var first
  const purposeEnvVar = ENV_VARS.claude[purpose];
  if (purposeEnvVar && process.env[purposeEnvVar]) {
    return process.env[purposeEnvVar];
  }

  // Fall back to default env var
  if (process.env[ENV_VARS.claude.default]) {
    return process.env[ENV_VARS.claude.default];
  }

  // Fall back to hardcoded default
  return MODEL_DEFAULTS.claude[purpose] || MODEL_DEFAULTS.claude.validation;
}

/**
 * Get the configured Google/Gemini model for a specific purpose
 *
 * Priority order:
 * 1. Purpose-specific env var (e.g., GEMINI_MODEL_VALIDATION)
 * 2. Default env var (GEMINI_MODEL)
 * 3. Hardcoded default for purpose
 *
 * @param {string} purpose - The purpose: 'validation', 'classification', 'generation', 'fast'
 * @returns {string} The model identifier
 */
function getGoogleModel(purpose = 'validation') {
  const validGooglePurposes = VALID_PURPOSES.filter(p => p !== 'vision');
  if (!validGooglePurposes.includes(purpose)) {
    return MODEL_DEFAULTS.google.validation;
  }

  // Check purpose-specific env var first
  const purposeEnvVar = ENV_VARS.google[purpose];
  if (purposeEnvVar && process.env[purposeEnvVar]) {
    return process.env[purposeEnvVar];
  }

  // Fall back to default env var
  if (process.env[ENV_VARS.google.default]) {
    return process.env[ENV_VARS.google.default];
  }

  // Fall back to hardcoded default
  return MODEL_DEFAULTS.google[purpose] || MODEL_DEFAULTS.google.validation;
}

/**
 * Get all current model configurations (useful for debugging/logging)
 *
 * @returns {Object} Current effective model configurations
 */
function getAllModels() {
  return {
    openai: {
      validation: getOpenAIModel('validation'),
      classification: getOpenAIModel('classification'),
      generation: getOpenAIModel('generation'),
      fast: getOpenAIModel('fast'),
      vision: getOpenAIModel('vision'),
    },
    claude: {
      validation: getClaudeModel('validation'),
      classification: getClaudeModel('classification'),
      generation: getClaudeModel('generation'),
      fast: getClaudeModel('fast'),
    },
    google: {
      validation: getGoogleModel('validation'),
      classification: getGoogleModel('classification'),
      generation: getGoogleModel('generation'),
      fast: getGoogleModel('fast'),
    }
  };
}

/**
 * Check if a model supports temperature parameter
 * BL-INF-2337D: Some models (like gpt-5-mini) only support temperature=1
 *
 * @param {string} model - The model identifier
 * @returns {boolean} True if the model supports custom temperature values
 *
 * @example
 * if (supportsTemperature(model)) {
 *   options.temperature = 0;
 * }
 */
function _supportsTemperature(model) {
  return !MODELS_WITHOUT_TEMPERATURE_SUPPORT.some(m => model.includes(m));
}

/**
 * Log current model configuration (useful at startup)
 */
function logModelConfig() {
  const models = getAllModels();
  console.log('LLM Model Configuration:');
  console.log('  OpenAI:');
  Object.entries(models.openai).forEach(([purpose, model]) => {
    const envOverride = process.env[ENV_VARS.openai[purpose]] ? ' (env)' : '';
    console.log(`    ${purpose}: ${model}${envOverride}`);
  });
  console.log('  Claude:');
  Object.entries(models.claude).forEach(([purpose, model]) => {
    const envOverride = process.env[ENV_VARS.claude[purpose]] ? ' (env)' : '';
    console.log(`    ${purpose}: ${model}${envOverride}`);
  });
  console.log('  Google:');
  Object.entries(models.google).forEach(([purpose, model]) => {
    const envOverride = process.env[ENV_VARS.google[purpose]] ? ' (env)' : '';
    console.log(`    ${purpose}: ${model}${envOverride}`);
  });
}

// ES Module exports (primary)
export {
  getOpenAIModel,
  getClaudeModel,
  getGoogleModel,
  getAllModels,
  logModelConfig,
  MODEL_DEFAULTS,
  ENV_VARS,
  VALID_PURPOSES,
};

// Default export for convenience
export default {
  getOpenAIModel,
  getClaudeModel,
  getGoogleModel,
  getAllModels,
  logModelConfig,
  MODEL_DEFAULTS,
  ENV_VARS,
  VALID_PURPOSES,
};
