/**
 * LEO Scoring Model - TypeScript Data Contracts
 * SD: SD-LEO-SELF-IMPROVE-001G (Phase 3a: Scoring Model + Data Schema)
 * Tables: leo_scoring_rubrics, leo_scoring_prioritization_config
 */

import { Json } from './database';

// ============================================================================
// Rubric Status Types
// ============================================================================

/**
 * Scoring rubric status values
 */
export type ScoringRubricStatus =
  | 'draft'      // Under development, can be modified
  | 'published'  // Active and immutable
  | 'deprecated'; // No longer in use

// ============================================================================
// Scoring Dimensions
// ============================================================================

/**
 * The six scoring dimensions used for prioritization
 */
export type ScoringDimensionKey =
  | 'value'      // Business value delivered
  | 'alignment'  // Strategic alignment score
  | 'risk'       // Risk level (lower is better)
  | 'effort'     // Implementation effort (lower is better)
  | 'dependency' // Dependency complexity (lower is better)
  | 'confidence'; // Estimation confidence

/**
 * Dimension definition within a rubric
 */
export interface ScoringDimension {
  description: string;
  min: number;
  max: number;
  examples?: string[];
}

/**
 * All dimensions in a rubric (must have all 6 keys)
 */
export type ScoringDimensions = Record<ScoringDimensionKey, ScoringDimension>;

// ============================================================================
// Normalization Rules
// ============================================================================

/**
 * Normalization mode options
 */
export type NormalizationMode =
  | 'none'           // No normalization applied
  | 'linear_0_100'   // Linear scaling to 0-100 with clipping
  | 'zscore_clipped'; // Z-score normalization with clipping

/**
 * Policy for handling missing values in scoring input
 */
export type MissingValuePolicy =
  | 'error'          // Throw error if dimension missing
  | 'impute_zero'    // Use 0 for missing values
  | 'impute_midpoint'; // Use midpoint of clip range

/**
 * Normalization rules for a rubric
 */
export interface NormalizationRules {
  mode: NormalizationMode;
  clip_min: number;
  clip_max: number;
  rounding_decimals: number;
  missing_value_policy: MissingValuePolicy;
}

// ============================================================================
// Stability Rules
// ============================================================================

/**
 * Stability rules to prevent scoring drift
 */
export interface StabilityRules {
  max_rank_delta_per_revision: number;
  min_score_delta_to_reorder: number;
  tie_breaker_order: ScoringDimensionKey[];
  deterministic_rounding: boolean;
}

// ============================================================================
// Deduplication Merge Confidence Rules
// ============================================================================

/**
 * Field comparator types for merge confidence scoring
 */
export type FieldComparator =
  | 'exact'            // Exact match required
  | 'fuzzy'            // Case-insensitive fuzzy match
  | 'numeric_tolerance'; // Numeric within tolerance

/**
 * Field definition for merge confidence scoring
 */
export interface MergeConfidenceField {
  field_name: string;
  weight: number;
  comparator: FieldComparator;
  tolerance?: number; // For numeric_tolerance comparator
}

/**
 * Deduplication merge confidence rules
 */
export interface DedupeMergeConfidenceRules {
  fields: MergeConfidenceField[];
  threshold_auto_merge: number;
  threshold_needs_review: number;
  threshold_reject: number;
  explainability: boolean;
}

// ============================================================================
// leo_scoring_rubrics Table Types
// ============================================================================

/**
 * Database row type for leo_scoring_rubrics
 */
export interface LeoScoringRubricRow {
  id: string;
  rubric_key: string;
  version: number;
  status: ScoringRubricStatus;
  dimensions: Json;
  normalization_rules: Json;
  stability_rules: Json;
  dedupe_merge_confidence_rules: Json;
  created_at: string;
  created_by: string;
  checksum: string;
  supersedes_rubric_id: string | null;
  notes: string | null;
}

/**
 * Insert type for leo_scoring_rubrics
 */
export interface LeoScoringRubricInsert {
  id?: string;
  rubric_key: string;
  version: number;
  status?: ScoringRubricStatus;
  dimensions: ScoringDimensions | Json;
  normalization_rules: NormalizationRules | Json;
  stability_rules: StabilityRules | Json;
  dedupe_merge_confidence_rules?: DedupeMergeConfidenceRules | Json;
  created_at?: string;
  created_by: string;
  checksum?: string; // Auto-computed by trigger
  supersedes_rubric_id?: string | null;
  notes?: string | null;
}

/**
 * Typed rubric with proper JSONB typing
 */
export interface LeoScoringRubric extends Omit<LeoScoringRubricRow, 'dimensions' | 'normalization_rules' | 'stability_rules' | 'dedupe_merge_confidence_rules'> {
  dimensions: ScoringDimensions;
  normalization_rules: NormalizationRules;
  stability_rules: StabilityRules;
  dedupe_merge_confidence_rules: DedupeMergeConfidenceRules;
}

// ============================================================================
// leo_scoring_prioritization_config Table Types
// ============================================================================

/**
 * Scope type for prioritization config
 */
export type PrioritizationScopeType =
  | 'application' // Per-application config
  | 'workspace'   // Per-workspace config
  | 'global';     // System-wide default

/**
 * Weights for scoring dimensions (must sum to 1.0)
 */
export type ScoringWeights = Record<ScoringDimensionKey, number>;

/**
 * Database row type for leo_scoring_prioritization_config
 */
export interface LeoScoringPrioritizationConfigRow {
  id: string;
  scope_type: PrioritizationScopeType;
  scope_id: string | null;
  active_rubric_id: string;
  weights: Json;
  tie_breakers: Json;
  normalization_mode: NormalizationMode;
  score_rounding: number;
  deterministic_seed: string | null;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
}

/**
 * Insert type for leo_scoring_prioritization_config
 */
export interface LeoScoringPrioritizationConfigInsert {
  id?: string;
  scope_type: PrioritizationScopeType;
  scope_id?: string | null;
  active_rubric_id: string;
  weights: ScoringWeights | Json;
  tie_breakers?: ScoringDimensionKey[] | Json;
  normalization_mode?: NormalizationMode;
  score_rounding?: number;
  deterministic_seed?: string | null;
  created_at?: string;
  created_by: string;
  updated_at?: string;
  updated_by: string;
}

/**
 * Update type for leo_scoring_prioritization_config
 */
export interface LeoScoringPrioritizationConfigUpdate {
  active_rubric_id?: string;
  weights?: ScoringWeights | Json;
  tie_breakers?: ScoringDimensionKey[] | Json;
  normalization_mode?: NormalizationMode;
  score_rounding?: number;
  deterministic_seed?: string | null;
  updated_by: string;
}

/**
 * Typed config with proper JSONB typing
 */
export interface LeoScoringPrioritizationConfig extends Omit<LeoScoringPrioritizationConfigRow, 'weights' | 'tie_breakers'> {
  weights: ScoringWeights;
  tie_breakers: ScoringDimensionKey[];
}

// ============================================================================
// Scoring Input/Output Types
// ============================================================================

/**
 * Raw scoring input (dimension values)
 */
export type ScoringInput = Record<ScoringDimensionKey, number>;

/**
 * Per-dimension scoring detail
 */
export interface DimensionScore {
  raw: number;
  normalized: number;
  weight: number;
  weighted_raw: number;
  weighted_normalized: number;
}

/**
 * Full scoring output
 */
export type ScoringOutput = Record<ScoringDimensionKey, DimensionScore>;

/**
 * Result from score_proposal function
 */
export interface ScoreProposalResult {
  scoring_output: ScoringOutput;
  scoring_total: number;
  scoring_normalized_total: number;
  rubric_id: string;
  checksum: string;
}

// ============================================================================
// Merge Confidence Types
// ============================================================================

/**
 * Merge decision types
 */
export type MergeDecision =
  | 'auto_merge'    // Confidence >= auto_merge threshold
  | 'needs_review'  // Confidence >= needs_review but < auto_merge
  | 'reject';       // Confidence < needs_review

/**
 * Field contribution in merge explanation
 */
export interface FieldContribution {
  field: string;
  match_score: number;
  weight: number;
  contribution: number;
}

/**
 * Merge confidence explanation
 */
export interface MergeConfidenceExplanation {
  field_contributions: FieldContribution[];
  total_weight: number;
  weighted_match: number;
  final_confidence: number;
  thresholds: {
    auto_merge: number;
    needs_review: number;
    reject: number;
  };
}

/**
 * Result from score_merge_confidence function
 */
export interface ScoreMergeConfidenceResult {
  confidence: number;
  decision: MergeDecision;
  explanation: MergeConfidenceExplanation | null;
}

// ============================================================================
// Protocol Section Scoring Fields
// ============================================================================

/**
 * Extended leo_protocol_sections with scoring fields
 */
export interface ProtocolSectionScoringFields {
  scoring_rubric_id: string | null;
  scoring_input: ScoringInput | null;
  scoring_output: ScoringOutput | null;
  scoring_total: number | null;
  scoring_normalized_total: number | null;
  scoring_computed_at: string | null;
  scoring_computed_by: string | null;
}
