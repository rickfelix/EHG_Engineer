/**
 * Centralized Exception Classes
 * LEO Protocol - Industrial Hardening
 *
 * All exception classes are now centralized here to:
 * 1. Eliminate duplicate definitions
 * 2. Provide single source of truth
 * 3. Enable consistent error handling patterns
 *
 * Usage:
 *   import { BudgetExhaustedException, HardHaltError } from '../exceptions/index.js';
 *
 * Or import from specific category:
 *   import { BudgetExhaustedException } from '../exceptions/budget-exceptions.js';
 */

// Budget-related exceptions
export {
  BudgetExhaustedException,
  BudgetConfigurationException,
  BudgetExhaustedError
} from './budget-exceptions.js';

// Governance/Halt exceptions
export {
  HardHaltError,
  UnauthorizedHaltError,
  AlreadyHaltedError,
  NotHaltedError,
  CrewGovernanceViolationError,
  OathViolationError,
  TransparencyViolation,
  BoundaryViolation,
  EscalationViolation,
  DeceptionViolation
} from './governance-exceptions.js';

// Validation exceptions
export {
  GoldenNuggetValidationException,
  SemanticGateRejectionError
} from './validation-exceptions.js';

// State/Agent exceptions
export {
  VentureRequiredException,
  CircuitBreakerException,
  UnauthorizedCapabilityError,
  StateStalenessError,
  GoldenNuggetValidationError,
  StageGateValidationError,
  BusinessHypothesisValidationError
} from './state-exceptions.js';

// Manifesto exceptions
export {
  ManifestoNotActiveError,
  ManifestoActivationError,
  ManifestoVersionMismatchError
} from './manifesto-exceptions.js';

// Security exceptions
export {
  SecurityError,
  AccessDeniedError,
  DataIntegrityError
} from './security-exceptions.js';
