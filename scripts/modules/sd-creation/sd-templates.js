/**
 * SD template utilities for creating consistent SD data structures
 * Provides builders and validation for strategic directive objects
 */

import { randomUUID } from 'crypto';

/**
 * Create a base SD object with common fields
 * @param {object} options - SD configuration options
 * @returns {object} Base SD data object
 */
export function createBaseSD({
  id,
  sdKey,
  title,
  description,
  category = 'infrastructure',
  priority = 'medium',
  status = 'draft',
  targetApplication = 'EHG',
  currentPhase = 'LEAD',
  sdType = 'implementation',
  parentSdId = null,
  createdBy = 'LEAD',
  version = '1.0'
}) {
  return {
    id,
    sd_key: sdKey || id,
    title,
    description,
    category,
    priority,
    status,
    target_application: targetApplication,
    current_phase: currentPhase,
    sd_type: sdType,
    parent_sd_id: parentSdId,
    created_by: createdBy,
    version,
    uuid_id: randomUUID(),
    phase_progress: 0,
    progress: 0,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

/**
 * Create an orchestrator (parent) SD
 * @param {object} config - Orchestrator configuration
 * @returns {object} Orchestrator SD object
 */
export function createOrchestratorSD({
  id,
  title,
  description,
  rationale,
  scope,
  strategicIntent,
  strategicObjectives = [],
  successCriteria = [],
  keyChanges = [],
  keyPrinciples = [],
  dependencies = [],
  risks = [],
  successMetrics = [],
  implementationGuidelines = [],
  metadata = {},
  ...rest
}) {
  const base = createBaseSD({
    id,
    title,
    description,
    sdType: 'orchestrator',
    priority: 'critical',
    ...rest
  });

  return {
    ...base,
    rationale,
    scope: typeof scope === 'string' ? scope : JSON.stringify(scope),
    strategic_intent: strategicIntent,
    strategic_objectives: strategicObjectives,
    success_criteria: successCriteria,
    key_changes: keyChanges,
    key_principles: keyPrinciples,
    dependencies,
    risks,
    success_metrics: successMetrics,
    implementation_guidelines: implementationGuidelines,
    metadata
  };
}

/**
 * Create a child SD from parent orchestrator
 * @param {object} config - Child SD configuration
 * @returns {object} Child SD object
 */
export function createChildSD({
  id,
  title,
  purpose,
  scope,
  deliverables = [],
  successCriteria = [],
  acceptanceCriteria = [],
  estimatedEffort,
  dependencies = [],
  blocks = [],
  parentSdId,
  rank,
  priority = 'high',
  metadata = {},
  ...rest
}) {
  const base = createBaseSD({
    id,
    title,
    description: purpose,
    parentSdId,
    priority,
    ...rest
  });

  return {
    ...base,
    rationale: `Part of ${parentSdId} orchestrator. ${purpose}`,
    scope: typeof scope === 'string' ? scope : JSON.stringify(scope),
    strategic_intent: purpose,
    strategic_objectives: deliverables.slice(0, 5),
    success_criteria: successCriteria,
    key_changes: deliverables,
    key_principles: ['Part of parent orchestrator'],
    dependencies,
    risks: [],
    success_metrics: successCriteria,
    implementation_guidelines: [
      `Execution rank: ${rank}`,
      `Dependencies: ${dependencies.join(', ') || 'None'}`,
      `Blocks: ${blocks.join(', ') || 'None'}`
    ],
    metadata: {
      parent_sd: parentSdId,
      rank,
      estimated_effort: estimatedEffort,
      acceptance_criteria: acceptanceCriteria,
      deliverables,
      blocks,
      ...metadata
    }
  };
}

/**
 * Create a risk object
 * @param {object} config - Risk configuration
 * @returns {object} Risk object
 */
export function createRisk({
  id,
  description,
  likelihood = 'medium',
  impact = 'medium',
  mitigation,
  severity
}) {
  const riskObj = {
    description,
    mitigation
  };

  if (id) riskObj.id = id;
  if (severity) {
    riskObj.severity = severity;
  } else {
    riskObj.likelihood = likelihood;
    riskObj.impact = impact;
  }

  return riskObj;
}

/**
 * Create a dependency object
 * @param {object} config - Dependency configuration
 * @returns {object} Dependency object
 */
export function createDependency({
  type = 'internal',
  sdId = null,
  description
}) {
  return {
    type,
    sd_id: sdId,
    description
  };
}

/**
 * Create a success metric object
 * @param {object} config - Metric configuration
 * @returns {object} Success metric object
 */
export function createSuccessMetric({
  metric,
  target,
  description
}) {
  return {
    metric,
    target,
    description
  };
}

/**
 * Validate SD object has required fields
 * @param {object} sd - The SD object to validate
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateSD(sd) {
  const errors = [];
  const requiredFields = ['id', 'title', 'description'];

  for (const field of requiredFields) {
    if (!sd[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (sd.id && !sd.id.startsWith('SD-')) {
    errors.push('SD id should start with "SD-"');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Transform array of simplified SD definitions to full SD objects
 * @param {Array<object>} definitions - Array of simplified SD definitions
 * @param {string} parentSdId - Parent SD ID for all children
 * @returns {Array<object>} Array of full SD objects
 */
export function transformChildDefinitions(definitions, parentSdId) {
  return definitions.map((def, index) => createChildSD({
    ...def,
    parentSdId,
    rank: def.rank || index + 1
  }));
}
