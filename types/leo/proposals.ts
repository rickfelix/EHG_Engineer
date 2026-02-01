/**
 * LEO Proposals - TypeScript Data Contracts
 * SD: SD-LEO-SELF-IMPROVE-001B (Phase 0.5: Data Contracts)
 * Table: leo_proposals
 */

import { Json } from './database';

/**
 * Proposal risk levels
 */
export type ProposalRiskLevel = 'low' | 'medium' | 'high';

/**
 * Proposal status values matching database constraint
 */
export type ProposalStatus =
  | 'draft'
  | 'submitted'
  | 'triaged'
  | 'vetting'
  | 'approved'
  | 'rejected'
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'rolled_back'
  | 'archived';

/**
 * Scope item structure
 */
export interface ProposalScopeItem {
  area: string;
  description: string;
}

/**
 * Affected component structure
 */
export interface AffectedComponent {
  name: string;
  type: 'database' | 'api' | 'ui' | 'config' | 'script' | 'documentation';
  impact: 'low' | 'medium' | 'high';
}

/**
 * Database row type for leo_proposals
 */
export interface LeoProposalRow {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  owner_team: string;
  title: string;
  summary: string;
  motivation: string;
  scope: Json;
  affected_components: Json;
  risk_level: ProposalRiskLevel;
  status: ProposalStatus;
  constitution_tags: Json;
  aegis_compliance_notes: string | null;
  rubric_version_id: string | null;
  rubric_snapshot: Json | null;
  prioritization_snapshot: Json | null;
  audit_snapshot: Json | null;
  feature_flag_key: string | null;
  decision_reason: string | null;
  decision_by: string | null;
  decision_at: string | null;
}

/**
 * Insert type for leo_proposals (required fields)
 */
export interface LeoProposalInsert {
  id?: string;
  created_at?: string;
  updated_at?: string;
  created_by: string;
  owner_team?: string;
  title: string;
  summary: string;
  motivation: string;
  scope?: ProposalScopeItem[] | Json;
  affected_components?: AffectedComponent[] | Json;
  risk_level: ProposalRiskLevel;
  status?: ProposalStatus;
  constitution_tags?: string[] | Json;
  aegis_compliance_notes?: string | null;
  rubric_version_id?: string | null;
  rubric_snapshot?: Json | null;
  prioritization_snapshot?: Json | null;
  audit_snapshot?: Json | null;
  feature_flag_key?: string | null;
  decision_reason?: string | null;
  decision_by?: string | null;
  decision_at?: string | null;
}

/**
 * Update type for leo_proposals (all fields optional)
 */
export interface LeoProposalUpdate {
  id?: string;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  owner_team?: string;
  title?: string;
  summary?: string;
  motivation?: string;
  scope?: ProposalScopeItem[] | Json;
  affected_components?: AffectedComponent[] | Json;
  risk_level?: ProposalRiskLevel;
  status?: ProposalStatus;
  constitution_tags?: string[] | Json;
  aegis_compliance_notes?: string | null;
  rubric_version_id?: string | null;
  rubric_snapshot?: Json | null;
  prioritization_snapshot?: Json | null;
  audit_snapshot?: Json | null;
  feature_flag_key?: string | null;
  decision_reason?: string | null;
  decision_by?: string | null;
  decision_at?: string | null;
}

/**
 * Typed proposal with parsed JSONB fields
 */
export interface LeoProposal extends Omit<LeoProposalRow, 'scope' | 'affected_components' | 'constitution_tags'> {
  scope: ProposalScopeItem[];
  affected_components: AffectedComponent[];
  constitution_tags: string[];
}

/**
 * Proposal state transition definition
 */
export interface LeoProposalTransition {
  from_status: ProposalStatus;
  to_status: ProposalStatus;
}

// Export convenience type aliases
export type Row = LeoProposalRow;
export type Insert = LeoProposalInsert;
export type Update = LeoProposalUpdate;
