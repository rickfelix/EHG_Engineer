/**
 * VentureStateMachine - Error Classes Module
 *
 * Custom error types for venture state machine operations.
 *
 * @module lib/agents/modules/venture-state-machine/errors
 */

/**
 * SD-UNIFIED-PATH-1.2.1: Custom error for stale state detection
 * Thrown when cached state differs from database state
 * isRetryable=true indicates caller should rehydrate and retry
 */
export class StateStalenessError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'StateStalenessError';
    this.isRetryable = true;
    this.cachedStage = details.cachedStage;
    this.dbStage = details.dbStage;
    this.ventureId = details.ventureId;
  }
}

/**
 * SD-HARDENING-V2-003: Golden Nugget validation failure error
 * Thrown when artifacts fail quality validation
 * Contains detailed validation results for feedback
 */
export class GoldenNuggetValidationError extends Error {
  constructor(message, validationResults = {}) {
    super(message);
    this.name = 'GoldenNuggetValidationError';
    this.validationResults = validationResults;
  }
}

/**
 * SD-INDUSTRIAL-2025-001: Stage Gate validation failure error
 * Thrown when stage-specific business rules are not met
 * Contains detailed gate check results for feedback
 */
export class StageGateValidationError extends Error {
  constructor(message, gateResults = {}) {
    super(message);
    this.name = 'StageGateValidationError';
    this.gateResults = gateResults;
  }
}
