/**
 * Feedback Resolution Validator
 * SD-FDBK-ENH-ADD-INTELLIGENT-RESOLUTION-001
 *
 * FR-4: Validates terminal status transitions have proper resolution links.
 * Returns structured error objects with stable error codes for 4xx responses.
 *
 * @module lib/quality/feedback-resolution-validator
 */

/**
 * Stable error codes for constraint violations
 */
export const ERROR_CODES = {
  FEEDBACK_RESOLUTION_CONSTRAINT_VIOLATION: 'FEEDBACK_RESOLUTION_CONSTRAINT_VIOLATION',
  FEEDBACK_REFERENCE_NOT_FOUND: 'FEEDBACK_REFERENCE_NOT_FOUND',
  FEEDBACK_SELF_DUPLICATE: 'FEEDBACK_SELF_DUPLICATE'
};

/**
 * Terminal statuses that require resolution metadata
 */
const TERMINAL_STATUSES = new Set(['resolved', 'wont_fix', 'duplicate', 'invalid']);

/**
 * Validate a feedback status transition before persisting.
 *
 * @param {Object} params
 * @param {string} params.feedbackId - The feedback item ID
 * @param {string} params.newStatus - The target status
 * @param {Object} params.updateData - Fields being set (resolution_sd_id, quick_fix_id, etc.)
 * @param {Object} params.existingFeedback - Current feedback row (for fallback field checking)
 * @returns {{ valid: boolean, error?: { code: string, message: string, details: Object } }}
 */
export function validateStatusTransition({ feedbackId, newStatus, updateData = {}, existingFeedback = {} }) {
  // Non-terminal statuses have no resolution requirements
  if (!TERMINAL_STATUSES.has(newStatus)) {
    return { valid: true };
  }

  // Merge existing + update for effective state
  const effective = { ...existingFeedback, ...updateData };

  switch (newStatus) {
    case 'resolved':
      return validateResolved(effective);
    case 'wont_fix':
      return validateWontFix(effective);
    case 'duplicate':
      return validateDuplicate(feedbackId, effective);
    case 'invalid':
      // No requirements for invalid
      return { valid: true };
    default:
      return { valid: true };
  }
}

/**
 * Validate 'resolved' status: needs at least one resolution link or notes
 */
function validateResolved(effective) {
  const hasResolutionLink =
    effective.resolution_sd_id != null ||
    effective.quick_fix_id != null ||
    effective.strategic_directive_id != null;

  const hasNotes =
    effective.resolution_notes != null &&
    effective.resolution_notes.trim().length > 0;

  if (!hasResolutionLink && !hasNotes) {
    return {
      valid: false,
      error: {
        code: ERROR_CODES.FEEDBACK_RESOLUTION_CONSTRAINT_VIOLATION,
        message: 'Resolved feedback must have a resolution link (resolution_sd_id, quick_fix_id, or strategic_directive_id) or non-empty resolution_notes.',
        details: {
          status: 'resolved',
          required: 'At least one of: resolution_sd_id, quick_fix_id, strategic_directive_id, or resolution_notes',
          provided: {
            resolution_sd_id: effective.resolution_sd_id ?? null,
            quick_fix_id: effective.quick_fix_id ?? null,
            strategic_directive_id: effective.strategic_directive_id ?? null,
            resolution_notes: effective.resolution_notes ? '(set)' : null
          }
        }
      }
    };
  }

  return { valid: true };
}

/**
 * Validate 'wont_fix' status: needs non-empty resolution_notes
 */
function validateWontFix(effective) {
  const hasNotes =
    effective.resolution_notes != null &&
    effective.resolution_notes.trim().length > 0;

  if (!hasNotes) {
    return {
      valid: false,
      error: {
        code: ERROR_CODES.FEEDBACK_RESOLUTION_CONSTRAINT_VIOLATION,
        message: "Won't-fix feedback must include a reason in resolution_notes.",
        details: {
          status: 'wont_fix',
          required: 'Non-empty resolution_notes explaining why this will not be fixed',
          provided: {
            resolution_notes: effective.resolution_notes ?? null
          }
        }
      }
    };
  }

  return { valid: true };
}

/**
 * Validate 'duplicate' status: needs duplicate_of_id and no self-reference
 */
function validateDuplicate(feedbackId, effective) {
  if (effective.duplicate_of_id == null) {
    return {
      valid: false,
      error: {
        code: ERROR_CODES.FEEDBACK_RESOLUTION_CONSTRAINT_VIOLATION,
        message: 'Duplicate feedback must reference the original via duplicate_of_id.',
        details: {
          status: 'duplicate',
          required: 'duplicate_of_id referencing the canonical feedback item',
          provided: { duplicate_of_id: null }
        }
      }
    };
  }

  if (effective.duplicate_of_id === feedbackId) {
    return {
      valid: false,
      error: {
        code: ERROR_CODES.FEEDBACK_SELF_DUPLICATE,
        message: 'A feedback item cannot be marked as a duplicate of itself.',
        details: {
          feedback_id: feedbackId,
          duplicate_of_id: effective.duplicate_of_id
        }
      }
    };
  }

  return { valid: true };
}

/**
 * Validate that a referenced entity exists in the database.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} params
 * @param {string} [params.quick_fix_id] - QF ID to verify
 * @param {string} [params.duplicate_of_id] - Feedback ID to verify
 * @param {string} [params.resolution_sd_id] - SD key to verify
 * @returns {Promise<{ valid: boolean, error?: Object }>}
 */
export async function validateReferences(supabase, params = {}) {
  const checks = [];

  if (params.quick_fix_id) {
    checks.push(
      supabase
        .from('quick_fixes')
        .select('id')
        .eq('id', params.quick_fix_id)
        .single()
        .then(({ error }) => {
          if (error) {
            return {
              valid: false,
              error: {
                code: ERROR_CODES.FEEDBACK_REFERENCE_NOT_FOUND,
                message: `Quick-fix '${params.quick_fix_id}' not found.`,
                details: { field: 'quick_fix_id', value: params.quick_fix_id }
              }
            };
          }
          return { valid: true };
        })
    );
  }

  if (params.duplicate_of_id) {
    checks.push(
      supabase
        .from('feedback')
        .select('id')
        .eq('id', params.duplicate_of_id)
        .single()
        .then(({ error }) => {
          if (error) {
            return {
              valid: false,
              error: {
                code: ERROR_CODES.FEEDBACK_REFERENCE_NOT_FOUND,
                message: `Feedback '${params.duplicate_of_id}' not found for duplicate reference.`,
                details: { field: 'duplicate_of_id', value: params.duplicate_of_id }
              }
            };
          }
          return { valid: true };
        })
    );
  }

  if (params.resolution_sd_id) {
    checks.push(
      supabase
        .from('strategic_directives_v2')
        .select('id')
        .eq('sd_key', params.resolution_sd_id)
        .single()
        .then(({ error }) => {
          if (error) {
            return {
              valid: false,
              error: {
                code: ERROR_CODES.FEEDBACK_REFERENCE_NOT_FOUND,
                message: `Strategic Directive '${params.resolution_sd_id}' not found.`,
                details: { field: 'resolution_sd_id', value: params.resolution_sd_id }
              }
            };
          }
          return { valid: true };
        })
    );
  }

  if (checks.length === 0) {
    return { valid: true };
  }

  const results = await Promise.all(checks);
  const failure = results.find(r => !r.valid);
  return failure || { valid: true };
}
