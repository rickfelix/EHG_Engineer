/**
 * SINGLE SOURCE OF TRUTH for all LEO Protocol Status Definitions
 *
 * This file is the authoritative source for status values across:
 * - Database CHECK constraints (generate via npm run db:sync-statuses)
 * - TypeScript/JavaScript validation
 * - SQL functions (referenced via comments, synced via migration)
 *
 * @module status-definitions
 * @see database/migrations/*_sync_status_constraints.sql
 */

// ============================================================================
// PRD (Product Requirements Document) Statuses
// ============================================================================

/**
 * All valid PRD status values.
 * Database constraint: product_requirements_v2.status
 */
export const PRD_STATUSES = [
  'draft',
  'planning',
  'in_progress',
  'testing',
  'verification',
  'approved',
  'completed',
  'archived',
  'rejected',
  'on_hold',
  'cancelled'
] as const;

export type PRDStatus = typeof PRD_STATUSES[number];

/**
 * PRD statuses that indicate work is actively happening.
 * Used by calculate_sd_progress to credit PLAN phase.
 */
export const PRD_ACTIVE_STATUSES: readonly PRDStatus[] = [
  'planning',
  'in_progress',
  'testing',
  'verification',
  'approved',
  'completed'
] as const;

/**
 * PRD statuses that indicate the PRD exists and is valid (not abandoned).
 * Broadest set for "PRD exists" checks.
 */
export const PRD_EXISTS_STATUSES: readonly PRDStatus[] = [
  'draft',
  'planning',
  'in_progress',
  'testing',
  'verification',
  'approved',
  'completed',
  'on_hold'
] as const;

/**
 * Terminal PRD statuses (no further transitions allowed)
 */
export const PRD_TERMINAL_STATUSES: readonly PRDStatus[] = [
  'archived',
  'cancelled'
] as const;

// ============================================================================
// SD (Strategic Directive) Statuses
// ============================================================================

/**
 * All valid SD status values.
 * Database constraint: strategic_directives_v2.status
 */
export const SD_STATUSES = [
  'draft',
  'active',
  'in_progress',
  'on_hold',
  'completed',
  'cancelled',
  'deferred',
  'pending_approval'
] as const;

export type SDStatus = typeof SD_STATUSES[number];

/**
 * SD statuses that indicate active work.
 * Used by calculate_sd_progress for LEAD phase credit.
 */
export const SD_ACTIVE_STATUSES: readonly SDStatus[] = [
  'active',
  'in_progress',
  'pending_approval',
  'completed'
] as const;

// ============================================================================
// Handoff Statuses
// ============================================================================

export const HANDOFF_STATUSES = [
  'pending',
  'accepted',
  'rejected',
  'expired'
] as const;

export type HandoffStatus = typeof HANDOFF_STATUSES[number];

// ============================================================================
// User Story Statuses
// ============================================================================

export const USER_STORY_VALIDATION_STATUSES = [
  'pending',
  'in_progress',
  'validated',
  'failed'
] as const;

export const USER_STORY_E2E_STATUSES = [
  'pending',
  'running',
  'passing',
  'failing',
  'error'
] as const;

// ============================================================================
// Deliverable Statuses
// ============================================================================

export const DELIVERABLE_STATUSES = [
  'pending',
  'in_progress',
  'completed',
  'blocked',
  'cancelled'
] as const;

export type DeliverableStatus = typeof DELIVERABLE_STATUSES[number];

// ============================================================================
// SQL Generation Helpers
// ============================================================================

/**
 * Generate SQL CHECK constraint for a status list
 */
export function generateSQLCheckConstraint(
  columnName: string,
  statuses: readonly string[]
): string {
  const statusList = statuses.map(s => `'${s}'`).join(', ');
  return `CHECK (${columnName} IN (${statusList}))`;
}

/**
 * Generate SQL IN clause for status checks
 */
export function generateSQLInClause(statuses: readonly string[]): string {
  return statuses.map(s => `'${s}'`).join(', ');
}

// ============================================================================
// Validation Helpers
// ============================================================================

export function isValidPRDStatus(status: string): status is PRDStatus {
  return PRD_STATUSES.includes(status as PRDStatus);
}

export function isActivePRDStatus(status: string): boolean {
  return PRD_ACTIVE_STATUSES.includes(status as PRDStatus);
}

export function isValidSDStatus(status: string): status is SDStatus {
  return SD_STATUSES.includes(status as SDStatus);
}

export function isActiveSDStatus(status: string): boolean {
  return SD_ACTIVE_STATUSES.includes(status as SDStatus);
}

// ============================================================================
// Export for SQL sync script
// ============================================================================

export const STATUS_DEFINITIONS = {
  PRD: {
    all: PRD_STATUSES,
    active: PRD_ACTIVE_STATUSES,
    exists: PRD_EXISTS_STATUSES,
    terminal: PRD_TERMINAL_STATUSES
  },
  SD: {
    all: SD_STATUSES,
    active: SD_ACTIVE_STATUSES
  },
  HANDOFF: {
    all: HANDOFF_STATUSES
  },
  USER_STORY: {
    validation: USER_STORY_VALIDATION_STATUSES,
    e2e: USER_STORY_E2E_STATUSES
  },
  DELIVERABLE: {
    all: DELIVERABLE_STATUSES
  }
} as const;
