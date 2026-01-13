/**
 * File Scope Validator
 * Part of LEO Protocol Gate 1 Validation
 *
 * Validates that PRD file_scope has create/modify/delete arrays defined.
 */

/**
 * Validate file scope is properly defined
 * @param {object} context - Validation context with prd
 * @returns {Promise<object>} Validation result
 */
export async function validateFileScope(context) {
  const { prd } = context;
  const fileScope = prd?.file_scope || {};
  const issues = [];
  const warnings = [];

  // Check for required arrays
  if (!fileScope.create && !fileScope.modify && !fileScope.delete) {
    issues.push('file_scope should have create/modify/delete arrays');
  }

  // Check if arrays have content
  const hasContent = (fileScope.create?.length > 0) ||
                     (fileScope.modify?.length > 0) ||
                     (fileScope.delete?.length > 0);

  if (!hasContent) {
    warnings.push('file_scope arrays are all empty - consider if any file changes are planned');
  }

  return {
    passed: issues.length === 0,
    score: issues.length === 0 ? (hasContent ? 100 : 80) : 50,
    max_score: 100,
    issues,
    warnings,
    details: {
      create: fileScope.create?.length || 0,
      modify: fileScope.modify?.length || 0,
      delete: fileScope.delete?.length || 0
    }
  };
}
