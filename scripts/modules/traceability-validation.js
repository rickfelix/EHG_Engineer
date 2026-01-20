/**
 * DESIGN->DATABASE Validation Gates - Gate 3 (PLAN->LEAD)
 *
 * REFACTORED: SD-LEO-REFACTOR-TRACEABILITY-001
 * Original 993 LOC monolith refactored into focused modules.
 * See: scripts/modules/traceability-validation/
 *
 * Integration: unified-handoff-system.js (PLAN->LEAD handoff)
 * Created: 2025-10-28
 * Part of: SD-DESIGN-DATABASE-VALIDATION-001
 */

// Re-export everything from the modular structure
export * from './traceability-validation/index.js';

// Named export for the main validation function
export { validateGate3PlanToLead } from './traceability-validation/index.js';
