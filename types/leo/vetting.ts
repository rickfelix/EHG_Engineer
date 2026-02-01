/**
 * LEO Vetting Engine - TypeScript Data Contracts
 * SD-LEO-SELF-IMPROVE-001F (Phase 2b: Vetting Agent Bridge)
 * Tables: leo_vetting_outcomes, leo_feedback
 */

import { Json } from './database';

// ============================================================================
// Vetting Outcome Types
// ============================================================================

/**
 * Vetting outcome status values
 */
export type VettingOutcome =
  | 'approved'       // Passed all checks, ready for implementation
  | 'rejected'       // Failed governance checks
  | 'needs_revision' // Requires changes before approval
  | 'deferred'       // Postponed for future consideration
  | 'escalated';     // Requires human review

/**
 * Human decision types for outcome review
 */
export type HumanDecision =
  | 'confirmed'      // Human agrees with machine outcome
  | 'overridden'     // Human changed the outcome
  | 'reviewed';      // Human reviewed but no action

/**
 * AEGIS validation result structure
 */
export interface AegisResult {
  passed: boolean;
  violations: AegisViolation[];
  warnings: AegisWarning[];
  constitutionsChecked: number;
  evaluatedAt: string;
  results?: Record<string, unknown>;
  error?: string;
}

export interface AegisViolation {
  rule_id?: string;
  rule_code: string;
  rule_name?: string;
  message: string;
  severity: string;
  enforcement_action: string;
  details?: Record<string, unknown>;
}

export interface AegisWarning {
  rule_code: string;
  message: string;
  severity: string;
}

/**
 * Database row type for leo_vetting_outcomes
 */
export interface VettingOutcomeRow {
  id: string;
  created_at: string;
  feedback_id: string | null;
  proposal_id: string | null;
  outcome: VettingOutcome;
  rubric_score: number | null;
  rubric_version_id: string | null;
  aegis_result: Json;
  processed_by: string;
  processing_time_ms: number | null;
  notes: string | null;
  human_decision: HumanDecision | null;
  human_decision_by: string | null;
  human_decision_at: string | null;
  human_decision_notes: string | null;
  metadata: Json;
}

/**
 * Insert type for leo_vetting_outcomes
 */
export interface VettingOutcomeInsert {
  id?: string;
  created_at?: string;
  feedback_id?: string | null;
  proposal_id?: string | null;
  outcome: VettingOutcome;
  rubric_score?: number | null;
  rubric_version_id?: string | null;
  aegis_result?: AegisResult | Json;
  processed_by?: string;
  processing_time_ms?: number | null;
  notes?: string | null;
  metadata?: Json;
}

/**
 * Update type for leo_vetting_outcomes (human decision fields only)
 */
export interface VettingOutcomeUpdate {
  human_decision?: HumanDecision | null;
  human_decision_by?: string | null;
  human_decision_at?: string | null;
  human_decision_notes?: string | null;
}

// ============================================================================
// Feedback Types
// ============================================================================

/**
 * Feedback source types
 */
export type FeedbackSourceType =
  | 'retrospective'   // From retrospective analysis
  | 'user_report'     // From user feedback
  | 'automated'       // From automated monitoring
  | 'manual';         // Manual entry

/**
 * Feedback status values
 */
export type FeedbackStatus =
  | 'pending'         // Awaiting vetting
  | 'vetted'          // Passed vetting
  | 'rejected'        // Failed vetting
  | 'implemented'     // Already implemented
  | 'duplicate';      // Duplicate of another feedback

/**
 * Database row type for leo_feedback
 */
export interface FeedbackRow {
  id: string;
  created_at: string;
  source_type: FeedbackSourceType;
  source_id: string | null;
  title: string;
  description: string;
  category: string | null;
  priority: number;
  status: FeedbackStatus;
  metadata: Json;
}

/**
 * Insert type for leo_feedback
 */
export interface FeedbackInsert {
  id?: string;
  created_at?: string;
  source_type: FeedbackSourceType;
  source_id?: string | null;
  title: string;
  description: string;
  category?: string | null;
  priority?: number;
  status?: FeedbackStatus;
  metadata?: Json;
}

/**
 * Update type for leo_feedback
 */
export interface FeedbackUpdate {
  source_type?: FeedbackSourceType;
  source_id?: string | null;
  title?: string;
  description?: string;
  category?: string | null;
  priority?: number;
  status?: FeedbackStatus;
  metadata?: Json;
}

// ============================================================================
// Rubric Types
// ============================================================================

/**
 * Rubric criterion definition
 */
export interface RubricCriterion {
  id: string;
  name: string;
  description: string;
  weight: number;
  examples?: string[];
}

/**
 * Scoring scale definition
 */
export interface ScoringScale {
  min: number;
  max: number;
  labels: Record<number, string>;
}

/**
 * Complete rubric definition
 */
export interface Rubric {
  criteria: RubricCriterion[];
  scoringScale: ScoringScale;
  version?: string;
}

/**
 * Rubric assessment result
 */
export interface RubricAssessment {
  scores: Record<string, {
    name: string;
    score: number;
    weight: number;
    weightedScore: number;
  }>;
  totalScore: number;
  rubricVersion: string;
  assessedAt: string;
}

// ============================================================================
// Vetting Engine Types
// ============================================================================

/**
 * Options for processing feedback through vetting
 */
export interface VettingOptions {
  rubric?: Rubric;
  context?: Record<string, unknown>;
  approvalThreshold?: number;
  rejectionThreshold?: number;
  thresholds?: {
    approval?: number;
    rejection?: number;
  };
}

/**
 * Result of processing feedback through vetting
 */
export interface VettingResult {
  success: boolean;
  feedback_id: string;
  proposal_id?: string | null;
  outcome: VettingOutcome;
  rubric_score?: number;
  aegis_passed?: boolean;
  violations?: AegisViolation[];
  warnings?: AegisWarning[];
  processing_time_ms: number;
  outcome_record_id?: string | null;
  error?: string;
}

/**
 * Coverage metrics for vetting
 */
export interface CoverageMetrics {
  period_start: string;
  period_end: string;
  total_feedback: number;
  total_vetted: number;
  coverage_pct: number;
  approval_rate: number;
  avg_rubric_score: number;
  avg_processing_time_ms: number;
}

// ============================================================================
// Export Type Aliases
// ============================================================================

export type OutcomeRow = VettingOutcomeRow;
export type OutcomeInsert = VettingOutcomeInsert;
export type OutcomeUpdate = VettingOutcomeUpdate;
