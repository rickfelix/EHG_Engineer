/**
 * LEO Feature Flags - TypeScript Data Contracts
 * SD: SD-LEO-SELF-IMPROVE-001B (Phase 0.5: Data Contracts)
 * Table: leo_feature_flags
 */

import { Json } from './database';

/**
 * Feature flag status values
 */
export type FeatureFlagStatus = 'draft' | 'enabled' | 'disabled' | 'expired' | 'archived';

/**
 * Flag condition types
 */
export interface FlagConditions {
  user_ids?: string[];
  team_ids?: string[];
  environments?: ('development' | 'staging' | 'production')[];
  percentage_basis?: 'user_id' | 'session_id' | 'random';
  custom_rules?: Record<string, unknown>;
}

/**
 * Database row type for leo_feature_flags
 */
export interface LeoFeatureFlagRow {
  id: string;
  created_at: string;
  updated_at: string;
  key: string;
  name: string;
  description: string | null;
  status: FeatureFlagStatus;
  owner_user_id: string;
  owner_team: string;
  expires_at: string | null;
  conditions: Json;
  rollout_percentage: number;
  proposal_id: string | null;
  last_changed_by: string | null;
  last_changed_at: string | null;
}

/**
 * Insert type for leo_feature_flags
 */
export interface LeoFeatureFlagInsert {
  id?: string;
  created_at?: string;
  updated_at?: string;
  key: string;
  name: string;
  description?: string | null;
  status?: FeatureFlagStatus;
  owner_user_id: string;
  owner_team?: string;
  expires_at?: string | null;
  conditions?: FlagConditions | Json;
  rollout_percentage?: number;
  proposal_id?: string | null;
  last_changed_by?: string | null;
  last_changed_at?: string | null;
}

/**
 * Update type for leo_feature_flags
 */
export interface LeoFeatureFlagUpdate {
  id?: string;
  created_at?: string;
  updated_at?: string;
  key?: string;
  name?: string;
  description?: string | null;
  status?: FeatureFlagStatus;
  owner_user_id?: string;
  owner_team?: string;
  expires_at?: string | null;
  conditions?: FlagConditions | Json;
  rollout_percentage?: number;
  proposal_id?: string | null;
  last_changed_by?: string | null;
  last_changed_at?: string | null;
}

/**
 * Typed feature flag with parsed JSONB fields
 */
export interface LeoFeatureFlag extends Omit<LeoFeatureFlagRow, 'conditions'> {
  conditions: FlagConditions;
}

/**
 * Helper to check if a flag is active for a given context
 */
export interface FlagEvaluationContext {
  user_id?: string;
  team_id?: string;
  environment: 'development' | 'staging' | 'production';
  session_id?: string;
}

// Export convenience type aliases
export type Row = LeoFeatureFlagRow;
export type Insert = LeoFeatureFlagInsert;
export type Update = LeoFeatureFlagUpdate;
