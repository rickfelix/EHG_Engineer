/**
 * LEO Configuration Tables - TypeScript Data Contracts
 * SD: SD-LEO-SELF-IMPROVE-001B (Phase 0.5: Data Contracts)
 * Tables: leo_prioritization_config, leo_audit_config
 */

import { Json } from './database';

/**
 * Config status values
 */
export type ConfigStatus = 'draft' | 'active' | 'deprecated';

// =============================================================================
// Prioritization Config
// =============================================================================

/**
 * Prioritization weights structure
 */
export interface PrioritizationWeights {
  business_value: number;
  risk_reduction: number;
  effort_complexity: number;
  strategic_alignment: number;
  [key: string]: number;
}

/**
 * Prioritization constraints
 */
export interface PrioritizationConstraints {
  max_concurrent_proposals: number;
  min_approval_score: number;
  required_reviewers: number;
  [key: string]: unknown;
}

/**
 * Database row type for leo_prioritization_config
 */
export interface LeoPrioritizationConfigRow {
  id: string;
  created_at: string;
  created_by: string;
  version: number;
  status: ConfigStatus;
  weights: Json;
  constraints: Json;
  description: string | null;
}

/**
 * Insert type for leo_prioritization_config
 */
export interface LeoPrioritizationConfigInsert {
  id?: string;
  created_at?: string;
  created_by: string;
  version: number;
  status?: ConfigStatus;
  weights: PrioritizationWeights | Json;
  constraints: PrioritizationConstraints | Json;
  description?: string | null;
}

/**
 * Update type for leo_prioritization_config
 */
export interface LeoPrioritizationConfigUpdate {
  id?: string;
  created_at?: string;
  created_by?: string;
  version?: number;
  status?: ConfigStatus;
  weights?: PrioritizationWeights | Json;
  constraints?: PrioritizationConstraints | Json;
  description?: string | null;
}

/**
 * Typed prioritization config with parsed JSONB fields
 */
export interface LeoPrioritizationConfig extends Omit<LeoPrioritizationConfigRow, 'weights' | 'constraints'> {
  weights: PrioritizationWeights;
  constraints: PrioritizationConstraints;
}

// =============================================================================
// Audit Config
// =============================================================================

/**
 * PII redaction rule structure
 */
export interface PiiRedactionRule {
  field_pattern: string;
  redaction_type: 'hash' | 'mask' | 'remove';
  applies_to: string[];
}

/**
 * Database row type for leo_audit_config
 */
export interface LeoAuditConfigRow {
  id: string;
  created_at: string;
  created_by: string;
  version: number;
  status: ConfigStatus;
  event_retention_days: number;
  pii_redaction_rules: Json;
  required_event_types: Json;
  description: string | null;
}

/**
 * Insert type for leo_audit_config
 */
export interface LeoAuditConfigInsert {
  id?: string;
  created_at?: string;
  created_by: string;
  version: number;
  status?: ConfigStatus;
  event_retention_days: number;
  pii_redaction_rules: PiiRedactionRule[] | Json;
  required_event_types: string[] | Json;
  description?: string | null;
}

/**
 * Update type for leo_audit_config
 */
export interface LeoAuditConfigUpdate {
  id?: string;
  created_at?: string;
  created_by?: string;
  version?: number;
  status?: ConfigStatus;
  event_retention_days?: number;
  pii_redaction_rules?: PiiRedactionRule[] | Json;
  required_event_types?: string[] | Json;
  description?: string | null;
}

/**
 * Typed audit config with parsed JSONB fields
 */
export interface LeoAuditConfig extends Omit<LeoAuditConfigRow, 'pii_redaction_rules' | 'required_event_types'> {
  pii_redaction_rules: PiiRedactionRule[];
  required_event_types: string[];
}

// =============================================================================
// Active Config Result (from leo_get_active_configs function)
// =============================================================================

export interface ActiveConfigsResult {
  prioritization_config_id: string;
  prioritization_config: {
    version: number;
    weights: PrioritizationWeights;
    constraints: PrioritizationConstraints;
  };
  audit_config_id: string;
  audit_config: {
    version: number;
    event_retention_days: number;
    pii_redaction_rules: PiiRedactionRule[];
    required_event_types: string[];
  };
}

// Export convenience type aliases
export type PrioritizationRow = LeoPrioritizationConfigRow;
export type PrioritizationInsert = LeoPrioritizationConfigInsert;
export type PrioritizationUpdate = LeoPrioritizationConfigUpdate;

export type AuditRow = LeoAuditConfigRow;
export type AuditInsert = LeoAuditConfigInsert;
export type AuditUpdate = LeoAuditConfigUpdate;
