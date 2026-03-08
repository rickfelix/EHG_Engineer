/**
 * Roadmap Taxonomy Module
 * SD: SD-LEO-FEAT-STRATEGIC-ROADMAP-ARTIFACT-001-B
 *
 * Pure data module: Status enums, source types, validation functions,
 * and SQL constraint builders for the Strategic Roadmap artifact type.
 * No side effects, no database calls.
 */

/** Roadmap status lifecycle */
export const ROADMAP_STATUSES = ['draft', 'active', 'archived'];

/** Wave status lifecycle */
export const WAVE_STATUSES = ['proposed', 'approved', 'active', 'completed', 'archived'];

/** Intake source types that can be assigned to waves */
export const SOURCE_TYPES = ['todoist', 'youtube'];

/** Human-readable labels */
export const ROADMAP_STATUS_LABELS = {
  draft: 'Draft',
  active: 'Active',
  archived: 'Archived',
};

export const WAVE_STATUS_LABELS = {
  proposed: 'Proposed',
  approved: 'Approved',
  active: 'Active',
  completed: 'Completed',
  archived: 'Archived',
};

export const SOURCE_TYPE_LABELS = {
  todoist: 'Todoist Task',
  youtube: 'YouTube Video',
};

/** Valid wave status transitions */
export const WAVE_TRANSITIONS = {
  proposed: ['approved', 'archived'],
  approved: ['active', 'archived'],
  active: ['completed', 'archived'],
  completed: ['archived'],
  archived: [],
};

/**
 * Validate a wave object has required fields and valid values.
 * @param {object} wave - Wave object to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateWave(wave) {
  const errors = [];
  if (!wave) {
    return { valid: false, errors: ['Wave object is required'] };
  }
  if (!wave.title || typeof wave.title !== 'string') {
    errors.push('title is required and must be a string');
  }
  if (wave.sequence_rank == null || typeof wave.sequence_rank !== 'number' || wave.sequence_rank < 0) {
    errors.push('sequence_rank must be a non-negative integer');
  }
  if (wave.status && !WAVE_STATUSES.includes(wave.status)) {
    errors.push(`status must be one of: ${WAVE_STATUSES.join(', ')}`);
  }
  if (wave.confidence_score != null && (wave.confidence_score < 0 || wave.confidence_score > 1)) {
    errors.push('confidence_score must be between 0 and 1');
  }
  if (wave.progress_pct != null && (wave.progress_pct < 0 || wave.progress_pct > 100)) {
    errors.push('progress_pct must be between 0 and 100');
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validate a sequence of waves for ordering consistency.
 * @param {object[]} waves - Array of wave objects with sequence_rank
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateSequence(waves) {
  const errors = [];
  if (!Array.isArray(waves)) {
    return { valid: false, errors: ['Waves must be an array'] };
  }
  const ranks = waves.map(w => w.sequence_rank);
  const uniqueRanks = new Set(ranks);
  if (uniqueRanks.size !== ranks.length) {
    errors.push('Duplicate sequence_rank values detected');
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validate a wave status transition.
 * @param {string} from - Current status
 * @param {string} to - Target status
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateTransition(from, to) {
  if (!WAVE_STATUSES.includes(from)) {
    return { valid: false, error: `Invalid source status: ${from}` };
  }
  if (!WAVE_STATUSES.includes(to)) {
    return { valid: false, error: `Invalid target status: ${to}` };
  }
  if (!WAVE_TRANSITIONS[from].includes(to)) {
    return { valid: false, error: `Cannot transition from ${from} to ${to}. Valid: ${WAVE_TRANSITIONS[from].join(', ')}` };
  }
  return { valid: true };
}

/**
 * Generate SQL constraint value strings for use in migrations.
 * @returns {object} SQL-ready constraint strings
 */
export function getSQLConstraintValues() {
  return {
    roadmap_statuses: ROADMAP_STATUSES.map(s => `'${s}'`).join(', '),
    wave_statuses: WAVE_STATUSES.map(s => `'${s}'`).join(', '),
    source_types: SOURCE_TYPES.map(s => `'${s}'`).join(', '),
  };
}
