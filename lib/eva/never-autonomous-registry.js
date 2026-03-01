/**
 * NEVER_AUTONOMOUS Registry
 * SD: SD-MAN-GEN-CORRECTIVE-VISION-GAP-007-02 (GOV-003)
 *
 * Programmatic deny list that blocks autonomous execution of restricted operations.
 * Converts documentation-only NEVER_AUTONOMOUS policy into enforceable code.
 *
 * Operations in the deny list MUST require explicit human approval before execution.
 */

const NEVER_AUTONOMOUS_OPERATIONS = [
  'schema_migration',
  'user_deletion',
  'financial_transaction',
  'chairman_impersonation',
  'rls_policy_change',
  'service_role_key_usage',
  'production_data_export',
  'auth_bypass'
];

/**
 * Check whether an operation is allowed to run autonomously.
 *
 * @param {string} operationType - The operation being attempted
 * @returns {{ allowed: boolean, reason: string|null }}
 */
function checkAutonomousAllowed(operationType) {
  if (!operationType || typeof operationType !== 'string') {
    return { allowed: false, reason: 'operationType is required and must be a string' };
  }

  const normalized = operationType.toLowerCase().trim();
  const blocked = NEVER_AUTONOMOUS_OPERATIONS.includes(normalized);

  if (blocked) {
    return {
      allowed: false,
      reason: `"${normalized}" is in the NEVER_AUTONOMOUS deny list. Requires explicit human approval.`
    };
  }

  return { allowed: true, reason: null };
}

/**
 * Get the current deny list.
 * @returns {string[]}
 */
function getDenyList() {
  return [...NEVER_AUTONOMOUS_OPERATIONS];
}

/**
 * Validate an operation and throw if blocked.
 * Convenience wrapper for use in middleware or pre-execution hooks.
 *
 * @param {string} operationType
 * @throws {Error} if operation is in deny list
 */
function enforceAutonomousCheck(operationType) {
  const result = checkAutonomousAllowed(operationType);
  if (!result.allowed) {
    const err = new Error(result.reason);
    err.code = 'NEVER_AUTONOMOUS_BLOCKED';
    err.operationType = operationType;
    throw err;
  }
}

export {
  checkAutonomousAllowed,
  getDenyList,
  enforceAutonomousCheck,
  NEVER_AUTONOMOUS_OPERATIONS
};
