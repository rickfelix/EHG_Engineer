/**
 * Phase Model Configuration
 * Loads model routing configuration from JSON with Proxy-based access
 *
 * Extracted from sub-agent-executor.js for modularity
 * SD-LEO-REFACTOR-SUBAGENT-EXEC-001
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Phase model configuration loader
 * Loads from config/phase-model-config.json with fallback for backwards compatibility
 */
let _phaseModelConfigCache = null;

export function loadPhaseModelConfig() {
  if (_phaseModelConfigCache) return _phaseModelConfigCache;
  try {
    const configPath = join(__dirname, '..', '..', 'config', 'phase-model-config.json');
    const configData = JSON.parse(readFileSync(configPath, 'utf-8'));

    // Convert JSON format to simple effort/model strings (supports both .effort and .model for backward compat)
    const convertPhase = (phaseConfig) => {
      const result = {};
      for (const [key, value] of Object.entries(phaseConfig)) {
        if (key.startsWith('_')) continue; // Skip metadata keys
        result[key] = value.effort || value.model;
      }
      return result;
    };

    const convertDefaults = (defaults) => {
      const result = {};
      for (const [key, value] of Object.entries(defaults)) {
        if (key.startsWith('_')) continue;
        result[key] = value.effort || value.model;
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
export const PHASE_MODEL_OVERRIDES = new Proxy({}, {
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

/**
 * Default model assignments (used when phase is unknown or for ad-hoc runs)
 * NOTE: Configuration loaded from config/phase-model-config.json
 */
export const DEFAULT_MODEL_ASSIGNMENTS = new Proxy({}, {
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
export const SUB_AGENT_CATEGORY_MAPPING = new Proxy({}, {
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
