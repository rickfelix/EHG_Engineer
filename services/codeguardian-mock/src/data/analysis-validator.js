import {
  VALID_ANALYSIS_STATUSES, VALID_SEVERITIES, VALID_FINDING_TYPES,
  VALID_METRIC_TYPES, REQUIRED_FIELDS
} from './analysis-schema.js';

export function validateAnalysis(type, entity) {
  const errors = [];
  const required = REQUIRED_FIELDS[type];
  if (!required) {
    return { valid: false, errors: [`Unknown entity type: ${type}`] };
  }

  for (const field of required) {
    if (entity[field] === undefined || entity[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (type === 'analysis' && entity.status && !VALID_ANALYSIS_STATUSES.includes(entity.status)) {
    errors.push(`Invalid status: ${entity.status}. Must be one of: ${VALID_ANALYSIS_STATUSES.join(', ')}`);
  }

  if (type === 'finding') {
    if (entity.severity && !VALID_SEVERITIES.includes(entity.severity)) {
      errors.push(`Invalid severity: ${entity.severity}. Must be one of: ${VALID_SEVERITIES.join(', ')}`);
    }
    if (entity.finding_type && !VALID_FINDING_TYPES.includes(entity.finding_type)) {
      errors.push(`Invalid finding_type: ${entity.finding_type}. Must be one of: ${VALID_FINDING_TYPES.join(', ')}`);
    }
    if (entity.line_number !== undefined && typeof entity.line_number !== 'number') {
      errors.push(`line_number must be a number, got: ${typeof entity.line_number}`);
    }
  }

  if (type === 'metric') {
    if (entity.metric_type && !VALID_METRIC_TYPES.includes(entity.metric_type)) {
      errors.push(`Invalid metric_type: ${entity.metric_type}. Must be one of: ${VALID_METRIC_TYPES.join(', ')}`);
    }
    if (entity.value !== undefined && typeof entity.value !== 'number') {
      errors.push(`value must be a number, got: ${typeof entity.value}`);
    }
  }

  return { valid: errors.length === 0, errors };
}
