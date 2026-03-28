import { VALID_STATUSES, VALID_SEVERITIES, REQUIRED_FIELDS } from './schema.js';

export function validate(type, entity) {
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

  if (type === 'repository' && entity.status && !VALID_STATUSES.includes(entity.status)) {
    errors.push(`Invalid status: ${entity.status}. Must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  if (type === 'finding' && entity.severity && !VALID_SEVERITIES.includes(entity.severity)) {
    errors.push(`Invalid severity: ${entity.severity}. Must be one of: ${VALID_SEVERITIES.join(', ')}`);
  }

  if (type === 'finding' && entity.line !== undefined && typeof entity.line !== 'number') {
    errors.push(`line must be a number, got: ${typeof entity.line}`);
  }

  return { valid: errors.length === 0, errors };
}
