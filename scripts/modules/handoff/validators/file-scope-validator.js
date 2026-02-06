/**
 * File Scope Validator
 * Part of LEO Protocol Gate 1 Validation
 *
 * Validates that PRD file_scope has create/modify/delete arrays defined.
 *
 * PAT-VALIDATION-SCHEMA-MISMATCH-001: file_scope column does not exist in
 * product_requirements_v2 table. This validator was created before the data
 * model was implemented. Missing file_scope is treated as a WARNING (not error)
 * since no PRD creation path currently populates this field.
 * Also checks prd.metadata.file_scope as a fallback location.
 */

/**
 * Validate file scope is properly defined
 * @param {object} context - Validation context with prd
 * @returns {Promise<object>} Validation result
 */
export async function validateFileScope(context) {
  const { prd } = context;
  // PAT-VALIDATION-SCHEMA-MISMATCH-001: Check both column and metadata fallback
  const fileScope = prd?.file_scope || prd?.metadata?.file_scope || {};
  const warnings = [];

  // Check for required arrays - downgraded from error to warning
  // because no PRD creation path currently populates file_scope
  if (!fileScope.create && !fileScope.modify && !fileScope.delete) {
    warnings.push('file_scope not defined - consider adding create/modify/delete arrays to PRD metadata');
  }

  // Check if arrays have content
  const hasContent = (fileScope.create?.length > 0) ||
                     (fileScope.modify?.length > 0) ||
                     (fileScope.delete?.length > 0);

  if (!hasContent && fileScope.create) {
    warnings.push('file_scope arrays are all empty - consider if any file changes are planned');
  }

  return {
    passed: true,  // PAT-VALIDATION-SCHEMA-MISMATCH-001: Never block on missing file_scope
    score: hasContent ? 100 : 70,
    max_score: 100,
    issues: [],  // No blocking issues - missing file_scope is advisory
    warnings,
    details: {
      create: fileScope.create?.length || 0,
      modify: fileScope.modify?.length || 0,
      delete: fileScope.delete?.length || 0,
      source: prd?.file_scope ? 'column' : (prd?.metadata?.file_scope ? 'metadata' : 'not_found')
    }
  };
}
