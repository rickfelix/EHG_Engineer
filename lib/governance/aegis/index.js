/**
 * AEGIS - Autonomous Enforcement and Governance Integration System
 *
 * Unified governance framework that consolidates:
 * - Protocol Constitution (9 rules)
 * - Four Oaths (4 oaths + sub-rules)
 * - Doctrine of Constraint (Law 1)
 * - Hard Halt Protocol
 * - Manifesto Mode
 * - Crew Governance
 * - Compliance Policies
 *
 * @module aegis
 * @version 1.0.0
 * @implements SD-AEGIS-GOVERNANCE-001
 */

export { AegisEnforcer, getAegisEnforcer } from './AegisEnforcer.js';
export { AegisRuleLoader } from './AegisRuleLoader.js';
export { AegisViolationRecorder } from './AegisViolationRecorder.js';

// Validators
export { BaseValidator } from './validators/BaseValidator.js';
export { FieldCheckValidator } from './validators/FieldCheckValidator.js';
export { ThresholdValidator } from './validators/ThresholdValidator.js';
export { RoleForbiddenValidator } from './validators/RoleForbiddenValidator.js';
export { CountLimitValidator } from './validators/CountLimitValidator.js';
export { CustomValidator } from './validators/CustomValidator.js';

// Adapters (backward-compatible wrappers)
// Phase 2: Protocol Constitution
export { ConstitutionAdapter } from './adapters/ConstitutionAdapter.js';

// Phase 3: Four Oaths
export { FourOathsAdapter, getFourOathsAdapter } from './adapters/FourOathsAdapter.js';

// Phase 4: Doctrine & System State
export { HardHaltAdapter, getHardHaltAdapter } from './adapters/HardHaltAdapter.js';
export { ManifestoModeAdapter, getManifestoModeAdapter } from './adapters/ManifestoModeAdapter.js';
export { DoctrineAdapter, getDoctrineAdapter } from './adapters/DoctrineAdapter.js';

// Phase 5: Compliance
export { ComplianceAdapter, getComplianceAdapter } from './adapters/ComplianceAdapter.js';

// Constants
export const AEGIS_CONSTITUTIONS = {
  PROTOCOL: 'PROTOCOL',
  FOUR_OATHS: 'FOUR_OATHS',
  DOCTRINE: 'DOCTRINE',
  HARD_HALT: 'HARD_HALT',
  MANIFESTO_MODE: 'MANIFESTO_MODE',
  COMPLIANCE: 'COMPLIANCE'
};

export const AEGIS_SEVERITY = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  ADVISORY: 'ADVISORY'
};

export const AEGIS_ENFORCEMENT_ACTION = {
  BLOCK: 'BLOCK',
  BLOCK_OVERRIDABLE: 'BLOCK_OVERRIDABLE',
  WARN_AND_LOG: 'WARN_AND_LOG',
  AUDIT_ONLY: 'AUDIT_ONLY',
  TRIGGER_SD: 'TRIGGER_SD'
};

export const AEGIS_VALIDATION_TYPE = {
  FIELD_CHECK: 'field_check',
  THRESHOLD: 'threshold',
  ROLE_FORBIDDEN: 'role_forbidden',
  COUNT_LIMIT: 'count_limit',
  CUSTOM: 'custom'
};
