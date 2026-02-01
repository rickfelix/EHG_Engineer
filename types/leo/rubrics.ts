/**
 * LEO Vetting Rubrics - TypeScript Data Contracts
 * SD: SD-LEO-SELF-IMPROVE-001B (Phase 0.5: Data Contracts)
 * Table: leo_vetting_rubrics
 */

import { Json } from './database';

/**
 * Rubric status values
 */
export type RubricStatus = 'draft' | 'published' | 'deprecated';

/**
 * Scoring scale definition
 */
export interface ScoringScale {
  min: number;
  max: number;
  labels: Record<number, string>;
}

/**
 * Rubric criterion definition
 */
export interface RubricCriterion {
  id: string;
  name: string;
  description: string;
  examples?: string[];
}

/**
 * Rubric weights (keys should match criterion IDs, values should sum to 1.0)
 */
export type RubricWeights = Record<string, number>;

/**
 * Database row type for leo_vetting_rubrics
 */
export interface LeoVettingRubricRow {
  id: string;
  created_at: string;
  created_by: string;
  name: string;
  version: number;
  status: RubricStatus;
  weights: Json;
  criteria: Json;
  scoring_scale: Json;
  description: string | null;
  effective_from: string;
  effective_to: string | null;
}

/**
 * Insert type for leo_vetting_rubrics
 */
export interface LeoVettingRubricInsert {
  id?: string;
  created_at?: string;
  created_by: string;
  name: string;
  version: number;
  status?: RubricStatus;
  weights: RubricWeights | Json;
  criteria: RubricCriterion[] | Json;
  scoring_scale: ScoringScale | Json;
  description?: string | null;
  effective_from?: string;
  effective_to?: string | null;
}

/**
 * Update type for leo_vetting_rubrics
 */
export interface LeoVettingRubricUpdate {
  id?: string;
  created_at?: string;
  created_by?: string;
  name?: string;
  version?: number;
  status?: RubricStatus;
  weights?: RubricWeights | Json;
  criteria?: RubricCriterion[] | Json;
  scoring_scale?: ScoringScale | Json;
  description?: string | null;
  effective_from?: string;
  effective_to?: string | null;
}

/**
 * Typed rubric with parsed JSONB fields
 */
export interface LeoVettingRubric extends Omit<LeoVettingRubricRow, 'weights' | 'criteria' | 'scoring_scale'> {
  weights: RubricWeights;
  criteria: RubricCriterion[];
  scoring_scale: ScoringScale;
}

// Export convenience type aliases
export type Row = LeoVettingRubricRow;
export type Insert = LeoVettingRubricInsert;
export type Update = LeoVettingRubricUpdate;
