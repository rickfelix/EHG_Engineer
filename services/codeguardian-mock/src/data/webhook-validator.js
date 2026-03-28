import {
  VALID_EVENT_TYPES, VALID_PIPELINE_STATUSES, VALID_CONCLUSIONS,
  VALID_SCAN_TYPES, VALID_SCAN_STATUSES, REQUIRED_FIELDS
} from './webhook-schema.js';

export function validateWebhook(type, entity) {
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

  if (type === 'delivery' && entity.event_type && !VALID_EVENT_TYPES.includes(entity.event_type)) {
    errors.push(`Invalid event_type: ${entity.event_type}. Must be one of: ${VALID_EVENT_TYPES.join(', ')}`);
  }

  if (type === 'pipeline_run') {
    if (entity.status && !VALID_PIPELINE_STATUSES.includes(entity.status)) {
      errors.push(`Invalid status: ${entity.status}. Must be one of: ${VALID_PIPELINE_STATUSES.join(', ')}`);
    }
    if (entity.conclusion && !VALID_CONCLUSIONS.includes(entity.conclusion)) {
      errors.push(`Invalid conclusion: ${entity.conclusion}. Must be one of: ${VALID_CONCLUSIONS.join(', ')}`);
    }
  }

  if (type === 'scan_event') {
    if (entity.scan_type && !VALID_SCAN_TYPES.includes(entity.scan_type)) {
      errors.push(`Invalid scan_type: ${entity.scan_type}. Must be one of: ${VALID_SCAN_TYPES.join(', ')}`);
    }
    if (entity.status && !VALID_SCAN_STATUSES.includes(entity.status)) {
      errors.push(`Invalid status: ${entity.status}. Must be one of: ${VALID_SCAN_STATUSES.join(', ')}`);
    }
    if (entity.findings_count !== undefined && typeof entity.findings_count !== 'number') {
      errors.push(`findings_count must be a number, got: ${typeof entity.findings_count}`);
    }
  }

  return { valid: errors.length === 0, errors };
}
