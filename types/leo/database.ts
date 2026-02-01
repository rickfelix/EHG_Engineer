/**
 * LEO Protocol Database Types
 * SD: SD-LEO-SELF-IMPROVE-001B (Phase 0.5: Data Contracts)
 *
 * This file provides the Database type for Supabase client instantiation
 * and exports all LEO protocol table types.
 */

import type {
  LeoProposalRow,
  LeoProposalInsert,
  LeoProposalUpdate,
  LeoProposalTransition,
} from './proposals';

import type {
  LeoVettingRubricRow,
  LeoVettingRubricInsert,
  LeoVettingRubricUpdate,
} from './rubrics';

import type {
  LeoPrioritizationConfigRow,
  LeoPrioritizationConfigInsert,
  LeoPrioritizationConfigUpdate,
  LeoAuditConfigRow,
  LeoAuditConfigInsert,
  LeoAuditConfigUpdate,
} from './config';

import type {
  LeoFeatureFlagRow,
  LeoFeatureFlagInsert,
  LeoFeatureFlagUpdate,
} from './feature-flags';

import type {
  LeoEventRow,
  LeoEventInsert,
} from './events';

import type {
  LeoPromptRow,
  LeoPromptInsert,
  LeoPromptUpdate,
} from './prompts';

/**
 * Generic JSON type for JSONB columns
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/**
 * Database schema definition for LEO Protocol tables
 * Use with: createClient<Database>(url, key)
 */
export interface Database {
  public: {
    Tables: {
      leo_proposals: {
        Row: LeoProposalRow;
        Insert: LeoProposalInsert;
        Update: LeoProposalUpdate;
        Relationships: [
          {
            foreignKeyName: 'fk_leo_proposals_rubric';
            columns: ['rubric_version_id'];
            referencedRelation: 'leo_vetting_rubrics';
            referencedColumns: ['id'];
          }
        ];
      };
      leo_proposal_transitions: {
        Row: LeoProposalTransition;
        Insert: LeoProposalTransition;
        Update: LeoProposalTransition;
        Relationships: [];
      };
      leo_vetting_rubrics: {
        Row: LeoVettingRubricRow;
        Insert: LeoVettingRubricInsert;
        Update: LeoVettingRubricUpdate;
        Relationships: [];
      };
      leo_prioritization_config: {
        Row: LeoPrioritizationConfigRow;
        Insert: LeoPrioritizationConfigInsert;
        Update: LeoPrioritizationConfigUpdate;
        Relationships: [];
      };
      leo_audit_config: {
        Row: LeoAuditConfigRow;
        Insert: LeoAuditConfigInsert;
        Update: LeoAuditConfigUpdate;
        Relationships: [];
      };
      leo_feature_flags: {
        Row: LeoFeatureFlagRow;
        Insert: LeoFeatureFlagInsert;
        Update: LeoFeatureFlagUpdate;
        Relationships: [
          {
            foreignKeyName: 'fk_leo_flags_proposal';
            columns: ['proposal_id'];
            referencedRelation: 'leo_proposals';
            referencedColumns: ['id'];
          }
        ];
      };
      leo_events: {
        Row: LeoEventRow;
        Insert: LeoEventInsert;
        Update: never; // Append-only table
        Relationships: [];
      };
      leo_prompts: {
        Row: LeoPromptRow;
        Insert: LeoPromptInsert;
        Update: LeoPromptUpdate;
        Relationships: [];
      };
    };
    Views: {
      // Add views here as needed
    };
    Functions: {
      leo_get_active_configs: {
        Args: Record<string, never>;
        Returns: {
          prioritization_config_id: string;
          prioritization_config: Json;
          audit_config_id: string;
          audit_config: Json;
        }[];
      };
      leo_get_active_prompt: {
        Args: { p_name: string };
        Returns: {
          id: string;
          name: string;
          version: number;
          prompt_text: string;
          metadata: Json;
          checksum: string;
        }[];
      };
    };
    Enums: {
      // Add enums here if needed
    };
  };
}

/**
 * Helper type to extract Row type from table name
 */
export type TableRow<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

/**
 * Helper type to extract Insert type from table name
 */
export type TableInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];

/**
 * Helper type to extract Update type from table name
 */
export type TableUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];
