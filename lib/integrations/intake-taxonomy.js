/**
 * Intake Taxonomy Module
 * SD: SD-LEO-FEAT-EVA-INTAKE-REDESIGN-003-A
 *
 * Pure data module: Application enum, Aspect maps (per-app), Intent enum,
 * and validation functions. No side effects, no database calls.
 *
 * Replaces the old 2-dimension taxonomy (venture_tag + business_function)
 * with a 3-dimension taxonomy: Application × Aspects × Intent.
 */

/** Dimension 1: Target Application */
export const APPLICATIONS = ['ehg_engineer', 'ehg_app', 'new_venture'];

/** Dimension 2: Aspects (context-sensitive per application) */
export const ASPECTS = {
  ehg_engineer: [
    'leo_protocol',
    'eva_pipeline',
    'sd_lifecycle',
    'tooling_cli',
    'database_schema',
    'testing_quality',
    'ci_cd',
    'documentation',
    'performance',
    'security',
  ],
  ehg_app: [
    'chairman_ui',
    'dashboard',
    'navigation',
    'data_visualization',
    'authentication',
    'notifications',
    'settings',
    'quality_inbox',
    'venture_management',
    'okr_tracking',
  ],
  new_venture: [
    'business_model',
    'market_research',
    'product_design',
    'technology_stack',
    'go_to_market',
    'competitive_analysis',
    'user_research',
    'pricing_strategy',
    'legal_compliance',
    'branding',
  ],
};

/** Dimension 3: Chairman Intent (why the item was captured) */
export const INTENTS = ['idea', 'insight', 'reference', 'question', 'value'];

/** Human-readable labels for display */
export const APPLICATION_LABELS = {
  ehg_engineer: 'EHG Engineer (Backend/Tooling)',
  ehg_app: 'EHG App (Frontend/UI)',
  new_venture: 'New Venture',
};

export const INTENT_LABELS = {
  idea: 'Idea — Something to build or create',
  insight: 'Insight — A realization or pattern worth noting',
  reference: 'Reference — Material to study or revisit later',
  question: 'Question — Something to research or answer',
  value: 'Value — A principle or standard to uphold',
};

/**
 * Get valid aspects for a given application.
 * @param {string} app - One of APPLICATIONS
 * @returns {string[]} Array of valid aspect strings
 */
export function getAspectsForApp(app) {
  return ASPECTS[app] || [];
}

/**
 * Validate a complete classification (all 3 dimensions).
 * @param {string} app - target_application value
 * @param {string[]} aspects - target_aspects array
 * @param {string} intent - chairman_intent value
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateClassification(app, aspects, intent) {
  const errors = [];

  if (!APPLICATIONS.includes(app)) {
    errors.push(`Invalid application: "${app}". Must be one of: ${APPLICATIONS.join(', ')}`);
  }

  if (!Array.isArray(aspects)) {
    errors.push('Aspects must be an array');
  } else if (aspects.length === 0) {
    errors.push('At least one aspect is required');
  } else if (app && ASPECTS[app]) {
    const validAspects = ASPECTS[app];
    const invalid = aspects.filter(a => !validAspects.includes(a));
    if (invalid.length > 0) {
      errors.push(`Invalid aspects for ${app}: ${invalid.join(', ')}. Valid: ${validAspects.join(', ')}`);
    }
  }

  if (!INTENTS.includes(intent)) {
    errors.push(`Invalid intent: "${intent}". Must be one of: ${INTENTS.join(', ')}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Build the CHECK constraint value list for SQL validation.
 * Useful for verifying migration constraints match this module.
 * @returns {{ applications: string, intents: string }}
 */
export function getSQLConstraintValues() {
  return {
    applications: APPLICATIONS.map(a => `'${a}'`).join(', '),
    intents: INTENTS.map(i => `'${i}'`).join(', '),
  };
}
